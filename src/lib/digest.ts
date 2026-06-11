import type {
  AgentRegistryEntry,
  CompanyContext,
  GovernanceRule,
  PedigreeState,
  Person,
  QuestionBacklogItem,
  StackAuditRecord,
  StackChangeProposal,
  StackSignal,
  TaskItem,
} from "@/types";
import { applyStackProposals } from "./stackSync";
import { applyConfirmations } from "./freshness";
import { resolveBacklogItem } from "./questionBacklog";
import { corroborationsFor, setSignalStatus } from "./signalLedger";
import { classifyTask } from "./parse";
import { extractGovernanceRulesDeterministic } from "./governance";

// ── Living Stack A.6: the weekly digest ────────────────────────────────
// Per-transcript review does not scale at a twice-weekly meeting cadence.
// Promoted signals accumulate into a digest: rule changes and authority-
// expanding items first (explicit confirmation required), then drift, then
// durable candidates with every corroborating quote, then retirements/stale
// flags, agent feedback, and the free wins. Applying reuses the SAME apply
// path as Org Sync changesets — it is never forked. Nothing touching
// authority auto-applies.

export interface DigestEntry {
  signal: StackSignal;
  proposal: StackChangeProposal | null;   // null = needs an owner pick before apply
  corroborations: StackSignal[];          // every corroborating quote (candidates)
  needs_owner: boolean;
}

export interface DigestView {
  generated_at: string;
  period_days: number;
  rule_and_authority: DigestEntry[];      // distinct warning treatment, explicit confirm
  drift: DigestEntry[];
  candidates: DigestEntry[];              // ranked
  retirements: DigestEntry[];
  agent_feedback: DigestEntry[];
  free_wins: {
    confirmations: number;                // "38 tasks confirmed fresh this week"
    backlog_resolutions: StackSignal[];
  };
}

function findTask(pedigree: PedigreeState, personId: string, taskId: string): { task: TaskItem; cls: "delegatable" | "human_approval_required" | "not_delegatable" } | null {
  const row = pedigree[personId];
  if (!row) return null;
  const d = row.tasks.delegatable.find((t) => t.id === taskId);
  if (d) return { task: d, cls: "delegatable" };
  const a = row.tasks.approval.find((t) => t.id === taskId);
  if (a) return { task: a, cls: "human_approval_required" };
  const n = row.tasks.not_delegatable.find((t) => t.id === taskId);
  if (n) return { task: n, cls: "not_delegatable" };
  return null;
}

interface SignalPatch {
  kind?: string;
  summary?: string | null;
  label?: string | null;
  cadence?: string | null;
  owner_person_id?: string | null;
  rule?: GovernanceRule;
  note?: string;
  agent_id?: string;
  task_id?: string;
  person_id?: string;
  agent_ids?: string[];
}

/**
 * Convert a promoted signal into a StackChangeProposal for the shared apply
 * path. Returns null when the signal cannot be applied without more input
 * (e.g. a candidate with no owner) — the digest UI collects it first.
 */
