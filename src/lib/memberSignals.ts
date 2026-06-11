import type { Person, StackSignal, TaskItem } from "@/types";

// ── Living Stack B.3/B.4: member self-service signals ──────────────────
// Member actions NEVER write directly to authority-bearing fields. Everything
// routes through the signal ledger and the digest review path. The one
// exception: confirming one's own task, which only updates last_confirmed_at.
// A member cannot widen their own agent's tasks, tools, or scopes — not even
// via "correct": such corrections become authority_expanding proposals.

let memberSeq = 0;
function nextId(): string {
  memberSeq += 1;
  return `SIG-M-${Date.now().toString(36)}-${memberSeq}`;
}

function memberSignal(person: Person, type: StackSignal["type"], evidence: string): StackSignal {
  return {
    id: nextId(),
    type,
    source: { kind: "member", person_id: person.id },
    evidence_quote: evidence,
    confidence: 0.9, // the owner speaking about their own work — highest trust
    refs: { person_ids: [person.id], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [] },
    authority_expanding: false,
    captured_at: new Date().toISOString(),
    status: "ledgered",
  };
}

/** One-tap confirm: a confirmation signal — timestamps only, never authority. */
export function memberConfirmTask(person: Person, task: TaskItem, agentIds: string[] = []): StackSignal {
  const signal = memberSignal(person, "confirmation", `${person.name} confirmed "${task.label}" is still accurate.`);
  signal.refs.task_ids = [task.id];
  signal.refs.agent_ids = agentIds;
  return signal;
}

export interface MemberCorrection {
  cadence?: string;
  inputs?: string[];
  outputs?: string[];
  tools?: string[];
  note?: string;
}

/**
 * Correct: emits a drift signal; nothing changes until the digest applies it.
 * Adding tools is authority-touching and is flagged for governance review.
 */
export function memberCorrectTask(person: Person, task: TaskItem, correction: MemberCorrection, agentIds: string[] = []): StackSignal {
  const parts: string[] = [];
  if (correction.cadence) parts.push(`cadence is now ${correction.cadence}`);
  if (correction.inputs?.length) parts.push(`inputs: ${correction.inputs.join(", ")}`);
  if (correction.outputs?.length) parts.push(`outputs: ${correction.outputs.join(", ")}`);
  if (correction.tools?.length) parts.push(`tools: ${correction.tools.join(", ")}`);
  if (correction.note) parts.push(correction.note);
  const signal = memberSignal(person, "drift", `${person.name} corrected "${task.label}": ${parts.join("; ") || "details updated"}.`);
  signal.refs.task_ids = [task.id];
  signal.refs.agent_ids = agentIds;
  // New tools on a task widen what a compiled agent could touch.
  signal.authority_expanding = Boolean(correction.tools?.length);
  signal.proposed_patch = {
    kind: "drift",
    summary: parts.join("; "),
    label: task.label,
    cadence: correction.cadence ?? null,
    owner_person_id: null,
    recurrence_language: false,
  };
  return signal;
}

/** "Doesn't exist anymore" → retirement signal, digest-reviewed. */
export function memberRetireTask(person: Person, task: TaskItem, agentIds: string[] = []): StackSignal {
  const signal = memberSignal(person, "retirement", `${person.name} reports "${task.label}" is no longer performed.`);
  signal.refs.task_ids = [task.id];
  signal.refs.agent_ids = agentIds;
  signal.proposed_patch = { kind: "retirement", task_id: task.id, person_id: person.id, agent_ids: agentIds };
  return signal;
}

/** Report an issue with an agent's output → agent_feedback. */
export function memberAgentFeedback(person: Person, agentId: string, note: string): StackSignal {
  const signal = memberSignal(person, "agent_feedback", note.trim());
  signal.refs.agent_ids = [agentId];
  signal.proposed_patch = { kind: "agent_feedback", agent_id: agentId, note: note.trim() };
  return signal;
}

export interface AgentRequest {
  work: string;          // what's the recurring work
  last_time: string;     // last time you did it
  cadence: string;
  inputs: string;        // which systems
  output: string;        // what comes out, who receives it
  tedious: string;       // what makes it tedious
}

/**
 * Request an Agent — a self-service mini discovery. Member provenance counts
 * as corroboration (A.4): a member request plus one meeting mention promotes
 * immediately.
 */
export function memberAgentRequest(person: Person, request: AgentRequest): StackSignal {
  const evidence = [
    `Recurring work: ${request.work}`,
    request.last_time && `Last done: ${request.last_time}`,
    request.cadence && `Cadence: ${request.cadence}`,
    request.inputs && `Inputs: ${request.inputs}`,
    request.output && `Output: ${request.output}`,
    request.tedious && `Pain: ${request.tedious}`,
  ].filter(Boolean).join(" · ");
  const signal = memberSignal(person, "new_candidate", evidence);
  signal.proposed_patch = {
    kind: "new_candidate",
    label: request.work.length > 80 ? `${request.work.slice(0, 77)}...` : request.work,
    cadence: request.cadence || null,
    recurrence_language: true,
  };
  return signal;
}

/** Display labels for a member's request-status tracker. */
export function requestStatusLabel(status: StackSignal["status"]): string {
  switch (status) {
    case "ledgered": return "Logged — awaiting corroboration";
    case "proposed": return "In review (this week's digest)";
    case "applied": return "Approved — task added to the map";
    case "rejected": return "Declined";
    case "expired": return "Expired without corroboration";
  }
}
