import { describe, it, expect } from "vitest";
import {
  ingestParserOpenQuestions,
  openBacklog,
  backlogByPerson,
  resolveBacklogFromParse,
  resolveBacklogItem,
  serializeBacklogAnswer,
} from "../src/lib/questionBacklog";
import type { ParsedMap, QuestionBacklogItem } from "../src/types";

const parsedWithOpenQuestions: ParsedMap = {
  "P-001": {
    summary: "",
    responsibilities: [{
      id: "R-001", title: "Forecast hygiene",
      tasks: { delegatable: ["Clean stale forecast records"], approval: [], not_delegatable: [] },
      taskDetails: [{
        name: "Clean stale forecast records",
        delegation_class: "delegatable", risk_level: "low", requires_human_approval: false,
        trigger: null, inputs: null, outputs: null, tools_mentioned: null,
        definition_of_done: null, readiness: "needs_clarification",
        open_questions: ["Which fields count as stale?", "Who receives the hygiene scorecard?"],
        candidate_pattern: null,
      }],
    }],
  },
};

describe("question backlog", () => {
  it("parser open_questions land in the backlog keyed by person", () => {
    const backlog = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    expect(backlog).toHaveLength(2);
    expect(backlog[0].person_id).toBe("P-001");
    expect(backlog[0].source).toBe("parser_open_question");
    expect(backlog[0].source_ref).toContain("R-001");
  });

  it("dedupes by person + question text", () => {
    const once = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    const twice = ingestParserOpenQuestions(once, parsedWithOpenQuestions, ["P-001"]);
    expect(twice).toHaveLength(2);
  });

  it("auto-resolves when a later parse answers the question", () => {
    const backlog = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    const answering: ParsedMap = {
      "P-001": {
        summary: "",
        responsibilities: [{
          id: "R-001", title: "Forecast hygiene",
          tasks: { delegatable: ["Clean stale forecast records"], approval: [], not_delegatable: [] },
          taskDetails: [{
            name: "Clean stale forecast records",
            delegation_class: "delegatable", risk_level: "low", requires_human_approval: false,
            trigger: "every Monday",
            inputs: ["Salesforce pipeline report"],
            outputs: ["hygiene scorecard to AE managers"],
            tools_mentioned: ["Salesforce"],
            definition_of_done: "stale fields cleared and scorecard sent",
            readiness: "ready",
            open_questions: null,
            candidate_pattern: "record-hygiene",
          }],
        }],
      },
    };
    const resolved = resolveBacklogFromParse(backlog, answering, ["P-001"], "PS-2");
    const scorecard = resolved.find((b) => b.question.includes("scorecard"))!;
    expect(scorecard.resolved_by_session_id).toBe("PS-2");
    expect(openBacklog(resolved).length).toBeLessThan(backlog.length);
  });

  it("does not resolve when the parser re-emits the same open question", () => {
    const backlog = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    const resolved = resolveBacklogFromParse(backlog, parsedWithOpenQuestions, ["P-001"], "PS-2");
    expect(openBacklog(resolved)).toHaveLength(2);
  });

  it("groups open items by person and supports manual resolution", () => {
    let backlog: QuestionBacklogItem[] = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    const grouped = backlogByPerson(backlog);
    expect(grouped.get("P-001")).toHaveLength(2);
    backlog = resolveBacklogItem(backlog, backlog[0].id, "manual");
    expect(openBacklog(backlog)).toHaveLength(1);
  });

  it("serializes member answers in the authoritative tagged-block format", () => {
    const backlog = ingestParserOpenQuestions([], parsedWithOpenQuestions, ["P-001"]);
    const block = serializeBacklogAnswer(backlog[0], "Anything untouched for 30 days.", "jane@x.co");
    expect(block).toContain(`[backlog:${backlog[0].id} | target: jane@x.co | intent: clarification]`);
    expect(block).toContain('"Anything untouched for 30 days."');
  });
});
