import type {
  AgentBirthCertificate,
  AgentManifest,
  AgentSystemAccess,
  ApprovalRecord,
  AuthorityCeiling,
} from "../types";

// ── ID generation ────────────────────────────────────────────────────

/**
 * Generate a new birth certificate ID in the format `bc-<timestamp>`.
 */
export function newBirthCertificateId(): string {
  return `bc-${Date.now()}`;
}

// ── Creation ─────────────────────────────────────────────────────────

export interface CreateBirthCertificateParams {
  agentId: string;
  agentName: string;
  createdBy: string;
  approvedBy: ApprovalRecord[];
  humanOwnerId: string;
  parentRole: string;
  parentResponsibilityId: string;
  parentTaskId: string;
  authorityCeiling: AuthorityCeiling;
  systemsAllowed: AgentSystemAccess[];
  relatedControlIds: string[];
  soxRelevant: boolean;
  initialPromptVersion: string;
  manifestVersion: number;
}

/**
 * Create a new `AgentBirthCertificate` from explicit parameters.
 *
 * Defaults:
 * - `id` is auto-generated via `newBirthCertificateId()`
 * - `birthDate` is set to the current ISO date string
 * - `systemsDenied` is `[]`
 * - `initialRiskScore` is `0`
 * - `approvalEvidenceIds` is `[]`
 * - `createdAt` is set to the current ISO date-time string
 */
export function createBirthCertificate(
  params: CreateBirthCertificateParams,
): AgentBirthCertificate {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const datetimeStr = now.toISOString();

  return {
    id: newBirthCertificateId(),
    agentId: params.agentId,
    agentName: params.agentName,
    birthDate: dateStr,
    createdBy: params.createdBy,
    approvedBy: params.approvedBy,
    humanOwnerId: params.humanOwnerId,
    parentRole: params.parentRole,
    parentResponsibilityId: params.parentResponsibilityId,
    parentTaskId: params.parentTaskId,
    authorityCeiling: params.authorityCeiling,
    systemsAllowed: params.systemsAllowed,
    systemsDenied: [],
    relatedControlIds: params.relatedControlIds,
    soxRelevant: params.soxRelevant,
    approvalEvidenceIds: [],
    initialPromptVersion: params.initialPromptVersion,
    initialRiskScore: 0,
    manifestVersion: params.manifestVersion,
    evidencePacketId: "",
    createdAt: datetimeStr,
  };
}

// ── Convenience from manifest ────────────────────────────────────────

/**
 * Convenience factory that extracts birth certificate fields from an
 * `AgentManifest`. Fields not present on the manifest are given sensible
 * defaults:
 *  - `parentRole` → `manifest.department`
 *  - `initialPromptVersion` → `"1.0.0"`
 *  - `manifestVersion` → `1`
 */
export function createBirthCertificateFromManifest(
  manifest: AgentManifest,
  approvedBy: ApprovalRecord[],
  createdBy: string,
): AgentBirthCertificate {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const datetimeStr = now.toISOString();

  return {
    id: newBirthCertificateId(),
    agentId: manifest.id,
    agentName: manifest.agentName,
    birthDate: dateStr,
    createdBy,
    approvedBy,
    humanOwnerId: manifest.humanOwnerId,
    parentRole: manifest.department,
    parentResponsibilityId: manifest.parentResponsibilityId,
    parentTaskId: manifest.parentTaskId,
    authorityCeiling: manifest.authorityCeiling,
    systemsAllowed: manifest.systemAccess,
    systemsDenied: [],
    relatedControlIds: manifest.relatedControlIds,
    soxRelevant: manifest.soxRelevant,
    approvalEvidenceIds: [],
    initialPromptVersion: "1.0.0",
    initialRiskScore: 0,
    manifestVersion: 1,
    evidencePacketId: "",
    createdAt: datetimeStr,
  };
}

// ── Export helpers ───────────────────────────────────────────────────

/**
 * Serialize a birth certificate to a pretty-printed JSON string.
 */
export function exportBirthCertificateJson(cert: AgentBirthCertificate): string {
  return JSON.stringify(cert, null, 2);
}

/**
 * Render a birth certificate as a minimal, readable HTML document.
 */
