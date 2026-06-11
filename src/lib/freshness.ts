import type {
  AgentRegistryEntry,
  FreshnessConfig,
  FreshnessState,
  PedigreeState,
  Person,
  QuestionBacklogItem,
  TaskItem,
} from "@/types";

// ── Living Stack A.5: the freshness model ──────────────────────────────
// Every responsibility, task, and agent carries freshness derived from
// last_confirmed_at (set by confirmations, applied changes, or member
// confirmations):
//   fresh — confirmed within the window
//   aging — up to two windows without confirmation
//   stale — beyond that; surfaced for action

export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  task_days: 30,
  responsibility_days: 60,
  agent_days: 45,
  authority_days: 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshnessOf(lastConfirmedAt: string | undefined, windowDays: number, now = new Date()): FreshnessState {
  if (!lastConfirmedAt) return "stale"; // never confirmed = needs attention
  const age = now.getTime() - new Date(lastConfirmedAt).getTime();
  if (age <= windowDays * DAY_MS) return "fresh";
  if (age <= 2 * windowDays * DAY_MS) return "aging";
  return "stale";
}

export function taskFreshness(task: TaskItem, config: FreshnessConfig, now = new Date()): FreshnessState {
  return freshnessOf(task.last_confirmed_at, config.task_days, now);
}

export function agentFreshness(entry: AgentRegistryEntry, config: FreshnessConfig, now = new Date()): FreshnessState {
  const compiledAt = entry.versions[entry.versions.length - 1]?.created_at;
  return freshnessOf(entry.last_confirmed_at ?? compiledAt, config.agent_days, now);
}

export function authorityFreshness(person: Person, config: FreshnessConfig, now = new Date()): FreshnessState {
  return freshnessOf(person.authority?.updated_at, config.authority_days, now);
}

/**
 * Apply confirmations: timestamps only — never authority. Touches the tasks,
 * their parent responsibilities, and any agents built on them.
 */
export function applyConfirmations(
  pedigree: PedigreeState,
  registry: AgentRegistryEntry[],
  confirmations: { person_ids: string[]; task_ids: string[]; agent_ids: string[] }[],
  when = new Date().toISOString(),
): { pedigree: PedigreeState; registry: AgentRegistryEntry[] } {
  const taskIds = new Set(confirmations.flatMap((c) => c.task_ids));
  const agentIds = new Set(confirmations.flatMap((c) => c.agent_ids));
  const personIds = new Set(confirmations.flatMap((c) => c.person_ids));
  if (!taskIds.size && !agentIds.size) return { pedigree, registry };

  const nextPedigree: PedigreeState = { ...pedigree };
  for (const personId of personIds) {
    const row = nextPedigree[personId];
    if (!row) continue;
    const confirmedRespIds = new Set<string>();
    const touch = (tasks: TaskItem[]) =>
      tasks.map((t) => {
        if (!taskIds.has(t.id)) return t;
        confirmedRespIds.add(t.respId);
        return { ...t, last_confirmed_at: when };
      });
    const tasks = {
      delegatable: touch(row.tasks.delegatable),
      approval: touch(row.tasks.approval),
      not_delegatable: touch(row.tasks.not_delegatable),
    };
    nextPedigree[personId] = {
      ...row,
      tasks,
      responsibilities: row.responsibilities.map((r) =>
        confirmedRespIds.has(r.id) ? { ...r, last_confirmed_at: when } : r,
      ),
    };
  }

  const nextRegistry = registry.map((entry) =>
    agentIds.has(entry.agent_id) || taskIds.has(entry.task_id)
      ? { ...entry, last_confirmed_at: when }
      : entry,
  );

  return { pedigree: nextPedigree, registry: nextRegistry };
}

export interface StaleItem {
  kind: "task" | "responsibility" | "agent" | "authority";
  person_id: string;
  person_name: string;
  id: string;
  label: string;
  state: FreshnessState;
  last_confirmed_at?: string;
}

/**
 * Everything aging/stale, owner-first — feeds brief-question injection, the
 * member workspace one-tap confirm, and mini-refresh proposals. An agent
 * whose underlying task has gone stale is itself flagged: its work may no
 * longer exist.
 */
export function collectStaleItems(
  people: Person[],
  pedigree: PedigreeState,
  registry: AgentRegistryEntry[],
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
  now = new Date(),
): StaleItem[] {
  const out: StaleItem[] = [];
  for (const person of people) {
    if (person.lifecycle === "offboarded") continue;
    const row = pedigree[person.id];
    if (!row) continue;
    const buckets = [...row.tasks.delegatable, ...row.tasks.approval, ...row.tasks.not_delegatable];
    for (const task of buckets) {
      const state = taskFreshness(task, config, now);
      if (state !== "fresh") {
        out.push({ kind: "task", person_id: person.id, person_name: person.name, id: task.id, label: task.label, state, ...(task.last_confirmed_at ? { last_confirmed_at: task.last_confirmed_at } : {}) });
      }
    }
    for (const resp of row.responsibilities) {
      const state = freshnessOf(resp.last_confirmed_at, config.responsibility_days, now);
      if (state === "stale") {
        out.push({ kind: "responsibility", person_id: person.id, person_name: person.name, id: resp.id, label: resp.title, state, ...(resp.last_confirmed_at ? { last_confirmed_at: resp.last_confirmed_at } : {}) });
      }
    }
    if (person.authority && authorityFreshness(person, config, now) === "stale") {
      out.push({ kind: "authority", person_id: person.id, person_name: person.name, id: `auth-${person.id}`, label: "Authority profile", state: "stale" });
    }
  }
  for (const entry of registry) {
    if (entry.status === "retired") continue;
    const owner = people.find((p) => p.id === entry.owner_person_id);
    const state = agentFreshness(entry, config, now);
    const taskStale = out.some((i) => i.kind === "task" && i.id === entry.task_id && i.state === "stale");
    if (state !== "fresh" || taskStale) {
      out.push({
        kind: "agent",
        person_id: entry.owner_person_id,
        person_name: owner?.name ?? entry.owner_person_id,
        id: entry.agent_id,
        label: taskStale ? `${entry.agent_id} (underlying task is stale — its work may no longer exist)` : entry.agent_id,
        state: taskStale ? "stale" : state,
        ...(entry.last_confirmed_at ? { last_confirmed_at: entry.last_confirmed_at } : {}),
      });
    }
  }
  const rank: Record<FreshnessState, number> = { stale: 0, aging: 1, fresh: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

/**
 * Stale-check questions for the next relevant session brief, shaped as
 * backlog items so every brief-question source flows through one channel.
 */
export function staleConfirmationQuestions(items: StaleItem[], personIds: string[], limit = 4): QuestionBacklogItem[] {
  const ids = new Set(personIds);
  return items
    .filter((i) => i.kind === "task" && i.state === "stale" && ids.has(i.person_id))
    .slice(0, limit)
    .map((i) => ({
      id: `QB-STALE-${i.id}`,
      person_id: i.person_id,
      question: `Is "${i.label}" still happening the way it was originally described? Walk me through the last time.`,
      source: "parser_open_question" as const,
      source_ref: i.id,
      created_at: new Date().toISOString(),
    }));
}
