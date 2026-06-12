import { describe, it, expect } from "vitest";
import { parsedTaskSchema, parsedDiscoverySchema } from "../src/lib/schemas";
import { classifyTask, generateParsed } from "../src/lib/parse";
import { applyParsed } from "../src/lib/state";
import { buildReviewQueue } from "../src/lib/provenance";
import type { Person } from "../src/types";

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: null, tools: ["Salesforce", "Slack"],
};

describe("enriched parse schema", () => {
  it("parses the new completion-context fields", () => {
    const task = parsedTaskSchema.parse({
      name: "Compile weekly forecast report",
      delegation_class: "delegatable",
      risk_level: "low",
      requires_human_approval: false,
      trigger: "every Friday",
      inputs: ["Salesforce opportunity export"],
      outputs: ["Forecast summary doc"],
      tools_mentioned: ["Salesforce"],
      definition_of_done: "Report posted to the shared drive",
      readiness: "ready",
      open_questions: [],
      candidate_pattern: "weekly-report",
    });
    expect(task.trigger).toBe("every Friday");
    expect(task.inputs).toEqual(["Salesforce opportunity export"]);
    expect(task.readiness).toBe("ready");
    expect(task.candidate_pattern).toBe("weekly-report");
  });

  it("nulls survive Zod (null means 'not stated in transcript')", () => {
    const task = parsedTaskSchema.parse({
      name: "Clean stale forecast records",
      delegation_class: "delegatable",
      risk_level: "low",
      requires_human_approval: false,
      trigger: null,
      inputs: null,
      outputs: null,
      tools_mentioned: null,
      definition_of_done: null,
      readiness: null,
      open_questions: null,
      candidate_pattern: null,
    });
    expect(task.trigger).toBeNull();
    expect(task.inputs).toBeNull();
    expect(task.readiness).toBeNull();
  });

  it("defaults missing completion-context fields to null (back-compat with old payloads)", () => {
    const task = parsedTaskSchema.parse({
      name: "Summarize exceptions",
      delegation_class: "delegatable",
      risk_level: "low",
      requires_human_approval: false,
    });
    expect(task.trigger).toBeNull();
    expect(task.definition_of_done).toBeNull();
    expect(task.open_questions).toBeNull();
  });

  it("full discovery payload with enriched tasks passes the discovery schema", () => {
    const out = parsedDiscoverySchema.parse({
      people_updates: [{
        person_email: "jane@x.co",
        responsibilities: [{
          name: "Forecast hygiene",
          tasks: [{
            name: "Compile weekly forecast report",
            delegation_class: "delegatable",
            risk_level: "low",
            requires_human_approval: false,
            trigger: "weekly",
            readiness: "needs_clarification",
            open_questions: ["Which dashboard is the source of truth?"],
          }],
        }],
      }],
    });
    const task = out.people_updates[0].responsibilities[0].tasks[0];
    expect(task.readiness).toBe("needs_clarification");
    expect(task.open_questions).toEqual(["Which dashboard is the source of truth?"]);
    expect(task.inputs).toBeNull();
  });
});

describe("deterministic fallback (no API key)", () => {
  it("emits nulls for all completion-context fields — never invented data", () => {
    const parsed = generateParsed([jane], "Jane cleans stale forecast records every week.");
    const details = parsed[jane.id].responsibilities.flatMap((r) => r.taskDetails ?? []);
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) {
      expect(d.trigger).toBeNull();
      expect(d.inputs).toBeNull();
      expect(d.outputs).toBeNull();
      expect(d.tools_mentioned).toBeNull();
      expect(d.definition_of_done).toBeNull();
      expect(d.readiness).toBeNull();
      expect(d.open_questions).toBeNull();
      expect(d.candidate_pattern).toBeNull();
    }
  });

  it("classification behavior is unchanged on existing fixtures", () => {
    expect(classifyTask("Clean stale forecast records").cls).toBe("delegatable");
    expect(classifyTask("Send next-step nudges").cls).toBe("human_approval_required");
    expect(classifyTask("Approve final forecast number").cls).toBe("not_delegatable");
    expect(classifyTask("Handle the mystery process").cls).toBe("human_approval_required");
  });
});

describe("applyParsed completion-context propagation", () => {
  it("carries completion context from taskDetails onto TaskItems", () => {
    const parsed = {
      [jane.id]: {
        summary: "Owns forecast hygiene.",
        responsibilities: [{
          id: "R-001",
          title: "Forecast hygiene",
          tasks: { delegatable: ["Compile weekly forecast report"], approval: [], not_delegatable: [] },
          taskDetails: [{
            name: "Compile weekly forecast report",
            delegation_class: "delegatable" as const,
            risk_level: "low" as const,
            requires_human_approval: false,
            evidence_quote: "I compile the forecast every Friday",
            trigger: "every Friday",
            inputs: ["Salesforce export"],
            outputs: ["Forecast summary"],
            tools_mentioned: ["Salesforce"],
            definition_of_done: "Posted to shared drive",
            readiness: "ready" as const,
            open_questions: null,
            candidate_pattern: "weekly-report",
          }],
        }],
      },
    };
    const next = applyParsed([jane], parsed, {});
    const task = next[jane.id].tasks.delegatable[0];
    expect(task.completion?.trigger).toBe("every Friday");
    expect(task.completion?.definition_of_done).toBe("Posted to shared drive");
    expect(task.completion?.candidate_pattern).toBe("weekly-report");
    expect(task.riskLevel).toBe("low");
    expect(task.evidence).toContain("every Friday");
  });

  it("session-review apply confirms accepted findings and leaves flagged exceptions queued", () => {
    const parsed = {
      [jane.id]: {
        summary: "Owns forecast hygiene.",
        responsibilities: [{
          id: "R-001",
          title: "Forecast hygiene",
          evidence_quote: "Jane owns forecast hygiene",
          tasks: { delegatable: ["Compile weekly forecast report", "Clean stale records"], approval: [], not_delegatable: [] },
          taskDetails: [
            {
              name: "Compile weekly forecast report",
              delegation_class: "delegatable" as const,
              risk_level: "low" as const,
              requires_human_approval: false,
              evidence_quote: "I compile the forecast every Friday",
              trigger: "every Friday",
              inputs: ["Salesforce export"],
              outputs: ["Forecast summary"],
              tools_mentioned: ["Salesforce"],
              definition_of_done: "Posted to shared drive",
              readiness: "ready" as const,
              open_questions: null,
              candidate_pattern: "weekly-report",
            },
            {
              name: "Clean stale records",
              delegation_class: "delegatable" as const,
              risk_level: "low" as const,
              requires_human_approval: false,
              evidence_quote: "I clean stale records",
              trigger: null,
              inputs: null,
              outputs: null,
              tools_mentioned: null,
              definition_of_done: null,
              readiness: null,
              open_questions: null,
              candidate_pattern: null,
            },
          ],
        }],
      },
    };
    const next = applyParsed([jane], parsed, {}, {
      sessionLabel: "Leadership Session",
      confirmedBy: "reviewer@x.co",
      exceptionKeys: new Set([`${jane.id}::R-001::clean stale records`]),
    });
    const row = next[jane.id];
    expect(row.responsibilities[0].provenance?.state).toBe("human_confirmed");
    expect(row.tasks.delegatable.find((item) => item.label === "Compile weekly forecast report")?.provenance?.state).toBe("human_confirmed");
    expect(row.tasks.delegatable.find((item) => item.label === "Clean stale records")?.provenance?.state).toBe("evidenced");
    expect(buildReviewQueue([jane], next).map((item) => item.label)).toEqual(["Clean stale records"]);
  });
});
