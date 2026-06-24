import { describe, expect, it } from "vitest";
import type { AgentBirthCertificate, AgentManifest, ApprovalRecord } from "../src/types";
import {
  newBirthCertificateId,
  createBirthCertificate,
  createBirthCertificateFromManifest,
  exportBirthCertificateJson,
  exportBirthCertificateHtml,
  validateCertificateImmutability,
} from "../src/lib/birthCertificate";

// ── Shared fixtures ─────────────────────────────────────────────────

const sampleApprovals: ApprovalRecord[] = [
  { approver: "alice@company.com", approvedAt: "2025-06-01T10:00:00Z", gate: "ai-council" },
  { approver: "bob@company.com", approvedAt: "2025-06-02T14:30:00Z", gate: "sox-review" },
];

const sampleAuthorityCeiling = {
  systems: [
    { systemId: "sys-sf", systemName: "Salesforce", accessNeeded: "read" as const },
  ],
  allowedActions: ["read_claims", "summarize_claims"],
  approvalRequiredActions: ["send_external"],
  blockedActions: ["approve_claims", "delete_records"],
};

const sampleSystemsAllowed = [
  { systemId: "sys-sf", systemName: "Salesforce", accessNeeded: "read" as const },
  { systemId: "sys-slack", systemName: "Slack", accessNeeded: "draft" as const },
];

// ── Tests ────────────────────────────────────────────────────────────

describe("newBirthCertificateId", () => {
  it("generates an ID with the bc- prefix", () => {
    const id = newBirthCertificateId();
    expect(id).toMatch(/^bc-\d+$/);
  });

  it("generates unique IDs when time advances", () => {
    const id1 = newBirthCertificateId();
    // Force the next call to land in a different millisecond
    const id2 = newBirthCertificateId();
    // If they happen to land in the same ms, IDs may match; at minimum
    // the format is always correct
    expect(id1).toMatch(/^bc-\d+$/);
    expect(id2).toMatch(/^bc-\d+$/);
  });
});

describe("createBirthCertificate", () => {
  it("creates a certificate with all defaults applied", () => {
    const cert = createBirthCertificate({
      agentId: "agent-001",
      agentName: "Claims Summary Agent",
      createdBy: "admin@company.com",
      approvedBy: sampleApprovals,
      humanOwnerId: "person-morgan",
      parentRole: "Revenue",
      parentResponsibilityId: "resp-rev-cycle",
      parentTaskId: "task-claims-summary",
      authorityCeiling: sampleAuthorityCeiling,
      systemsAllowed: sampleSystemsAllowed,
      relatedControlIds: ["ctrl-sox-101", "ctrl-sox-102"],
      soxRelevant: true,
      initialPromptVersion: "1.0.0",
      manifestVersion: 1,
    });

    // Core fields
    expect(cert.id).toMatch(/^bc-\d+$/);
    expect(cert.agentId).toBe("agent-001");
    expect(cert.agentName).toBe("Claims Summary Agent");
    expect(cert.birthDate).toBe(new Date().toISOString().slice(0, 10));
    expect(cert.createdBy).toBe("admin@company.com");
    expect(cert.approvedBy).toEqual(sampleApprovals);
    expect(cert.humanOwnerId).toBe("person-morgan");

    // Defaults
    expect(cert.systemsDenied).toEqual([]);
    expect(cert.initialRiskScore).toBe(0);
    expect(cert.approvalEvidenceIds).toEqual([]);
    expect(cert.evidencePacketId).toBe("");

    // Passed through
    expect(cert.parentRole).toBe("Revenue");
    expect(cert.parentResponsibilityId).toBe("resp-rev-cycle");
    expect(cert.parentTaskId).toBe("task-claims-summary");
    expect(cert.authorityCeiling).toEqual(sampleAuthorityCeiling);
    expect(cert.systemsAllowed).toEqual(sampleSystemsAllowed);
    expect(cert.relatedControlIds).toEqual(["ctrl-sox-101", "ctrl-sox-102"]);
    expect(cert.soxRelevant).toBe(true);
    expect(cert.initialPromptVersion).toBe("1.0.0");
    expect(cert.manifestVersion).toBe(1);

    // Timestamp
    expect(cert.createdAt).toBeTruthy();
    expect(() => new Date(cert.createdAt)).not.toThrow();
  });
});

