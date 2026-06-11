import type {
  AgentRegistryEntry,
  ApprovalAuthority,
  AuthorityAssertion,
  AuthorityDiscrepancy,
  AuthorityGrantScope,
  AuthorityProfile,
  AuthorityProvenance,
  DataTier,
  GovernanceRule,
  McpGrant,
  Person,
  SodRole,
  SystemGrant,
} from "@/types";

// ── Authority Profile: inheritance made mechanical ─────────────────────
// An agent can only inherit authority its human owner actually holds.
// Grants are populated from trust-ranked sources; enforcement happens at
// compile (min() math) and validation (hard gates). Authority is only
// meaningful if it ends: the joiner/mover/leaver lifecycle lives here too.

// Trust order (low → high). A higher-trust source replaces a lower-trust
// grant on the same system/domain; a lower-trust source never overwrites a
// higher one — it raises a discrepancy flag instead.
const TRUST_ORDER: AuthorityProvenance["source"][] = [
  "csv", "self_attested", "discovery", "rule_derived", "operator", "iam_sync",
];

export function trustRank(source: AuthorityProvenance["source"]): number {
  return TRUST_ORDER.indexOf(source);
}

// Scope ladder for min(): none < read_only < draft_only < read_write < admin.
const SCOPE_ORDER: AuthorityGrantScope[] = ["none", "read_only", "draft_only", "read_write", "admin"];

export function scopeRank(scope: AuthorityGrantScope): number {
  return SCOPE_ORDER.indexOf(scope);
}

export function minScope(...scopes: AuthorityGrantScope[]): AuthorityGrantScope {
  return scopes.reduce((min, s) => (scopeRank(s) < scopeRank(min) ? s : min), "admin" as AuthorityGrantScope);
}

export const DEFAULT_CLEARANCE_TIERS: DataTier[] = ["public", "internal"];

export function emptyAuthorityProfile(): AuthorityProfile {
  return { system_grants: [], approval_authority: [], sod_roles: [], updated_at: new Date().toISOString() };
}

const normKey = (s: string) => s.trim().toLowerCase();

let discrepancySeq = 0;
function discrepancy(
  personId: string,
  kind: AuthorityDiscrepancy["kind"],
  key: string,
  held: string,
  asserted: string,
  lower: AuthorityProvenance["source"],
  higher: AuthorityProvenance["source"],
): AuthorityDiscrepancy {
  discrepancySeq += 1;
  return {
    id: `DSC-${Date.now().toString(36)}-${discrepancySeq}`,
    person_id: personId,
    kind,
    key,
    held,
    asserted,
    lower_source: lower,
    higher_source: higher,
    raised_at: new Date().toISOString(),
  };
}

export interface AuthorityMergeResult {
  profile: AuthorityProfile;
  discrepancies: AuthorityDiscrepancy[];
}

/**
 * Merge a system grant into a profile, enforcing trust order. Same-trust
 * sources update in place; higher trust replaces; lower trust that disagrees
 * raises a discrepancy (itself audit evidence) and changes nothing.
 */
export function mergeSystemGrant(profile: AuthorityProfile, personId: string, grant: SystemGrant): AuthorityMergeResult {
  const key = normKey(grant.system);
  const existing = profile.system_grants.find((g) => normKey(g.system) === key);
  if (!existing) {
    return {
      profile: { ...profile, system_grants: [...profile.system_grants, grant], updated_at: new Date().toISOString() },
      discrepancies: [],
    };
  }
  const incoming = trustRank(grant.provenance.source);
  const held = trustRank(existing.provenance.source);
  if (incoming >= held) {
    return {
      profile: {
        ...profile,
        system_grants: profile.system_grants.map((g) => (normKey(g.system) === key ? grant : g)),
        updated_at: new Date().toISOString(),
      },
      discrepancies: [],
    };
  }
  if (existing.scope !== grant.scope) {
    return {
      profile,
      discrepancies: [discrepancy(personId, "system_grant", grant.system, existing.scope, grant.scope, grant.provenance.source, existing.provenance.source)],
    };
  }
  return { profile, discrepancies: [] };
}

