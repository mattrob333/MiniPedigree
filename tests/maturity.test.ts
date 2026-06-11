import { describe, it, expect } from "vitest";
import {
  canDefaultToOrgMap,
  defaultSurface,
  deriveStage,
  nextAction,
  setupChecklist,
  stageMetrics,
  summaryNextAction,
  type MaturityInput,
} from "../src/lib/maturity";
import { computeReadiness } from "../src/lib/readiness";
import { initialPedigreeState } from "../src/lib/state";
import type { CompanyContext, PedigreeState, Person } from "../src/types";

const people: Person[] = [
  { id: "P-001", name: "Ada CEO", email: "ada@x.co", title: "CEO", department: "Leadership", managerId: null, tools: ["Slack"] },
  { id: "P-002", name: "Sam Sales", email: "sam@x.co", title: "Head of Sales", department: "Sales", managerId: "P-001", tools: ["Salesforce"] },
  { id: "P-003", name: "Fin Fox", email: "fin@x.co", title: "Controller", department: "Finance", managerId: "P-001", tools: ["NetSuite"] },
  { id: "P-004", name: "Rep One", email: "rep1@x.co", title: "AE", department: "Sales", managerId: "P-002", tools: ["Salesforce"] },
];

const richContext: CompanyContext = {
  company: "Acme",
  whatWeDo: "Acme sells managed billing infrastructure to mid-market healthcare groups across the US, replacing in-house claims teams.",
  businessModel: "SaaS subscription",
  strategicGoals: "1. Reach $10M ARR\n2. Cut denial rate to 4%\n3. Launch partner channel",
  bottlenecks: "Manual claims rework eats two analyst days per week; onboarding takes 6 weeks.",
  systems: ["Salesforce", "NetSuite", "Slack"],
  approvalRules: ["Refunds above $500 require Finance sign-off."],
  terminology: "scrub pass, clean claim, 837 file, payer matrix, denial queue",
  kpis: [
    { department: "Sales", metric: "Pipeline coverage" },
    { department: "Finance", metric: "Denial rate" },
    { department: "Leadership", metric: "ARR" },
  ],
  contextDocuments: [{ id: "d1", bucket: "policy", fileName: "p.md", text: "Refunds above $500 require Finance sign-off.", uploadedAt: "2026-01-01" }],
};

function input(overrides: Partial<MaturityInput> = {}): MaturityInput {
  const ctx = overrides.readiness ? undefined : richContext;
  return {
    people,
    pedigree: initialPedigreeState(people),
    readiness: computeReadiness(ctx, ctx?.contextDocuments ?? [], people),
    rosterValidatedAt: "2026-06-01",
    discoveryPlan: null,
    reviewQueueCount: 0,
    questionBacklog: [],
    registry: [],
    agentsBuilt: 0,
    ...overrides,
  };
}

function mappedPedigree(ids: string[]): PedigreeState {
  const ped = initialPedigreeState(people);
  for (const id of ids) {
    ped[id] = {
      ...ped[id],
      status: "ready",
      responsibilities: [{ id: `R-${id}`, title: "Work" }],
      tasks: { delegatable: [{ id: `T-${id}`, label: "Summarize weekly status", respId: `R-${id}`, respTitle: "Work" }], approval: [], not_delegatable: [] },
    };
  }
  return ped;
}

describe("deriveStage ladder", () => {
  it("walks no_roster → validate → context → sessions", () => {
    expect(deriveStage(input({ people: [] }))).toBe("no_roster");
    expect(deriveStage(input({ rosterValidatedAt: undefined }))).toBe("validate_roster");
    const lowReadiness = computeReadiness(undefined, [], people);
    expect(deriveStage(input({ readiness: lowReadiness }))).toBe("add_context");
    expect(deriveStage(input())).toBe("run_sessions");
  });

  it("moves to review when coverage passes half and the queue has items", () => {
    const s = input({ pedigree: mappedPedigree(["P-001", "P-002", "P-003"]), reviewQueueCount: 6 });
    expect(deriveStage(s)).toBe("review_findings");
  });

  it("moves to plan_agents once the queue clears and delegatable tasks exist", () => {
    const s = input({ pedigree: mappedPedigree(["P-001", "P-002", "P-003"]), reviewQueueCount: 0 });
    expect(deriveStage(s)).toBe("plan_agents");
  });

  it("export when agents exist unapproved; operate once approved", () => {
    const base = { pedigree: mappedPedigree(["P-001", "P-002", "P-003"]), reviewQueueCount: 0, agentsBuilt: 1 };
    expect(deriveStage(input(base))).toBe("export");
    const registry = [{ agent_id: "A-1", owner_person_id: "P-001", task_id: "T", resp_id: "R", runtime: "pedigree", status: "approved" as const, stale: false, ingredient_hashes: {}, versions: [] }];
    expect(deriveStage(input({ ...base, registry }))).toBe("operate");
  });
});

