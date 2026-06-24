import { describe, it, expect } from "vitest";
import {
  createSystem,
  deriveConnectedAgentCount,
  deriveConnectedControlCount,
  deriveConnectedHumanCount,
  deriveSystemsFromCompanyContext,
  filterSystemsBySox,
  findSystemById,
  newSystemId,
  validateSystem,
} from "../src/lib/systems";
import type { SystemManifest } from "../src/types";

// ── Sample data ─────────────────────────────────────────────────────────

function sampleSystem(overrides: Partial<SystemManifest> = {}): SystemManifest {
  return createSystem({
    name: "Salesforce",
    category: "crm",
    soxInScope: false,
    dataSensitivity: "internal",
    integrationStatus: "connected",
    ...overrides,
  });
}

// ── newSystemId ─────────────────────────────────────────────────────────

describe("newSystemId", () => {
  it("prefixes with sys- and lowercases", () => {
    expect(newSystemId("Salesforce")).toBe("sys-salesforce");
  });

  it("replaces whitespace with hyphens", () => {
    expect(newSystemId("Oracle E-Business Suite")).toBe(
      "sys-oracle-e-business-suite",
    );
  });

  it("handles single word", () => {
    expect(newSystemId("NetSuite")).toBe("sys-netsuite");
  });

  it("collapses consecutive whitespace to a single hyphen", () => {
    expect(newSystemId("SAP   S/4HANA")).toBe("sys-sap-s/4hana");
  });
});

// ── createSystem ────────────────────────────────────────────────────────

describe("createSystem", () => {
  it("returns a complete SystemManifest with defaults", () => {
    const sys = createSystem({ name: "Salesforce" });

    expect(sys.id).toBe("sys-salesforce");
    expect(sys.name).toBe("Salesforce");
    expect(sys.category).toBe("other");
    expect(sys.soxInScope).toBe(false);
    expect(sys.dataSensitivity).toBe("internal");
    expect(sys.integrationStatus).toBe("manual");
    expect(sys.connectedHumanIds).toEqual([]);
    expect(sys.connectedAgentIds).toEqual([]);
    expect(sys.connectedControlIds).toEqual([]);
    expect(sys.riskFindings).toEqual([]);
    expect(sys.approvalRequirements).toEqual([]);
    expect(sys.createdAt).toBeTruthy();
    expect(sys.updatedAt).toBe(sys.createdAt);
  });

  it("overrides all supplied fields", () => {
    const sys = createSystem({
      name: "NetSuite",
      id: "sys-ns-001",
      category: "erp",
      soxInScope: true,
      dataSensitivity: "regulated",
      integrationStatus: "connected",
      ownerPersonId: "P-001",
      connectedHumanIds: ["P-001", "P-002"],
      connectedAgentIds: ["A-001"],
      connectedControlIds: ["C-001"],
    });

    expect(sys.name).toBe("NetSuite");
    expect(sys.id).toBe("sys-ns-001");
    expect(sys.category).toBe("erp");
    expect(sys.soxInScope).toBe(true);
    expect(sys.dataSensitivity).toBe("regulated");
    expect(sys.integrationStatus).toBe("connected");
    expect(sys.ownerPersonId).toBe("P-001");
    expect(sys.connectedHumanIds).toEqual(["P-001", "P-002"]);
    expect(sys.connectedAgentIds).toEqual(["A-001"]);
    expect(sys.connectedControlIds).toEqual(["C-001"]);
  });

  it("auto-generates id from name when id not supplied", () => {
    const sys = createSystem({ name: "Oracle Fusion" });
    expect(sys.id).toBe("sys-oracle-fusion");
  });

  it("defaults name to 'Untitled System' when omitted", () => {
    const sys = createSystem({});
    expect(sys.name).toBe("Untitled System");
    expect(sys.id).toBe("sys-untitled-system");
  });

  it("preserves a custom createdAt", () => {
    const ts = "2026-01-15T10:00:00.000Z";
    const sys = createSystem({ name: "Slack", createdAt: ts });
    expect(sys.createdAt).toBe(ts);
    expect(sys.updatedAt).toBe(ts);
  });
});