/** Merge approval authority with the same trust rules as system grants. */
export function mergeApprovalAuthority(profile: AuthorityProfile, personId: string, authority: ApprovalAuthority): AuthorityMergeResult {
  const key = normKey(authority.domain);
  const existing = profile.approval_authority.find((a) => normKey(a.domain) === key);
  if (!existing) {
    return {
      profile: { ...profile, approval_authority: [...profile.approval_authority, authority], updated_at: new Date().toISOString() },
      discrepancies: [],
    };
  }
  const incoming = trustRank(authority.provenance.source);
  const held = trustRank(existing.provenance.source);
  if (incoming >= held) {
    return {
      profile: {
        ...profile,
        approval_authority: profile.approval_authority.map((a) => (normKey(a.domain) === key ? authority : a)),
        updated_at: new Date().toISOString(),
      },
      discrepancies: [],
    };
  }
  const heldDesc = existing.limit?.amount !== undefined ? `limit ${existing.limit.amount}` : "unlimited";
  const newDesc = authority.limit?.amount !== undefined ? `limit ${authority.limit.amount}` : "unlimited";
  if (heldDesc !== newDesc) {
    return {
      profile,
      discrepancies: [discrepancy(personId, "approval_authority", authority.domain, heldDesc, newDesc, authority.provenance.source, existing.provenance.source)],
    };
  }
  return { profile, discrepancies: [] };
}

export function mergeSodRole(profile: AuthorityProfile, role: SodRole): AuthorityProfile {
  const key = normKey(role.flow);
  const existing = profile.sod_roles.find((r) => normKey(r.flow) === key);
  if (!existing) {
    return { ...profile, sod_roles: [...profile.sod_roles, role], updated_at: new Date().toISOString() };
  }
  // The same human holding both sides of a flow is itself a finding.
  if (existing.role !== role.role && existing.role !== "both_flagged") {
    return {
      ...profile,
      sod_roles: profile.sod_roles.map((r) => (normKey(r.flow) === key ? { ...r, role: "both_flagged" as const } : r)),
      updated_at: new Date().toISOString(),
    };
  }
  return profile;
}

// ── Rule-derived authority: the free win ───────────────────────────────
// Governance rules that name an authority holder ("Managers approve spend
// above $500", "Only dana@x.co signs pricing") emit approval-authority writes
// for matching people, with the same evidence binding as agent constraints.

const MANAGER_HOLDER_RE = /\b(managers?|supervisors?|directors?|heads?\s+of|vps?|leadership)\b/i;

function domainFromRule(rule: GovernanceRule): string {
  const keywords = (rule.matcher.keywords ?? []).filter((k) => !/approv|manag|must|sign/.test(k));
  return keywords.slice(0, 3).join("_") || "general_approval";
}

export interface RuleDerivedAuthorityWrite {
  person_id: string;
  authority: ApprovalAuthority;
}

export function deriveAuthorityFromRules(rules: GovernanceRule[], people: Person[]): RuleDerivedAuthorityWrite[] {
  const writes: RuleDerivedAuthorityWrite[] = [];
  const managers = people.filter((p) => people.some((r) => r.managerId === p.id));
  for (const rule of rules) {
    if (rule.type !== "approval") continue;
    const holders: Person[] = [];
    if (rule.approver && rule.approver !== "owner" && rule.approver !== "owner_manager") {
      const named = people.find((p) => p.email.toLowerCase() === rule.approver!.toLowerCase());
      if (named) holders.push(named);
    } else if (rule.approver === "owner_manager" || MANAGER_HOLDER_RE.test(rule.evidence_quote)) {
      holders.push(...managers);
    }
    for (const person of holders) {
      writes.push({
        person_id: person.id,
        authority: {
          domain: domainFromRule(rule),
          ...(rule.matcher.amount_threshold !== undefined
            ? { limit: { amount: rule.matcher.amount_threshold, description: rule.condition } }
            : { limit: { description: rule.condition } }),
          provenance: { source: "rule_derived", rule_id: rule.rule_id },
          evidence_quote: rule.evidence_quote,
          status: "reviewed", // derived from reviewed governance text
        },
      });
    }
  }
  return writes;
}

// ── Discovery assertions → review-gated profile patches ────────────────

export function applyAssertion(
  profile: AuthorityProfile,
  personId: string,
  assertion: AuthorityAssertion,
  provenance: AuthorityProvenance,
): AuthorityMergeResult {
  if (assertion.kind === "system_access" && assertion.system) {
    return mergeSystemGrant(profile, personId, {
      system: assertion.system,
      scope: assertion.scope ?? "read_only",
      provenance,
      evidence_quote: assertion.evidence_quote,
      status: provenance.source === "operator" ? "reviewed" : "asserted",
    });
  }
  if (assertion.kind === "approval" && assertion.domain) {
    return mergeApprovalAuthority(profile, personId, {
      domain: assertion.domain,
      ...(assertion.limit_description ? { limit: { description: assertion.limit_description } } : {}),
      provenance,
      evidence_quote: assertion.evidence_quote,
      status: provenance.source === "operator" ? "reviewed" : "asserted",
    });
  }
  if (assertion.kind === "sod_role" && assertion.flow && assertion.role) {
    return {
      profile: mergeSodRole(profile, { flow: assertion.flow, role: assertion.role, provenance }),
      discrepancies: [],
    };
  }
  return { profile, discrepancies: [] };
}

