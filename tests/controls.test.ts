import { describe, expect, it } from "vitest";
import type { ControlManifest, ApprovalRequirement } from "../src/types";
import {
  deriveAgentIdsForControl,
  deriveTaskIdsForControl,
  deriveSystemIdsForControl,
  filterControlsBySox,
  filterControlsBySystem,
  filterControlsByOwner,
  filterControlsByProcess,
  newControlId,
  createControl,
  validateControl,
} from "../src/lib/controls";

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseControl: ControlManifest = {
  id: "ctrl-001",
  controlId: "ctrl-001",
  name: "Segregation of duties review",
  ownerPersonId: "p1",
  process: "month-end close",
  relatedRisk: "Unauthorized financial transactions",
  frequency: "monthly",
  systemIds: ["sys-erp"],
  evidenceRequired: ["access audit log"],
  soxRelevant: true,
  socRelevant: false,
  relatedTaskIds: ["t1"],
  relatedAgentIds: ["a1"],
  approvalRequirements: [],
  status: "draft",
  source: "manual",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const controls: ControlManifest[] = [
  baseControl,
  {
    ...baseControl,
    id: "ctrl-002",
    controlId: "ctrl-002",
    name: "Access recertification",
    ownerPersonId: "p2",
    process: "user access review",
    systemIds: ["sys-erp", "sys-hris"],
    soxRelevant: true,
    relatedAgentIds: ["a2"],
    relatedTaskIds: ["t2"],
  },
  {
    ...baseControl,
    id: "ctrl-003",
    controlId: "ctrl-003",
    name: "Vendor invoice approval",
    ownerPersonId: "p1",
    process: "vendor payment",
    systemIds: ["sys-ap"],
    soxRelevant: false,
    relatedAgentIds: [],
    relatedTaskIds: [],
  },
];

// ── Derivation functions ─────────────────────────────────────────────────

describe("deriveAgentIdsForControl", () => {
  it("returns the relatedAgentIds array", () => {
    expect(deriveAgentIdsForControl(baseControl)).toEqual(["a1"]);
  });

  it("returns empty array when no agents are linked", () => {
    const noAgents: ControlManifest = {
      ...baseControl,
      relatedAgentIds: [],
    };
    expect(deriveAgentIdsForControl(noAgents)).toEqual([]);
  });
});

describe("deriveTaskIdsForControl", () => {
  it("returns the relatedTaskIds array", () => {
    expect(deriveTaskIdsForControl(baseControl)).toEqual(["t1"]);
  });

  it("returns empty array when no tasks are linked", () => {
    const noTasks: ControlManifest = {
      ...baseControl,
      relatedTaskIds: [],
    };
    expect(deriveTaskIdsForControl(noTasks)).toEqual([]);
  });
});

describe("deriveSystemIdsForControl", () => {
  it("returns the systemIds array", () => {
    expect(deriveSystemIdsForControl(baseControl)).toEqual(["sys-erp"]);
  });

  it("returns all system IDs for multi-system controls", () => {
    const multiSys = controls[1];
    expect(deriveSystemIdsForControl(multiSys)).toEqual([
      "sys-erp",
      "sys-hris",
    ]);
  });
});

// ── Filter functions ────────────────────────────────────────────────────

describe("filterControlsBySox", () => {
  it("returns all controls when soxOnly is false", () => {
    expect(filterControlsBySox(controls, false)).toHaveLength(3);
  });

  it("filters to only SOX-relevant controls", () => {
    const result = filterControlsBySox(controls, true);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.soxRelevant)).toBe(true);
  });

  it("returns empty array when no controls match", () => {
    const nonSox = controls.filter((c) => !c.soxRelevant);
    expect(filterControlsBySox(nonSox, true)).toHaveLength(0);
  });
});

describe("filterControlsBySystem", () => {
  it("filters controls by system ID", () => {
    const result = filterControlsBySystem(controls, "sys-erp");
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.systemIds.includes("sys-erp"))).toBe(true);
  });

  it("returns empty array when no controls match", () => {
    expect(filterControlsBySystem(controls, "sys-nonexistent")).toHaveLength(0);
  });
});

describe("filterControlsByOwner", () => {
  it("filters controls by owner person ID", () => {
    const result = filterControlsByOwner(controls, "p1");
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.ownerPersonId === "p1")).toBe(true);
  });

  it("returns empty array for unknown owner", () => {
    expect(filterControlsByOwner(controls, "p-unknown")).toHaveLength(0);
  });
});

