import { describe, it, expect } from "vitest";
import { computeReadiness, readinessGaps, readinessTier, READINESS_MAX } from "../src/lib/readiness";
import type { CompanyContext, Person } from "../src/types";

const people: Person[] = [
  { id: "P-001", name: "Ada CEO", email: "ada@x.co", title: "CEO", department: "Leadership", managerId: null, tools: ["Slack"] },
  { id: "P-002", name: "Sam Sales", email: "sam@x.co", title: "Head of Sales", department: "Sales", managerId: "P-001", tools: ["Salesforce"] },
  { id: "P-003", name: "Fin Fox", email: "fin@x.co", title: "Controller", department: "Finance", managerId: "P-001", tools: ["NetSuite"] },
];

const richContext: CompanyContext = {
  company: "Acme",
  whatWeDo: "Acme sells managed billing infrastructure to mid-market healthcare groups across the US, replacing in-house claims teams.",
  businessModel: "SaaS subscription plus a per-claim processing fee",
  market: "Mid-market healthcare providers",
  strategicGoals: "1. Reach $10M ARR by Q4\n2. Cut claim denial rate to 4% this year\n3. Launch the partner channel in H2",
  bottlenecks: "Manual claims rework eats two analyst days per week; onboarding new provider groups takes 6 weeks because contracts are reviewed by hand.",
  systems: ["Salesforce", "NetSuite", "Slack"],
  approvalRules: ["Refunds above $500 require Finance sign-off."],
  terminology: "scrub pass, clean claim, 837 file, payer matrix, denial queue",
  kpis: [
    { department: "Sales", metric: "Pipeline coverage", cadence: "weekly" },
    { department: "Finance", metric: "Denial rate", cadence: "monthly" },
    { department: "Leadership", metric: "ARR", cadence: "monthly" },
  ],
  contextDocuments: [
    { id: "d1", bucket: "policy", fileName: "approvals.md", text: "Refunds above $500 require Finance sign-off.", uploadedAt: "2026-01-01" },
    { id: "d2", bucket: "segregation_of_duties", fileName: "sod.md", text: "The same person may not both prepare and release payments.", uploadedAt: "2026-01-01" },
  ],
};

describe("computeReadiness", () => {
  it("scores an empty workspace 0 with a gap on every dimension", () => {
    const r = computeReadiness(undefined, [], []);
    expect(r.overall).toBe(0);
    expect(r.dimensions).toHaveLength(8);
    for (const d of r.dimensions) {
      expect(d.score).toBe(0);
      expect(d.gap).toBeTruthy();
      expect(d.fix_hint).toBeTruthy();
    }
  });

  it("scores a rich workspace at or near the max", () => {
    const r = computeReadiness(richContext, richContext.contextDocuments ?? [], people);
    expect(r.overall).toBeGreaterThanOrEqual(14);
    expect(r.overall).toBeLessThanOrEqual(READINESS_MAX);
    expect(readinessTier(r)).toBe("high");
  });

  it("gap messages name the missing thing specifically", () => {
    const ctx: CompanyContext = { ...richContext, kpis: [{ department: "Sales", metric: "Pipeline coverage" }] };
    const r = computeReadiness(ctx, ctx.contextDocuments ?? [], people);
    const kpiDim = r.dimensions.find((d) => d.id === "kpis")!;
    expect(kpiDim.score).toBeLessThan(2);
    expect(kpiDim.gap).toMatch(/Finance|Leadership/);
  });

  it("stack dimension flags people without tools", () => {
    const bare = people.map((p) => ({ ...p, tools: [] as string[] }));
    const r = computeReadiness(richContext, [], bare);
    const stack = r.dimensions.find((d) => d.id === "stack")!;
    expect(stack.score).toBeLessThan(2);
    expect(stack.gap).toMatch(/3 people have no known_tools/);
  });

  it("governance requires both stated rules and uploaded docs for a 2", () => {
    const noDocs = computeReadiness({ ...richContext, contextDocuments: [] }, [], people);
    expect(noDocs.dimensions.find((d) => d.id === "governance")!.score).toBe(1);
    const noRules = computeReadiness({ ...richContext, approvalRules: [], segregationOfDuties: [] }, richContext.contextDocuments ?? [], people);
    expect(noRules.dimensions.find((d) => d.id === "governance")!.score).toBe(1);
  });

  it("readinessGaps returns lowest-scoring dimensions first", () => {
    const ctx: CompanyContext = { company: "X", whatWeDo: richContext.whatWeDo, businessModel: "SaaS" };
    const r = computeReadiness(ctx, [], people);
    const gaps = readinessGaps(r, 3);
    expect(gaps).toHaveLength(3);
    expect(gaps[0].score).toBeLessThanOrEqual(gaps[1].score);
  });
});
