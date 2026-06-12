import type {
  ItemProvenance,
  ParsedResponsibility,
  PedigreeState,
  Person,
  ProvenanceState,
  ResponsibilityRow,
  RiskLevel,
  TaskCompletionContext,
  TaskItem,
  WorkspaceAuditEvent,
} from "@/types";

// ── Provenance derivation + confirmation (UX backlog P0-1) ─────────────
// Evidence-backed items are "evidenced"; parser inferences (role templates,
// thin transcripts) are "ai_inferred"; a reviewer's explicit action makes an
// item "human_confirmed". State carries into the manifest on compile.

export function deriveProvenance(args: {
  evidence?: string | null;
  confidence?: number;
  source?: string;
}): ItemProvenance {
  const evidence = args.evidence?.trim();
  return {
    state: evidence ? "evidenced" : "ai_inferred",
    ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
    ...(evidence ? { evidence_quote: evidence } : {}),
    ...(args.source ? { source: args.source } : {}),
  };
}

export function deriveResponsibilityProvenance(r: ParsedResponsibility, source?: string): ItemProvenance {
  return deriveProvenance({ evidence: r.evidence_quote, confidence: r.confidence, source });
}

export function confidenceTier(confidence?: number): "high" | "medium" | "low" {
  if (confidence === undefined) return "low";
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

export function provenanceLabel(state: ProvenanceState): string {
  if (state === "evidenced") return "Evidenced";
  if (state === "human_confirmed") return "Human-confirmed";
  return "AI-drafted";
}

function confirm(provenance: ItemProvenance | undefined, by: string): ItemProvenance {
  return {
    ...(provenance ?? { state: "ai_inferred" as const }),
    state: "human_confirmed",
    confirmed_by: by,
    confirmed_at: new Date().toISOString(),
  };
}

/** Confirm a task's provenance. Returns a new pedigree state. */
export function confirmTaskProvenance(pedigree: PedigreeState, personId: string, taskId: string, by: string): PedigreeState {
  const row = pedigree[personId];
  if (!row) return pedigree;
  const update = (tasks: TaskItem[]) => tasks.map((t) => (t.id === taskId ? { ...t, provenance: confirm(t.provenance, by) } : t));
  return {
    ...pedigree,
    [personId]: {
      ...row,
      tasks: {
        delegatable: update(row.tasks.delegatable),
        approval: update(row.tasks.approval),
        not_delegatable: update(row.tasks.not_delegatable),
      },
    },
  };
}

/** Confirm a responsibility's provenance. Returns a new pedigree state. */
export function confirmResponsibilityProvenance(pedigree: PedigreeState, personId: string, respId: string, by: string): PedigreeState {
  const row = pedigree[personId];
  if (!row) return pedigree;
  return {
    ...pedigree,
    [personId]: {
      ...row,
      responsibilities: row.responsibilities.map((r) => (r.id === respId ? { ...r, provenance: confirm(r.provenance, by) } : r)),
    },
  };
}

// ── Org-wide review queue (UX backlog P0-3) ────────────────────────────

export type ReviewItemKind = "responsibility" | "task";
export type ReviewClass = "delegatable" | "approval" | "not_delegatable";

export interface ReviewQueueItem {
  key: string;                 // stable list key
  kind: ReviewItemKind;
  personId: string;
  personName: string;
  department: string;
  label: string;
  description?: string;
  reviewer_note?: string;
  itemId: string;              // respId or taskId
  cls?: ReviewClass;           // tasks only
  respId?: string;
  respTitle?: string;
  riskLevel?: RiskLevel;
  completion?: TaskCompletionContext;
  provenance: ItemProvenance;
}

export interface ReviewEditPatch {
  label: string;
  description?: string;
  reviewer_note?: string;
}

const RISK_RANK: Record<RiskLevel, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/**
 * Build the org-wide review queue: every responsibility and task that is not
 * yet human-confirmed, sorted highest-risk first, then lowest-confidence first.
 */
export function buildReviewQueue(people: Person[], pedigree: PedigreeState): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];
  for (const person of people) {
    const row = pedigree[person.id];
    if (!row) continue;
    for (const r of row.responsibilities) {
      const provenance = r.provenance ?? deriveProvenance({ confidence: r.confidence, source: r.source });
      if (provenance.state === "human_confirmed") continue;
      items.push({
        key: `${person.id}:resp:${r.id}`,
        kind: "responsibility",
        personId: person.id,
        personName: person.name,
        department: person.department,
        label: r.title,
        description: r.description,
        reviewer_note: r.reviewer_note,
        itemId: r.id,
        respId: r.id,
        respTitle: r.title,
        provenance,
      });
    }
    const buckets: [ReviewClass, TaskItem[]][] = [
      ["delegatable", row.tasks.delegatable],
      ["approval", row.tasks.approval],
      ["not_delegatable", row.tasks.not_delegatable],
    ];
    for (const [cls, tasks] of buckets) {
      for (const t of tasks) {
        const provenance = t.provenance ?? deriveProvenance({ evidence: t.evidence });
        if (provenance.state === "human_confirmed") continue;
        items.push({
          key: `${person.id}:task:${t.id}`,
          kind: "task",
          personId: person.id,
          personName: person.name,
          department: person.department,
          label: t.label,
          description: t.description,
          reviewer_note: t.reviewer_note,
          itemId: t.id,
          cls,
          respId: t.respId,
          respTitle: t.respTitle,
          riskLevel: t.riskLevel,
          completion: t.completion,
          provenance,
        });
      }
    }
  }
  return items.sort((a, b) => {
    const risk = RISK_RANK[b.riskLevel ?? "low"] - RISK_RANK[a.riskLevel ?? "low"];
    if (risk !== 0) return risk;
    return (a.provenance.confidence ?? 0) - (b.provenance.confidence ?? 0);
  });
}