describe("filterControlsByProcess", () => {
  it("filters controls case-insensitively by process", () => {
    const result = filterControlsByProcess(controls, "MONTH-END");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ctrl-001");
  });

  it("matches partial process strings", () => {
    const result = filterControlsByProcess(controls, "access");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ctrl-002");
  });

  it("returns empty array when no process matches", () => {
    expect(filterControlsByProcess(controls, "procurement")).toHaveLength(0);
  });
});

// ── Factory functions ───────────────────────────────────────────────────

describe("newControlId", () => {
  it("generates an id starting with ctrl-", () => {
    expect(newControlId()).toMatch(/^ctrl-/);
  });

  it("generates unique ids on successive calls", () => {
    const id1 = newControlId();
    const id2 = newControlId();
    expect(id1).not.toBe(id2);
  });
});

describe("createControl", () => {
  it("creates a control with defaults from an empty partial", () => {
    const c = createControl({});
    expect(c.name).toBe("");
    expect(c.status).toBe("draft");
    expect(c.source).toBe("manual");
    expect(c.frequency).toBe("monthly");
    expect(c.soxRelevant).toBe(false);
    expect(c.systemIds).toEqual([]);
    expect(c.relatedAgentIds).toEqual([]);
    expect(c.relatedTaskIds).toEqual([]);
    expect(c.approvalRequirements).toEqual([]);
    expect(c.id).toMatch(/^ctrl-/);
    expect(c.controlId).toBe(c.id);
    expect(c.createdAt).toBeTruthy();
    expect(c.updatedAt).toBeTruthy();
    expect(c.createdAt).toBe(c.updatedAt);
  });

  it("fills in provided partial fields", () => {
    const c = createControl({
      name: "Test control",
      ownerPersonId: "p99",
      systemIds: ["sys-1"],
      soxRelevant: true,
      frequency: "daily",
    });
    expect(c.name).toBe("Test control");
    expect(c.ownerPersonId).toBe("p99");
    expect(c.systemIds).toEqual(["sys-1"]);
    expect(c.soxRelevant).toBe(true);
    expect(c.frequency).toBe("daily");
  });

  it("preserves a provided id", () => {
    const c = createControl({ id: "ctrl-custom" });
    expect(c.id).toBe("ctrl-custom");
    expect(c.controlId).toBe("ctrl-custom");
  });

  it("preserves provided createdAt and updatedAt", () => {
    const c = createControl({
      createdAt: "2024-06-01T00:00:00.000Z",
      updatedAt: "2024-06-15T00:00:00.000Z",
    });
    expect(c.createdAt).toBe("2024-06-01T00:00:00.000Z");
    expect(c.updatedAt).toBe("2024-06-15T00:00:00.000Z");
  });
});

// ── Validation ──────────────────────────────────────────────────────────

describe("validateControl", () => {
  it("passes a well-formed control", () => {
    const result = validateControl(baseControl);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when name is empty", () => {
    const result = validateControl({ ...baseControl, name: "" });
    expect(result.failures).toContain("name is required and must be non-empty");
  });

  it("fails when name is only whitespace", () => {
    const result = validateControl({ ...baseControl, name: "   " });
    expect(result.failures).toContain("name is required and must be non-empty");
  });

  it("fails when ownerPersonId is missing", () => {
    const result = validateControl({ ...baseControl, ownerPersonId: "" });
    expect(result.failures).toContain("ownerPersonId is required");
  });

  it("fails when no system IDs are present", () => {
    const result = validateControl({ ...baseControl, systemIds: [] });
    expect(result.failures).toContain("at least one systemId is required");
  });

  it("fails when soxRelevant is not a boolean", () => {
    const result = validateControl({
      ...baseControl,
      soxRelevant: undefined as unknown as boolean,
    });
    expect(result.failures).toContain(
      "soxRelevant must be set to true or false",
    );
  });

  it("returns warnings for missing optional fields", () => {
    const result = validateControl({
      ...baseControl,
      description: "",
      process: "",
      frequency: "" as ControlManifest["frequency"],
    });
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings).toContain(
      "description is missing — consider adding one",
    );
    expect(result.warnings).toContain(
      "process is missing — consider adding one",
    );
  });

  it("reports multiple failures simultaneously", () => {
    const bad = { ...baseControl, name: "", ownerPersonId: "", systemIds: [] };
    const result = validateControl(bad);
    expect(result.failures).toHaveLength(3);
    expect(result.failures).toContain("name is required and must be non-empty");
    expect(result.failures).toContain("ownerPersonId is required");
    expect(result.failures).toContain("at least one systemId is required");
  });
});