// ── Inheritance math (Compiler Stage B addition) ───────────────────────
// agent_grant(system) = min(task_needs, owner grant, library default).
// Missing profile ≠ blank check: it means no verified grants, which degrades
// agent grants to read_only with a warning. Agents never receive admin.

export interface InheritanceResult {
  grants: McpGrant[];
  warnings: string[];
}

export function capGrantsByAuthority(grants: McpGrant[], owner: Person): InheritanceResult {
  const warnings: string[] = [];
  const profile = owner.authority;
  if (!profile || !profile.system_grants.length) {
    const capped = grants.map((g) =>
      scopeRank(g.scope) > scopeRank("read_only")
        ? { ...g, scope: "read_only" as const, reason: `${g.reason} (capped: owner has no verified authority profile)` }
        : g,
    );
    if (grants.length) {
      warnings.push(`${owner.name} has no authority profile — agent grants degraded to read_only. Capture the owner's access in the Authority panel.`);
    }
    return { grants: capped, warnings };
  }
  const capped = grants.map((grant) => {
    const ownerGrant = profile.system_grants.find((g) => normKey(g.system) === normKey(grant.name));
    if (!ownerGrant) {
      // The owner holds no recorded grant for this system at all.
      if (scopeRank(grant.scope) > scopeRank("read_only")) {
        warnings.push(`Owner has no recorded ${grant.name} access — grant capped at read_only.`);
        return { ...grant, scope: "read_only" as const, reason: `${grant.reason} (capped: no owner grant for this system)` };
      }
      return grant;
    }
    // min(task needs, owner scope); admin never flows to an agent.
    const ownerScope = ownerGrant.scope === "admin" ? "read_write" : ownerGrant.scope;
    const effective = minScope(grant.scope, ownerScope as AuthorityGrantScope);
    if (ownerGrant.status === "asserted") {
      warnings.push(`${grant.name} grant rests on ${owner.name}'s unreviewed (asserted) access claim — review it in the Authority panel.`);
    }
    if (effective !== grant.scope) {
      return {
        ...grant,
        scope: effective === "none" ? ("read_only" as const) : (effective as McpGrant["scope"]),
        reason: `${grant.reason} (capped by owner's ${ownerGrant.scope} grant)`,
      };
    }
    return grant;
  });
  return { grants: capped, warnings };
}

const APPROVE_CLASS_RE = /\b(approve|authori[sz]e|sign[\s-]?off|sign\b|release|finali[sz]e)\b/i;

export function isApproveClassAction(action: string): boolean {
  return APPROVE_CLASS_RE.test(action);
}

export interface AuthorityGateResult {
  failures: string[];
  warnings: string[];
}

/**
 * Stage E authority gates.
 * Fail: an agent grant exceeds the owner's grant for that system; an
 * approve-class allowed action without matching reviewed approval authority;
 * a preparer/approver SoD violation; a context document above owner clearance.
 * Warn: grants resting on asserted authority; both_flagged SoD role; no
 * authority profile at all.
 */
export function authorityGates(args: {
  owner: Person;
  mcpGrants: McpGrant[];
  allowed: string[];
  contextDocuments?: { fileName: string; classification?: DataTier }[];
}): AuthorityGateResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const profile = args.owner.authority;

  if (!profile) {
    warnings.push(`${args.owner.name} has no authority profile — agent authority cannot be verified against the owner's actual access.`);
  }

  // Grants vs owner grants.
  if (profile?.system_grants.length) {
    for (const grant of args.mcpGrants) {
      const ownerGrant = profile.system_grants.find((g) => normKey(g.system) === normKey(grant.name));
      if (!ownerGrant) continue;
      const ownerScope = ownerGrant.scope === "admin" ? "read_write" : ownerGrant.scope;
      if (scopeRank(grant.scope) > scopeRank(ownerScope as AuthorityGrantScope)) {
        failures.push(`Agent grant ${grant.name}:${grant.scope} exceeds the owner's ${ownerGrant.scope} grant.`);
      } else if (ownerGrant.status === "asserted") {
        warnings.push(`${grant.name} grant rests on asserted (unreviewed) owner authority.`);
      }
    }
  }

  // Approve-class actions need reviewed (or verified) owner approval
  // authority — asserted claims never activate compilation.
  const approveActions = args.allowed.filter(isApproveClassAction);
  if (approveActions.length) {
    const reviewed = (profile?.approval_authority ?? []).filter((a) => a.status === "reviewed" || a.status === "verified");
    if (!reviewed.length) {
      for (const action of approveActions) {
        failures.push(`Allowed action "${action}" is approve-class but ${args.owner.name} has no reviewed approval authority covering it.`);
      }
    }
  }

  // SoD: a preparer's agent may not approve in that flow (and vice versa).
  for (const role of profile?.sod_roles ?? []) {
    if (role.role === "both_flagged") {
      warnings.push(`${args.owner.name} holds both preparer and approver roles in "${role.flow}" — a flagged SoD conflict on the human.`);
      continue;
    }
    const flowTokens = role.flow.toLowerCase().split(/[_\s]+/).filter((t) => t.length >= 4);
    const touches = (action: string) => flowTokens.some((t) => action.toLowerCase().includes(t));
    if (role.role === "preparer") {
      for (const action of args.allowed) {
        if (isApproveClassAction(action) && touches(action)) {
          failures.push(`SoD violation: owner is preparer in "${role.flow}" but the agent may "${action}".`);
        }
      }
    }
  }

  // Document clearance: agent context limited to docs within owner clearance.
  const tiers = new Set<DataTier>(profile?.data_clearance?.tiers ?? DEFAULT_CLEARANCE_TIERS);
  for (const doc of args.contextDocuments ?? []) {
    const tier = doc.classification ?? "internal";
    if (!tiers.has(tier)) {
      failures.push(`Context document "${doc.fileName}" is classified ${tier}, above the owner's clearance (${[...tiers].join(", ")}).`);
    }
  }

  return { failures, warnings };
}

