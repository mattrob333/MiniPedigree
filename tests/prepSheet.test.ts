import { describe, expect, it } from "vitest";
import { briefToParticipantMarkdown } from "../src/lib/prepSheet";
import type { Person, SessionBrief } from "../src/types";

const participants: Person[] = [
  { id: "P1", name: "Oscar Lin", email: "oscar@example.com", title: "VP Sales", department: "Sales", managerId: null, tools: ["Salesforce"] },
  { id: "P2", name: "Tara Singh", email: "tara@example.com", title: "AE", department: "Sales", managerId: "P1", tools: ["Gong"] },
];

const brief: SessionBrief = {
  id: "B1",
  session_id: "PS-dept-P1",
  objectives: "Map Sales ownership and approval boundaries.",
  questions: [
    { id: "Q1", text: "For each of you: what can you approve alone?", target_person_id: "group", intent: "approval_boundary", why: "Ask last after rapport.", order: 1 },
    { id: "Q2", text: "Tara, walk me through your weekly forecast update.", target_person_id: "P2", intent: "cadence", why: "Use when conversation stalls.", order: 2 },
    { id: "Q3", text: "Oscar, what stays with leadership?", target_person_id: "P1", intent: "responsibility", why: "Facilitator hint.", order: 3 },
    { id: "Q4", text: "", target_person_id: "P2", intent: "system", why: "Empty should strip.", order: 4 },
  ],
  probe_areas: [{ system: "Salesforce", prompt: "Probe the exact report path." }],
  carried_over: [{ question: "Hidden backlog framing", source_task_id: "T1" }],
  coverage_targets: ["P1", "P2"],
  source: "template",
  edited_by_user: false,
  generated_at: "2026-06-11T00:00:00Z",
};

describe("briefToParticipantMarkdown", () => {
  it("does not leak facilitator why-lines, hints, probe prompts, or carried-over framing", () => {
    const out = briefToParticipantMarkdown(brief, participants);
    expect(out).toContain("Map Sales ownership");
    expect(out).toContain("For each of you");
    expect(out).toContain("Salesforce");
    expect(out).not.toContain("Ask last");
    expect(out).not.toContain("conversation stalls");
    expect(out).not.toContain("Probe the exact report path");
    expect(out).not.toContain("Hidden backlog framing");
  });

  it("filters per-person prep to group and recipient questions", () => {
    const out = briefToParticipantMarkdown(brief, participants, "P2");
    expect(out).toContain("For each of you");
    expect(out).toContain("Tara:");
    expect(out).not.toContain("Oscar, what stays with leadership");
  });
});
