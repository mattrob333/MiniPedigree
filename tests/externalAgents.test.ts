import { describe, it, expect } from "vitest";
import {
  newExternalAgentId,
  createExternalAgent,
  classifyExternalAgent,
  approveExternalAgent,
  restrictExternalAgent,
  sandboxExternalAgent,
  rejectExternalAgent,
  filterExternalByStatus,
  filterExternalByRisk,
} from "../src/lib/externalAgents";
import type { ExternalAgentRecord } from "../src/types";

// ── Helpers ───────────────────────────────────────────────────────────────

function sampleAgent(
  overrides: Partial<ExternalAgentRecord> = {},
): ExternalAgentRecord {
  return createExternalAgent({
    name: "Test Agent",
    source: "manual",
    ...overrides,
  });
}

// ── newExternalAgentId ────────────────────────────────────────────────────

describe("newExternalAgentId", () => {
  it("generates an id with ext- prefix followed by a timestamp", () => {
    const id = newExternalAgentId();
    expect(id).toMatch(/^ext-\d+-\d+$/);
  });

  it("generates unique ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 5 }, () => newExternalAgentId()));
    expect(ids.size).toBe(5);
  });
});

// ── createExternalAgent ───────────────────────────────────────────────────

describe("createExternalAgent", () => {
  it("returns a complete ExternalAgentRecord with defaults", () => {
    const agent = createExternalAgent({ name: "My Agent" });

    expect(agent.id).toMatch(/^ext-\d+-\d+$/);
    expect(agent.name).toBe("My Agent");
    expect(agent.source).toBe("manual");
    expect(agent.riskTier).toBe("medium");
    expect(agent.soxRelevant).toBe(false);
    expect(agent.status).toBe("imported_pending_review");
    expect(agent.systems).toEqual([]);
    expect(agent.tools).toEqual([]);
    expect(agent.classificationFlags).toEqual([]);
    expect(agent.matchedPolicyIds).toEqual([]);
    expect(agent.evidenceIds).toEqual([]);
    expect(agent.createdAt).toBeTruthy();
    expect(agent.updatedAt).toBe(agent.createdAt);
  });

  it("defaults name to 'Untitled External Agent' when omitted", () => {
    const agent = createExternalAgent({});
    expect(agent.name).toBe("Untitled External Agent");
  });

  it("overrides all supplied fields", () => {
    const agent = createExternalAgent({
      id: "ext-custom-001",
      name: "Custom GPT Bot",
      source: "gpt",
      sourceReference: "https://chatgpt.com/g/g-custom",
      ownerPersonId: "P-001",
      businessOwnerId: "P-002",
      technicalOwnerId: "P-003",
      purpose: "Generate weekly reports",
      systems: ["salesforce", "slack"],
      tools: ["sap", "netsuite"],
      promptSnippet: "You are a helpful assistant...",
      riskTier: "high",
      soxRelevant: true,
      status: "approved",
      classificationFlags: ["missing_owner"],
      matchedPolicyIds: ["POL-001"],
      evidenceIds: ["EVD-001"],
    });

    expect(agent.id).toBe("ext-custom-001");
    expect(agent.name).toBe("Custom GPT Bot");
    expect(agent.source).toBe("gpt");
    expect(agent.sourceReference).toBe("https://chatgpt.com/g/g-custom");
    expect(agent.ownerPersonId).toBe("P-001");
    expect(agent.businessOwnerId).toBe("P-002");
    expect(agent.technicalOwnerId).toBe("P-003");
    expect(agent.purpose).toBe("Generate weekly reports");
    expect(agent.systems).toEqual(["salesforce", "slack"]);
    expect(agent.tools).toEqual(["sap", "netsuite"]);
    expect(agent.promptSnippet).toBe("You are a helpful assistant...");
    expect(agent.riskTier).toBe("high");
    expect(agent.soxRelevant).toBe(true);
    expect(agent.status).toBe("approved");
    expect(agent.classificationFlags).toEqual(["missing_owner"]);
    expect(agent.matchedPolicyIds).toEqual(["POL-001"]);
    expect(agent.evidenceIds).toEqual(["EVD-001"]);
  });

  it("preserves optional fields set to undefined", () => {
    const agent = createExternalAgent({ name: "Agent X" });
    expect(agent.ownerPersonId).toBeUndefined();
    expect(agent.purpose).toBeUndefined();
    expect(agent.sourceReference).toBeUndefined();
    expect(agent.promptSnippet).toBeUndefined();
  });

  it("preserves a custom createdAt and sets updatedAt to match", () => {
    const ts = "2026-06-01T12:00:00.000Z";
    const agent = createExternalAgent({ name: "Test", createdAt: ts });
    expect(agent.createdAt).toBe(ts);
    expect(agent.updatedAt).toBe(ts);
  });

  it("allows a separate updatedAt", () => {
    const created = "2026-06-01T12:00:00.000Z";
    const updated = "2026-06-02T12:00:00.000Z";
    const agent = createExternalAgent({
      name: "Test",
      createdAt: created,
      updatedAt: updated,
    });
    expect(agent.createdAt).toBe(created);
    expect(agent.updatedAt).toBe(updated);
  });
});

