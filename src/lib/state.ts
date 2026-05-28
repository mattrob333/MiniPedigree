import type {
  ParsedMap,
  PedigreeRow,
  PedigreeState,
  Person,
  Status,
  TaskItem,
} from "@/types";
import { suggestedAgentName } from "./parse";
import Papa from "papaparse";

export function initialPedigreeState(people: Person[]): PedigreeState {
  const out: PedigreeState = {};
  for (const p of people) {
    out[p.id] = {
      status: "needs-discovery",
      responsibilities: [],
      tasks: { delegatable: [], approval: [], not_delegatable: [] },
      agents: [],
    };
  }
  return out;
}

/** Apply a parsed-discovery map onto the pedigree state (PRD §6 step 6). */
export function applyParsed(
  people: Person[],
  parsed: ParsedMap,
  existing: PedigreeState,
): PedigreeState {
  const next: PedigreeState = { ...existing };

  for (const person of people) {
    const data = parsed[person.id];
    const prev = existing[person.id] ?? {
      status: "needs-discovery" as Status,
      responsibilities: [],
      tasks: { delegatable: [], approval: [], not_delegatable: [] },
      agents: [],
    };
    if (!data) {
      next[person.id] = prev;
      continue;
    }

    const delegatable: TaskItem[] = [];
    const approval: TaskItem[] = [];
    const not_delegatable: TaskItem[] = [];
    const responsibilities = data.responsibilities.map((r) => {
      r.tasks.delegatable.forEach((t, i) =>
        delegatable.push({ id: `${r.id}-d-${i}`, label: t, respId: r.id, respTitle: r.title }),
      );
      r.tasks.approval.forEach((t, i) =>
        approval.push({ id: `${r.id}-a-${i}`, label: t, respId: r.id, respTitle: r.title }),
      );
      r.tasks.not_delegatable.forEach((t, i) =>
        not_delegatable.push({ id: `${r.id}-n-${i}`, label: t, respId: r.id, respTitle: r.title }),
      );
      return { id: r.id, title: r.title, suggestedAgent: suggestedAgentName(r.title) };
    });

    const status: Status = data.needsReview
      ? "needs-review"
      : delegatable.length > 0
        ? "ready"
        : responsibilities.length > 0
          ? "mapped"
          : "needs-discovery";

    const row: PedigreeRow = {
      status: prev.agents.length ? "generated" : status,
      summary: data.summary,
      needsReview: data.needsReview,
      responsibilities,
      tasks: { delegatable, approval, not_delegatable },
      agents: prev.agents,
    };
    next[person.id] = row;
  }

  return next;
}

export function computeMetrics(people: Person[], pedigree: PedigreeState) {
  let respMapped = 0,
    delegTasks = 0,
    candidates = 0,
    agentsBuilt = 0;
  for (const p of people) {
    const ped = pedigree[p.id];
    if (!ped) continue;
    respMapped += ped.responsibilities.length;
    delegTasks += ped.tasks.delegatable.length;
    candidates += new Set(ped.tasks.delegatable.map((t) => t.respId)).size;
    agentsBuilt += ped.agents.length;
  }
  return { peopleCount: people.length, respMapped, delegTasks, candidates, agentsBuilt };
}

function joinLabels(items: { label?: string; title?: string }[]): string {
  return items.map((i) => i.label ?? i.title ?? "").filter(Boolean).join(" | ");
}

/** Export the enriched spreadsheet to a CSV string (PRD §20). */
export function exportEnrichedCsv(people: Person[], pedigree: PedigreeState): string {
  const rows = people.map((p) => {
    const ped = pedigree[p.id];
    const mgr = people.find((x) => x.id === p.managerId);
    return {
      name: p.name,
      email: p.email,
      title: p.title,
      manager_email: mgr?.email ?? p.managerEmail ?? "",
      department: p.department,
      known_tools: p.tools.join(", "),
      responsibilities: joinLabels(ped?.responsibilities ?? []),
      delegatable_tasks: joinLabels(ped?.tasks.delegatable ?? []),
      human_approval_tasks: joinLabels(ped?.tasks.approval ?? []),
      non_delegatable_tasks: joinLabels(ped?.tasks.not_delegatable ?? []),
      agent_candidates: (ped?.agents ?? []).map((a) => a.name).join(", "),
      status: ped?.status ?? "needs-discovery",
    };
  });
  return Papa.unparse(rows);
}

export function downloadFile(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