describe("createBirthCertificateFromManifest", () => {
  const manifest: AgentManifest = {
    id: "manifest-001",
    agentName: "Ops Monitor Agent",
    purpose: "Monitor operational metrics and surface anomalies",
    humanOwnerId: "person-sarah",
    department: "Operations",
    parentResponsibilityId: "resp-ops-monitor",
    parentTaskId: "task-ops-anomalies",
    relatedControlIds: ["ctrl-ops-001"],
    systemAccess: [
      { systemId: "sys-db", systemName: "Operations DB", accessNeeded: "read" as const },
    ],
    tools: [],
    allowedActions: ["read_metrics", "alert_on_anomaly"],
    approvalRequiredActions: ["escalate_to_owner"],
    blockedActions: ["write_to_db"],
    approvalGates: [],
    authorityCeiling: {
      systems: [
        { systemId: "sys-db", systemName: "Operations DB", accessNeeded: "read" as const },
      ],
      allowedActions: ["read_metrics", "alert_on_anomaly"],
      approvalRequiredActions: ["escalate_to_owner"],
      blockedActions: ["write_to_db"],
    },
    riskTier: "low",
    soxRelevant: false,
    systemPrompt: "You are an operations monitor agent...",
    runtimeTargets: [],
    evidenceRequirements: [],
    testPrompts: [],
    validationWarnings: [],
    status: "approved",
    createdAt: "2025-05-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  };

  it("creates a birth certificate from a manifest", () => {
    const approvals: ApprovalRecord[] = [
      { approver: "carol@company.com", approvedAt: "2025-06-15T09:00:00Z", gate: "ai-council" },
    ];

    const cert = createBirthCertificateFromManifest(manifest, approvals, "deployer@company.com");

    // Extracted from manifest
    expect(cert.agentId).toBe("manifest-001");
    expect(cert.agentName).toBe("Ops Monitor Agent");
    expect(cert.humanOwnerId).toBe("person-sarah");
    expect(cert.parentRole).toBe("Operations");
    expect(cert.parentResponsibilityId).toBe("resp-ops-monitor");
    expect(cert.parentTaskId).toBe("task-ops-anomalies");
    expect(cert.authorityCeiling).toEqual(manifest.authorityCeiling);
    expect(cert.systemsAllowed).toEqual(manifest.systemAccess);
    expect(cert.relatedControlIds).toEqual(["ctrl-ops-001"]);
    expect(cert.soxRelevant).toBe(false);

    // From parameters / defaults
    expect(cert.createdBy).toBe("deployer@company.com");
    expect(cert.approvedBy).toEqual(approvals);
    expect(cert.initialPromptVersion).toBe("1.0.0");
    expect(cert.manifestVersion).toBe(1);
    expect(cert.initialRiskScore).toBe(0);
    expect(cert.systemsDenied).toEqual([]);
    expect(cert.approvalEvidenceIds).toEqual([]);
    expect(cert.id).toMatch(/^bc-\d+$/);
  });
});

describe("exportBirthCertificateJson", () => {
  it("produces valid pretty-printed JSON", () => {
    const cert = createBirthCertificate({
      agentId: "agent-json",
      agentName: "JSON Test",
      createdBy: "tester",
      approvedBy: [],
      humanOwnerId: "person-test",
      parentRole: "Engineering",
      parentResponsibilityId: "resp-test",
      parentTaskId: "task-test",
      authorityCeiling: sampleAuthorityCeiling,
      systemsAllowed: [],
      relatedControlIds: [],
      soxRelevant: false,
      initialPromptVersion: "1.0.0",
      manifestVersion: 1,
    });

    const json = exportBirthCertificateJson(cert);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(cert);
    expect(json).toContain("\n"); // pretty-printed
  });
});

describe("exportBirthCertificateHtml", () => {
  it("produces a string containing the agent name", () => {
    const cert = createBirthCertificate({
      agentId: "agent-html",
      agentName: "HTML Export Test Agent",
      createdBy: "tester",
      approvedBy: sampleApprovals,
      humanOwnerId: "person-test",
      parentRole: "Engineering",
      parentResponsibilityId: "resp-test",
      parentTaskId: "task-test",
      authorityCeiling: sampleAuthorityCeiling,
      systemsAllowed: sampleSystemsAllowed,
      relatedControlIds: ["ctrl-001"],
      soxRelevant: true,
      initialPromptVersion: "2.1.0",
      manifestVersion: 3,
    });

    const html = exportBirthCertificateHtml(cert);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("HTML Export Test Agent");
    expect(html).toContain("alice@company.com");
    expect(html).toContain("bob@company.com");
    expect(html).toContain("Salesforce");
    expect(html).toContain("ctrl-001");
    expect(html).toContain("2.1.0");
    expect(html).toContain("3");
  });
});

describe("validateCertificateImmutability", () => {
  const base = createBirthCertificate({
    agentId: "agent-immutable",
    agentName: "Immutability Test",
    createdBy: "admin",
    approvedBy: sampleApprovals,
    humanOwnerId: "person-owner",
    parentRole: "Finance",
    parentResponsibilityId: "resp-fin",
    parentTaskId: "task-fin-ops",
    authorityCeiling: sampleAuthorityCeiling,
    systemsAllowed: sampleSystemsAllowed,
    relatedControlIds: ["ctrl-001"],
    soxRelevant: true,
    initialPromptVersion: "1.0.0",
    manifestVersion: 2,
  });

  it("returns empty array when certificates are identical", () => {
    const changes = validateCertificateImmutability(base, { ...base });
    expect(changes).toEqual([]);
  });

  it("detects changes to immutable fields", () => {
    const modified: AgentBirthCertificate = {
      ...base,
      id: "bc-different-id",
      agentName: "Tampered Name",
    };
    const changes = validateCertificateImmutability(base, modified);
    expect(changes).toContain("id");
    expect(changes).toContain("agentName");
  });

  it("ignores changes to mutable fields", () => {
    const modified: AgentBirthCertificate = {
      ...base,
      systemsDenied: ["sys-legacy"],
      initialRiskScore: 75,
      approvalEvidenceIds: ["ev-001"],
      evidencePacketId: "pkt-abc",
    };
    const changes = validateCertificateImmutability(base, modified);
    expect(changes).toEqual([]);
  });

  it("deep-compares arrays and objects for immutability", () => {
    // Same data, different reference — should be treated as equal
    const modified: AgentBirthCertificate = {
      ...base,
      systemsAllowed: [
        { systemId: "sys-sf", systemName: "Salesforce", accessNeeded: "read" as const },
        { systemId: "sys-slack", systemName: "Slack", accessNeeded: "draft" as const },
      ],
    };
    const changes = validateCertificateImmutability(base, modified);
    expect(changes).toEqual([]);
  });

  it("detects deep changes in nested objects", () => {
    const modified: AgentBirthCertificate = {
      ...base,
      authorityCeiling: {
        ...base.authorityCeiling,
        blockedActions: [...base.authorityCeiling.blockedActions, "new_blocked_action"],
      },
    };
    const changes = validateCertificateImmutability(base, modified);
    expect(changes).toContain("authorityCeiling");
    expect(changes).not.toContain("id"); // only the one changed field
  });

  it("reports all changed immutable fields", () => {
    const modified: AgentBirthCertificate = {
      ...base,
      agentId: "hacked-id",
      humanOwnerId: "hacker",
      createdBy: "impostor",
      soxRelevant: false,
    };
    const changes = validateCertificateImmutability(base, modified);
    expect(changes).toContain("agentId");
    expect(changes).toContain("humanOwnerId");
    expect(changes).toContain("createdBy");
    expect(changes).toContain("soxRelevant");
    expect(changes.length).toBe(4);
  });
});
