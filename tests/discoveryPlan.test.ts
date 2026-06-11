import { describe, it, expect } from "vitest";
import { adaptPlan, discoveryCompletion, generatePlan, setSessionStatus } from "../src/lib/discoveryPlan";
import { initialPedigreeState } from "../src/lib/state";
import type { CompanyContext, PedigreeState, Person, QuestionBacklogItem } from "../src/types";

const people: Person[] = [
  { id: "P-001", name: "Ada CEO", email: "ada@x.co", title: "CEO", department: "Leadership", managerId: null, tools: [] },
  { id: "P-002", name: "Sam Sales", email: "sam@x.co", title: "Head of Sales", department: "Sales", managerId: "P-001", tools: [] },
  { id: "P-003", name: "Fin Fox", email: "fin@x.co", title: "Controller", department: "Finance", managerId: "P-001", tools: [] },
  { id: "P-004", name: "Rep One", email: "rep1@x.co", title: "AE", department: "Sales", managerId: "P-002", tools: [] },
  { id: "P-005", name: "Rep Two", email: "rep2@x.co", title: "AE", department: "Sales", managerId: "P-002", tools: [] },
  { id: "P-006", name: "Clerk", email: "clerk@x.co", title: "AP Clerk", department: "Finance", managerId: "P-003", tools: [] },
];

const ctx: CompanyContext = {
  company: "Acme", whatWeDo: "x",
  bottlenecks: "Finance close is the slowest process in the company.",
};

describe("generatePlan", () => {
  it("cascades leadership first, then departments by bottleneck mention then headcount", () => {
    const plan = generatePlan(people, initialPedigreeState(people), ctx);
    expect(plan.sessions[0].type).toBe("leadership_session");
    expect(plan.sessions[0].anchor_person_id).toBe("P-001");
    // Finance is named in bottlenecks → its head outranks Sales despite smaller team.
    expect(plan.sessions[1].anchor_person_id).toBe("P-003");
    expect(plan.sessions[1].rationale).toMatch(/bottleneck/i);
    expect(plan.sessions[2].anchor_person_id).toBe("P-002");
    expect(plan.coverage.people_total).toBe(6);
    expect(plan.coverage.departments_total).toBe(3);
  });

  it("preserves session statuses and brief links across regeneration", () => {
    const ped = initialPedigreeState(people);
    let plan = generatePlan(people, ped, ctx);
    const leadershipId = plan.sessions[0].id;
    plan = setSessionStatus(plan, leadershipId, "applied", "BRIEF-1");
    const regenerated = generatePlan(people, ped, ctx, plan);
    const leadership = regenerated.sessions.find((s) => s.id === leadershipId)!;
    expect(leadership.status).toBe("applied");
    expect(leadership.brief_id).toBe("BRIEF-1");
  });

  it("adds clarification sessions for needs-review people without reports", () => {
    const ped = initialPedigreeState(people);
    ped["P-006"] = { ...ped["P-006"], status: "needs-review" };
    const plan = generatePlan(people, ped, ctx);
    const clar = plan.sessions.find((s) => s.type === "clarification_session");
    expect(clar?.anchor_person_id).toBe("P-006");
  });

  it("excludes offboarded people", () => {
    const left = people.map((p) => (p.id === "P-002" ? { ...p, lifecycle: "offboarded" as const } : p));
    const plan = generatePlan(left, initialPedigreeState(left), ctx);
    expect(plan.sessions.some((s) => s.anchor_person_id === "P-002")).toBe(false);
  });
});

describe("adaptPlan", () => {
  const backlogFor = (personId: string, n: number): QuestionBacklogItem[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `QB-${personId}-${i}`, person_id: personId, question: `Open question ${i}?`,
      source: "parser_open_question", source_ref: "t", created_at: "2026-06-01",
    }));

  it("proposes a targeted session for a person with ≥3 open questions", () => {
    const ped = initialPedigreeState(people);
    // Mark every pending session applied so nothing pending covers P-006.
    let plan = generatePlan(people, ped, ctx);
    for (const s of plan.sessions) plan = setSessionStatus(plan, s.id, "applied");
    // Give everyone a responsibility so applied sessions don't flip to rerun.
    const mapped: PedigreeState = Object.fromEntries(Object.entries(ped).map(([id, row]) => [id, { ...row, responsibilities: [{ id: "R", title: "Work" }] }]));
    const adapted = adaptPlan({ plan, people, pedigree: mapped, questionBacklog: backlogFor("P-006", 3) });
    const targeted = adapted.sessions.find((s) => s.type === "individual_role_session" && s.anchor_person_id === "P-006");
    expect(targeted).toBeTruthy();
    expect(targeted!.rationale).toMatch(/3 open questions/);
  });

  it("flags thin applied sessions rerun_suggested instead of silently done", () => {
    const ped = initialPedigreeState(people); // nobody has responsibilities
    let plan = generatePlan(people, ped, ctx);
    plan = setSessionStatus(plan, plan.sessions[0].id, "applied");
    const adapted = adaptPlan({ plan, people, pedigree: ped, questionBacklog: [] });
    expect(adapted.sessions.find((s) => s.id === plan.sessions[0].id)!.status).toBe("rerun_suggested");
  });

  it("never deletes session history", () => {
    const ped = initialPedigreeState(people);
    let plan = generatePlan(people, ped, ctx);
    plan = setSessionStatus(plan, plan.sessions[0].id, "applied");
    const adapted = adaptPlan({ plan, people, pedigree: ped, questionBacklog: [] });
    expect(adapted.sessions.length).toBeGreaterThanOrEqual(plan.sessions.length);
  });
});

describe("discoveryCompletion", () => {
  it("requires manager coverage, IC coverage, and a small backlog", () => {
    const ped = initialPedigreeState(people);
    expect(discoveryCompletion(people, ped, []).complete).toBe(false);
    const allMapped: PedigreeState = Object.fromEntries(Object.entries(ped).map(([id, row]) => [id, { ...row, status: "mapped" as const }]));
    expect(discoveryCompletion(people, allMapped, []).complete).toBe(true);
    const bigBacklog: QuestionBacklogItem[] = Array.from({ length: 11 }, (_, i) => ({
      id: `QB-${i}`, person_id: "P-004", question: "?", source: "parker" as never, source_ref: "x", created_at: "2026-06-01",
    }));
    expect(discoveryCompletion(people, allMapped, bigBacklog).complete).toBe(false);
  });
});