/**
 * Bulk confirmation is limited to SAFE operations: only evidenced,
 * delegatable items qualify. Approval-required and blocked classifications —
 * and anything AI-inferred — must be reviewed individually.
 */
export function isBulkConfirmable(item: ReviewQueueItem): boolean {
  if (item.provenance.source === "role_template") return false;
  if (item.provenance.state !== "evidenced") return false;
  if (item.kind === "task" && item.cls !== "delegatable") return false;
  return true;
}

/**
 * Edit-and-confirm: a reviewer corrects the extracted wording, which is
 * itself a human confirmation. Renames the item and marks it confirmed.
 */
export function editReviewItem(
  pedigree: PedigreeState,
  item: ReviewQueueItem,
  patch: string | ReviewEditPatch,
  by: string,
): { pedigree: PedigreeState; event: WorkspaceAuditEvent } {
  const row = pedigree[item.personId];
  let next = pedigree;
  const edit = typeof patch === "string" ? { label: patch } : patch;
  const newLabel = edit.label;
  if (row) {
    if (item.kind === "task") {
      const rename = (tasks: TaskItem[]) => tasks.map((t) => (t.id === item.itemId ? {
        ...t,
        label: edit.label,
        description: edit.description?.trim() || undefined,
        reviewer_note: edit.reviewer_note?.trim() || undefined,
      } : t));
      next = {
        ...pedigree,
        [item.personId]: {
          ...row,
          tasks: {
            delegatable: rename(row.tasks.delegatable),
            approval: rename(row.tasks.approval),
            not_delegatable: rename(row.tasks.not_delegatable),
          },
        },
      };
      next = confirmTaskProvenance(next, item.personId, item.itemId, by);
    } else {
      next = {
        ...pedigree,
        [item.personId]: {
          ...row,
          responsibilities: row.responsibilities.map((r) => (r.id === item.itemId ? {
            ...r,
            title: edit.label,
            description: edit.description?.trim() || undefined,
            reviewer_note: edit.reviewer_note?.trim() || undefined,
          } : r)),
        },
      };
      next = confirmResponsibilityProvenance(next, item.personId, item.itemId, by);
    }
  }
  return {
    pedigree: next,
    event: {
      id: `EVT-${Date.now().toString(36)}-edit-${item.itemId}`,
      type: "provenance_confirmed",
      actor: by,
      timestamp: new Date().toISOString(),
      summary: `Edited and confirmed ${item.kind} for ${item.personName}: "${item.label}" → "${newLabel}".`,
      subject_id: item.itemId,
      ...(item.provenance.evidence_quote ? { evidence: item.provenance.evidence_quote } : {}),
    },
  };
}

export function findReviewTask(pedigree: PedigreeState, item: ReviewQueueItem): TaskItem | undefined {
  const row = pedigree[item.personId];
  if (!row || item.kind !== "task") return undefined;
  return [...row.tasks.delegatable, ...row.tasks.approval, ...row.tasks.not_delegatable].find((task) => task.id === item.itemId);
}

export function findReviewResponsibility(pedigree: PedigreeState, item: ReviewQueueItem): ResponsibilityRow | undefined {
  const row = pedigree[item.personId];
  if (!row || item.kind !== "responsibility") return undefined;
  return row.responsibilities.find((resp) => resp.id === item.itemId);
}

/** Apply confirmations and emit one audit event per confirmed item. */
export function confirmReviewItems(
  pedigree: PedigreeState,
  items: ReviewQueueItem[],
  by: string,
): { pedigree: PedigreeState; events: WorkspaceAuditEvent[] } {
  let next = pedigree;
  const events: WorkspaceAuditEvent[] = [];
  for (const item of items) {
    next = item.kind === "task"
      ? confirmTaskProvenance(next, item.personId, item.itemId, by)
      : confirmResponsibilityProvenance(next, item.personId, item.itemId, by);
    events.push({
      id: `EVT-${Date.now().toString(36)}-${events.length}-${item.itemId}`,
      type: "provenance_confirmed",
      actor: by,
      timestamp: new Date().toISOString(),
      summary: `Confirmed ${item.kind} "${item.label}" for ${item.personName} (was ${provenanceLabel(item.provenance.state)}).`,
      subject_id: item.itemId,
      ...(item.provenance.evidence_quote ? { evidence: item.provenance.evidence_quote } : {}),
    });
  }
  return { pedigree: next, events };
}