// ── deriveSystemsFromCompanyContext ─────────────────────────────────────

describe("deriveSystemsFromCompanyContext", () => {
  it("creates SystemManifest entries from a list of system names", () => {
    const systems = deriveSystemsFromCompanyContext([
      "Salesforce",
      "NetSuite",
      "Slack",
    ]);

    expect(systems).toHaveLength(3);
    expect(systems[0].name).toBe("Salesforce");
    expect(systems[0].id).toBe("sys-salesforce");
    expect(systems[0].category).toBe("other");
    expect(systems[0].soxInScope).toBe(false);
    expect(systems[1].name).toBe("NetSuite");
    expect(systems[2].name).toBe("Slack");
  });

  it("deduplicates by generated id (case-insensitive name collision)", () => {
    const systems = deriveSystemsFromCompanyContext([
      "Salesforce",
      "salesforce",
      "SALESFORCE",
    ]);

    expect(systems).toHaveLength(1);
    expect(systems[0].name).toBe("Salesforce");
  });

  it("skips empty strings", () => {
    const systems = deriveSystemsFromCompanyContext([
      "Salesforce",
      "",
      "  ",
      "NetSuite",
    ]);

    expect(systems).toHaveLength(2);
    expect(systems.map((s) => s.name)).toEqual(["Salesforce", "NetSuite"]);
  });

  it("returns empty array for empty input", () => {
    expect(deriveSystemsFromCompanyContext([])).toEqual([]);
  });
});

// ── filterSystemsBySox ─────────────────────────────────────────────────

describe("filterSystemsBySox", () => {
  const systems = [
    sampleSystem({ name: "ERP", id: "sys-erp", soxInScope: true }),
    sampleSystem({ name: "CRM", id: "sys-crm", soxInScope: false }),
    sampleSystem({ name: "HRIS", id: "sys-hris", soxInScope: true }),
    sampleSystem({ name: "Slack", id: "sys-slack", soxInScope: false }),
  ];

  it("returns only soxInScope systems when soxOnly is true", () => {
    const filtered = filterSystemsBySox(systems, true);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.name)).toEqual(["ERP", "HRIS"]);
  });

  it("returns all systems when soxOnly is false", () => {
    const filtered = filterSystemsBySox(systems, false);
    expect(filtered).toHaveLength(4);
  });

  it("returns empty array when no systems match and soxOnly is true", () => {
    const nonSox = systems.filter((s) => !s.soxInScope);
    expect(filterSystemsBySox(nonSox, true)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterSystemsBySox([], true)).toEqual([]);
    expect(filterSystemsBySox([], false)).toEqual([]);
  });
});

// ── findSystemById ──────────────────────────────────────────────────────

