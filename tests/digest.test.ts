import { describe, it, expect } from "vitest";
import { applyDigestSelections, buildDigest, signalToProposal, withOwner } from "../src/lib/digest";
import { ingestSignals } from "../src/lib/signalLedger";
import { memberCorrectTask, memberRetireTask } from "../src/lib/memberSignals";
import { runMaintenanceParseDeterministic } from "../src/lib/maintenance";
import { buildCompactStackState } from "../src/lib/meetings";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { compileAgent } from "../src/lib/runtimes";
import { upsertCompiledVersion } from "../src/lib/registry";
import { taskFreshness, DEFAULT_FRESHNESS_CONFIG } from "../src/lib/freshness";
import { collectStaleItems } from "../src/lib/freshness";
import { buildRecommendations } from "../src/lib/optimizer";
import type { PedigreeState, Person, StackSignal, TaskItem } from "../src/types";

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "RevOps Manager",
  department: "Revenue Ops", managerId: null, tools: ["Salesforce"], lifecycle: "active",
};
const janeTask: TaskItem = { id: "T-001", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };

function makePedigree(): PedigreeState {
  return {
    [jane.id]: {
      status: "ready",
      responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
      tasks: { delegatable: [janeTask], approval: [], not_delegatable: [] },
      agents: [],
    },
  };
}

function makeRegistry() {
  const row = makePedigree()[jane.id];
  const buildCtx = { person: jane, row, task: janeTask, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const };
  const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
  const compiled = compileAgent({ agent, runtime: "pedigree", mcpLibrary: [] });
  return upsertCompiledVersion([], compiled, []);
}

describe("buildDigest", () => {
  it("puts rule changes and authority-expanding items in the top section", () => {
    const stackState = buildCompactStackState([jane], makePedigree(), [], []);
    const parsed = runMaintenanceParseDeterministic({
      transcript: "From now on Finance must approve all refunds above $250. Jane cleaned the stale forecast records on Monday.",
      transcriptId: "T-1", participantIds: [jane.id], stackState,
    });
    const { ledger } = ingestSignals([], parsed);
    const digest = buildDigest({ ledger, people: [jane], pedigree: makePedigree(), registry: [] });
    expect(digest.rule_and_authority.length).toBeGreaterThan(0);
    expect(digest.free_wins.confirmations).toBeGreaterThan(0);
  });

  it("authority-expanding member corrections land in the warning section", () => {
    const { ledger } = ingestSignals([], [memberCorrectTask(jane, janeTask, { tools: ["NetSuite"] })]);
    const digest = buildDigest({ ledger, people: [jane], pedigree: makePedigree(), registry: [] });
    expect(digest.rule_and_authority).toHaveLength(1);
    expect(digest.drift).toHaveLength(0);
  });

  it("candidates without an owner are marked needs_owner", () => {
    const orphan: StackSignal = {
      id: "SIG-X", type: "new_candidate",
      source: { kind: "meeting", meeting_id: "M", transcript_id: "T-9" },
      evidence_quote: "Every week someone compiles the churn digest.",
      confidence: 0.6,
      refs: { person_ids: [], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [] },
      proposed_patch: { kind: "new_candidate", label: "Compile churn digest", recurrence_language: true },
      authority_expanding: false, captured_at: new Date().toISOString(), status: "ledgered",
    };
    const { ledger } = ingestSignals([], [orphan]);
    const digest = buildDigest({ ledger, people: [jane], pedigree: makePedigree(), registry: [] });
    expect(digest.candidates[0].needs_owner).toBe(true);
    expect(digest.candidates[0].proposal).toBeNull();
    // Assigning an owner makes it applicable.
    const owned = signalToProposal(withOwner(digest.candidates[0].signal, jane.id), [jane], makePedigree());
    expect(owned?.type).toBe("new_task");
  });
});

