import { describe, expect, it } from "vitest";
import type {
  AgentRecord,
  AgentRegistryEntry,
  ControlManifest,
  ExternalAgentRecord,
  PedigreeRow,
  PedigreeState,
  Person,
  RiskFinding,
  SystemManifest,
  TaskItem,
} from "../src/types";
import {
  filterAgents,
  flattenAgents,
  sortAgents,
  type FlattenedAgentEntry,
  type FlattenParams,
} from "../src/lib/agentInventory";

// ── Shared test fixtures ───────────────────────────────────────────────────

const alice: Person = {
  id: "p-alice",
  name: "Alice Chen",
  email: "alice@example.com",
  title: "VP Engineering",
  managerId: null,
  department: "Engineering",
  tools: ["GitHub", "Jira"],
};

const bob: Person = {
  id: "p-bob",
  name: "Bob Martinez",
  email: "bob@example.com",
  title: "Engineering Manager",
  managerId: "p-alice",
  department: "Engineering",
  tools: ["GitHub"],
};

const carol: Person = {
  id: "p-carol",
  name: "Carol Smith",
  email: "carol@example.com",
  title: "VP Finance",
  managerId: null,
  department: "Finance",
  tools: ["SAP", "NetSuite"],
};

const people: Person[] = [alice, bob, carol];

const aliceTask1: TaskItem = {
  id: "t-a1",
  label: "Review code merges",
  respId: "r-a1",
  respTitle: "Code governance",
  soxRelevant: false,
};

const aliceTask2: TaskItem = {
  id: "t-a2",
  label: "Approve quarterly access audit",
  respId: "r-a2",
  respTitle: "Access control",
  soxRelevant: true,
};

const bobTask: TaskItem = {
  id: "t-b1",
  label: "Manage CI/CD pipelines",
  respId: "r-b1",
  respTitle: "DevOps",
  soxRelevant: false,
};

const carolTask: TaskItem = {
  id: "t-c1",
  label: "Close monthly books",
  respId: "r-c1",
  respTitle: "Financial close",
  soxRelevant: true,
};

const agentAlice1: AgentRecord = {
  id: "a-alice-1",
  name: "Code Review Agent",
  taskId: "t-a1",
  respId: "r-a1",
  respTitle: "Code governance",
  policy: "read-only",
  riskLevel: "low",
  person: alice,
  task: aliceTask1,
  createdAt: "2025-01-10T00:00:00Z",
};

const agentAlice2: AgentRecord = {
  id: "a-alice-2",
  name: "Access Audit Agent",
  taskId: "t-a2",
  respId: "r-a2",
  respTitle: "Access control",
  policy: "draft-then-approve",
  riskLevel: "high",
  person: alice,
  task: aliceTask2,
  createdAt: "2025-02-15T00:00:00Z",
};

const agentBob: AgentRecord = {
  id: "a-bob-1",
  name: "CI/CD Pipeline Agent",
  taskId: "t-b1",
  respId: "r-b1",
  respTitle: "DevOps",
  policy: "write-with-approval",
  riskLevel: "medium",
  person: bob,
  task: bobTask,
  createdAt: "2025-03-01T00:00:00Z",
};

const agentCarol: AgentRecord = {
  id: "a-carol-1",
  name: "Financial Close Agent",
  taskId: "t-c1",
  respId: "r-c1",
  respTitle: "Financial close",
  policy: "write-with-approval",
  riskLevel: "critical",
  person: carol,
  task: carolTask,
  createdAt: "2025-04-10T00:00:00Z",
};

const pedigree: PedigreeState = {
  "p-alice": {
    status: "ready",
    responsibilities: [],
    tasks: { delegatable: [], approval: [], not_delegatable: [] },
    agents: [agentAlice1, agentAlice2],
  },
  "p-bob": {
    status: "ready",
    responsibilities: [],
    tasks: { delegatable: [], approval: [], not_delegatable: [] },
    agents: [agentBob],
  },
  "p-carol": {
    status: "ready",
    responsibilities: [],
    tasks: { delegatable: [], approval: [], not_delegatable: [] },
    agents: [agentCarol],
  },
};

// ── flatParams helper ──────────────────────────────────────────────────────

function defaultParams(overrides?: Partial<FlattenParams>): FlattenParams {
  return {
    people,
    pedigree,
    registry: [],
    ...overrides,
  };
}

// ── flattenAgents ──────────────────────────────────────────────────────────