// ── Person lifecycle: joiner / mover / leaver ──────────────────────────

/**
 * Leaver: every owned agent suspends immediately. No agent may remain
 * deployed with an offboarded owner — hard invariant.
 */
export function suspendAgentsForLeaver(registry: AgentRegistryEntry[], personId: string): { registry: AgentRegistryEntry[]; suspended: string[] } {
  const suspended: string[] = [];
  const next = registry.map((entry) => {
    if (entry.owner_person_id !== personId || entry.status === "retired" || entry.status === "suspended") return entry;
    suspended.push(entry.agent_id);
    return { ...entry, status: "suspended" as const, stale: true, stale_reason: "owner_offboarded" };
  });
  return { registry: next, suspended };
}

/** Mover: authority profile goes stale in full; owned agents flagged. */
export function flagAgentsForMover(registry: AgentRegistryEntry[], personId: string): AgentRegistryEntry[] {
  return registry.map((entry) =>
    entry.owner_person_id === personId && entry.status !== "retired"
      ? { ...entry, stale: true, stale_reason: "owner_role_changed" }
      : entry,
  );
}

/** Continuous invariant check: suspend anything still active under an offboarded owner. */
export function enforceLeaverInvariant(registry: AgentRegistryEntry[], people: Person[]): { registry: AgentRegistryEntry[]; suspended: string[] } {
  const offboarded = new Set(people.filter((p) => p.lifecycle === "offboarded").map((p) => p.id));
  let out = registry;
  const allSuspended: string[] = [];
  for (const id of offboarded) {
    const res = suspendAgentsForLeaver(out, id);
    out = res.registry;
    allSuspended.push(...res.suspended);
  }
  return { registry: out, suspended: allSuspended };
}

export interface ReassignmentProposal {
  agent_id: string;
  from_person_id: string;
  candidates: { person: Person; covers_grants: boolean }[];
}

/**
 * Reassignment candidates for a suspended agent: people in the same
 * department whose authority profile covers the agent's grants. Reassignment
 * is a normal authority-reviewed change; the agent recompiles under the new
 * owner's ceiling, which may shrink it.
 */
export function proposeReassignments(
  registry: AgentRegistryEntry[],
  people: Person[],
  grantsByAgent: Map<string, McpGrant[]>,
): ReassignmentProposal[] {
  const proposals: ReassignmentProposal[] = [];
  for (const entry of registry) {
    if (entry.status !== "suspended") continue;
    const owner = people.find((p) => p.id === entry.owner_person_id);
    const grants = grantsByAgent.get(entry.agent_id) ?? [];
    const candidates = people
      .filter((p) => p.id !== entry.owner_person_id && p.lifecycle !== "offboarded" && (!owner || p.department === owner.department))
      .map((person) => ({
        person,
        covers_grants: grants.every((grant) => {
          const g = person.authority?.system_grants.find((sg) => normKey(sg.system) === normKey(grant.name));
          return g ? scopeRank(g.scope === "admin" ? "read_write" : g.scope) >= scopeRank(grant.scope) : false;
        }),
      }))
      .sort((a, b) => Number(b.covers_grants) - Number(a.covers_grants));
    proposals.push({ agent_id: entry.agent_id, from_person_id: entry.owner_person_id, candidates: candidates.slice(0, 3) });
  }
  return proposals;
}