// ── classifyExternalAgent ─────────────────────────────────────────────────

describe("classifyExternalAgent", () => {
  it("flags missing owner when ownerPersonId is empty", () => {
    const agent = sampleAgent({ ownerPersonId: undefined, purpose: "Test" });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.missingOwner).toBe(true);
    expect(flags).toContain("missing_owner");
  });

  it("does NOT flag missing owner when ownerPersonId is provided", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.missingOwner).toBe(false);
    expect(flags).not.toContain("missing_owner");
  });

  it("flags missing purpose when purpose is empty", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: undefined,
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.missingPurpose).toBe(true);
    expect(flags).toContain("missing_purpose");
  });

  it("does NOT flag missing purpose when purpose is provided", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Generate reports",
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.missingPurpose).toBe(false);
    expect(flags).not.toContain("missing_purpose");
  });

  it("flags unknown tools when tools contain items not in known systems", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      tools: ["salesforce", "unknown_tool", "another_unknown"],
    });
    const { flags, classification } = classifyExternalAgent(agent, [
      "salesforce",
      "slack",
    ]);
    expect(classification.unknownTools).toEqual([
      "unknown_tool",
      "another_unknown",
    ]);
    expect(flags).toContain("unknown_tools");
  });

  it("does NOT flag unknown tools when all tools are in known systems", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      tools: ["Salesforce", "Slack"],
    });
    const { flags, classification } = classifyExternalAgent(agent, [
      "Salesforce",
      "Slack",
    ]);
    expect(classification.unknownTools).toEqual([]);
    expect(flags).not.toContain("unknown_tools");
  });

  it("does NOT flag unknown tools when no tools are provided", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      tools: [],
    });
    const { flags, classification } = classifyExternalAgent(agent, [
      "salesforce",
    ]);
    expect(classification.unknownTools).toEqual([]);
    expect(flags).not.toContain("unknown_tools");
  });

  it("performs case-insensitive matching for unknown tools", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      tools: ["SALESFORCE", "Slack"],
    });
    const { classification } = classifyExternalAgent(agent, [
      "Salesforce",
      "Slack",
    ]);
    expect(classification.unknownTools).toEqual([]);
  });

  it("flags excessive scope when agent touches more than 5 systems", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      systems: ["a", "b", "c", "d", "e", "f"],
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.excessiveScope).toBe(true);
    expect(flags).toContain("excessive_scope");
  });

  it("does NOT flag excessive scope with 5 or fewer systems", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      systems: ["a", "b", "c", "d", "e"],
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.excessiveScope).toBe(false);
    expect(flags).not.toContain("excessive_scope");
  });

  it("flags SOX system access when agent accesses a known SOX system", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      systems: ["sap", "slack"],
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.soxSystemAccess).toBe(true);
    expect(flags).toContain("sox_system_access");
  });

  it("does NOT flag SOX access for non-SOX systems", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      systems: ["slack", "jira"],
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.soxSystemAccess).toBe(false);
    expect(flags).not.toContain("sox_system_access");
  });

  it("flags service account pattern when source is service_account", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      source: "service_account",
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.serviceAccountPattern).toBe(true);
    expect(flags).toContain("service_account_pattern");
  });

  it("does NOT flag service account pattern for other sources", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Test",
      source: "copilot",
    });
    const { flags, classification } = classifyExternalAgent(agent, []);
    expect(classification.serviceAccountPattern).toBe(false);
    expect(flags).not.toContain("service_account_pattern");
  });

  it("flags multiple conditions simultaneously", () => {
    const agent = sampleAgent({
      ownerPersonId: undefined,
      purpose: undefined,
      tools: ["unknown_tool"],
      systems: ["sap", "a", "b", "c", "d", "e", "f"],
    });
    const { flags, classification } = classifyExternalAgent(agent, [
      "salesforce",
    ]);
    expect(classification.missingOwner).toBe(true);
    expect(classification.missingPurpose).toBe(true);
    expect(classification.unknownTools).toEqual(["unknown_tool"]);
    expect(classification.excessiveScope).toBe(true);
    expect(classification.soxSystemAccess).toBe(true);
    expect(flags).toContain("missing_owner");
    expect(flags).toContain("missing_purpose");
    expect(flags).toContain("unknown_tools");
    expect(flags).toContain("excessive_scope");
    expect(flags).toContain("sox_system_access");
  });

  it("returns no flags for a well-configured agent", () => {
    const agent = sampleAgent({
      ownerPersonId: "P-001",
      purpose: "Send daily alerts",
      tools: ["slack"],
      systems: ["slack"],
      source: "copilot",
    });
    const { flags, classification } = classifyExternalAgent(agent, ["slack"]);
    expect(classification.missingOwner).toBe(false);
    expect(classification.missingPurpose).toBe(false);
    expect(classification.unknownTools).toEqual([]);
    expect(classification.excessiveScope).toBe(false);
    expect(classification.soxSystemAccess).toBe(false);
    expect(classification.serviceAccountPattern).toBe(false);
    expect(flags).toEqual([]);
  });
});

