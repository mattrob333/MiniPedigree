import { describe, it, expect } from "vitest";
import {
  createAiCouncilRequest,
  approveRequest,
  convertApprovedToManifest,
} from "./aiCouncil";
import type { AiCouncilRequest } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeApprovedRequest(
  overrides: Partial<AiCouncilRequest> = {},
): AiCouncilRequest {
  const req = createAiCouncilRequest({
    requesterId: "user-1",
    department: "Finance",
    businessProblem: "Monthly reconciliation takes 3 days manually",
    proposedTask: "Automate bank statement matching in Oracle EBS",
    systemsTouched: ["sys-oracle"],
    dataSensitivity: "regulated",
    soxRelevant: true,
    humanOwnerId: "user-2",
    riskTier: "high" as const,
    ...overrides,
  });
  const { request } = approveRequest(req, "julie.chen@wesco.com");
  return request;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("convertApprovedToManifest", () => {
  it("throws if the request is not approved", () => {
    const draft = createAiCouncilRequest({
      requesterId: "user-1",
      businessProblem: "Test problem",
      proposedTask: "Test task",
    });
    expect(() => convertApprovedToManifest(draft, "Alice")).toThrow(
      /status is "draft"/,
    );
  });

  it("maps businessProblem to manifest purpose", () => {
    const approved = makeApprovedRequest();
    const { manifest } = convertApprovedToManifest(approved, "Alice");
    expect(manifest.purpose).toBe(
      "Monthly reconciliation takes 3 days manually",
    );
  });

  it("maps proposedTask to agent name", () => {
    const approved = makeApprovedRequest();
    const { manifest } = convertApprovedToManifest(approved, "Alice");
    expect(manifest.agentName).toContain("Automate bank statement matching");
  });

  it("creates systemAccess entries from systemsTouched", () => {
    const approved = makeApprovedRequest({
      systemsTouched: ["sys-oracle", "sys-salesforce"],
    });
    const { manifest } = convertApprovedToManifest(approved, "Alice", [
      { id: "sys-oracle", name: "Oracle EBS" },
    ]);
    expect(manifest.systemAccess).toHaveLength(2);

    // Known system should resolve name
    const oracle = manifest.systemAccess.find(
      (s) => s.systemId === "sys-oracle",
    );
    expect(oracle?.systemName).toBe("Oracle EBS");

    // Unknown system uses raw id as name
    const sf = manifest.systemAccess.find(
      (s) => s.systemId === "sys-salesforce",
    );
    expect(sf?.systemName).toBe("sys-salesforce");
  });

  it("sets soxRelevant from the request", () => {
    const soxReq = makeApprovedRequest({ soxRelevant: true });
    const noSoxReq = makeApprovedRequest({ soxRelevant: false });
    expect(convertApprovedToManifest(soxReq, "Alice").manifest.soxRelevant).toBe(
      true,
    );
    expect(
      convertApprovedToManifest(noSoxReq, "Alice").manifest.soxRelevant,
    ).toBe(false);
  });

  it("sets riskTier from the request defaulting to medium", () => {
    const highReq = makeApprovedRequest({ riskTier: "high" });
    const noRisk = makeApprovedRequest({ riskTier: undefined });
    expect(convertApprovedToManifest(highReq, "Alice").manifest.riskTier).toBe(
      "high",
    );
    expect(convertApprovedToManifest(noRisk, "Alice").manifest.riskTier).toBe(
      "medium",
    );
  });

  it("uses humanOwnerId if available, falls back to requesterId", () => {
    const withOwner = makeApprovedRequest({ humanOwnerId: "user-owner" });
    const withoutOwner = makeApprovedRequest({ humanOwnerId: undefined });
    expect(
      convertApprovedToManifest(withOwner, "Alice").manifest.humanOwnerId,
    ).toBe("user-owner");
    expect(
      convertApprovedToManifest(withoutOwner, "Alice").manifest.humanOwnerId,
    ).toBe("user-1"); // requesterId fallback
  });

  it("creates an evidence record linking the manifest to the approval", () => {
    const approved = makeApprovedRequest();
    const { evidenceRecord } = convertApprovedToManifest(
      approved,
      "Alice Smith",
    );
    expect(evidenceRecord.id).toMatch(/^evt-aic-convert-/);
    expect(evidenceRecord.type).toBe("agent_request");
    expect(evidenceRecord.subjectType).toBe("agent");
    expect(evidenceRecord.actor).toBe("Alice Smith");
    expect(evidenceRecord.summary).toContain(approved.id);
    expect(evidenceRecord.source?.kind).toBe("manual_action");
  });

  it("returns a partialRecord with id and manifest", () => {
    const approved = makeApprovedRequest();
    const { partialRecord } = convertApprovedToManifest(approved, "Alice");
    expect(partialRecord.id).toBeTruthy();
    expect(partialRecord.name).toBeTruthy();
    expect(partialRecord.manifest).toBeTruthy();
  });

  it("handles empty systemsTouched", () => {
    const approved = makeApprovedRequest({ systemsTouched: [] });
    const { manifest } = convertApprovedToManifest(approved, "Alice");
    expect(manifest.systemAccess).toHaveLength(0);
    expect(manifest.authorityCeiling.systems).toHaveLength(0);
  });

  it("sets status to draft on the manifest", () => {
    const approved = makeApprovedRequest();
    const { manifest } = convertApprovedToManifest(approved, "Alice");
    expect(manifest.status).toBe("draft");
  });
});
