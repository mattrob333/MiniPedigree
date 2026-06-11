import { describe, it, expect } from "vitest";
import { applyQuestionOutcomes, emptyCaptureState, participantCoverage, serializeGuidedSession } from "../src/lib/guidedCapture";
import { buildTemplateBrief } from "../src/lib/sessionBrief";
import { ingestBriefOutcomes } from "../src/lib/questionBacklog";
import type { Person, SessionNote } from "../src/types";

const jane: Person = { id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "RevOps Manager", department: "Revenue Ops", managerId: null, tools: ["Salesforce"] };
const people = [jane];
const session = { id: "PS-individual_role_session-P-001", type: "individual_role_session" as const, anchor_person_id: "P-001", scope_ids: ["P-001"] };
const brief = buildTemplateBrief({ session, participants: people });

const note = (questionId: string, text: string, target?: string): SessionNote => ({
  id: `N-${questionId}`, question_id: questionId, target_person_id: target ?? "P-001",
  tags: ["task"], text, captured_at: "2026-06-10T10:00:00Z",
});

describe("serializeGuidedSession", () => {
  it("produces tagged blocks with email attribution and intent", () => {
    const q = brief.questions[0];
    const out = serializeGuidedSession(brief, [note(q.id, "Every Monday she pulls the pipeline report from Salesforce.")], people);
    expect(out).toContain(`[${q.id} | target: jane@x.co | intent: ${q.intent}`);
    expect(out).toContain('"Every Monday she pulls the pipeline report from Salesforce."');
    expect(out).toContain("GUIDED CAPTURE NOTES");
  });

  it("appends the raw transcript when both notes and recording exist", () => {
    const q = brief.questions[0];
    const out = serializeGuidedSession(brief, [note(q.id, "She owns the scorecard.")], people, "Raw transcript text here.");
    expect(out).toContain("RAW TRANSCRIPT");
    expect(out).toContain("Raw transcript text here.");
    expect(out.indexOf("GUIDED CAPTURE NOTES")).toBeLessThan(out.indexOf("RAW TRANSCRIPT"));
  });

  it("serializes parked items with a PARKED tag", () => {
    const out = serializeGuidedSession(brief, [note("parked", "Check the data warehouse migration timeline.")], people);
    expect(out).toContain("[PARKED | target: jane@x.co | intent: clarification]");
  });
});

describe("applyQuestionOutcomes", () => {
  it("maps notes → answered, explicit skips → skipped, parks → parked", () => {
    const state = emptyCaptureState();
    const [q1, q2, q3] = brief.questions;
    state.notes.push(note(q1.id, "Answered it."));
    state.skipped.push(q2.id);
    state.parked.push(note(q3.id, "Out of scope."));
    const updated = applyQuestionOutcomes(brief, state);
    expect(updated.questions.find((q) => q.id === q1.id)!.outcome).toBe("answered");
    expect(updated.questions.find((q) => q.id === q2.id)!.outcome).toBe("skipped");
    expect(updated.questions.find((q) => q.id === q3.id)!.outcome).toBe("parked");
    expect(updated.questions.find((q) => q.id === q1.id)!.notes).toHaveLength(1);
  });

  it("unanswered and parked questions flow into the backlog", () => {
    const state = emptyCaptureState();
    state.notes.push(note(brief.questions[0].id, "Answered."));
    const updated = applyQuestionOutcomes(brief, state);
    const backlog = ingestBriefOutcomes([], updated, state.parked, "P-001");
    // Every question except the answered one lands in the backlog.
    expect(backlog.length).toBe(brief.questions.length - 1);
    expect(backlog.every((b) => b.person_id === "P-001")).toBe(true);
    expect(backlog.some((b) => b.source === "unanswered_brief")).toBe(true);
  });
});

describe("participantCoverage", () => {
  it("counts answered questions per participant", () => {
    const q = brief.questions.find((x) => x.target_person_id === "P-001") ?? brief.questions[0];
    const coverage = participantCoverage(brief, [note(q.id, "Done.")], people);
    expect(coverage[0].person.id).toBe("P-001");
    expect(coverage[0].answered).toBe(1);
    expect(coverage[0].total).toBeGreaterThan(0);
  });
});
