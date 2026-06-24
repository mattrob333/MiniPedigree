// ── AI Council Request Utilities ───────────────────────────────────────
// Enterprise governance: structured review, approval, and evidence tracking
// for AI agent deployment requests.

import type { AiCouncilRequest, RiskLevel, ApprovalDecision } from "../types";

// ── Approved-to-Manifest Conversion ──────────────────────────────────────

/**
 * Convert an approved AiCouncilRequest into a draft AgentManifest and evidence
 * record. This is the final step of the AI Council intake pipeline: once a
 * request is approved, it should produce a deployable manifest so the UI can
 * navigate to the new agent.
 *
 * @param approvedRequest - The approved AiCouncilRequest (must have status "approved")
 * @param requesterName   - Human-readable name of the requester (for evidence)
 * @param knownSystems    - SystemManifest array used to build systemAccess entries
 * @returns An object with:
 *   - manifest: a draft AgentManifest derived from the request
 *   - evidenceId: the generated evidence record ID (caller should push to workspace)
 *   - evidenceRecord: the full EvidenceRecord for persistence
 *   - partialRecord: a Partial<AgentRecord> the UI can navigate to
 */
export function convertApprovedToManifest(
  approvedRequest: AiCouncilRequest,
  requesterName: string,
  knownSystems: Array<{ id: string; name: string }> = [],
): {
  manifest: import("../types").AgentManifest;
  evidenceId: string;
  evidenceRecord: import("../types").EvidenceRecord;
  partialRecord: Partial<import("../types").AgentRecord>;
} {
  if (approvedRequest.status !== "approved") {
    throw new Error(
      `Cannot convert request "${approvedRequest.id}": status is "${approvedRequest.status}", expected "approved".`,
    );
  }

  const now = new Date().toISOString();
  const manifestId = `manifest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const evidenceId = `evt-aic-convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agentId = `agent-aic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Build systemAccess from systemsTouched
  const systemAccess: import("../types").AgentSystemAccess[] =
    approvedRequest.systemsTouched.map((sysIdOrName) => {
      const matched = knownSystems.find(
        (s) => s.id === sysIdOrName || s.name === sysIdOrName,
      );
      return {
        systemId: matched?.id ?? sysIdOrName,
        systemName: matched?.name ?? sysIdOrName,
        accessNeeded: approvedRequest.soxRelevant ? "read" : "read",
      };
    });

  const manifest: import("../types").AgentManifest = {
    id: manifestId,
    agentName: `Agent: ${approvedRequest.proposedTask.slice(0, 48)}`,
    purpose: approvedRequest.businessProblem,
    humanOwnerId: approvedRequest.humanOwnerId ?? approvedRequest.requesterId,
    department: approvedRequest.department,
    parentResponsibilityId: "",
    parentTaskId: "",
    relatedControlIds: [],
    systemAccess,
    tools: [],
    allowedActions: [],
    approvalRequiredActions: [],
    blockedActions: [],
    approvalGates: [],
    authorityCeiling: {
      systems: systemAccess,
      allowedActions: [],
      approvalRequiredActions: [],
      blockedActions: [],
    },
    riskTier: approvedRequest.riskTier ?? "medium",
    soxRelevant: approvedRequest.soxRelevant,
    systemPrompt: "",
    runtimeTargets: [],
    evidenceRequirements: [],
    testPrompts: [],
    validationWarnings: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  const evidenceRecord: import("../types").EvidenceRecord = {
    id: evidenceId,
    type: "agent_request",
    subjectType: "agent",
    subjectId: agentId,
    actor: requesterName,
    timestamp: now,
    summary: `AI Council request "${approvedRequest.id}" converted to agent manifest. Purpose: ${approvedRequest.businessProblem.slice(0, 120)}. SOX-relevant: ${approvedRequest.soxRelevant}.`,
    source: {
      kind: "manual_action",
      sourceId: approvedRequest.id,
      quote: `Approved by ${approvedRequest.decision?.by ?? "unknown"} and converted to manifest ${manifestId}.`,
    },
  };

  const partialRecord: Partial<import("../types").AgentRecord> = {
    id: agentId,
    manifest: manifest as unknown as Record<string, unknown>,
    name: manifest.agentName,
  };

  return { manifest, evidenceId, evidenceRecord, partialRecord };
}

/**
 * Generate a new AI Council request ID with format `aic-req-<ISO-timestamp>`.
 */
export function newAiCouncilRequestId(): string {
  return `aic-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Factory ────────────────────────────────────────────────────────────

const DEFAULTS: Pick<
  AiCouncilRequest,
  | "status"
  | "priority"
  | "systemsTouched"
  | "approvalRequirements"
  | "reviewerIds"
  | "evidenceIds"
> = {
  status: "draft",
  priority: "medium",
  systemsTouched: [],
  approvalRequirements: [],
  reviewerIds: [],
  evidenceIds: [],
};

/**
 * Create an AiCouncilRequest with sensible defaults.
 * Any fields supplied via `partial` override the defaults.
 * `id`, `createdAt`, and `updatedAt` are always auto-generated.
 */
export function createAiCouncilRequest(
  partial: Partial<AiCouncilRequest> = {},
): AiCouncilRequest {
  const now = new Date().toISOString();
  return {
    ...DEFAULTS,
    id: newAiCouncilRequestId(),
    requesterId: "",
    department: "",
    businessProblem: "",
    proposedTask: "",
    dataSensitivity: "internal",
    soxRelevant: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

// ── Status transitions ─────────────────────────────────────────────────

/**
 * Submit a draft request for review.
 * Sets status to "submitted" and refreshes `updatedAt`.
 */
export function submitRequest(
  request: AiCouncilRequest,
): AiCouncilRequest {
  return {
    ...request,
    status: "submitted",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Approve a request and record the decision.
 * Creates an evidence record ID for audit trail linkage.
 *
 * Returns the updated request together with the generated evidence ID.
 */
export function approveRequest(
  request: AiCouncilRequest,
  by: string,
): { request: AiCouncilRequest; evidenceId: string } {
  const now = new Date().toISOString();
  const evidenceId = `ev-aic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const decision: ApprovalDecision = {
    by,
    at: now,
    outcome: "approved",
  };

  return {
    request: {
      ...request,
      status: "approved",
      decision,
      evidenceIds: [...request.evidenceIds, evidenceId],
      updatedAt: now,
    },
    evidenceId,
  };
}

/**
 * Reject a request and record the decision with an optional reason.
 */
export function rejectRequest(
  request: AiCouncilRequest,
  by: string,
  reason?: string,
): AiCouncilRequest {
  const now = new Date().toISOString();

  const decision: ApprovalDecision = {
    by,
    at: now,
    outcome: "rejected",
    ...(reason !== undefined ? { reason } : {}),
  };

  return {
    ...request,
    status: "rejected",
    decision,
    updatedAt: now,
  };
}

/**
 * Flag a request as needing more information from the requester.
 */
export function requestMoreInfo(
  request: AiCouncilRequest,
): AiCouncilRequest {
  return {
    ...request,
    status: "needs_more_info",
    updatedAt: new Date().toISOString(),
  };
}

// ── Filter helpers ─────────────────────────────────────────────────────

/**
 * Filter an array of requests by exact status match.
 */
export function filterRequestsByStatus(
  requests: AiCouncilRequest[],
  status: string,
): AiCouncilRequest[] {
  return requests.filter((r) => r.status === status);
}

/**
 * Filter an array of requests by exact priority match.
 */
export function filterRequestsByPriority(
  requests: AiCouncilRequest[],
  priority: string,
): AiCouncilRequest[] {
  return requests.filter((r) => r.priority === priority);
}

// ── Heuristic auto-suggest ─────────────────────────────────────────────

// Known SOX-relevant system keywords used by the heuristic matcher.
const SOX_SYSTEM_KEYWORDS = [
  "sap",
  "oracle",
  "netSuite",
  "netsuite",
  "workday",
  "salesforce",
  "quickbooks",
  "epicor",
  "microsoft dynamics",
  "dynamics",
  "great plains",
  "peoplesoft",
  "jde",
  "jdedwards",
  "j.d. edwards",
  "infor",
  "coupa",
  "concur",
  "blackline",
  "trintech",
];

/**
 * Given a system name, returns `true` if it looks like a SOX-relevant system
 * based on a simple keyword heuristic.
 */
function isSoxSystem(system: string): boolean {
  const lower = system.toLowerCase().trim();
  return SOX_SYSTEM_KEYWORDS.some(
    (kw) => lower === kw || lower.startsWith(kw + " ") || lower.startsWith(kw + "."),
  );
}

/**
 * Suggest fields for an AI Council request based on heuristics.
 *
 * - **soxRelevant**: set to `true` if any `systemsTouched` matches a known
 *   SOX-relevant system name (based on a built-in keyword list).
 * - **riskTier**: set to `"high"` if `dataSensitivity` is `"regulated"`.
 *
 * @param request     The request to analyse.
 * @param knownSystems  Optional list of additional SOX-relevant system names
 *                      beyond the built-in keyword list.
 */
export function autoSuggestFields(
  request: AiCouncilRequest,
  knownSystems: string[] = [],
): {
  systemsTouched?: string[];
  riskTier?: RiskLevel;
  soxRelevant?: boolean;
} {
  const result: {
    systemsTouched?: string[];
    riskTier?: RiskLevel;
    soxRelevant?: boolean;
  } = {};

  // ── SOX relevance heuristic ────────────────────────────────────────
  const allSoxSystems = SOX_SYSTEM_KEYWORDS.concat(
    knownSystems.filter((s) => SOX_SYSTEM_KEYWORDS.indexOf(s) === -1),
  );
  const matchedSox = request.systemsTouched.filter((s) => {
    const lower = s.toLowerCase().trim();
    return allSoxSystems.some((kw) => {
      const kwLower = kw.toLowerCase().trim();
      return (
        lower === kwLower ||
        lower.startsWith(kwLower + " ") ||
        lower.startsWith(kwLower + ".")
      );
    });
  });

  if (matchedSox.length > 0) {
    result.soxRelevant = true;
  }

  // ── Risk tier heuristic ────────────────────────────────────────────
  if (request.dataSensitivity === "regulated") {
    result.riskTier = "high";
  } else if (request.dataSensitivity === "confidential") {
    result.riskTier = "medium";
  }

  return result;
}