describe("applyDigestSelections", () => {
  it("applies drift through the shared path: audit record, stale agents, freshness", () => {
    const registry = makeRegistry();
    const { ledger } = ingestSignals([], [memberCorrectTask(jane, janeTask, { cadence: "every Tuesday" }, [registry[0].agent_id])]);
    const result = applyDigestSelections({
      signalIds: ledger.filter((s) => s.status === "proposed").map((s) => s.id),
      ledger, approver: "op@x.co",
      people: [jane], pedigree: makePedigree(), registry, auditLog: [], backlog: [],
    });
    expect(result.applied).toBe(1);
    expect(result.auditLog).toHaveLength(1);
    expect(result.auditLog[0].approver).toBe("op@x.co");
    expect(result.registry[0].stale).toBe(true);
    const task = result.pedigree[jane.id].tasks.delegatable[0];
    expect(task.completion?.trigger).toBe("every Tuesday");
    expect(taskFreshness(task, DEFAULT_FRESHNESS_CONFIG)).toBe("fresh");
    expect(result.ledger.every((s) => s.status === "applied")).toBe(true);
  });

  it("retirement removes the task and retires the agent", () => {
    const registry = makeRegistry();
    const { ledger } = ingestSignals([], [memberRetireTask(jane, janeTask, [registry[0].agent_id])]);
    const result = applyDigestSelections({
      signalIds: ledger.map((s) => s.id),
      ledger, approver: "op@x.co",
      people: [jane], pedigree: makePedigree(), registry, auditLog: [], backlog: [],
    });
    expect(result.pedigree[jane.id].tasks.delegatable).toHaveLength(0);
    expect(result.registry[0].status).toBe("retired");
  });

  it("nothing applies without selection", () => {
    const { ledger } = ingestSignals([], [memberCorrectTask(jane, janeTask, { cadence: "daily" })]);
    const result = applyDigestSelections({
      signalIds: [], ledger, approver: "op@x.co",
      people: [jane], pedigree: makePedigree(), registry: [], auditLog: [], backlog: [],
    });
    expect(result.applied).toBe(0);
    expect(result.pedigree[jane.id].tasks.delegatable[0].completion?.trigger).toBeUndefined();
  });
});

describe("freshness + optimizer", () => {
  it("an agent whose task went stale is flagged", () => {
    const registry = makeRegistry();
    const stale = collectStaleItems([jane], makePedigree(), registry); // never confirmed → stale
    expect(stale.some((i) => i.kind === "task" && i.id === "T-001")).toBe(true);
    expect(stale.some((i) => i.kind === "agent" && i.label.includes("underlying task is stale"))).toBe(true);
  });

  it("optimizer ranks corroborated, painful candidates highest", () => {
    const candidate = (transcriptId: string, quote: string): StackSignal => ({
      id: `SIG-${transcriptId}`, type: "new_candidate",
      source: { kind: "meeting", meeting_id: "M", transcript_id: transcriptId },
      evidence_quote: quote, confidence: 0.6,
      refs: { person_ids: [jane.id], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [] },
      proposed_patch: { kind: "new_candidate", label: "Compile churn digest for the exec team", recurrence_language: true },
      authority_expanding: false, captured_at: new Date().toISOString(), status: "ledgered",
    });
    const a = ingestSignals([], [candidate("T-1", "Compiling the churn digest takes forever, it's all manual.")]);
    const b = ingestSignals(a.ledger, [candidate("T-2", "The churn digest again — every single week.")]);
    const recs = buildRecommendations({ ledger: b.ledger, registry: [], people: [jane], pedigree: makePedigree(), mcpLibrary: [] });
    const build = recs.find((r) => r.kind === "build_candidate")!;
    expect(build.score_breakdown.corroborations).toBe(2);
    expect(build.score_breakdown.pain_weight).toBeGreaterThan(1);
    expect(build.evidence.length).toBe(2);
  });

  it("repeated agent feedback proposes a scope tune", () => {
    const registry = makeRegistry();
    const feedback = (id: string): StackSignal => ({
      id, type: "agent_feedback",
      source: { kind: "meeting", meeting_id: "M", transcript_id: id },
      evidence_quote: "The forecast agent's summary missed the renewals again.",
      confidence: 0.6,
      refs: { person_ids: [jane.id], task_ids: [], agent_ids: [registry[0].agent_id], rule_ids: [], backlog_ids: [] },
      authority_expanding: false, captured_at: new Date().toISOString(), status: "proposed",
    });
    const recs = buildRecommendations({ ledger: [feedback("S-1"), feedback("S-2")], registry, people: [jane], pedigree: makePedigree(), mcpLibrary: [] });
    expect(recs.some((r) => r.kind === "scope_tune")).toBe(true);
  });
});