describe("flattenAgents", () => {
  it("flattens all pedigree agents into the unified list", () => {
    const result = flattenAgents(defaultParams());
    expect(result).toHaveLength(4);
    expect(result.map((a) => a.id).sort()).toEqual([
      "a-alice-1",
      "a-alice-2",
      "a-bob-1",
      "a-carol-1",
    ]);
  });

  it("marks generated agents with source='generated'", () => {
    const result = flattenAgents(defaultParams());
    for (const a of result) {
      expect(a.source).toBe("generated");
    }
  });

  it("includes external agents alongside pedigree agents", () => {
    const external: ExternalAgentRecord[] = [
      {
        id: "ext-salesforce-bot",
        name: "Salesforce Sync Bot",
        source: "vendor_bot",
        ownerPersonId: "p-alice",
        systems: ["Salesforce"],
        tools: [],
        riskTier: "low",
        soxRelevant: false,
        status: "approved",
        classificationFlags: [],
        matchedPolicyIds: [],
        evidenceIds: [],
        createdAt: "2025-05-01T00:00:00Z",
        updatedAt: "2025-05-01T00:00:00Z",
      },
    ];

    const result = flattenAgents(defaultParams({ externalAgents: external }));
    expect(result).toHaveLength(5);
    const ext = result.find((a) => a.id === "ext-salesforce-bot");
    expect(ext).toBeDefined();
    expect(ext!.source).toBe("imported");
    expect(ext!.person.id).toBe("p-alice");
    expect(ext!.systemNames).toEqual(["Salesforce"]);
  });

  it("cross-references registry status", () => {
    const registry: AgentRegistryEntry[] = [
      {
        agent_id: "a-alice-1",
        owner_person_id: "p-alice",
        task_id: "t-a1",
        resp_id: "r-a1",
        runtime: "openai",
        status: "deployed",
        stale: false,
        ingredient_hashes: {},
        versions: [],
      },
    ];

    const result = flattenAgents(defaultParams({ registry }));
    const alice1 = result.find((a) => a.id === "a-alice-1")!;
    expect(alice1.registryStatus).toBe("deployed");
    expect(alice1.stale).toBe(false);
  });

  it("populates system names from systems manifest", () => {
    const systems: SystemManifest[] = [
      {
        id: "sys-github",
        name: "GitHub",
        category: "collaboration",
        soxInScope: false,
        dataSensitivity: "internal",
        integrationStatus: "connected",
        connectedHumanIds: ["p-alice", "p-bob"],
        connectedAgentIds: ["a-alice-1", "a-bob-1"],
        connectedControlIds: [],
        riskFindings: [],
        approvalRequirements: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    const result = flattenAgents(defaultParams({ systems }));
    const alice1 = result.find((a) => a.id === "a-alice-1")!;
    expect(alice1.systemNames).toContain("GitHub");

    const alice2 = result.find((a) => a.id === "a-alice-2")!;
    expect(alice2.systemNames).toEqual([]);
  });

  it("populates control ids from controls and risk findings", () => {
    const controls: ControlManifest[] = [
      {
        id: "ctrl-code-review",
        controlId: "CRC-001",
        name: "Code Review Policy",
        ownerPersonId: "p-alice",
        process: "Code review",
        relatedRisk: "Unauthorized changes",
        frequency: "daily",
        systemIds: ["sys-github"],
        evidenceRequired: [],
        soxRelevant: false,
        relatedTaskIds: ["t-a1"],
        relatedAgentIds: ["a-alice-1"],
        approvalRequirements: [],
        status: "active",
        source: "manual",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    const result = flattenAgents(defaultParams({ controls }));
    const alice1 = result.find((a) => a.id === "a-alice-1")!;
    expect(alice1.controlIds).toContain("ctrl-code-review");

    const alice2 = result.find((a) => a.id === "a-alice-2")!;
    expect(alice2.controlIds).toEqual([]);
  });

  it("enriches with risk findings referencing the agent", () => {
    const riskFindings: RiskFinding[] = [
      {
        id: "rf-001",
        severity: "high",
        category: "authority_exceeded",
        title: "Code review agent has write access",
        plainEnglishDescription: "Agent can merge without approval",
        whyItMatters: "Unauthorized code changes",
        recommendedAction: "Restrict to read-only",
        relatedAgentIds: ["a-alice-1"],
        relatedPersonIds: ["p-alice"],
        relatedSystemIds: ["sys-github"],
        relatedControlIds: ["ctrl-code-review"],
        status: "open",
        evidenceIds: [],
        createdAt: "2025-01-15T00:00:00Z",
      },
    ];

    const result = flattenAgents(defaultParams({ riskFindings }));
    const alice1 = result.find((a) => a.id === "a-alice-1")!;
    expect(alice1.riskFindings).toHaveLength(1);
    expect(alice1.riskFindings![0].id).toBe("rf-001");

    const alice2 = result.find((a) => a.id === "a-alice-2")!;
    expect(alice2.riskFindings).toHaveLength(0);
  });

  it("detects orphaned agents from registry (owner_offboarded)", () => {
    const registry: AgentRegistryEntry[] = [
      {
        agent_id: "a-alice-2",
        owner_person_id: "p-alice",
        task_id: "t-a2",
        resp_id: "r-a2",
        runtime: "openai",
        status: "suspended",
        stale: true,
        stale_reason: "owner_offboarded",
        ingredient_hashes: {},
        versions: [],
      },
    ];

    const result = flattenAgents(defaultParams({ registry }));
    const a2 = result.find((a) => a.id === "a-alice-2")!;
    expect(a2.orphaned).toBe(true);
    expect(a2.stale).toBe(true);
  });

  it("detects orphaned external agents (missing owner)", () => {
    const external: ExternalAgentRecord[] = [
      {
        id: "ext-orphan",
        name: "Orphan Bot",
        source: "legacy_automation",
        systems: ["Legacy"],
        tools: [],
        riskTier: "medium",
        soxRelevant: false,
        status: "imported_pending_review",
        classificationFlags: [],
        matchedPolicyIds: [],
        evidenceIds: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    const result = flattenAgents(defaultParams({ externalAgents: external }));
    const orphan = result.find((a) => a.id === "ext-orphan")!;
    expect(orphan.orphaned).toBe(true);
    expect(orphan.source).toBe("imported");
  });
});

// ── filterAgents ───────────────────────────────────────────────────────────

describe("filterAgents", () => {
  const allAgents = flattenAgents(defaultParams());

  it("returns all agents when no filters are applied", () => {
    expect(filterAgents(allAgents, {})).toHaveLength(4);
  });

  it("filters by ownerId", () => {
    const result = filterAgents(allAgents, { ownerId: "p-alice" });
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.person.id === "p-alice")).toBe(true);
  });

  it("filters by department", () => {
    const result = filterAgents(allAgents, { department: "Engineering" });
    expect(result).toHaveLength(3);
    expect(result.every((a) => a.person.department === "Engineering")).toBe(true);
  });

  it("filters by systemName (cross-referenced)", () => {
    // Attach a system to a-alice-1 so the filter has something to match
    const systems: SystemManifest[] = [
      {
        id: "sys-github",
        name: "GitHub",
        category: "collaboration",
        soxInScope: false,
        dataSensitivity: "internal",
        integrationStatus: "connected",
        connectedHumanIds: [],
        connectedAgentIds: ["a-alice-1"],
        connectedControlIds: [],
        riskFindings: [],
        approvalRequirements: [],
        createdAt: "",
        updatedAt: "",
      },
    ];
    const agents = flattenAgents(defaultParams({ systems }));
    const result = filterAgents(agents, { systemName: "GitHub" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-alice-1");
  });

  it("filters by systemName with case-insensitive matching", () => {
    const systems: SystemManifest[] = [
      {
        id: "sys-github",
        name: "GitHub",
        category: "collaboration",
        soxInScope: false,
        dataSensitivity: "internal",
        integrationStatus: "connected",
        connectedHumanIds: [],
        connectedAgentIds: ["a-alice-1"],
        connectedControlIds: [],
        riskFindings: [],
        approvalRequirements: [],
        createdAt: "",
        updatedAt: "",
      },
    ];
    const agents = flattenAgents(defaultParams({ systems }));
    const result = filterAgents(agents, { systemName: "github" });
    expect(result).toHaveLength(1);
  });

  it("filters by soxOnly", () => {
    const result = filterAgents(allAgents, { soxOnly: true });
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.task.soxRelevant === true)).toBe(true);
    expect(result.map((a) => a.id).sort()).toEqual(["a-alice-2", "a-carol-1"]);
  });

  it("filters by riskLevel", () => {
    const result = filterAgents(allAgents, { riskLevel: "high" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-alice-2");
  });

  it("filters by orphanedOnly", () => {
    const registry: AgentRegistryEntry[] = [
      {
        agent_id: "a-alice-2",
        owner_person_id: "p-alice",
        task_id: "t-a2",
        resp_id: "r-a2",
        runtime: "openai",
        status: "suspended",
        stale: true,
        stale_reason: "owner_offboarded",
        ingredient_hashes: {},
        versions: [],
      },
    ];
    const agents = flattenAgents(defaultParams({ registry }));
    const result = filterAgents(agents, { orphanedOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-alice-2");
  });

  it("filters by staleOnly", () => {
    const registry: AgentRegistryEntry[] = [
      {
        agent_id: "a-alice-1",
        owner_person_id: "p-alice",
        task_id: "t-a1",
        resp_id: "r-a1",
        runtime: "openai",
        status: "deployed",
        stale: true,
        stale_reason: "owner_role_changed",
        ingredient_hashes: {},
        versions: [],
      },
    ];
    const agents = flattenAgents(defaultParams({ registry }));
    const result = filterAgents(agents, { staleOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-alice-1");
  });

  it("filters by search (matches agent name, person name, email, task label)", () => {
    const result = filterAgents(allAgents, { search: "alice" });
    // Matches "Alice Chen" (person name) and "Access Audit Agent" (no),
    // but actually "Alice" is in person.name for a-alice-1 and a-alice-2
    expect(result).toHaveLength(2);
  });

  it("filters by search matching task label", () => {
    const result = filterAgents(allAgents, { search: "books" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-carol-1");
  });

  it("returns empty array when no agents match", () => {
    const result = filterAgents(allAgents, { search: "zzz_nonexistent" });
    expect(result).toHaveLength(0);
  });

  it("combines multiple filter criteria", () => {
    // Alice's agents in Engineering, only SOX-relevant
    const result = filterAgents(allAgents, {
      ownerId: "p-alice",
      department: "Engineering",
      soxOnly: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-alice-2");
  });
});

// ── sortAgents ─────────────────────────────────────────────────────────────

describe("sortAgents", () => {
  const allAgents = flattenAgents(defaultParams());

  it("sorts by name ascending (default)", () => {
    const sorted = sortAgents(allAgents, "name", true);
    const names = sorted.map((a) => a.name);
    expect(names).toEqual([
      "Access Audit Agent",
      "CI/CD Pipeline Agent",
      "Code Review Agent",
      "Financial Close Agent",
    ]);
  });

  it("sorts by name descending", () => {
    const sorted = sortAgents(allAgents, "name", false);
    const names = sorted.map((a) => a.name);
    expect(names).toEqual([
      "Financial Close Agent",
      "Code Review Agent",
      "CI/CD Pipeline Agent",
      "Access Audit Agent",
    ]);
  });

  it("sorts by personName", () => {
    const sorted = sortAgents(allAgents, "personName", true);
    expect(sorted[0].person.name).toBe("Alice Chen");
    expect(sorted[3].person.name).toBe("Carol Smith");
  });

  it("sorts by department", () => {
    const sorted = sortAgents(allAgents, "department", true);
    expect(sorted[0].person.department).toBe("Engineering");
    expect(sorted[3].person.department).toBe("Finance");
  });

  it("sorts by riskLevel ascending (low → critical)", () => {
    const sorted = sortAgents(allAgents, "riskLevel", true);
    expect(sorted[0].riskLevel).toBe("low");
    expect(sorted[1].riskLevel).toBe("medium");
    expect(sorted[2].riskLevel).toBe("high");
    expect(sorted[3].riskLevel).toBe("critical");
  });

  it("sorts by riskLevel descending (critical → low)", () => {
    const sorted = sortAgents(allAgents, "riskLevel", false);
    expect(sorted[0].riskLevel).toBe("critical");
    expect(sorted[3].riskLevel).toBe("low");
  });

  it("sorts by createdAt ascending", () => {
    const sorted = sortAgents(allAgents, "createdAt", true);
    expect(sorted[0].id).toBe("a-alice-1"); // 2025-01-10
    expect(sorted[3].id).toBe("a-carol-1"); // 2025-04-10
  });

  it("sorts by createdAt descending", () => {
    const sorted = sortAgents(allAgents, "createdAt", false);
    expect(sorted[0].id).toBe("a-carol-1");
    expect(sorted[3].id).toBe("a-alice-1");
  });

  it("falls back to name for unknown sort field", () => {
    const sorted = sortAgents(allAgents, "unknown_field", true);
    // Falls back to name ascending
    expect(sorted[0].name).toBe("Access Audit Agent");
  });
});

// ── Integration: pedigree + external + registry + controls + systems ──────

describe("flattenAgents integration", () => {
  it("unifies generated and imported agents with full cross-references", () => {
    const systems: SystemManifest[] = [
      {
        id: "sys-sap",
        name: "SAP",
        category: "erp",
        soxInScope: true,
        dataSensitivity: "regulated",
        integrationStatus: "connected",
        connectedHumanIds: ["p-carol"],
        connectedAgentIds: ["a-carol-1"],
        connectedControlIds: [],
        riskFindings: [],
        approvalRequirements: [],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const controls: ControlManifest[] = [
      {
        id: "ctrl-finclose",
        controlId: "FC-001",
        name: "Financial Close Control",
        ownerPersonId: "p-carol",
        process: "Month-end close",
        relatedRisk: "Misstated financials",
        frequency: "monthly",
        systemIds: ["sys-sap"],
        evidenceRequired: [],
        soxRelevant: true,
        relatedTaskIds: ["t-c1"],
        relatedAgentIds: ["a-carol-1"],
        approvalRequirements: [],
        status: "active",
        source: "manual",
        createdAt: "",
        updatedAt: "",
      },
    ];

    const registry: AgentRegistryEntry[] = [
      {
        agent_id: "a-carol-1",
        owner_person_id: "p-carol",
        task_id: "t-c1",
        resp_id: "r-c1",
        runtime: "openai",
        status: "deployed",
        stale: false,
        ingredient_hashes: {},
        versions: [],
      },
    ];

    const external: ExternalAgentRecord[] = [
      {
        id: "ext-netsuite-bridge",
        name: "NetSuite Bridge",
        source: "vendor_bot",
        ownerPersonId: "p-carol",
        systems: ["NetSuite"],
        tools: [],
        riskTier: "medium",
        soxRelevant: true,
        status: "approved",
        classificationFlags: [],
        matchedPolicyIds: [],
        evidenceIds: [],
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      },
    ];

    const riskFindings: RiskFinding[] = [
      {
        id: "rf-sap-access",
        severity: "critical",
        category: "sox_system_access",
        title: "Financial Close Agent has admin SAP access",
        plainEnglishDescription: "Agent has unrestricted access",
        whyItMatters: "SOX compliance risk",
        recommendedAction: "Restrict access",
        relatedAgentIds: ["a-carol-1"],
        relatedPersonIds: ["p-carol"],
        relatedSystemIds: ["sys-sap"],
        relatedControlIds: ["ctrl-finclose"],
        status: "open",
        evidenceIds: [],
        createdAt: "2025-06-15T00:00:00Z",
      },
    ];

    const result = flattenAgents({
      people,
      pedigree,
      registry,
      systems,
      controls,
      riskFindings,
      externalAgents: external,
    });

    // 4 pedigree + 1 external = 5
    expect(result).toHaveLength(5);

    // --- Carol's generated agent ---
    const carolGen = result.find((a) => a.id === "a-carol-1")!;
    expect(carolGen.source).toBe("generated");
    expect(carolGen.systemNames).toEqual(["SAP"]);
    expect(carolGen.controlIds).toContain("ctrl-finclose");
    expect(carolGen.registryStatus).toBe("deployed");
    expect(carolGen.stale).toBe(false);
    expect(carolGen.orphaned).toBeUndefined();
    expect(carolGen.riskFindings).toHaveLength(1);
    expect(carolGen.riskFindings![0].id).toBe("rf-sap-access");

    // --- Carol's external agent ---
    const carolExt = result.find((a) => a.id === "ext-netsuite-bridge")!;
    expect(carolExt.source).toBe("imported");
    expect(carolExt.systemNames).toEqual(["NetSuite"]);
    expect(carolExt.riskLevel).toBe("medium");
    expect(carolExt.orphaned).toBe(false);

    // --- Alice's SOX-relevant agent ---
    const aliceSox = result.find((a) => a.id === "a-alice-2")!;
    expect(aliceSox.riskLevel).toBe("high");
    expect(aliceSox.task.soxRelevant).toBe(true);
  });
});