describe("findSystemById", () => {
  const systems = [
    sampleSystem({ name: "ERP", id: "sys-erp" }),
    sampleSystem({ name: "CRM", id: "sys-crm" }),
  ];

  it("finds a system by its id", () => {
    const found = findSystemById(systems, "sys-crm");
    expect(found).toBeDefined();
    expect(found!.name).toBe("CRM");
  });

  it("returns undefined for unknown id", () => {
    expect(findSystemById(systems, "sys-unknown")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(findSystemById([], "sys-erp")).toBeUndefined();
  });
});

// ── validateSystem ──────────────────────────────────────────────────────

describe("validateSystem", () => {
  it("passes a fully valid system with no warnings", () => {
    const sys = createSystem({
      name: "Salesforce",
      category: "crm",
      soxInScope: false,
    });
    const { failures, warnings } = validateSystem(sys);
    expect(failures).toEqual([]);
    // With soxInScope false and createdAt set, no warnings fire
    expect(warnings).toEqual([]);
  });

  it("reports missing name as a failure", () => {
    const sys = createSystem({ name: "" });
    const { failures } = validateSystem(sys);
    expect(failures).toContain("System name is required");
  });

  it("reports invalid category as a failure", () => {
    const sys = createSystem({
      name: "Badger",
      category: "badger" as SystemManifest["category"],
    });
    const { failures } = validateSystem(sys);
    expect(failures.some((f) => f.includes("Invalid category"))).toBe(true);
  });

  it("reports invalid dataSensitivity as a failure", () => {
    const sys = createSystem({
      name: "Test",
      dataSensitivity: "top_secret" as SystemManifest["dataSensitivity"],
    });
    const { failures } = validateSystem(sys);
    expect(failures.some((f) => f.includes("Invalid dataSensitivity"))).toBe(
      true,
    );
  });

  it("reports invalid integrationStatus as a failure", () => {
    const sys = createSystem({
      name: "Test",
      integrationStatus: "unknown" as SystemManifest["integrationStatus"],
    });
    const { failures } = validateSystem(sys);
    expect(failures.some((f) => f.includes("Invalid integrationStatus"))).toBe(
      true,
    );
  });

  it("reports missing id as a failure", () => {
    const sys = createSystem({ name: "Test", id: "" });
    const { failures } = validateSystem(sys);
    expect(failures).toContain("System id is required");
  });

  it("warns when a SOX-in-scope system has no owner", () => {
    const sys = createSystem({
      name: "SAP",
      soxInScope: true,
      ownerPersonId: undefined,
    });
    const { failures, warnings } = validateSystem(sys);
    expect(failures).toEqual([]);
    expect(warnings).toContain(
      "SOX-in-scope system has no assigned owner; consider assigning an ownerPersonId",
    );
  });

  it("warns when a SOX-in-scope system has no connected controls", () => {
    const sys = createSystem({
      name: "SAP",
      soxInScope: true,
      ownerPersonId: "P-001",
      connectedControlIds: [],
    });
    const { warnings } = validateSystem(sys);
    expect(warnings.some((w) => w.includes("no connected controls"))).toBe(
      true,
    );
  });

  it("does not warn about missing controls for non-SOX systems", () => {
    const sys = createSystem({
      name: "Slack",
      soxInScope: false,
      connectedControlIds: [],
    });
    const { warnings } = validateSystem(sys);
    expect(warnings.some((w) => w.includes("no connected controls"))).toBe(
      false,
    );
  });

  it("accumulates multiple failures at once", () => {
    const sys = createSystem({ name: "" });
    // Clear id too — since name is empty, the generated id is 'sys-untitled-system'
    // which isn't empty, so also set id empty
    const bad = { ...sys, id: "" };
    const { failures } = validateSystem(bad);
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Derived counts ──────────────────────────────────────────────────────

describe("deriveConnectedHumanCount", () => {
  it("returns the length of connectedHumanIds", () => {
    const sys = sampleSystem({ connectedHumanIds: ["P-001", "P-002", "P-003"] });
    expect(deriveConnectedHumanCount(sys)).toBe(3);
  });

  it("returns 0 when no humans are connected", () => {
    const sys = sampleSystem({ connectedHumanIds: [] });
    expect(deriveConnectedHumanCount(sys)).toBe(0);
  });
});

describe("deriveConnectedAgentCount", () => {
  it("returns the length of connectedAgentIds", () => {
    const sys = sampleSystem({ connectedAgentIds: ["A-001", "A-002"] });
    expect(deriveConnectedAgentCount(sys)).toBe(2);
  });

  it("returns 0 when no agents are connected", () => {
    const sys = sampleSystem({ connectedAgentIds: [] });
    expect(deriveConnectedAgentCount(sys)).toBe(0);
  });
});

describe("deriveConnectedControlCount", () => {
  it("returns the length of connectedControlIds", () => {
    const sys = sampleSystem({ connectedControlIds: ["C-001", "C-002", "C-003", "C-004"] });
    expect(deriveConnectedControlCount(sys)).toBe(4);
  });

  it("returns 0 when no controls are connected", () => {
    const sys = sampleSystem({ connectedControlIds: [] });
    expect(deriveConnectedControlCount(sys)).toBe(0);
  });
});
