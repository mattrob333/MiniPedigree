// ── External Agent Library ────────────────────────────────────────────────
// Functions for creating, classifying, approving, restricting, sandboxing,
// rejecting, and filtering ExternalAgentRecord entries in the WESCO
// Enterprise Governance domain.

import type { ExternalAgentRecord, RiskLevel } from "../types";

// ── Classification interface ──────────────────────────────────────────────

export interface ExternalAgentClassification {
  missingOwner: boolean;
  missingPurpose: boolean;
  unknownTools: string[];
  excessiveScope: boolean;
  soxSystemAccess: boolean;
  serviceAccountPattern: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const NOW = /* @__PURE__ */ new Date().toISOString();

// Known SOX-relevant system prefixes / names for SOX system access detection.
// These are commonly audited systems in enterprise environments.
const SOX_SYSTEMS = new Set([
  "sap",
  "oracle_financials",
  "netsuite",
  "workday_financials",
  "coupa",
  "blackline",
  "s4/hana",
  "jd_edwards",
  "peoplesoft_financials",
  "dynamics_365_finance",
  "quickbooks",
  "intacct",
  "bills",
  "sovos",
  "trintech",
  "revenue_recognition",
  "tax_engine",
  "close_management",
  "fp&a",
  "financial_reporting",
]);

let _extIdCounter = 0;

/**
 * Generate a new stable external agent id in the form `ext-<timestamp>`.
 * A monotonic counter ensures uniqueness within the same millisecond.
 */
export function newExternalAgentId(): string {
  return `ext-${Date.now()}-${++_extIdCounter}`;
}

/**
 * Create a fully-initialised `ExternalAgentRecord` from a partial input.
 * Every field not supplied receives a sensible default.
 */
export function createExternalAgent(
  partial: Partial<ExternalAgentRecord>,
): ExternalAgentRecord {
  const now = partial.createdAt ?? NOW;
  return {
    id: partial.id ?? newExternalAgentId(),
    name: partial.name ?? "Untitled External Agent",
    source: partial.source ?? "manual",
    sourceReference: partial.sourceReference,
    ownerPersonId: partial.ownerPersonId,
    businessOwnerId: partial.businessOwnerId,
    technicalOwnerId: partial.technicalOwnerId,
    purpose: partial.purpose,
    systems: partial.systems ?? [],
    tools: partial.tools ?? [],
    promptSnippet: partial.promptSnippet,
    riskTier: partial.riskTier ?? "medium",
    soxRelevant: partial.soxRelevant ?? false,
    status: partial.status ?? "imported_pending_review",
    classificationFlags: partial.classificationFlags ?? [],
    matchedPolicyIds: partial.matchedPolicyIds ?? [],
    evidenceIds: partial.evidenceIds ?? [],
    createdAt: now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/**
 * Classify an external agent against known systems and return both a
 * structured `ExternalAgentClassification` object and a flat array of
 * human-readable flag strings.
 *
 * @param agent  - The external agent record to classify.
 * @param knownSystems - List of known/approved system names used to detect
 *   unknown tools. Any tool that does not appear in this list is flagged
 *   as unknown.
 */
export function classifyExternalAgent(
  agent: ExternalAgentRecord,
  knownSystems: string[],
): { flags: string[]; classification: ExternalAgentClassification } {
  const classification: ExternalAgentClassification = {
    missingOwner: false,
    missingPurpose: false,
    unknownTools: [],
    excessiveScope: false,
    soxSystemAccess: false,
    serviceAccountPattern: false,
  };

  const flags: string[] = [];

  // 1. Missing owner
  if (!agent.ownerPersonId) {
    classification.missingOwner = true;
    flags.push("missing_owner");
  }

  // 2. Missing purpose
  if (!agent.purpose) {
    classification.missingPurpose = true;
    flags.push("missing_purpose");
  }

  // 3. Unknown tools — tools not in the known systems list
  if (agent.tools.length > 0 && knownSystems.length > 0) {
    const knownSet = new Set(
      knownSystems.map((s) => s.toLowerCase().trim()),
    );
    for (const tool of agent.tools) {
      if (!knownSet.has(tool.toLowerCase().trim())) {
        classification.unknownTools.push(tool);
      }
    }
  }
  if (classification.unknownTools.length > 0) {
    flags.push("unknown_tools");
  }

  // 4. Excessive scope — currently heuristic: more than 5 systems touched
  if (agent.systems.length > 5) {
    classification.excessiveScope = true;
    flags.push("excessive_scope");
  }

  // 5. SOX system access — agent systems overlap with known SOX systems
  if (agent.systems.length > 0) {
    const agentSystemSet = new Set(
      agent.systems.map((s) => s.toLowerCase().trim()),
    );
    for (const sox of SOX_SYSTEMS) {
      if (agentSystemSet.has(sox)) {
        classification.soxSystemAccess = true;
        flags.push("sox_system_access");
        break;
      }
    }
  }

  // 6. Service account pattern — source is service_account
  if (agent.source === "service_account") {
    classification.serviceAccountPattern = true;
    flags.push("service_account_pattern");
  }

  return { flags, classification };
}

// ── Status transitions ────────────────────────────────────────────────────

/**
 * Approve an external agent. Sets status to `"approved"`.
 */
export function approveExternalAgent(
  agent: ExternalAgentRecord,
): ExternalAgentRecord {
  return {
    ...agent,
    status: "approved",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Restrict an external agent. Sets status to `"restricted"`.
 */
export function restrictExternalAgent(
  agent: ExternalAgentRecord,
): ExternalAgentRecord {
  return {
    ...agent,
    status: "restricted",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Sandbox an external agent. Sets status to `"sandboxed"`.
 */
export function sandboxExternalAgent(
  agent: ExternalAgentRecord,
): ExternalAgentRecord {
  return {
    ...agent,
    status: "sandboxed",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reject an external agent. Sets status to `"rejected"`.
 */
export function rejectExternalAgent(
  agent: ExternalAgentRecord,
): ExternalAgentRecord {
  return {
    ...agent,
    status: "rejected",
    updatedAt: new Date().toISOString(),
  };
}

// ── Filtering ─────────────────────────────────────────────────────────────

/**
 * Filter an array of external agents by `status`.
 * Returns only agents whose `status` matches the given string.
 */
export function filterExternalByStatus(
  agents: ExternalAgentRecord[],
  status: string,
): ExternalAgentRecord[] {
  return agents.filter((a) => a.status === status);
}

/**
 * Filter an array of external agents by `riskTier`.
 * Returns only agents whose `riskTier` matches the given level.
 */
export function filterExternalByRisk(
  agents: ExternalAgentRecord[],
  riskTier: RiskLevel,
): ExternalAgentRecord[] {
  return agents.filter((a) => a.riskTier === riskTier);
}
