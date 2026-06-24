import type { ControlManifest, ItemProvenance, ApprovalRequirement } from "../types";

// ── Module-level counter for unique IDs ──────────────────────────────────
let _ctrlCounter = 0;

/** Generates a new unique control id like ctrl-<timestamp>-<counter>. */
export function newControlId(): string {
  _ctrlCounter += 1;
  return `ctrl-${Date.now()}-${_ctrlCounter}`;
}

// ── ID derivation helpers ────────────────────────────────────────────────

/** Returns the agent IDs associated with a control. */
export function deriveAgentIdsForControl(control: ControlManifest): string[] {
  return control.relatedAgentIds;
}

/** Returns the task IDs associated with a control. */
export function deriveTaskIdsForControl(control: ControlManifest): string[] {
  return control.relatedTaskIds;
}

/** Returns the system IDs associated with a control. */
export function deriveSystemIdsForControl(control: ControlManifest): string[] {
  return control.systemIds;
}

// ── Filter helpers ───────────────────────────────────────────────────────

/** Filters controls by their soxRelevant flag. */
export function filterControlsBySox(
  controls: ControlManifest[],
  soxOnly: boolean,
): ControlManifest[] {
  if (!soxOnly) return controls;
  return controls.filter((c) => c.soxRelevant === true);
}

/** Filters controls whose systemIds includes the given systemId. */
export function filterControlsBySystem(
  controls: ControlManifest[],
  systemId: string,
): ControlManifest[] {
  return controls.filter((c) => c.systemIds.includes(systemId));
}

/** Filters controls by their ownerPersonId. */
export function filterControlsByOwner(
  controls: ControlManifest[],
  personId: string,
): ControlManifest[] {
  return controls.filter((c) => c.ownerPersonId === personId);
}

/** Filters controls where the process matches (case-insensitive). */
export function filterControlsByProcess(
  controls: ControlManifest[],
  process: string,
): ControlManifest[] {
  const lower = process.toLowerCase();
  return controls.filter((c) => c.process.toLowerCase().includes(lower));
}

// ── Factory helpers ──────────────────────────────────────────────────────

/** Creates a new ControlManifest with sensible defaults. */
export function createControl(
  partial: Partial<ControlManifest>,
): ControlManifest {
  const now = new Date().toISOString();
  const id = partial.id ?? newControlId();

  return {
    id,
    controlId: partial.controlId ?? id,
    name: partial.name ?? "",
    description: partial.description,
    ownerPersonId: partial.ownerPersonId ?? "",
    process: partial.process ?? "",
    relatedRisk: partial.relatedRisk ?? "",
    frequency: partial.frequency ?? "monthly",
    systemIds: partial.systemIds ?? [],
    evidenceRequired: partial.evidenceRequired ?? [],
    soxRelevant: partial.soxRelevant ?? false,
    socRelevant: partial.socRelevant,
    relatedTaskIds: partial.relatedTaskIds ?? [],
    relatedAgentIds: partial.relatedAgentIds ?? [],
    approvalRequirements: partial.approvalRequirements ?? [],
    status: partial.status ?? "draft",
    source: partial.source ?? "manual",
    provenance: partial.provenance,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

// ── Validation ───────────────────────────────────────────────────────────

/** Validates a ControlManifest, returning failures and warnings. */
export function validateControl(
  control: ControlManifest,
): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  // name must be non-empty
  if (!control.name || control.name.trim().length === 0) {
    failures.push("name is required and must be non-empty");
  }

  // ownerPersonId must exist
  if (!control.ownerPersonId || control.ownerPersonId.trim().length === 0) {
    failures.push("ownerPersonId is required");
  }

  // at least one system
  if (!control.systemIds || control.systemIds.length === 0) {
    failures.push("at least one systemId is required");
  }

  // soxRelevant must be a boolean (not undefined/null)
  if (typeof control.soxRelevant !== "boolean") {
    failures.push("soxRelevant must be set to true or false");
  }

  // Warnings for optional concerns
  if (!control.description || control.description.trim().length === 0) {
    warnings.push("description is missing — consider adding one");
  }

  if (!control.process || control.process.trim().length === 0) {
    warnings.push("process is missing — consider adding one");
  }

  if (!control.frequency) {
    warnings.push("frequency is not set");
  }

  return { failures, warnings };
}
