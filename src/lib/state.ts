import type {
  ParsedMap,
  ParsedResponsibility,
  ParsedTask,
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

export interface ApplyOptions {
  /** Only apply to these person ids (the mapping-session scope). */
  scopeIds?: string[];
  /** Label of the session, recorded as responsibility source + lastSession. */
  sessionLabel?: string;
  /** Map of personId -> manager name, for lineage ("assigned by manager"). */
  people?: Person[];
}

/** Apply a parsed-discovery map onto the pedigree state (PRD §6 step 6). */
export function applyParsed(
  people: Person[],
  parsed: ParsedMap,
  existing: PedigreeState,
  opts: ApplyOptions = {},
): PedigreeState {
  const next: PedigreeState = { ...existing };
  const scope = opts.scopeIds ? new Set(opts.scopeIds) : null;
  const managerName = (p: Person) =>
    p.managerId ? people.find((x) => x.id === p.managerId)?.name : undefined;

  for (const person of people) {
    const data = parsed[person.id];
    const prev = existing[person.id] ?? {
      status: "needs-discovery" as Status,
      responsibilities: [],
      tasks: { delegatable: [], approval: [], not_delegatable: [] },
      agents: [],
    };
    // Out of scope or no data → keep prior state untouched.
    if (!data || (scope && !scope.has(person.id))) {
      next[person.id] = prev;
      continue;
    }

    const delegatable: TaskItem[] = [];
    const approval: TaskItem[] = [];
    const not_delegatable: TaskItem[] = [];
    const responsibilities = data.responsibilities.map((r) => {
      r.tasks.delegatable.forEach((t, i) =>
        delegatable.push(toTaskItem(`${r.id}-d-${i}`, t, r)),
      );
      r.tasks.approval.forEach((t, i) =>
        approval.push(toTaskItem(`${r.id}-a-${i}`, t, r)),
      );
      r.tasks.not_delegatable.forEach((t, i) =>
        not_delegatable.push(toTaskItem(`${r.id}-n-${i}`, t, r)),
      );
      return {
        id: r.id,
        title: r.title,
        suggestedAgent: suggestedAgentName(r.title),
        source: opts.sessionLabel,
        assignedByName: managerName(person),
        confidence: r.confidence,
      };
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
      lastSession: opts.sessionLabel ?? prev.lastSession,
    };
    next[person.id] = row;
  }

  return next;
}

/** Build a TaskItem, carrying over per-task detail (risk, evidence, completion context) when parsed. */
function toTaskItem(id: string, label: string, r: ParsedResponsibility): TaskItem {
  const detail = r.taskDetails?.find((d) => d.name.trim().toLowerCase() === label.trim().toLowerCase());
  const item: TaskItem = { id, label, respId: r.id, respTitle: r.title };
  if (detail) {
    item.riskLevel = detail.risk_level;
    if (detail.evidence_quote) item.evidence = detail.evidence_quote;
    item.completion = extractCompletion(detail);
  }
  return item;
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

export function computeMetrics(people: Person[], pedigree: PedigreeState) {
  let respMapped = 0,
    delegTasks = 0,
    candidates = 0,
    agentsBuilt = 0,
    mappedPeople = 0,
    needsDiscovery = 0,
    readyForAgent = 0;
  const MAPPED = new Set(["mapped", "ready", "generated"]);
  for (const p of people) {
    const ped = pedigree[p.id];
    if (!ped) continue;
    respMapped += ped.responsibilities.length;
    delegTasks += ped.tasks.delegatable.length;
    candidates += new Set(ped.tasks.delegatable.map((t) => t.respId)).size;
    agentsBuilt += ped.agents.length;
    if (MAPPED.has(ped.status)) mappedPeople++;
    if (ped.status === "needs-discovery") needsDiscovery++;
    if (ped.status === "ready" || ped.status === "generated") readyForAgent++;
  }
  return {
    peopleCount: people.length,
    respMapped,
    delegTasks,
    candidates,
    agentsBuilt,
    mappedPeople,
    needsDiscovery,
    readyForAgent,
  };
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