export function signalToProposal(signal: StackSignal, people: Person[], pedigree: PedigreeState): StackChangeProposal | null {
  const patch = (signal.proposed_patch ?? {}) as SignalPatch;
  const transcriptId = signal.source.kind === "meeting" ? signal.source.transcript_id : `member:${signal.source.person_id}`;
  const base = {
    id: `SCP-${signal.id}`,
    evidence_quote: signal.evidence_quote,
    transcript_id: transcriptId,
    confidence: signal.confidence,
    affected: {
      person_ids: signal.refs.person_ids,
      agent_ids: signal.refs.agent_ids,
      rule_ids: signal.refs.rule_ids,
    },
    authority_expanding: signal.authority_expanding,
  };
  const personName = (id?: string | null) => people.find((p) => p.id === id)?.name ?? id ?? "unknown";

  switch (signal.type) {
    case "drift": {
      const personId = signal.refs.person_ids[0];
      const taskId = signal.refs.task_ids[0];
      if (!personId || !taskId) return null;
      const found = findTask(pedigree, personId, taskId);
      if (!found) return null;
      // Owner drift is an ownership transfer — always authority-relevant.
      if (patch.owner_person_id && patch.owner_person_id !== personId) {
        return {
          ...base,
          type: "ownership_transfer",
          summary: `"${found.task.label}" moves from ${personName(personId)} to ${personName(patch.owner_person_id)}.`,
          authority_expanding: true,
          proposed_patch: {
            kind: "ownership_transfer",
            fromPersonId: personId,
            toPersonId: patch.owner_person_id,
            taskId,
            label: patch.label ?? found.task.label,
            respTitle: found.task.respTitle,
          },
        };
      }
      const completion = patch.cadence
        ? { ...(found.task.completion ?? { trigger: null, inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: null, open_questions: null, candidate_pattern: null }), trigger: patch.cadence }
        : found.task.completion;
      return {
        ...base,
        type: "task_changed",
        summary: `${personName(personId)}: "${found.task.label}" drifted${patch.summary ? ` (${patch.summary})` : ""}.`,
        proposed_patch: {
          kind: "task_changed",
          personId,
          taskId,
          label: patch.label ?? found.task.label,
          delegation_class: found.cls,
          completion,
        },
      };
    }
    case "new_candidate": {
      const personId = signal.refs.person_ids[0];
      if (!personId) return null; // owner pick required in the digest UI
      const label = patch.label ?? signal.evidence_quote.slice(0, 80);
      const { cls } = classifyTask(label);
      return {
        ...base,
        type: "new_task",
        summary: `${personName(personId)}: durable new recurring work "${label}" — agent candidate.`,
        proposed_patch: {
          kind: "new_task",
          personId,
          respTitle: "Recurring team work",
          label,
          delegation_class: cls === "not_delegatable" ? "human_approval_required" : cls,
          completion: patch.cadence
            ? { trigger: patch.cadence, inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: null, open_questions: null, candidate_pattern: null }
            : undefined,
        },
      };
    }
    case "retirement": {
      const personId = signal.refs.person_ids[0] ?? patch.person_id;
      const taskId = signal.refs.task_ids[0] ?? patch.task_id;
      const agentIds = signal.refs.agent_ids.length ? signal.refs.agent_ids : (patch.agent_ids ?? []);
      const found = personId && taskId ? findTask(pedigree, personId, taskId) : null;
      return {
        ...base,
        type: "retire_candidate",
        summary: found
          ? `"${found.task.label}" appears to no longer be performed — retire it${agentIds.length ? ` and ${agentIds.join(", ")}` : ""}?`
          : `Retire ${agentIds.join(", ") || "the referenced work"} — no longer performed.`,
        proposed_patch: {
          kind: "retire_candidate",
          agentIds,
          ...(personId && taskId ? { taskRemovals: [{ personId, taskId }] } : {}),
        },
      };
    }
    case "rule_signal": {
      // Authority assertions from discovery ride the rule_signal channel but
      // patch the person's authority profile, not the governance overlay.
      if (patch.kind === "authority_assertion") {
        const personId = (patch as { personId?: string }).personId ?? signal.refs.person_ids[0];
        if (!personId) return null;
        const assertion = (patch as { assertion?: { kind: string; system?: string | null; scope?: string | null; domain?: string | null } }).assertion;
        const what = assertion?.kind === "system_access"
          ? `${assertion.system ?? "system"} access (${assertion.scope ?? "read_only"})`
          : assertion?.kind === "approval"
            ? `approval authority over ${assertion.domain ?? "a domain"}`
            : "a segregation-of-duties role";
        return {
          ...base,
          type: "authority_change",
          summary: `${personName(personId)} asserted ${what} — merge onto their authority profile (trust-ordered; discrepancies flag).`,
          proposed_patch: patch,
        };
      }
      const rule = patch.rule
        ?? extractGovernanceRulesDeterministic({ approvalRules: [signal.evidence_quote] })[0]
        ?? null;
      if (!rule) return null;
      return {
        ...base,
        type: "rule_changed",
        summary: `Governance change (${rule.type}): ${rule.condition}`,
        proposed_patch: { kind: "rule_changed", rule },
      };
    }
    case "agent_feedback": {
      const agentId = signal.refs.agent_ids[0] ?? patch.agent_id;
      if (!agentId) return null;
      return {
        ...base,
        type: "agent_feedback",
        summary: `Feedback on ${agentId} — attach as review note${patch.summary ? `: ${patch.summary}` : ""}.`,
        proposed_patch: { kind: "agent_feedback", agentId, note: patch.note ?? signal.evidence_quote },
      };
    }
    default:
      return null; // confirmations / backlog_resolutions apply silently at ingest
  }
}

/** Assign an owner to a candidate signal that arrived without person refs. */
export function withOwner(signal: StackSignal, personId: string): StackSignal {
  return { ...signal, refs: { ...signal.refs, person_ids: [personId] } };
}

export interface BuildDigestInput {
  ledger: StackSignal[];
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  periodDays?: number;
  now?: Date;
}

