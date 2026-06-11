import type {
  AgentRegistryEntry,
  PedigreeState,
  Person,
  QuestionBacklogItem,
  RegisteredMeeting,
} from "@/types";

// ── Living Stack A.2: meeting registry ─────────────────────────────────
// Recurring meetings are first-class objects so the maintenance parser can
// calibrate per meeting and route output correctly. Unregistered transcripts
// still parse; the user is prompted to register the series afterwards.

export interface MeetingDraft {
  name: string;
  cadence: RegisteredMeeting["cadence"];
  usual_participant_ids: string[];
  department?: string;
  source: RegisteredMeeting["source"];
  source_ref?: string;
  signal_profile?: RegisteredMeeting["signal_profile"];
}

export function addMeeting(meetings: RegisteredMeeting[], draft: MeetingDraft): RegisteredMeeting[] {
  return [
    ...meetings,
    {
      id: `MTG-${Date.now().toString(36)}-${meetings.length}`,
      name: draft.name.trim(),
      cadence: draft.cadence,
      usual_participant_ids: draft.usual_participant_ids,
      ...(draft.department ? { department: draft.department } : {}),
      source: draft.source,
      ...(draft.source_ref ? { source_ref: draft.source_ref } : {}),
      ...(draft.signal_profile ? { signal_profile: draft.signal_profile } : {}),
      active: true,
    },
  ];
}

export function updateMeeting(meetings: RegisteredMeeting[], id: string, patch: Partial<MeetingDraft> & { active?: boolean }): RegisteredMeeting[] {
  return meetings.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

export function removeMeeting(meetings: RegisteredMeeting[], id: string): RegisteredMeeting[] {
  return meetings.filter((m) => m.id !== id);
}

// ── Compact stack state for the maintenance parse ──────────────────────
// The parser receives task labels, cadences, agent names, and open backlog
// questions for the participants — not full records.

export interface CompactStackState {
  tasks: { id: string; person_id: string; label: string; cadence: string | null; cls: "delegatable" | "approval" | "not_delegatable" }[];
  agents: { id: string; name: string; owner_person_id: string; task_id: string; status: string }[];
  open_questions: { id: string; person_id: string; question: string }[];
  rules: { id: string; condition: string }[];
}

export function buildCompactStackState(
  participants: Person[],
  pedigree: PedigreeState,
  registry: AgentRegistryEntry[],
  backlog: QuestionBacklogItem[],
  ruleConditions: { rule_id: string; condition: string }[] = [],
): CompactStackState {
  const ids = new Set(participants.map((p) => p.id));
  const tasks: CompactStackState["tasks"] = [];
  for (const person of participants) {
    const row = pedigree[person.id];
    if (!row) continue;
    const push = (cls: CompactStackState["tasks"][number]["cls"], list: typeof row.tasks.delegatable) => {
      for (const t of list) {
        tasks.push({ id: t.id, person_id: person.id, label: t.label, cadence: t.completion?.trigger ?? null, cls });
      }
    };
    push("delegatable", row.tasks.delegatable);
    push("approval", row.tasks.approval);
    push("not_delegatable", row.tasks.not_delegatable);
  }
  const agents: CompactStackState["agents"] = registry
    .filter((e) => e.status !== "retired" && ids.has(e.owner_person_id))
    .map((e) => {
      const latest = e.versions[e.versions.length - 1];
      return {
        id: e.agent_id,
        name: String((latest?.compiled as Record<string, unknown> | undefined)?.agent_name ?? e.agent_id),
        owner_person_id: e.owner_person_id,
        task_id: e.task_id,
        status: e.status,
      };
    });
  return {
    tasks,
    agents,
    open_questions: backlog
      .filter((b) => !b.resolved_by_session_id && ids.has(b.person_id))
      .map((b) => ({ id: b.id, person_id: b.person_id, question: b.question })),
    rules: ruleConditions.map((r) => ({ id: r.rule_id, condition: r.condition })),
  };
}
