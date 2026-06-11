import { describe, it, expect } from "vitest";
import { buildTemplateBrief, isPitchQuestion, sanitizeBrief } from "../src/lib/sessionBrief";
import type { CompanyContext, Person, QuestionBacklogItem, SessionBrief } from "../src/types";

const participants: Person[] = [
  { id: "P-002", name: "Sam Sales", email: "sam@x.co", title: "Head of Sales", department: "Sales", managerId: "P-001", tools: ["Salesforce", "Slack"] },
  { id: "P-004", name: "Rep One", email: "rep1@x.co", title: "AE", department: "Sales", managerId: "P-002", tools: ["Salesforce"] },
];

const session = { id: "PS-department_session-P-002", type: "department_session" as const, anchor_person_id: "P-002", scope_ids: ["P-002", "P-004"] };

const ctx: CompanyContext = {
  company: "Acme", whatWeDo: "x",
  kpis: [{ department: "Sales", metric: "Pipeline coverage", cadence: "weekly" }],
};

const backlog: QuestionBacklogItem[] = [
  { id: "QB-1", person_id: "P-004", question: "Who actually owns the renewal handoff after close?", source: "parser_open_question", source_ref: "R-1:Renewals", created_at: "2026-06-01" },
];

describe("buildTemplateBrief", () => {
  it("produces at least 6 questions for any participant set", () => {
    const brief = buildTemplateBrief({ session, participants });
    expect(brief.questions.length).toBeGreaterThanOrEqual(6);
    expect(brief.source).toBe("template");
    const solo = buildTemplateBrief({
      session: { ...session, type: "individual_role_session", scope_ids: ["P-004"] },
      participants: [participants[1]],
    });
    expect(solo.questions.length).toBeGreaterThanOrEqual(6);
  });

  it("includes carried-over backlog questions verbatim and last", () => {
    const brief = buildTemplateBrief({ session, participants, backlog });
    expect(brief.carried_over).toHaveLength(1);
    const texts = brief.questions.map((q) => q.text);
    expect(texts).toContain(backlog[0].question);
    expect(texts[texts.length - 1]).toBe(backlog[0].question);
    expect(brief.questions[brief.questions.length - 1].intent).toBe("clarification");
  });

  it("never pitches automation at the interviewee", () => {
    const brief = buildTemplateBrief({ session, participants, companyContext: ctx, backlog });
    for (const q of brief.questions) {
      expect(isPitchQuestion(q.text), `pitch phrasing in: ${q.text}`).toBe(false);
    }
  });

  it("asks KPI-ownership questions grounded in the company KPIs", () => {
    const brief = buildTemplateBrief({ session, participants, companyContext: ctx });
    const kpiQ = brief.questions.find((q) => q.intent === "kpi_ownership");
    expect(kpiQ?.text).toContain("Pipeline coverage");
    expect(kpiQ?.target_person_id).toBe("P-002");
  });

  it("builds probe areas from systems shared across participants", () => {
    const brief = buildTemplateBrief({ session, participants });
    expect(brief.probe_areas.some((p) => p.system === "Salesforce")).toBe(true);
  });

  it("tags every question with target, intent, and why", () => {
    const brief = buildTemplateBrief({ session, participants, companyContext: ctx });
    for (const q of brief.questions) {
      expect(q.target_person_id).toBeTruthy();
      expect(q.intent).toBeTruthy();
      expect(q.why.length).toBeGreaterThan(10);
    }
  });
});

describe("sanitizeBrief", () => {
  it("drops AI-pitch questions and re-appends dropped backlog questions", () => {
    const brief: SessionBrief = {
      id: "B-1", session_id: session.id,
      objectives: "x",
      questions: [
        { id: "Q-1", text: "Walk me through last week.", target_person_id: "group", intent: "responsibility", why: "w", order: 1 },
        { id: "Q-2", text: "Could an AI agent do this report for you?", target_person_id: "P-004", intent: "responsibility", why: "w", order: 2 },
      ],
      probe_areas: [], carried_over: [], coverage_targets: [],
      source: "ai", edited_by_user: false, generated_at: "2026-06-01",
    };
    const cleaned = sanitizeBrief(brief, backlog, ["P-002", "P-004"]);
    expect(cleaned.questions.some((q) => /AI agent/i.test(q.text))).toBe(false);
    expect(cleaned.questions.some((q) => q.text === backlog[0].question)).toBe(true);
  });
});

describe("assessAgendaCoverage (transcript-first)", () => {
  it("maps transcript passages back to agenda questions and carries gaps forward", async () => {
    const { assessAgendaCoverage } = await import("../src/lib/agendaCoverage");
    const { ingestBriefOutcomes } = await import("../src/lib/questionBacklog");
    const brief = buildTemplateBrief({ session, participants, companyContext: ctx });
    const transcript = [
      "Sam: My week revolves around the Salesforce pipeline. Every Monday I open Salesforce, go deal by deal, flag the stale ones, and send the list to the team before ten.",
      "Sam: The pipeline coverage number gets produced every week — I pull the open pipeline from Salesforce, divide by the quarterly target, and post it in Slack.",
      "Rep One: I mostly draft follow-up emails for quiet deals and update next steps in Salesforce.",
    ].join("\n");
    const parsed = {};
    const { brief: scored, coverage } = assessAgendaCoverage(brief, transcript, parsed);
    expect(coverage.total).toBe(brief.questions.length);
    expect(coverage.answered).toBeGreaterThan(0);
    expect(coverage.unanswered).toBeGreaterThan(0);
    // Unanswered topics flow into the open-questions backlog.
    const backlog = ingestBriefOutcomes([], scored, [], "P-002");
    expect(backlog.length).toBe(coverage.unanswered + coverage.partial + scored.questions.filter((q) => q.outcome === undefined).length);
    expect(backlog.every((b) => b.source === "unanswered_brief")).toBe(true);
  });
});
