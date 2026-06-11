import { describe, it, expect } from "vitest";
import { runMaintenanceParseDeterministic } from "../src/lib/maintenance";
import { buildCompactStackState } from "../src/lib/meetings";
import { ingestSignals, sweepExpired, pendingSignals, setSignalStatus } from "../src/lib/signalLedger";
import { memberAgentRequest, memberConfirmTask, memberCorrectTask } from "../src/lib/memberSignals";
import { applyConfirmations } from "../src/lib/freshness";
import type { PedigreeState, Person, StackSignal, TaskItem } from "../src/types";

const jane: Person = { id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "RevOps Manager", department: "Revenue Ops", managerId: null, tools: ["Salesforce"] };
const janeTask: TaskItem = { id: "T-001", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };

const pedigree: PedigreeState = {
  [jane.id]: {
    status: "ready",
    responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
    tasks: { delegatable: [janeTask], approval: [], not_delegatable: [] },
    agents: [],
  },
};

const stackState = buildCompactStackState([jane], pedigree, [], []);

function parse(transcript: string, transcriptId: string): StackSignal[] {
  return runMaintenanceParseDeterministic({ transcript, transcriptId, participantIds: [jane.id], stackState });
}

describe("maintenance parse (deterministic)", () => {
  it("emits a confirmation when described work matches a record", () => {
    const signals = parse("Jane spent Monday cleaning the stale forecast records again before the pipeline call.", "T-A");
    const confirmation = signals.find((s) => s.type === "confirmation");
    expect(confirmation).toBeTruthy();
    expect(confirmation!.refs.task_ids).toContain("T-001");
  });

  it("emits a retirement on stop phrasing", () => {
    const signals = parse("We killed the stale forecast records cleanup — the new CRM does it automatically.", "T-B");
    expect(signals.some((s) => s.type === "retirement" && s.refs.task_ids.includes("T-001"))).toBe(true);
  });

  it("emits nothing for a one-off assignment without recurrence language", () => {
    const signals = parse("Jake, please take the Henderson account this week while Maria is out.", "T-C");
    expect(signals).toHaveLength(0);
  });

  it("emits a new_candidate only with recurrence language", () => {
    const signals = parse("From now on Maria compiles the churn digest for the exec team.", "T-D");
    const candidate = signals.find((s) => s.type === "new_candidate");
    expect(candidate).toBeTruthy();
  });

  it("emits rule signals for governance-shaped sentences", () => {
    const signals = parse("From now on Finance must approve all refunds above $250.", "T-E");
    expect(signals.some((s) => s.type === "rule_signal")).toBe(true);
  });
});

describe("signal ledger durability", () => {
  const vagueCandidate = (transcriptId: string): StackSignal => ({
    id: `SIG-${transcriptId}`,
    type: "new_candidate",
    source: { kind: "meeting", meeting_id: "MTG-1", transcript_id: transcriptId },
    evidence_quote: "Maria compiles the churn digest for the exec team again.",
    confidence: 0.5,
    refs: { person_ids: ["P-002"], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [] },
    proposed_patch: { kind: "new_candidate", label: "Compile churn digest for the exec team", recurrence_language: false },
    authority_expanding: false,
    captured_at: new Date().toISOString(),
    status: "ledgered",
  });

  it("a single vague mention stays ledgered", () => {
    const res = ingestSignals([], [vagueCandidate("T-1")]);
    expect(res.promoted).toHaveLength(0);
    expect(res.ledger[0].status).toBe("ledgered");
  });

  it("a second distinct meeting promotes the candidate", () => {
    const first = ingestSignals([], [vagueCandidate("T-1")]);
    const second = ingestSignals(first.ledger, [vagueCandidate("T-2")]);
    expect(second.promoted).toHaveLength(1);
    // The earlier corroborating mention rides along into review.
    expect(second.ledger.filter((s) => s.status === "proposed")).toHaveLength(2);
  });

  it("the same meeting does not corroborate itself", () => {
    const first = ingestSignals([], [vagueCandidate("T-1")]);
    const again = ingestSignals(first.ledger, [vagueCandidate("T-1")]);
    expect(again.promoted).toHaveLength(0);
  });

  it("recurrence language promotes immediately", () => {
    const explicit = { ...vagueCandidate("T-1"), proposed_patch: { kind: "new_candidate", label: "Compile churn digest", recurrence_language: true } };
    const res = ingestSignals([], [explicit]);
    expect(res.promoted).toHaveLength(1);
  });

  it("a member assertion counts as corroboration and promotes immediately", () => {
    const request = memberAgentRequest(jane, { work: "Compile churn digest for the exec team", last_time: "yesterday", cadence: "weekly", inputs: "Salesforce", output: "digest", tedious: "manual" });
    const res = ingestSignals([], [request]);
    expect(res.promoted).toHaveLength(1);
  });

  it("rule signals always promote, top priority", () => {
    const signals = parse("From now on Finance must approve all refunds above $250.", "T-F");
    const res = ingestSignals([], signals);
    expect(res.promoted.some((s) => s.type === "rule_signal")).toBe(true);
  });

  it("confirmations apply silently and never enter review", () => {
    const signals = parse("Jane cleaned the stale forecast records on Monday.", "T-G");
    const res = ingestSignals([], signals);
    expect(res.confirmations.length).toBeGreaterThan(0);
    expect(pendingSignals(res.ledger).filter((s) => s.type === "confirmation")).toHaveLength(0);
  });

  it("uncorroborated candidates expire after the window", () => {
    const old = { ...vagueCandidate("T-1"), captured_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() };
    const res = ingestSignals([], [old]);
    const swept = sweepExpired(res.ledger);
    expect(swept[0].status).toBe("expired");
  });

  it("decisions are recorded on status changes", () => {
    const res = ingestSignals([], [{ ...vagueCandidate("T-1"), proposed_patch: { kind: "new_candidate", label: "x", recurrence_language: true } }]);
    const next = setSignalStatus(res.ledger, res.ledger[0].id, "rejected", "op@x.co");
    expect(next[0].decision?.by).toBe("op@x.co");
  });
});

describe("member signals", () => {
  it("confirm updates freshness timestamps only", () => {
    const signal = memberConfirmTask(jane, janeTask);
    expect(signal.type).toBe("confirmation");
    expect(signal.authority_expanding).toBe(false);
    const res = ingestSignals([], [signal]);
    const { pedigree: next } = applyConfirmations(pedigree, [], res.confirmations.map((s) => s.refs));
    const task = next[jane.id].tasks.delegatable[0];
    expect(task.last_confirmed_at).toBeTruthy();
    expect(task.label).toBe(janeTask.label); // nothing else changed
  });

  it("correct emits drift and changes nothing until applied", () => {
    const signal = memberCorrectTask(jane, janeTask, { cadence: "every Tuesday" });
    expect(signal.type).toBe("drift");
    const res = ingestSignals([], [signal]);
    expect(res.promoted).toHaveLength(1);
    // The pedigree is untouched at ingest.
    expect(pedigree[jane.id].tasks.delegatable[0].completion?.trigger).toBeUndefined();
  });

  it("a tools correction is flagged authority_expanding", () => {
    const signal = memberCorrectTask(jane, janeTask, { tools: ["NetSuite"] });
    expect(signal.authority_expanding).toBe(true);
  });
});