describe("nextAction + defaultSurface", () => {
  it("each stage has a distinct CTA and surface; org map is never a default", () => {
    const stages = ["validate_roster", "add_context", "run_sessions", "review_findings", "plan_agents", "export", "operate"] as const;
    const labels = new Set<string>();
    for (const stage of stages) {
      const action = nextAction(stage, input());
      expect(action.label.length).toBeGreaterThan(3);
      expect(action.hint.length).toBeGreaterThan(10);
      labels.add(action.label);
      expect(defaultSurface(stage)).not.toBe("orgmap");
    }
    expect(labels.size).toBe(stages.length);
  });

  it("validate_roster targets the people table, operate targets the digest", () => {
    expect(defaultSurface("validate_roster")).toBe("people");
    expect(defaultSurface("run_sessions")).toBe("discovery");
    expect(defaultSurface("review_findings")).toBe("review");
    expect(defaultSurface("operate")).toBe("digest");
  });
});

describe("canDefaultToOrgMap", () => {
  it("requires confirmed responsibilities, applied sessions, or 50% coverage", () => {
    expect(canDefaultToOrgMap(input())).toBe(false);
    expect(canDefaultToOrgMap(input({ pedigree: mappedPedigree(["P-001", "P-002"]) }))).toBe(true); // 50%
    const plan = { id: "PL", sessions: [{ id: "a", type: "leadership_session" as const, anchor_person_id: "P-001", scope_ids: [], priority: 1, rationale: "", status: "applied" as const }, { id: "b", type: "department_session" as const, anchor_person_id: "P-002", scope_ids: [], priority: 2, rationale: "", status: "applied" as const }], coverage: { people_mapped: 0, people_total: 4, departments_covered: 0, departments_total: 3 }, updated_at: "" };
    expect(canDefaultToOrgMap(input({ discoveryPlan: plan }))).toBe(true);
  });
});

describe("stage-aware metrics", () => {
  it("early metrics are import-quality, not funnel zeros", () => {
    const metrics = stageMetrics("validate_roster", input({ rosterValidatedAt: undefined }));
    const labels = metrics.map((m) => m.label);
    expect(labels).toContain("People imported");
    expect(labels).toContain("Manager links");
    expect(labels).not.toContain("Agents built");
  });

  it("late metrics show the funnel", () => {
    const metrics = stageMetrics("plan_agents", input({ pedigree: mappedPedigree(["P-001", "P-002", "P-003"]) }));
    expect(metrics.map((m) => m.label)).toContain("Tasks ready for delegation");
  });
});

describe("setup checklist", () => {
  it("marks done/current/locked from the stage", () => {
    const items = setupChecklist("run_sessions");
    expect(items.find((i) => i.id === "validate_roster")!.state).toBe("done");
    expect(items.find((i) => i.id === "run_sessions")!.state).toBe("current");
    expect(items.find((i) => i.id === "plan_agents")!.state).toBe("locked");
    expect(setupChecklist("operate").every((i) => i.state === "done")).toBe(true);
  });
});

describe("summaryNextAction", () => {
  it("shows what happens next, not just Open", () => {
    expect(summaryNextAction({ peopleCount: 8, mappedCount: 0, agentsCount: 0 })).toBe("Start discovery");
    expect(summaryNextAction({ peopleCount: 8, mappedCount: 3, agentsCount: 0 })).toBe("Continue discovery");
    expect(summaryNextAction({ peopleCount: 8, mappedCount: 8, agentsCount: 0 })).toBe("Plan agents");
    expect(summaryNextAction({ peopleCount: 8, mappedCount: 8, agentsCount: 2 })).toBe("Open workspace");
  });
});
