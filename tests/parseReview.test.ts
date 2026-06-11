import { describe, it, expect } from "vitest";
import { countFindings, filterParsedMap, responsibilityKey, taskKey } from "../src/lib/parseReview";
import type { ParsedMap } from "../src/types";

const parsed: ParsedMap = {
  "P-001": {
    summary: "",
    responsibilities: [
      {
        id: "R-001", title: "Forecast hygiene",
        tasks: { delegatable: ["Clean stale records", "Summarize exceptions"], approval: ["Send scorecard"], not_delegatable: ["Approve final number"] },
        taskDetails: [
          { name: "Clean stale records", delegation_class: "delegatable", risk_level: "low", requires_human_approval: false, trigger: null, inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: null, open_questions: null, candidate_pattern: null },
        ],
      },
      { id: "R-002", title: "CRM change review", tasks: { delegatable: ["Diff CRM fields"], approval: [], not_delegatable: [] } },
    ],
  },
};

describe("filterParsedMap", () => {
  it("returns the map unchanged with no rejections", () => {
    expect(filterParsedMap(parsed, new Set())).toBe(parsed);
  });

  it("rejecting a task removes it from its bucket and from taskDetails", () => {
    const out = filterParsedMap(parsed, new Set([taskKey("P-001", "R-001", "Clean stale records")]));
    const r = out["P-001"].responsibilities[0];
    expect(r.tasks.delegatable).toEqual(["Summarize exceptions"]);
    expect(r.taskDetails).toHaveLength(0);
    // Other classes untouched.
    expect(r.tasks.approval).toEqual(["Send scorecard"]);
  });

  it("rejecting a responsibility drops it and all its tasks", () => {
    const out = filterParsedMap(parsed, new Set([responsibilityKey("P-001", "R-001")]));
    expect(out["P-001"].responsibilities.map((r) => r.id)).toEqual(["R-002"]);
  });

  it("countFindings reflects survivors", () => {
    const before = countFindings(parsed, ["P-001"]);
    expect(before).toEqual({ responsibilities: 2, tasks: 5 });
    const after = countFindings(filterParsedMap(parsed, new Set([responsibilityKey("P-001", "R-001")])), ["P-001"]);
    expect(after).toEqual({ responsibilities: 1, tasks: 1 });
  });
});