export function buildDigest({ ledger, people, pedigree, periodDays = 7, now = new Date() }: BuildDigestInput): DigestView {
  const cutoff = now.getTime() - periodDays * 24 * 60 * 60 * 1000;
  const proposed = ledger.filter((s) => s.status === "proposed");
  const entry = (signal: StackSignal): DigestEntry => {
    const proposal = signalToProposal(signal, people, pedigree);
    return {
      signal,
      proposal,
      corroborations: corroborationsFor(ledger, signal),
      needs_owner: signal.type === "new_candidate" && !signal.refs.person_ids.length,
    };
  };

  const ruleAndAuthority = proposed.filter((s) => s.type === "rule_signal" || s.authority_expanding).map(entry);
  const inSection = new Set(ruleAndAuthority.map((e) => e.signal.id));
  const drift = proposed.filter((s) => s.type === "drift" && !inSection.has(s.id)).map(entry);
  const candidates = proposed
    .filter((s) => s.type === "new_candidate" && !inSection.has(s.id))
    .map(entry)
    .sort((a, b) => (b.corroborations.length + b.signal.confidence) - (a.corroborations.length + a.signal.confidence));
  const retirements = proposed.filter((s) => s.type === "retirement" && !inSection.has(s.id)).map(entry);
  const agentFeedback = proposed.filter((s) => s.type === "agent_feedback" && !inSection.has(s.id)).map(entry);

  const inPeriod = (s: StackSignal) => new Date(s.captured_at).getTime() >= cutoff;
  return {
    generated_at: now.toISOString(),
    period_days: periodDays,
    rule_and_authority: ruleAndAuthority,
    drift,
    candidates,
    retirements,
    agent_feedback: agentFeedback,
    free_wins: {
      confirmations: ledger.filter((s) => s.type === "confirmation" && s.status === "applied" && inPeriod(s)).length,
      backlog_resolutions: ledger.filter((s) => s.type === "backlog_resolution" && s.status === "applied" && inPeriod(s)),
    },
  };
}

export interface ApplyDigestInput {
  signalIds: string[];
  ledger: StackSignal[];
  approver: string;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  registry: AgentRegistryEntry[];
  auditLog: StackAuditRecord[];
  backlog: QuestionBacklogItem[];
}

export interface ApplyDigestResult {
  ledger: StackSignal[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  registry: AgentRegistryEntry[];
  auditLog: StackAuditRecord[];
  backlog: QuestionBacklogItem[];
  people?: Person[];   // returned when an authority_change patched a person
  applied: number;
  skipped: string[];   // signals that could not convert (e.g. missing owner)
}

/**
 * Apply selected digest items through the shared changeset apply path:
 * audit record per change, affected agents marked stale, recompile remains a
 * separate explicit action. Applied drift also counts as a confirmation of
 * the underlying record (freshness timestamps).
 */
export function applyDigestSelections(input: ApplyDigestInput): ApplyDigestResult {
  const selected = input.ledger.filter((s) => input.signalIds.includes(s.id) && s.status === "proposed");
  const proposals: StackChangeProposal[] = [];
  const skipped: string[] = [];
  const appliedSignalIds: string[] = [];

  for (const signal of selected) {
    const proposal = signalToProposal(signal, input.people, input.pedigree);
    if (!proposal) {
      skipped.push(signal.id);
      continue;
    }
    proposals.push({
      ...proposal,
      decision: { by: input.approver, at: new Date().toISOString(), action: "applied" },
    });
    appliedSignalIds.push(signal.id);
  }

  const result = applyStackProposals({
    proposals,
    approver: input.approver,
    people: input.people,
    pedigree: input.pedigree,
    companyContext: input.companyContext,
    registry: input.registry,
    auditLog: input.auditLog,
  });

  // Freshness: an applied drift/confirmation-bearing change attests the record.
  const confirmable = selected
    .filter((s) => appliedSignalIds.includes(s.id) && s.type === "drift")
    .map((s) => ({ person_ids: s.refs.person_ids, task_ids: s.refs.task_ids, agent_ids: s.refs.agent_ids }));
  const freshened = applyConfirmations(result.pedigree, result.registry, confirmable);

  // Backlog resolutions linked to applied signals.
  let backlog = input.backlog;
  for (const signal of selected) {
    if (!appliedSignalIds.includes(signal.id)) continue;
    for (const backlogId of signal.refs.backlog_ids) {
      backlog = resolveBacklogItem(backlog, backlogId, `signal:${signal.id}`);
    }
  }

  let ledger = input.ledger;
  for (const id of appliedSignalIds) ledger = setSignalStatus(ledger, id, "applied", input.approver);

  return {
    ledger,
    pedigree: freshened.pedigree,
    companyContext: result.companyContext,
    registry: freshened.registry,
    auditLog: result.auditLog,
    backlog,
    ...(result.people ? { people: result.people } : {}),
    applied: appliedSignalIds.length,
    skipped,
  };
}
