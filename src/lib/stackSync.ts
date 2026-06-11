import type {
  AgentRegistryEntry,
  AuthorityAssertion,
  AuthorityProvenance,
  CompanyContext,
  GovernanceRule,
  ParsedMap,
  ParsedTask,
  PedigreeState,
  Person,
  StackAuditRecord,
  StackChangeProposal,
  TaskItem,
} from "@/types";
import { applyAssertion } from "./authority";
import { extractGovernanceRulesDeterministic, significantKeywords } from "./governance";
import { deriveProvenance } from "./provenance";
import { markStale } from "./registry";
import type { ItemProvenance } from "@/types";

// ── Phase 6: the living stack ──────────────────────────────────────────
// New transcript → diff against (a) responsibility map, (b) Agent Registry,
// (c) governance rules → typed proposals with evidence. Nothing auto-applies:
// human review always sits between diff and apply, and recompiles are a
// separate explicit action per agent.

export interface StackDiffInput {
  parsed: ParsedMap;
  transcript: string;
  transcriptId?: string;
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  rules: GovernanceRule[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(significantKeywords(a));
  const tb = new Set(significantKeywords(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const SIMILAR_THRESHOLD = 0.6;

let proposalSeq = 0;
function nextProposalId(): string {
  proposalSeq += 1;
  return `SCP-${Date.now().toString(36)}-${proposalSeq}`;
}

interface OwnedTask {
  personId: string;
  task: TaskItem;
  cls: "delegatable" | "approval" | "not_delegatable";
}

function allOwnedTasks(people: Person[], pedigree: PedigreeState): OwnedTask[] {
  const out: OwnedTask[] = [];
  for (const person of people) {
    const row = pedigree[person.id];
    if (!row) continue;
    for (const task of row.tasks.delegatable) out.push({ personId: person.id, task, cls: "delegatable" });
    for (const task of row.tasks.approval) out.push({ personId: person.id, task, cls: "approval" });
    for (const task of row.tasks.not_delegatable) out.push({ personId: person.id, task, cls: "not_delegatable" });
  }
  return out;
}

function activeAgentsFor(registry: AgentRegistryEntry[], personId?: string, taskId?: string): string[] {
  return registry
    .filter((e) => e.status !== "retired")
    .filter((e) => (personId ? e.owner_person_id === personId : true))
    .filter((e) => (taskId ? e.task_id === taskId : true))
    .map((e) => e.agent_id);
}

function classRank(cls: ParsedTask["delegation_class"] | OwnedTask["cls"]): number {
  // Higher = more restricted. Moving DOWN this ladder expands authority.
  if (cls === "delegatable") return 0;
  if (cls === "human_approval_required" || cls === "approval") return 1;
  return 2; // not_delegatable / unclear treated as restricted
}

/**
 * Deterministic stack diff. Same person + similar task label → task_changed;
 * unknown task verb-phrase for a mapped person → new_task; task owned by a
 * different person → ownership_transfer; rule-shaped sentence not in the
 * current rule set → rule_changed; explicit stop phrases → retire_candidate;
 * agent name mentions → agent_feedback.
 */
export function runStackDiffDeterministic(input: StackDiffInput): StackChangeProposal[] {
  proposalSeq = 0;
  const transcriptId = input.transcriptId ?? `T-${Date.now().toString(36)}`;
  const proposals: StackChangeProposal[] = [];
  const owned = allOwnedTasks(input.people, input.pedigree);

  // ── Task-level proposals from the parsed map ──
  for (const person of input.people) {
    const data = input.parsed[person.id];
    if (!data) continue;
    const mine = owned.filter((o) => o.personId === person.id);

    for (const resp of data.responsibilities) {
      const details = resp.taskDetails ?? [];
      const detailFor = (label: string) => details.find((d) => norm(d.name) === norm(label));
      const labels: { label: string; cls: ParsedTask["delegation_class"] }[] = [
        ...resp.tasks.delegatable.map((l) => ({ label: l, cls: "delegatable" as const })),
        ...resp.tasks.approval.map((l) => ({ label: l, cls: "human_approval_required" as const })),
        ...resp.tasks.not_delegatable.map((l) => ({ label: l, cls: "not_delegatable" as const })),
      ];

      for (const { label, cls } of labels) {
        const detail = detailFor(label);
        const evidence = detail?.evidence_quote || resp.evidence_quote || label;
        const exact = mine.find((o) => norm(o.task.label) === norm(label));
        const similar = exact ?? mine.find((o) => tokenOverlap(o.task.label, label) >= SIMILAR_THRESHOLD);

        if (similar) {
          const changes = describeTaskChanges(similar, label, cls, detail);
          if (!changes.length) continue;
          const expanding = classRank(cls) < classRank(similar.cls) || changes.some((c) => c.startsWith("tools:"));
          proposals.push({
            id: nextProposalId(),
            type: "task_changed",
            summary: `${person.name}: "${similar.task.label}" changed (${changes.join("; ")}).`,
            evidence_quote: evidence,
            transcript_id: transcriptId,
            confidence: exact ? 0.85 : 0.65,
            affected: {
              person_ids: [person.id],
              agent_ids: activeAgentsFor(input.registry, person.id, similar.task.id),
              rule_ids: [],
            },
            authority_expanding: expanding,
            proposed_patch: { kind: "task_changed", personId: person.id, taskId: similar.task.id, label, delegation_class: cls, completion: detail ? extractCompletion(detail) : undefined },
          });
          continue;
        }

        // Owned by someone else → ownership transfer.
        const elsewhere = owned.find((o) => o.personId !== person.id && norm(o.task.label) === norm(label));
        if (elsewhere) {
          proposals.push({
            id: nextProposalId(),
            type: "ownership_transfer",
            summary: `"${label}" moves from ${input.people.find((p) => p.id === elsewhere.personId)?.name ?? elsewhere.personId} to ${person.name}.`,
            evidence_quote: evidence,
            transcript_id: transcriptId,
            confidence: 0.7,
            affected: {
              person_ids: [person.id, elsewhere.personId],
              agent_ids: activeAgentsFor(input.registry, elsewhere.personId, elsewhere.task.id),
              rule_ids: [],
            },
            // Re-evaluating the authority ceiling is mandatory on transfer.
            authority_expanding: true,
            proposed_patch: { kind: "ownership_transfer", fromPersonId: elsewhere.personId, toPersonId: person.id, taskId: elsewhere.task.id, label, respTitle: resp.title },
          });
          continue;
        }

        // Unknown task for a mapped person → new task / agent candidate.
        if (cls === "delegatable" || cls === "human_approval_required") {
          proposals.push({
            id: nextProposalId(),
            type: "new_task",
            summary: `${person.name}: new recurring work "${label}" (${cls}) — agent candidate.`,
            evidence_quote: evidence,
            transcript_id: transcriptId,
            confidence: detail ? 0.75 : 0.6,
            affected: { person_ids: [person.id], agent_ids: [], rule_ids: [] },
            authority_expanding: false, // a candidate, not a grant; authority is decided at compile time
            proposed_patch: { kind: "new_task", personId: person.id, respTitle: resp.title, label, delegation_class: cls, completion: detail ? extractCompletion(detail) : undefined },
          });
        }
      }
    }
  }

  // ── Rule-shaped sentences → rule_changed ──
  const transcriptRules = extractGovernanceRulesDeterministic({
    contextDocuments: [{ id: `transcript:${transcriptId}`, bucket: "policy", fileName: "transcript", text: input.transcript, uploadedAt: new Date().toISOString() }],
  });
  for (const rule of transcriptRules) {
    const known = input.rules.some((r) => norm(r.condition) === norm(rule.condition) || tokenOverlap(r.condition, rule.condition) >= 0.8);
    if (known) continue;
    const affectedTasks = owned.filter((o) => (rule.matcher.keywords ?? []).some((k) => o.task.label.toLowerCase().includes(k)));
    const expanding = /\bno longer\b|\banymore\b|\blifted\b|\bremoved?\b|\brelax\w*\b/i.test(rule.evidence_quote);
    proposals.push({
      id: nextProposalId(),
      type: "rule_changed",
      summary: `Governance change (${rule.type}): ${rule.condition}`,
      evidence_quote: rule.evidence_quote,
      transcript_id: transcriptId,
      confidence: 0.7,
      affected: {
        person_ids: Array.from(new Set(affectedTasks.map((t) => t.personId))),
        agent_ids: Array.from(new Set(affectedTasks.flatMap((t) => activeAgentsFor(input.registry, t.personId, t.task.id)))),
        rule_ids: [rule.rule_id],
      },
      authority_expanding: expanding,
      proposed_patch: { kind: "rule_changed", rule },
    });
  }

  // ── Retire candidates: explicit stop phrases against owned tasks ──
  const stopSentences = input.transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => /\bno longer\b|\bstopped\b|\bnot\s+doing\b.*\banymore\b|\bhanded\s+off\b|\bwent\s+away\b/i.test(s));
  for (const sentence of stopSentences) {
    for (const o of owned) {
      if (tokenOverlap(sentence, o.task.label) < SIMILAR_THRESHOLD) continue;
      const agents = activeAgentsFor(input.registry, o.personId, o.task.id);
      if (!agents.length) continue;
      proposals.push({
        id: nextProposalId(),
        type: "retire_candidate",
        summary: `Work "${o.task.label}" appears to no longer be performed — retire ${agents.join(", ")}?`,
        evidence_quote: sentence.trim(),
        transcript_id: transcriptId,
        confidence: 0.55,
        affected: { person_ids: [o.personId], agent_ids: agents, rule_ids: [] },
        authority_expanding: false,
        proposed_patch: { kind: "retire_candidate", agentIds: agents },
      });
    }
  }

  // ── Agent feedback: a registered agent named in the meeting ──
  for (const entry of input.registry) {
    if (entry.status === "retired") continue;
    const latest = entry.versions[entry.versions.length - 1];
    const name = String((latest?.compiled as Record<string, unknown> | undefined)?.agent_name ?? "");
    if (!name) continue;
    const mention = input.transcript
      .split(/(?<=[.!?])\s+|\n+/)
      .find((s) => s.toLowerCase().includes(name.toLowerCase()));
    if (!mention) continue;
    proposals.push({
      id: nextProposalId(),
      type: "agent_feedback",
      summary: `Feedback on ${name} captured in the meeting — attach as review note.`,
      evidence_quote: mention.trim(),
      transcript_id: transcriptId,
      confidence: 0.6,
      affected: { person_ids: [entry.owner_person_id], agent_ids: [entry.agent_id], rule_ids: [] },
      authority_expanding: false,
      proposed_patch: { kind: "agent_feedback", agentId: entry.agent_id, note: mention.trim() },
    });
  }

  return proposals;
}

function describeTaskChanges(existing: OwnedTask, label: string, cls: ParsedTask["delegation_class"], detail?: ParsedTask): string[] {
  const changes: string[] = [];
  if (classRank(cls) !== classRank(existing.cls)) {
    changes.push(`class: ${existing.cls} → ${cls}`);
  }
  const completion = existing.task.completion;
  if (detail?.trigger && detail.trigger !== completion?.trigger) changes.push(`cadence: ${completion?.trigger ?? "unstated"} → ${detail.trigger}`);
  if (detail?.inputs?.length && stringsDiffer(detail.inputs, completion?.inputs)) changes.push("inputs changed");
  if (detail?.outputs?.length && stringsDiffer(detail.outputs, completion?.outputs)) changes.push("outputs changed");
  if (detail?.tools_mentioned?.length) {
    const known = new Set((completion?.tools_mentioned ?? []).map(norm));
    const added = detail.tools_mentioned.filter((t) => !known.has(norm(t)));
    if (added.length) changes.push(`tools: +${added.join(", ")}`);
  }
  if (norm(label) !== norm(existing.task.label)) changes.push(`label: "${existing.task.label}" → "${label}"`);
  return changes;
}

function stringsDiffer(next: string[], prev?: string[] | null): boolean {
  const a = new Set((prev ?? []).map(norm));
  return next.some((n) => !a.has(norm(n)));
}

function extractCompletion(detail: ParsedTask): TaskItem["completion"] {
  return {
    trigger: detail.trigger ?? null,
    inputs: detail.inputs ?? null,
    outputs: detail.outputs ?? null,
    tools_mentioned: detail.tools_mentioned ?? null,
    definition_of_done: detail.definition_of_done ?? null,
    readiness: detail.readiness ?? null,
    open_questions: detail.open_questions ?? null,
    candidate_pattern: detail.candidate_pattern ?? null,
  };
}

// ── Apply path ─────────────────────────────────────────────────────────

export interface ApplyStackInput {
  proposals: StackChangeProposal[];
  approver: string;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  registry: AgentRegistryEntry[];
  auditLog: StackAuditRecord[];
}

export interface ApplyStackResult {
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  registry: AgentRegistryEntry[];
  auditLog: StackAuditRecord[];
  /** Returned when an authority_change proposal patched a person record. */
  people?: Person[];
  applied: number;
}

/**
 * Apply approved proposals. Every applied change writes an audit record
 * (who approved, what changed, which transcript sentence justified it) and
 * marks affected registry entries stale. Recompiling is a separate explicit
 * user action per agent — never automatic.
 */
export function applyStackProposals(input: ApplyStackInput): ApplyStackResult {
  let pedigree = { ...input.pedigree };
  let companyContext = input.companyContext ? { ...input.companyContext } : undefined;
  let registry = input.registry;
  let people = input.people;
  let peopleChanged = false;
  const auditLog = [...input.auditLog];
  let applied = 0;
  const now = () => new Date().toISOString();

  for (const proposal of input.proposals) {
    // Invariant: nothing applies without an explicit decision record.
    if (proposal.decision?.action !== "applied") continue;
    const patch = proposal.proposed_patch as Record<string, any> | null;
    if (!patch) continue;

    switch (proposal.type) {
      case "new_task": {
        pedigree = addTaskToPerson(
          pedigree, patch.personId, patch.respTitle, patch.label, patch.delegation_class, patch.completion,
          deriveProvenance({ evidence: proposal.evidence_quote, confidence: proposal.confidence, source: "Stack Sync" }),
        );
        break;
      }
      case "task_changed": {
        pedigree = updateTask(pedigree, patch.personId, patch.taskId, patch.label, patch.delegation_class, patch.completion);
        break;
      }
      case "ownership_transfer": {
        pedigree = removeTask(pedigree, patch.fromPersonId, patch.taskId);
        pedigree = addTaskToPerson(
          pedigree, patch.toPersonId, patch.respTitle, patch.label, "human_approval_required", undefined,
          deriveProvenance({ evidence: proposal.evidence_quote, confidence: proposal.confidence, source: "Stack Sync" }),
        );
        break;
      }
      case "rule_changed": {
        const rule = patch.rule as GovernanceRule;
        const base: CompanyContext = companyContext ?? { company: "", whatWeDo: "" };
        companyContext = rule.type === "sod_conflict"
          ? { ...base, segregationOfDuties: [...(base.segregationOfDuties ?? []), rule.evidence_quote], updatedAt: now() }
          : { ...base, approvalRules: [...(base.approvalRules ?? []), rule.evidence_quote], updatedAt: now() };
        break;
      }
      case "retire_candidate": {
        registry = registry.map((entry) =>
          (patch.agentIds as string[]).includes(entry.agent_id) ? { ...entry, status: "retired" as const } : entry,
        );
        // Digest retirements may also confirm-retire the underlying task.
        for (const removal of (patch.taskRemovals ?? []) as { personId: string; taskId: string }[]) {
          pedigree = removeTask(pedigree, removal.personId, removal.taskId);
        }
        break;
      }
      case "authority_change": {
        // A reviewed authority assertion (discovery or member) merges onto the
        // person record with trust ordering; discrepancies flag, never resolve.
        const personId = patch.personId as string;
        const assertion = patch.assertion as AuthorityAssertion;
        const provenance = (patch.provenance ?? { source: "discovery", transcript_id: proposal.transcript_id }) as AuthorityProvenance;
        people = people.map((person) => {
          if (person.id !== personId) return person;
          const base = person.authority ?? { system_grants: [], approval_authority: [], sod_roles: [], updated_at: now() };
          const res = applyAssertion(base, personId, assertion, provenance);
          return { ...person, authority: res.profile };
        });
        peopleChanged = true;
        // Authority is a compile ingredient: every agent this person owns drifts.
        const owned = registry.filter((e) => e.owner_person_id === personId && e.status !== "retired").map((e) => e.agent_id);
        if (owned.length) registry = markStale(registry, owned);
        break;
      }
      case "agent_feedback":
        // Review note: the audit record below is the attachment.
        break;
    }

    // Ingredient drift: every affected (non-retired) agent goes stale.
    if (proposal.type !== "retire_candidate" && proposal.affected.agent_ids.length) {
      registry = markStale(registry, proposal.affected.agent_ids);
    }

    auditLog.push({
      id: `AUD-${Date.now().toString(36)}-${auditLog.length}`,
      proposal_id: proposal.id,
      proposal_type: proposal.type,
      approver: input.approver,
      timestamp: proposal.decision.at || now(),
      evidence_quote: proposal.evidence_quote,
      transcript_id: proposal.transcript_id,
      summary: proposal.summary,
    });
    applied++;
  }

  return { pedigree, companyContext, registry, auditLog, ...(peopleChanged ? { people } : {}), applied };
}

function addTaskToPerson(
  pedigree: PedigreeState,
  personId: string,
  respTitle: string,
  label: string,
  cls: ParsedTask["delegation_class"],
  completion: TaskItem["completion"],
  provenance?: ItemProvenance,
): PedigreeState {
  const prev = pedigree[personId] ?? {
    status: "needs-discovery" as const,
    responsibilities: [],
    tasks: { delegatable: [], approval: [], not_delegatable: [] },
    agents: [],
  };
  // Idempotent: never duplicate an existing task label for this person.
  const existingLabels = new Set(
    [...prev.tasks.delegatable, ...prev.tasks.approval, ...prev.tasks.not_delegatable].map((t) => norm(t.label)),
  );
  if (existingLabels.has(norm(label))) return pedigree;
  let resp = prev.responsibilities.find((r) => norm(r.title) === norm(respTitle));
  const responsibilities = [...prev.responsibilities];
  if (!resp) {
    resp = { id: `S-${Date.now().toString(36)}-${personId}`, title: respTitle, source: "Stack Sync" };
    responsibilities.push(resp);
  }
  const item: TaskItem = {
    id: `${resp.id}-s-${Date.now().toString(36)}`,
    label,
    respId: resp.id,
    respTitle: resp.title,
    ...(completion ? { completion } : {}),
    ...(provenance ? { provenance } : {}),
    last_confirmed_at: new Date().toISOString(), // evidence-backed at creation
  };
  const tasks = {
    delegatable: [...prev.tasks.delegatable],
    approval: [...prev.tasks.approval],
    not_delegatable: [...prev.tasks.not_delegatable],
  };
  if (cls === "delegatable") tasks.delegatable.push(item);
  else if (cls === "not_delegatable") tasks.not_delegatable.push(item);
  else tasks.approval.push(item);
  return { ...pedigree, [personId]: { ...prev, responsibilities, tasks, lastSession: "Stack Sync" } };
}

function updateTask(
  pedigree: PedigreeState,
  personId: string,
  taskId: string,
  label: string,
  cls: ParsedTask["delegation_class"],
  completion: TaskItem["completion"],
): PedigreeState {
  const prev = pedigree[personId];
  if (!prev) return pedigree;
  const buckets = ["delegatable", "approval", "not_delegatable"] as const;
  let found: TaskItem | undefined;
  const stripped = {
    delegatable: prev.tasks.delegatable.filter((t) => (t.id === taskId ? ((found = t), false) : true)),
    approval: prev.tasks.approval.filter((t) => (t.id === taskId ? ((found = t), false) : true)),
    not_delegatable: prev.tasks.not_delegatable.filter((t) => (t.id === taskId ? ((found = t), false) : true)),
  };
  if (!found) return pedigree;
  const updated: TaskItem = {
    ...found,
    label,
    ...(completion ? { completion: { ...found.completion, ...completion } } : {}),
  };
  const bucket: (typeof buckets)[number] = cls === "delegatable" ? "delegatable" : cls === "not_delegatable" ? "not_delegatable" : "approval";
  stripped[bucket] = [...stripped[bucket], updated];
  return { ...pedigree, [personId]: { ...prev, tasks: stripped, lastSession: "Stack Sync" } };
}

function removeTask(pedigree: PedigreeState, personId: string, taskId: string): PedigreeState {
  const prev = pedigree[personId];
  if (!prev) return pedigree;
  return {
    ...pedigree,
    [personId]: {
      ...prev,
      tasks: {
        delegatable: prev.tasks.delegatable.filter((t) => t.id !== taskId),
        approval: prev.tasks.approval.filter((t) => t.id !== taskId),
        not_delegatable: prev.tasks.not_delegatable.filter((t) => t.id !== taskId),
      },
      lastSession: "Stack Sync",
    },
  };
}
