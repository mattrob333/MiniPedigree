import type { ParsedMap, PedigreeState, Person, Status } from "@/types";
import { suggestedAgentName } from "./parse";

export interface AddedTask {
  label: string;
  cls: "delegatable" | "approval" | "not_delegatable";
}

export interface PersonDelta {
  personId: string;
  addedResponsibilities: string[];
  addedTasks: AddedTask[];
  reassignedFrom: { label: string; fromPersonId: string }[];
}

export interface Changeset {
  deltas: PersonDelta[];
  summary: { newResponsibilities: number; newTasks: number; reassignments: number; peopleAffected: number };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Diff a freshly-parsed map (e.g. from a Fireflies transcript) against the current
 * pedigree state. Reconcile, never overwrite: surface only *new* responsibilities,
 * *new* tasks, and *reassignments* (a task that currently belongs to someone else).
 */
export function computeChangeset(people: Person[], pedigree: PedigreeState, parsed: ParsedMap): Changeset {
  // current owner of each task label (for reassignment detection)
  const ownerByTask = new Map<string, string>();
  for (const p of people) {
    const row = pedigree[p.id];
    if (!row) continue;
    for (const t of [...row.tasks.delegatable, ...row.tasks.approval, ...row.tasks.not_delegatable]) {
      if (!ownerByTask.has(norm(t.label))) ownerByTask.set(norm(t.label), p.id);
    }
  }

  const deltas: PersonDelta[] = [];
  for (const person of people) {
    const data = parsed[person.id];
    if (!data) continue;
    const row = pedigree[person.id];
    const existingResp = new Set((row?.responsibilities ?? []).map((r) => norm(r.title)));
    const existingTasks = new Set(
      [...(row?.tasks.delegatable ?? []), ...(row?.tasks.approval ?? []), ...(row?.tasks.not_delegatable ?? [])].map((t) => norm(t.label)),
    );

    const addedResponsibilities: string[] = [];
    const addedTasks: AddedTask[] = [];
    const reassignedFrom: { label: string; fromPersonId: string }[] = [];

    for (const r of data.responsibilities) {
      if (!existingResp.has(norm(r.title))) addedResponsibilities.push(r.title);
      const buckets: [AddedTask["cls"], string[]][] = [
        ["delegatable", r.tasks.delegatable],
        ["approval", r.tasks.approval],
        ["not_delegatable", r.tasks.not_delegatable],
      ];
      for (const [cls, labels] of buckets) {
        for (const label of labels) {
          if (existingTasks.has(norm(label))) continue;
          addedTasks.push({ label, cls });
          const prevOwner = ownerByTask.get(norm(label));
          if (prevOwner && prevOwner !== person.id) reassignedFrom.push({ label, fromPersonId: prevOwner });
        }
      }
    }

    if (addedResponsibilities.length || addedTasks.length) {
      deltas.push({ personId: person.id, addedResponsibilities, addedTasks, reassignedFrom });
    }
  }

  const summary = {
    newResponsibilities: deltas.reduce((s, d) => s + d.addedResponsibilities.length, 0),
    newTasks: deltas.reduce((s, d) => s + d.addedTasks.length, 0),
    reassignments: deltas.reduce((s, d) => s + d.reassignedFrom.length, 0),
    peopleAffected: deltas.length,
  };

  return { deltas, summary };
}

/**
 * Apply the approved deltas by MERGING new responsibilities/tasks onto existing
 * rows (existing items and agents are preserved). Returns a new pedigree state.
 */
export function applyOrgSync(
  people: Person[],
  pedigree: PedigreeState,
  parsed: ParsedMap,
  changeset: Changeset,
  approvedPersonIds: Set<string>,
): PedigreeState {
  const next: PedigreeState = { ...pedigree };
  let seq = 0;
  const nextId = (p: string) => `S-${Date.now().toString(36)}-${seq++}-${p}`;

  for (const delta of changeset.deltas) {
    if (!approvedPersonIds.has(delta.personId)) continue;
    const data = parsed[delta.personId];
    if (!data) continue;
    const prev = pedigree[delta.personId] ?? {
      status: "needs-discovery" as Status,
      responsibilities: [],
      tasks: { delegatable: [], approval: [], not_delegatable: [] },
      agents: [],
    };

    const respTitles = new Set(prev.responsibilities.map((r) => norm(r.title)));
    const taskLabels = new Set(
      [...prev.tasks.delegatable, ...prev.tasks.approval, ...prev.tasks.not_delegatable].map((t) => norm(t.label)),
    );

    const responsibilities = [...prev.responsibilities];
    const delegatable = [...prev.tasks.delegatable];
    const approval = [...prev.tasks.approval];
    const not_delegatable = [...prev.tasks.not_delegatable];

    for (const r of data.responsibilities) {
      let respId = responsibilities.find((x) => norm(x.title) === norm(r.title))?.id;
      if (!respId) {
        respId = nextId(delta.personId);
        responsibilities.push({ id: respId, title: r.title, suggestedAgent: suggestedAgentName(r.title), source: "Org Sync", confidence: r.confidence });
        respTitles.add(norm(r.title));
      }
      const add = (arr: typeof delegatable, label: string) => {
        if (taskLabels.has(norm(label))) return;
        arr.push({ id: nextId(delta.personId), label, respId: respId!, respTitle: r.title });
        taskLabels.add(norm(label));
      };
      r.tasks.delegatable.forEach((t) => add(delegatable, t));
      r.tasks.approval.forEach((t) => add(approval, t));
      r.tasks.not_delegatable.forEach((t) => add(not_delegatable, t));
    }

    const status: Status = prev.agents.length
      ? "generated"
      : delegatable.length > 0
        ? "ready"
        : responsibilities.length > 0
          ? "mapped"
          : prev.status;

    next[delta.personId] = {
      ...prev,
      status,
      responsibilities,
      tasks: { delegatable, approval, not_delegatable },
      lastSession: "Org Sync",
    };
  }

  return next;
}