export function exportBirthCertificateHtml(cert: AgentBirthCertificate): string {
  const approvedByRows = cert.approvedBy
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.approver)}</td><td>${escapeHtml(a.gate)}</td><td>${escapeHtml(a.approvedAt)}</td></tr>`,
    )
    .join("\n");

  const allowedSystems = cert.systemsAllowed
    .map((s) => `<li>${escapeHtml(s.systemName)} (${escapeHtml(s.accessNeeded)})</li>`)
    .join("\n");

  const deniedSystems = cert.systemsDenied.length
    ? cert.systemsDenied.map((s) => `<li>${escapeHtml(s)}</li>`).join("\n")
    : "<li><em>None</em></li>";

  const controlIds = cert.relatedControlIds
    .map((id) => `<li>${escapeHtml(id)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Birth Certificate — ${escapeHtml(cert.agentName)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
  h2 { margin-top: 2rem; color: #374151; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border: 1px solid #d1d5db; }
  th { background: #f3f4f6; }
  .field-label { font-weight: 600; color: #4b5563; width: 220px; }
  .meta { color: #6b7280; font-size: 0.875rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>Agent Birth Certificate</h1>
<table>
  <tr><td class="field-label">ID</td><td>${escapeHtml(cert.id)}</td></tr>
  <tr><td class="field-label">Agent ID</td><td>${escapeHtml(cert.agentId)}</td></tr>
  <tr><td class="field-label">Agent Name</td><td>${escapeHtml(cert.agentName)}</td></tr>
  <tr><td class="field-label">Birth Date</td><td>${escapeHtml(cert.birthDate)}</td></tr>
  <tr><td class="field-label">Created By</td><td>${escapeHtml(cert.createdBy)}</td></tr>
  <tr><td class="field-label">Human Owner</td><td>${escapeHtml(cert.humanOwnerId)}</td></tr>
  <tr><td class="field-label">Parent Role</td><td>${escapeHtml(cert.parentRole)}</td></tr>
  <tr><td class="field-label">Parent Responsibility</td><td>${escapeHtml(cert.parentResponsibilityId)}</td></tr>
  <tr><td class="field-label">Parent Task</td><td>${escapeHtml(cert.parentTaskId)}</td></tr>
  <tr><td class="field-label">SOX Relevant</td><td>${String(cert.soxRelevant)}</td></tr>
  <tr><td class="field-label">Initial Prompt Version</td><td>${escapeHtml(cert.initialPromptVersion)}</td></tr>
  <tr><td class="field-label">Manifest Version</td><td>${String(cert.manifestVersion)}</td></tr>
  <tr><td class="field-label">Initial Risk Score</td><td>${String(cert.initialRiskScore)}</td></tr>
  <tr><td class="field-label">Evidence Packet</td><td>${escapeHtml(cert.evidencePacketId)}</td></tr>
  <tr><td class="field-label">Created At</td><td>${escapeHtml(cert.createdAt)}</td></tr>
</table>

<h2>Approved By</h2>
<table>
  <thead><tr><th>Approver</th><th>Gate</th><th>Date</th></tr></thead>
  <tbody>${approvedByRows || "<tr><td colspan=\"3\"><em>No approvals recorded</em></td></tr>"}</tbody>
</table>

<h2>Authority Ceiling</h2>
<h3>Allowed Actions</h3>
<ul>${cert.authorityCeiling.allowedActions.length ? cert.authorityCeiling.allowedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n") : "<li><em>None</em></li>"}</ul>
<h3>Approval Required Actions</h3>
<ul>${cert.authorityCeiling.approvalRequiredActions.length ? cert.authorityCeiling.approvalRequiredActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n") : "<li><em>None</em></li>"}</ul>
<h3>Blocked Actions</h3>
<ul>${cert.authorityCeiling.blockedActions.length ? cert.authorityCeiling.blockedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n") : "<li><em>None</em></li>"}</ul>

<h2>Systems</h2>
<h3>Allowed</h3>
<ul>${allowedSystems || "<li><em>None</em></li>"}</ul>
<h3>Denied</h3>
<ul>${deniedSystems}</ul>

<h2>Related Controls</h2>
<ul>${controlIds || "<li><em>None</em></li>"}</ul>
<p class="meta">Certificate generated at ${escapeHtml(cert.createdAt)}</p>
</body>
</html>`;
}

// ── Immutability validation ──────────────────────────────────────────

/**
 * Fields on an `AgentBirthCertificate` that must never change after creation.
 */
const IMMUTABLE_FIELDS: (keyof AgentBirthCertificate)[] = [
  "id",
  "agentId",
  "agentName",
  "birthDate",
  "createdBy",
  "approvedBy",
  "humanOwnerId",
  "parentRole",
  "parentResponsibilityId",
  "parentTaskId",
  "authorityCeiling",
  "systemsAllowed",
  "relatedControlIds",
  "soxRelevant",
  "initialPromptVersion",
  "manifestVersion",
  "createdAt",
];

/**
 * Compare two birth certificates and return the names of fields that are
 * considered immutable but differ between `existing` and `updated`.
 *
 * Fields that are allowed to change (e.g. `systemsDenied`,
 * `approvalEvidenceIds`, `initialRiskScore`, `runtimeDestination`,
 * `evidencePacketId`) are **not** included in the result even if they
 * differ.
 */
export function validateCertificateImmutability(
  existing: AgentBirthCertificate,
  updated: AgentBirthCertificate,
): string[] {
  const changed: string[] = [];

  for (const field of IMMUTABLE_FIELDS) {
    const lhs = existing[field];
    const rhs = updated[field];

    if (lhs === rhs) continue;

    // Deep-compare arrays and objects by JSON serialisation
    if (
      Array.isArray(lhs) &&
      Array.isArray(rhs) &&
      JSON.stringify(lhs) === JSON.stringify(rhs)
    ) {
      continue;
    }

    if (
      typeof lhs === "object" &&
      lhs !== null &&
      typeof rhs === "object" &&
      rhs !== null &&
      JSON.stringify(lhs) === JSON.stringify(rhs)
    ) {
      continue;
    }

    changed.push(field as string);
  }

  return changed;
}

// ── Internal helpers ─────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
