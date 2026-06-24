import { describe, it, expect } from "vitest";
import {
  createRiskFinding,
  deriveDriftRiskFindings,
  deriveOrphanRiskFindings,
  filterRiskFindings,
  getRiskColor,
  getRiskLabel,
  newRiskFindingId,
  resolveRiskFinding,
  riskSummaryStats,
} from "../src/lib/riskFindings";
import type { AgentRegistryEntry, Person, RiskFinding } from "../src/types";

// ── Helpers ─────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "P-001",
    name: "Jane Doe",
    email: "jane@x.co",
    title: "Engineer",
    managerId: null,
    department: "Engineering",
    tools: [],
    lifecycle: "active",
    ...overrides,
  };
}

function makeRegistryEntry(
  overrides: Partial<AgentRegistryEntry> = {},
): AgentRegistryEntry {
  return {
    agent_id: "agent-001",
    owner_person_id: "P-001",
    task_id: "task-001",
    resp_id: "resp-001",
    runtime: "hermes",
    status: "deployed",
    stale: false,
    ingredient_hashes: {},
    versions: [
      {
        version: 1,
        compiled: {},
        artifacts_manifest: [],
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("newRiskFindingId", () => {
  it("generates an id starting with 'risk-'", () => {
    expect(newRiskFindingId()).toMatch(/^risk-/);
  });
});

describe("createRiskFinding", () => {
  it("creates a risk finding with the given properties and defaults", () => {
    const finding = createRiskFinding(
      "sod_conflict",
      "critical",
      "SoD Conflict",
      "Same person prepares and approves payments.",
      "This violates segregation of duties.",
      "Assign separate preparer and approver roles.",
    );

    expect(finding.id).toMatch(/^risk-/);
    expect(finding.category).toBe("sod_conflict");
    expect(finding.severity).toBe("critical");
    expect(finding.title).toBe("SoD Conflict");
    expect(finding.plainEnglishDescription).toBe(
      "Same person prepares and approves payments.",
    );
    expect(finding.whyItMatters).toBe(
      "This violates segregation of duties.",
    );
    expect(finding.recommendedAction).toBe(
      "Assign separate preparer and approver roles.",
    );
    expect(finding.status).toBe("open");
    expect(finding.relatedAgentIds).toEqual([]);
    expect(finding.relatedPersonIds).toEqual([]);
    expect(finding.relatedSystemIds).toEqual([]);
    expect(finding.relatedControlIds).toEqual([]);
    expect(finding.evidenceIds).toEqual([]);
    expect(finding.createdAt).toBeTruthy();
    expect(finding.resolvedAt).toBeUndefined();
  });
});

describe("deriveOrphanRiskFindings", () => {
  it("returns empty when no offboarded people exist", () => {
    const people = [makePerson()];
    const registry = [makeRegistryEntry()];
    const findings = deriveOrphanRiskFindings(people, registry);
    expect(findings).toEqual([]);
  });

  it("returns empty when offboarded person owns no agents", () => {
    const people = [makePerson({ lifecycle: "offboarded" })];
    const registry: AgentRegistryEntry[] = [];
    const findings = deriveOrphanRiskFindings(people, registry);
    expect(findings).toEqual([]);
  });

  it("creates orphan risk findings for agents owned by offboarded people", () => {
    const people = [
      makePerson({ id: "P-001", lifecycle: "offboarded", name: "Jane Doe" }),
      makePerson({ id: "P-002", lifecycle: "active" }),
    ];
    const registry = [
      makeRegistryEntry({ agent_id: "agent-001", owner_person_id: "P-001" }),
      makeRegistryEntry({ agent_id: "agent-002", owner_person_id: "P-001" }),
      makeRegistryEntry({ agent_id: "agent-003", owner_person_id: "P-002" }),
    ];

    const findings = deriveOrphanRiskFindings(people, registry);

    expect(findings).toHaveLength(2);
    expect(
      findings.every((f) => f.category === "orphaned_agent"),
    ).toBe(true);
    expect(
      findings.every((f) => f.severity === "high"),
    ).toBe(true);
    expect(
      findings.every((f) => f.status === "open"),
    ).toBe(true);

    const ids = findings.map((f) => f.title);
    expect(ids).toContain("Orphaned agent: agent-001");
    expect(ids).toContain("Orphaned agent: agent-002");
  });
});

describe("deriveDriftRiskFindings", () => {
  it("returns empty when no stale entries exist", () => {
    const registry = [makeRegistryEntry({ stale: false })];
    const findings = deriveDriftRiskFindings(registry);
    expect(findings).toEqual([]);
  });

  it("returns empty when registry is empty", () => {
    const findings = deriveDriftRiskFindings([]);
    expect(findings).toEqual([]);
  });

  it("creates drift risk findings for stale entries", () => {
    const registry = [
      makeRegistryEntry({
        agent_id: "agent-001",
        stale: true,
        stale_reason: "owner_role_changed",
      }),
      makeRegistryEntry({
        agent_id: "agent-002",
        stale: true,
        stale_reason: "owner_offboarded",
      }),
      makeRegistryEntry({ agent_id: "agent-003", stale: false }),
    ];

    const findings = deriveDriftRiskFindings(registry);

    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.category === "drift")).toBe(true);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
    expect(findings.every((f) => f.status === "open")).toBe(true);

    const titles = findings.map((f) => f.title);
    expect(titles).toContain("Drift detected: agent-001");
    expect(titles).toContain("Drift detected: agent-002");

    const descs = findings.map((f) => f.plainEnglishDescription);
    expect(descs[0]).toContain("owner_role_changed");
    expect(descs[1]).toContain("owner_offboarded");
  });

  it("handles stale entries without a stale_reason", () => {
    const registry = [
      makeRegistryEntry({ agent_id: "agent-001", stale: true }),
    ];
    const findings = deriveDriftRiskFindings(registry);

    expect(findings).toHaveLength(1);
    expect(findings[0].plainEnglishDescription).toContain("Unknown drift cause");
  });
});

describe("getRiskColor", () => {
  it("returns correct hex colors", () => {
    expect(getRiskColor("critical")).toBe("#dc2626");
    expect(getRiskColor("high")).toBe("#ea580c");
    expect(getRiskColor("medium")).toBe("#ca8a04");
    expect(getRiskColor("low")).toBe("#2563eb");
    expect(getRiskColor("info")).toBe("#6b7280");
  });
});

describe("getRiskLabel", () => {
  it("returns uppercase labels", () => {
    expect(getRiskLabel("critical")).toBe("CRITICAL");
    expect(getRiskLabel("high")).toBe("HIGH");
    expect(getRiskLabel("medium")).toBe("MEDIUM");
    expect(getRiskLabel("low")).toBe("LOW");
    expect(getRiskLabel("info")).toBe("INFO");
  });
});

describe("filterRiskFindings", () => {
  const findings: RiskFinding[] = [
    createRiskFinding("orphaned_agent", "high", "O1", "desc", "why", "act"),
    createRiskFinding("drift", "medium", "D1", "desc", "why", "act"),
    createRiskFinding("sod_conflict", "critical", "S1", "desc", "why", "act"),
  ];

  it("returns all when no filters are set", () => {
    expect(filterRiskFindings(findings, {})).toHaveLength(3);
  });

  it("filters by severity", () => {
    const result = filterRiskFindings(findings, { severity: "high" });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("O1");
  });

  it("filters by status", () => {
    // All are "open" so all should match
    const result = filterRiskFindings(findings, { status: "open" });
    expect(result).toHaveLength(3);
  });

  it("filters by category", () => {
    const result = filterRiskFindings(findings, { category: "drift" });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("D1");
  });

  it("combines multiple filters", () => {
    const result = filterRiskFindings(findings, {
      severity: "high",
      category: "orphaned_agent",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("O1");
  });

  it("returns empty array when no match", () => {
    const result = filterRiskFindings(findings, { severity: "info" });
    expect(result).toEqual([]);
  });
});

describe("resolveRiskFinding", () => {
  it("sets status to resolved and adds a resolvedAt timestamp", () => {
    const finding = createRiskFinding(
      "orphaned_agent",
      "high",
      "Test",
      "desc",
      "why",
      "act",
    );
    const resolved = resolveRiskFinding(finding);

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBeTruthy();
    // Immutable: original is unchanged
    expect(finding.status).toBe("open");
    expect(finding.resolvedAt).toBeUndefined();
  });

  it("preserves all other fields", () => {
    const finding = createRiskFinding(
      "sod_conflict",
      "critical",
      "SoD",
      "desc",
      "why",
      "act",
    );
    const resolved = resolveRiskFinding(finding);

    expect(resolved.id).toBe(finding.id);
    expect(resolved.category).toBe("sod_conflict");
    expect(resolved.severity).toBe("critical");
    expect(resolved.title).toBe("SoD");
  });
});

describe("riskSummaryStats", () => {
  it("returns zeroed stats for empty input", () => {
    const stats = riskSummaryStats([]);
    expect(stats).toEqual({
      total: 0,
      open: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      byCategory: {},
    });
  });

  it("computes correct counts", () => {
    const findings = [
      createRiskFinding("orphaned_agent", "high", "O1", "desc", "why", "act"),
      createRiskFinding("drift", "medium", "D1", "desc", "why", "act"),
      createRiskFinding("sod_conflict", "critical", "S1", "desc", "why", "act"),
      createRiskFinding("drift", "low", "D2", "desc", "why", "act"),
    ];

    // Resolve the last one to test open count
    findings[3] = resolveRiskFinding(findings[3]);

    const stats = riskSummaryStats(findings);
    expect(stats.total).toBe(4);
    expect(stats.open).toBe(3);
    expect(stats.critical).toBe(1);
    expect(stats.high).toBe(1);
    expect(stats.medium).toBe(1);
    expect(stats.low).toBe(1);
    expect(stats.byCategory).toEqual({
      orphaned_agent: 1,
      drift: 2,
      sod_conflict: 1,
    });
  });

  it("counts info severity findings (not in critical/high/medium/low)", () => {
    const findings = [
      createRiskFinding("missing_evidence", "info", "Info1", "desc", "why", "act"),
      createRiskFinding("orphaned_agent", "high", "O1", "desc", "why", "act"),
    ];

    const stats = riskSummaryStats(findings);
    expect(stats.total).toBe(2);
    expect(stats.high).toBe(1);
    // info is not tracked in the dedicated severity counters — only in byCategory
    expect(stats.byCategory.missing_evidence).toBe(1);
  });
});
