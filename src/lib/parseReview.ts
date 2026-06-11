import type { ParsedMap } from "@/types";

// ── Session Review mode: per-item accept/edit/reject ───────────────────
// The transcript becomes governed data only through human review. Each
// extracted responsibility and task can be rejected before apply; rejecting
// a responsibility drops its tasks with it.

export type FindingKey = string;

export function responsibilityKey(personId: string, respId: string): FindingKey {
  return `${personId}::${respId}`;
}

export function taskKey(personId: string, respId: string, taskLabel: string): FindingKey {
  return `${personId}::${respId}::${taskLabel.trim().toLowerCase()}`;
}

/**
 * Drop rejected findings from a parsed map before it is applied. Pure;
 * responsibilities with every task rejected survive only if the
 * responsibility itself was accepted (an owner with no delegatable evidence
 * is still a valid mapping).
 */
export function filterParsedMap(parsed: ParsedMap, rejected: Set<FindingKey>): ParsedMap {
  if (!rejected.size) return parsed;
  const out: ParsedMap = {};
  for (const [personId, person] of Object.entries(parsed)) {
    const responsibilities = person.responsibilities
      .filter((r) => !rejected.has(responsibilityKey(personId, r.id)))
      .map((r) => {
        const keep = (label: string) => !rejected.has(taskKey(personId, r.id, label));
        return {
          ...r,
          tasks: {
            delegatable: r.tasks.delegatable.filter(keep),
            approval: r.tasks.approval.filter(keep),
            not_delegatable: r.tasks.not_delegatable.filter(keep),
          },
          taskDetails: r.taskDetails?.filter((d) => keep(d.name)),
        };
      });
    out[personId] = { ...person, responsibilities };
  }
  return out;
}

/** Count surviving findings (for the apply CTA). */
export function countFindings(parsed: ParsedMap, scopeIds: string[]): { responsibilities: number; tasks: number } {
  let responsibilities = 0;
  let tasks = 0;
  for (const id of scopeIds) {
    for (const r of parsed[id]?.responsibilities ?? []) {
      responsibilities++;
      tasks += r.tasks.delegatable.length + r.tasks.approval.length + r.tasks.not_delegatable.length;
    }
  }
  return { responsibilities, tasks };
}
