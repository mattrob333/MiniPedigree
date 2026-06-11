import { describe, it, expect } from "vitest";
import {
  applyAssertion,
  authorityGates,
  capGrantsByAuthority,
  deriveAuthorityFromRules,
  enforceLeaverInvariant,
  flagAgentsForMover,
  mergeApprovalAuthority,
  mergeSystemGrant,
  minScope,
  proposeReassignments,
  suspendAgentsForLeaver,
} from "../src/lib/authority";
import { authorityFromCsv, parsePeopleCsv } from "../src/lib/csv";
import { extractGovernanceRulesDeterministic } from "../src/lib/governance";
import { compileAgent } from "../src/lib/runtimes";
import { validateCompiledAgent } from "../src/lib/validate";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { upsertCompiledVersion } from "../src/lib/registry";
import type { AuthorityProfile, CompanyMcpServer, McpGrant, Person } from "../src/types";

const baseProfile = (): AuthorityProfile => ({
  system_grants: [{ system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op@x.co" }, status: "reviewed" }],
  approval_authority: [],
  sod_roles: [],
  updated_at: "2026-06-01",
});

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "RevOps Manager",
  department: "Revenue Ops", managerId: null, tools: ["Salesforce"],
  authority: baseProfile(), lifecycle: "active",
};

describe("scope ladder + trust order", () => {
  it("minScope follows none < read_only < draft_only < read_write < admin", () => {
    expect(minScope("read_write", "read_only")).toBe("read_only");
    expect(minScope("admin", "draft_only")).toBe("draft_only");
    expect(minScope("read_only", "none")).toBe("none");
  });

  it("a higher-trust source replaces a lower-trust grant", () => {
    let profile = baseProfile();
    profile.system_grants[0].provenance = { source: "csv" };
    profile.system_grants[0].status = "asserted";
    const res = mergeSystemGrant(profile, "P-001", {
      system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op@x.co" }, status: "reviewed",
    });
    expect(res.profile.system_grants[0].scope).toBe("read_only");
    expect(res.discrepancies).toHaveLength(0);
  });

  it("a lower-trust source never overwrites — it raises a discrepancy", () => {
    const profile = baseProfile(); // operator-sourced read_write
    const res = mergeSystemGrant(profile, "P-001", {
      system: "Salesforce", scope: "admin", provenance: { source: "self_attested", person_id: "P-001" }, status: "asserted",
    });
    expect(res.profile.system_grants[0].scope).toBe("read_write"); // unchanged
    expect(res.discrepancies).toHaveLength(1);
    expect(res.discrepancies[0].lower_source).toBe("self_attested");
    expect(res.discrepancies[0].higher_source).toBe("operator");
  });

  it("approval authority follows the same trust rules", () => {
    let profile = baseProfile();
    const op = mergeApprovalAuthority(profile, "P-001", {
      domain: "spend", limit: { amount: 500 }, provenance: { source: "operator", operator_id: "op@x.co" }, status: "reviewed",
    });
    const lower = mergeApprovalAuthority(op.profile, "P-001", {
      domain: "spend", limit: { amount: 50_000 }, provenance: { source: "self_attested", person_id: "P-001" }, status: "asserted",
    });
    expect(lower.profile.approval_authority[0].limit?.amount).toBe(500);
    expect(lower.discrepancies).toHaveLength(1);
  });
});

describe("CSV tool_scopes", () => {
  it("parses scoped grants and conservative read_only defaults", () => {
    const warnings: string[] = [];
    const profile = authorityFromCsv(["Salesforce", "Slack"], "Salesforce:read_write", warnings, "Row 2")!;
    const sf = profile.system_grants.find((g) => g.system === "Salesforce")!;
    const slack = profile.system_grants.find((g) => g.system === "Slack")!;
    expect(sf.scope).toBe("read_write");
    expect(slack.scope).toBe("read_only");
    expect(sf.status).toBe("asserted");
    expect(sf.provenance.source).toBe("csv");
  });

  it("imports tool_scopes from a people CSV", () => {
    const csv = "name,email,title,manager_email,department,known_tools,tool_scopes\nJane,jane@x.co,RevOps,,Revenue Ops,Salesforce;Slack,Salesforce:read_write";
    const result = parsePeopleCsv(csv);
    expect(result.people[0].authority?.system_grants.find((g) => g.system === "Salesforce")?.scope).toBe("read_write");
    expect(result.people[0].lifecycle).toBe("active");
  });
});

describe("rule-derived authority (the free win)", () => {
  it("a manager approval rule grants approval authority to managers", () => {
    const rules = extractGovernanceRulesDeterministic({ approvalRules: ["Managers must approve spend above $500."] });
    const manager: Person = { ...jane, id: "P-010", authority: undefined };
    const report: Person = { id: "P-011", name: "Rep", email: "rep@x.co", title: "AE", department: "Sales", managerId: "P-010", tools: [] };
    const writes = deriveAuthorityFromRules(rules, [manager, report]);
    expect(writes).toHaveLength(1);
    expect(writes[0].person_id).toBe("P-010");
    expect(writes[0].authority.limit?.amount).toBe(500);
    expect(writes[0].authority.status).toBe("reviewed");
    expect(writes[0].authority.provenance.source).toBe("rule_derived");
  });
});

describe("inheritance math (compile-time capping)", () => {
  const grants: McpGrant[] = [
    { server_id: "S-1", name: "Salesforce", scope: "read_write", source: "library", reason: "task needs it" },
  ];

  it("caps an agent grant at the owner's scope", () => {
    const owner: Person = { ...jane, authority: { ...baseProfile(), system_grants: [{ system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op" }, status: "reviewed" }] } };
    const res = capGrantsByAuthority(grants, owner);
    expect(res.grants[0].scope).toBe("read_only");
    expect(res.grants[0].reason).toMatch(/capped by owner/);
  });

  it("missing profile degrades grants to read_only with a warning", () => {
    const owner: Person = { ...jane, authority: undefined };
    const res = capGrantsByAuthority(grants, owner);
    expect(res.grants[0].scope).toBe("read_only");
    expect(res.warnings[0]).toMatch(/no authority profile/);
  });

  it("admin owner grants never flow to the agent above read_write", () => {
    const owner: Person = { ...jane, authority: { ...baseProfile(), system_grants: [{ system: "Salesforce", scope: "admin", provenance: { source: "operator", operator_id: "op" }, status: "reviewed" }] } };
    const res = capGrantsByAuthority(grants, owner);
    expect(res.grants[0].scope).toBe("read_write");
  });
});

describe("validation gates", () => {
  it("fails when an agent grant exceeds the owner's grant", () => {
    const res = authorityGates({
      owner: { ...jane, authority: { ...baseProfile(), system_grants: [{ system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op" }, status: "reviewed" }] } },
      mcpGrants: [{ server_id: "S-1", name: "Salesforce", scope: "read_write", source: "library", reason: "r" }],
      allowed: [],
    });
    expect(res.failures.some((f) => f.includes("exceeds the owner's"))).toBe(true);
  });

  it("fails approve-class allowed actions without reviewed approval authority", () => {
    const res = authorityGates({ owner: jane, mcpGrants: [], allowed: ["Approve vendor invoices"] });
    expect(res.failures.some((f) => f.includes("approve-class"))).toBe(true);
    const withAuthority = authorityGates({
      owner: { ...jane, authority: { ...baseProfile(), approval_authority: [{ domain: "invoices", provenance: { source: "operator", operator_id: "op" }, status: "reviewed" }] } },
      mcpGrants: [], allowed: ["Approve vendor invoices"],
    });
    expect(withAuthority.failures).toHaveLength(0);
  });

  it("approval authority is domain-scoped: spend authority does not unlock hiring approvals", () => {
    const spendOnly = { ...jane, authority: { ...baseProfile(), approval_authority: [{ domain: "spend", limit: { amount: 5000, description: "Managers approve spend above $500" }, provenance: { source: "operator" as const, operator_id: "op" }, status: "reviewed" as const }] } };
    const hiring = authorityGates({ owner: spendOnly, mcpGrants: [], allowed: ["Approve hiring offers"] });
    expect(hiring.failures.some((f) => f.includes("approve-class"))).toBe(true);
    const spend = authorityGates({ owner: spendOnly, mcpGrants: [], allowed: ["Approve spend requests"] });
    expect(spend.failures).toHaveLength(0);
  });

  it("blocks a preparer's agent from approve-class actions in that flow", () => {
    const res = authorityGates({
      owner: { ...jane, authority: { ...baseProfile(), approval_authority: [{ domain: "payments", provenance: { source: "operator", operator_id: "op" }, status: "reviewed" }], sod_roles: [{ flow: "payment_processing", role: "preparer", provenance: { source: "rule_derived", rule_id: "GR-1" } }] } },
      mcpGrants: [],
      allowed: ["Approve payment runs for processing"],
    });
    expect(res.failures.some((f) => f.includes("SoD violation"))).toBe(true);
  });

  it("fails documents above the owner's clearance and warns on asserted authority", () => {
    const res = authorityGates({
      owner: { ...jane, authority: { ...baseProfile(), system_grants: [{ system: "Salesforce", scope: "read_write", provenance: { source: "csv" }, status: "asserted" }] } },
      mcpGrants: [{ server_id: "S-1", name: "Salesforce", scope: "read_only", source: "library", reason: "r" }],
      allowed: [],
      contextDocuments: [{ fileName: "comp-bands.md", classification: "regulated" }],
    });
    expect(res.failures.some((f) => f.includes("regulated"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("asserted"))).toBe(true);
  });

  it("validateCompiledAgent fails an offboarded owner", () => {
    const row = { status: "ready" as const, responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [] };
    const task = { id: "T-1", label: "Summarize pipeline notes", respId: "R-1", respTitle: "Pipeline" };
    const buildCtx = { person: { ...jane, lifecycle: "offboarded" as const }, row, task, respTitle: "Pipeline", agentName: "Pipeline Agent", policy: "read-only", riskLevel: "low" as const };
    const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
    const compiled = compileAgent({ agent, runtime: "pedigree", mcpLibrary: [] });
    const result = validateCompiledAgent(compiled, []);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.includes("offboarded"))).toBe(true);
  });
});

describe("person lifecycle", () => {
  const makeEntry = (agentId: string, ownerId: string) => {
    const task = { id: "T-1", label: "Summarize pipeline notes", respId: "R-1", respTitle: "Pipeline" };
    const row = { status: "ready" as const, responsibilities: [], tasks: { delegatable: [task], approval: [], not_delegatable: [] }, agents: [] };
    const buildCtx = { person: { ...jane, id: ownerId }, row, task, respTitle: "Pipeline", agentName: agentId, policy: "read-only", riskLevel: "low" as const };
    const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
    const compiled = compileAgent({ agent, runtime: "pedigree", mcpLibrary: [] });
    return upsertCompiledVersion([], compiled, []).map((e) => ({ ...e, status: "deployed" as const }));
  };

  it("leaver suspends every owned agent, no exceptions", () => {
    const registry = makeEntry("Pipeline Agent", "P-001");
    const { registry: next, suspended } = suspendAgentsForLeaver(registry, "P-001");
    expect(suspended).toHaveLength(1);
    expect(next[0].status).toBe("suspended");
    expect(next[0].stale_reason).toBe("owner_offboarded");
  });

  it("the leaver invariant is enforced on every check", () => {
    const registry = makeEntry("Pipeline Agent", "P-001");
    const { registry: next } = enforceLeaverInvariant(registry, [{ ...jane, lifecycle: "offboarded" }]);
    expect(next[0].status).toBe("suspended");
  });

  it("mover flags owned agents stale with owner_role_changed", () => {
    const registry = makeEntry("Pipeline Agent", "P-001");
    const next = flagAgentsForMover(registry, "P-001");
    expect(next[0].stale).toBe(true);
    expect(next[0].stale_reason).toBe("owner_role_changed");
  });

  it("reassignment candidates must cover the agent's grants", () => {
    const registry = suspendAgentsForLeaver(makeEntry("Pipeline Agent", "P-001"), "P-001").registry;
    const covering: Person = { ...jane, id: "P-002", name: "Cover", email: "cover@x.co" };
    const lacking: Person = { ...jane, id: "P-003", name: "Lacking", email: "lacking@x.co", authority: undefined };
    const grants = new Map<string, McpGrant[]>([[registry[0].agent_id, [{ server_id: "S", name: "Salesforce", scope: "read_only", source: "library", reason: "r" }]]]);
    const proposals = proposeReassignments(registry, [{ ...jane, lifecycle: "offboarded" }, covering, lacking], grants);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].candidates[0].person.id).toBe("P-002");
    expect(proposals[0].candidates[0].covers_grants).toBe(true);
    expect(proposals[0].candidates.find((c) => c.person.id === "P-003")?.covers_grants).toBe(false);
  });
});

describe("discovery assertions", () => {
  it("land as asserted claims, review-gated", () => {
    const res = applyAssertion(baseProfile(), "P-001", {
      kind: "approval", domain: "refunds", limit_description: "up to $2,000",
      evidence_quote: "I can approve refunds up to $2k.",
    }, { source: "discovery", transcript_id: "T-1" });
    const claim = res.profile.approval_authority.find((a) => a.domain === "refunds")!;
    expect(claim.status).toBe("asserted");
    expect(claim.evidence_quote).toContain("$2k");
  });
});

describe("authority assertions through the digest", () => {
  it("a parsed assertion becomes a review-gated digest proposal that patches the person", async () => {
    const { authorityAssertionSignals } = await import("../src/lib/authority");
    const { ingestSignals } = await import("../src/lib/signalLedger");
    const { buildDigest, applyDigestSelections } = await import("../src/lib/digest");
    const parsed = {
      "P-001": {
        summary: "",
        responsibilities: [],
        authority_assertions: [{
          kind: "approval" as const, domain: "refunds", limit_description: "up to $2,000",
          evidence_quote: "I can approve refunds up to $2k without anyone signing off.",
        }],
      },
    };
    const signals = authorityAssertionSignals(parsed, ["P-001"], "T-1");
    expect(signals).toHaveLength(1);
    expect(signals[0].authority_expanding).toBe(true);

    const owner: Person = { ...jane, authority: undefined };
    const { ledger } = ingestSignals([], signals);
    const digest = buildDigest({ ledger, people: [owner], pedigree: {}, registry: [] });
    expect(digest.rule_and_authority).toHaveLength(1);
    expect(digest.rule_and_authority[0].proposal?.type).toBe("authority_change");

    const result = applyDigestSelections({
      signalIds: ledger.map((s) => s.id), ledger, approver: "gov@x.co",
      people: [owner], pedigree: {}, registry: [], auditLog: [], backlog: [],
    });
    expect(result.applied).toBe(1);
    const patched = result.people?.find((p) => p.id === "P-001");
    expect(patched?.authority?.approval_authority[0].domain).toBe("refunds");
    // Discovery-sourced claims stay asserted until an operator reviews them.
    expect(patched?.authority?.approval_authority[0].status).toBe("asserted");
    expect(result.auditLog).toHaveLength(1);
  });
});