// ── Status transitions ────────────────────────────────────────────────────

describe("approveExternalAgent", () => {
  it("sets status to approved", () => {
    const agent = sampleAgent({ status: "imported_pending_review" });
    const result = approveExternalAgent(agent);
    expect(result.status).toBe("approved");
  });

  it("updates updatedAt", () => {
    const agent = sampleAgent();
    const before = agent.updatedAt;
    const result = approveExternalAgent(agent);
    expect(result.updatedAt).not.toBe(before);
    expect(result.updatedAt).toBeTruthy();
  });

  it("preserves other fields", () => {
    const agent = sampleAgent({ name: "Keep Name", purpose: "Keep Purpose" });
    const result = approveExternalAgent(agent);
    expect(result.name).toBe("Keep Name");
    expect(result.purpose).toBe("Keep Purpose");
  });
});

describe("restrictExternalAgent", () => {
  it("sets status to restricted", () => {
    const agent = sampleAgent();
    const result = restrictExternalAgent(agent);
    expect(result.status).toBe("restricted");
  });

  it("updates updatedAt", () => {
    const agent = sampleAgent();
    const before = agent.updatedAt;
    const result = restrictExternalAgent(agent);
    expect(result.updatedAt).not.toBe(before);
  });
});

describe("sandboxExternalAgent", () => {
  it("sets status to sandboxed", () => {
    const agent = sampleAgent();
    const result = sandboxExternalAgent(agent);
    expect(result.status).toBe("sandboxed");
  });

  it("updates updatedAt", () => {
    const agent = sampleAgent();
    const before = agent.updatedAt;
    const result = sandboxExternalAgent(agent);
    expect(result.updatedAt).not.toBe(before);
  });
});

describe("rejectExternalAgent", () => {
  it("sets status to rejected", () => {
    const agent = sampleAgent();
    const result = rejectExternalAgent(agent);
    expect(result.status).toBe("rejected");
  });

  it("updates updatedAt", () => {
    const agent = sampleAgent();
    const before = agent.updatedAt;
    const result = rejectExternalAgent(agent);
    expect(result.updatedAt).not.toBe(before);
  });
});

describe("transition chain", () => {
  it("transitions from imported_pending_review through all statuses", () => {
    const agent = sampleAgent({ status: "imported_pending_review" });

    const approved = approveExternalAgent(agent);
    expect(approved.status).toBe("approved");

    const restricted = restrictExternalAgent(agent);
    expect(restricted.status).toBe("restricted");

    const sandboxed = sandboxExternalAgent(agent);
    expect(sandboxed.status).toBe("sandboxed");

    const rejected = rejectExternalAgent(agent);
    expect(rejected.status).toBe("rejected");
  });

  it("approve/restrict/sandbox/reject are all independent (each returns a new object)", () => {
    const original = sampleAgent({ status: "imported_pending_review" });

    const approved = approveExternalAgent(original);
    const restricted = restrictExternalAgent(original);
    const sandboxed = sandboxExternalAgent(original);
    const rejected = rejectExternalAgent(original);

    expect(original.status).toBe("imported_pending_review");
    expect(approved.status).toBe("approved");
    expect(restricted.status).toBe("restricted");
    expect(sandboxed.status).toBe("sandboxed");
    expect(rejected.status).toBe("rejected");
  });
});

// ── filterExternalByStatus ────────────────────────────────────────────────

describe("filterExternalByStatus", () => {
  const agents = [
    sampleAgent({ id: "a1", status: "approved" }),
    sampleAgent({ id: "a2", status: "imported_pending_review" }),
    sampleAgent({ id: "a3", status: "rejected" }),
    sampleAgent({ id: "a4", status: "approved" }),
    sampleAgent({ id: "a5", status: "sandboxed" }),
  ];

  it("returns only agents with matching status", () => {
    const result = filterExternalByStatus(agents, "approved");
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["a1", "a4"]);
  });

  it("returns empty array when no agents match", () => {
    const result = filterExternalByStatus(agents, "restricted");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterExternalByStatus([], "approved")).toEqual([]);
  });

  it("returns all agents whose status matches exactly", () => {
    const result = filterExternalByStatus(agents, "imported_pending_review");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a2");
  });
});

// ── filterExternalByRisk ──────────────────────────────────────────────────

describe("filterExternalByRisk", () => {
  const agents = [
    sampleAgent({ id: "a1", riskTier: "low" }),
    sampleAgent({ id: "a2", riskTier: "medium" }),
    sampleAgent({ id: "a3", riskTier: "high" }),
    sampleAgent({ id: "a4", riskTier: "critical" }),
    sampleAgent({ id: "a5", riskTier: "medium" }),
  ];

  it("returns only agents with matching risk tier", () => {
    const result = filterExternalByRisk(agents, "medium");
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["a2", "a5"]);
  });

  it("returns empty array when no agents match", () => {
    const result = filterExternalByRisk(agents, "low");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("returns empty array for empty input", () => {
    expect(filterExternalByRisk([], "high")).toEqual([]);
  });

  it("filters by critical risk tier", () => {
    const result = filterExternalByRisk(agents, "critical");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a4");
  });
});
