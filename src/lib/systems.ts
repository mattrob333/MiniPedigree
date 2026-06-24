// ── Systems Library ─────────────────────────────────────────────────────
// Functions for creating, querying, filtering, and validating SystemManifest
// entries in the WESCO Enterprise Governance domain.

import type { SystemManifest, RiskFinding, ApprovalRequirement } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Generate a stable system id from a human-readable name. */
export function newSystemId(name: string): string {
  return "sys-" + name.toLowerCase().replace(/\s+/g, "-");
}

// ── Factory ──────────────────────────────────────────────────────────────

const NOW = /* @__PURE__ */ new Date().toISOString();

const DEFAULTS = {
  category: "other" as const,
  soxInScope: false,
  dataSensitivity: "internal" as const,
  integrationStatus: "manual" as const,
  connectedHumanIds: [] as string[],
  connectedAgentIds: [] as string[],
  connectedControlIds: [] as string[],
  riskFindings: [] as RiskFinding[],
  approvalRequirements: [] as ApprovalRequirement[],
};

/**
 * Create a fully-initialised `SystemManifest` from a partial input.
 * Every field not supplied receives a sensible default.
 */
export function createSystem(partial: Partial<SystemManifest>): SystemManifest {
  const now = partial.createdAt ?? NOW;
  const name = partial.name ?? "Untitled System";
  return {
    id: partial.id ?? newSystemId(name),
    name,
    ownerPersonId: partial.ownerPersonId,
    category: partial.category ?? DEFAULTS.category,
    soxInScope: partial.soxInScope ?? DEFAULTS.soxInScope,
    dataSensitivity: partial.dataSensitivity ?? DEFAULTS.dataSensitivity,
    integrationStatus: partial.integrationStatus ?? DEFAULTS.integrationStatus,
    connectedHumanIds: partial.connectedHumanIds ?? DEFAULTS.connectedHumanIds,
    connectedAgentIds: partial.connectedAgentIds ?? DEFAULTS.connectedAgentIds,
    connectedControlIds:
      partial.connectedControlIds ?? DEFAULTS.connectedControlIds,
    riskFindings: partial.riskFindings ?? DEFAULTS.riskFindings,
    approvalRequirements:
      partial.approvalRequirements ?? DEFAULTS.approvalRequirements,
    createdAt: now,
    updatedAt: partial.updatedAt ?? now,
  };
}

// ── Derivation ───────────────────────────────────────────────────────────

/**
 * Create `SystemManifest` entries from the raw system-name list stored in
 * company context (`CompanyContext.systems`). Each entry gets default values
 * and a generated id; duplicate names are collapsed.
 */
export function deriveSystemsFromCompanyContext(
  systemsList: string[],
): SystemManifest[] {
  const seen = new Set<string>();
  const result: SystemManifest[] = [];

  for (const name of systemsList) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    const id = newSystemId(trimmed);
    if (seen.has(id)) continue;
    seen.add(id);

    result.push(createSystem({ name: trimmed, id }));
  }

  return result;
}

// ── Query / Filter ───────────────────────────────────────────────────────

/**
 * Return only the systems whose `soxInScope` matches the filter.
 * When `soxOnly` is false the full list is returned unchanged.
 */
export function filterSystemsBySox(
  systems: SystemManifest[],
  soxOnly: boolean,
): SystemManifest[] {
  if (!soxOnly) return systems;
  return systems.filter((s) => s.soxInScope);
}

/** Look up a system by its `id`. */
export function findSystemById(
  systems: SystemManifest[],
  id: string,
): SystemManifest | undefined {
  return systems.find((s) => s.id === id);
}

// ── Validation ───────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "erp",
  "hris",
  "crm",
  "finance",
  "identity",
  "collaboration",
  "data",
  "custom",
  "other",
] as const;

const VALID_SENSITIVITIES = [
  "public",
  "internal",
  "confidential",
  "regulated",
] as const;

const VALID_INTEGRATION_STATUSES = [
  "manual",
  "planned",
  "connected",
  "disabled",
] as const;

/**
 * Validate a `SystemManifest` for required fields and known enum values.
 * Returns separate lists of hard failures and soft warnings.
 */
export function validateSystem(
  system: SystemManifest,
): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  // ── Hard failures ──
  if (!system.name || system.name.trim().length === 0) {
    failures.push("System name is required");
  }

  if (!(VALID_CATEGORIES as readonly string[]).includes(system.category)) {
    failures.push(
      `Invalid category "${system.category}"; expected one of: ${VALID_CATEGORIES.join(", ")}`,
    );
  }

  if (
    !(VALID_SENSITIVITIES as readonly string[]).includes(system.dataSensitivity)
  ) {
    failures.push(
      `Invalid dataSensitivity "${system.dataSensitivity}"; expected one of: ${VALID_SENSITIVITIES.join(", ")}`,
    );
  }

  if (
    !(VALID_INTEGRATION_STATUSES as readonly string[]).includes(
      system.integrationStatus,
    )
  ) {
    failures.push(
      `Invalid integrationStatus "${system.integrationStatus}"; expected one of: ${VALID_INTEGRATION_STATUSES.join(", ")}`,
    );
  }

  if (!system.id || system.id.trim().length === 0) {
    failures.push("System id is required");
  }

  // ── Soft warnings ──
  if (system.soxInScope && !system.ownerPersonId) {
    warnings.push(
      "SOX-in-scope system has no assigned owner; consider assigning an ownerPersonId",
    );
  }

  if (system.connectedControlIds.length === 0 && system.soxInScope) {
    warnings.push(
      "SOX-in-scope system has no connected controls; controls may need to be mapped",
    );
  }

  if (!system.createdAt) {
    warnings.push("System has no createdAt timestamp");
  }

  return { failures, warnings };
}

// ── Derived counts ───────────────────────────────────────────────────────

/** Number of human identities connected to this system. */
export function deriveConnectedHumanCount(system: SystemManifest): number {
  return system.connectedHumanIds.length;
}

/** Number of agents connected to this system. */
export function deriveConnectedAgentCount(system: SystemManifest): number {
  return system.connectedAgentIds.length;
}

/** Number of controls connected to this system. */
export function deriveConnectedControlCount(system: SystemManifest): number {
  return system.connectedControlIds.length;
}
