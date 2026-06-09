import { describe, it, expect } from "vitest";
import { applyStackProposals, runStackDiffDeterministic } from "../src/lib/stackSync";
import { extractGovernanceRulesDeterministic } from "../src/lib/governance";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { compileAgent } from "../src/lib/runtimes";
import { upsertCompiledVersion } from "../src/lib/registry";
import type { AgentRegistryEntry, ParsedMap, PedigreeState, Person, StackChangeProposal, TaskItem } from "../src/types";

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: "vp@x.co", tools: ["Salesforce"],
};
const bob: Person = {
  id: "P-002", name: "Bob Lee", email: "bob@x.co", title: "Finance Analyst",
  department: "Finance", managerId: null, managerEmail: null, tools: ["Looker"],
};
const people = [jane, bob];

const janeTask: TaskItem = {
  id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene",
  completion: { trigger: "weekly", inputs: null, outputs: null, tools_mentioned: ["Salesforce"], definition_of_done: null, readiness: "ready", open_questions: null, candidate_pattern: null },
};

function makePedigree(): PedigreeState {
  return {
    [jane.id]: {
      status: "generated",
      responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
      tasks: { delegatable: [janeTask], approval: [], not_delegatable: [] },
      agents: [],
    },
    [bob.id]: {
      status: "mapped",
      responsibilities: [{ id: "R-002", title: "Financial reporting" }],
      tasks: { delegatable: [{ id: "R-002-d-0", label: "Compile aging report", respId: "R-002", respTitle: "Financial reporting" }], approval: [], not_delegatable: [] },
      agents: [],
    },
  };
}

function makeRegistry(): AgentRegistryEntry[] {
  const row = makePedigree()[jane.id];
  const buildCtx = { person: jane, row, task: janeTask, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const };
  const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
  const compiled = compileAgent({ agent, runtime: "pedigree", mcpLibrary: [] });
  return upsertCompiledVersion([], compiled, []);
}

function parsedWith(personId: string, respTitle: string, tasks: { delegatable?: string[]; approval?: string[] }, details?: ParsedMap[string]["responsibilities"][number]["taskDetails"]): ParsedMap {
  return {
    [personId]: {
      summary: "",
      responsibilities: [{
        id: "RX-001",
        title: respTitle,
        tasks: { delegatable: tasks.delegatable ?? [], approval: tasks.approval ?? [], not_delegatable: [] },
        taskDetails: details,
      }],
    },
  };
}

describe("runStackDiffDeterministic", () => {
  it("proposes new_task for unknown work on a mapped person", () => {
    const proposals = runStackDiffDeterministic({
      parsed: parsedWith(jane.id, "Forecast hygiene", { delegatable: ["Reconcile partner rebate spreadsheets"] }),
      transcript: "Jane now reconciles partner rebate spreadsheets every month.",
      people, pedigree: makePedigree(), registry: [], rules: [],
    });
    const p = proposals.find((x) => x.type === "new_task");
    expect(p).toBeDefined();
    expect(p!.affected.person_ids).toEqual([jane.id]);
    expect(p!.authority_expanding).toBe(false);
    expect(p!.evidence_quote).toBeTruthy();
  });

  it("proposes task_changed with affected agents when cadence changes on a similar task", () => {
    const registry = makeRegistry();
    const proposals = runStackDiffDeterministic({
      parsed: parsedWith(jane.id, "Forecast hygiene", { delegatable: ["Clean stale forecast records"] }, [{
        name: "Clean stale forecast records", delegation_class: "delegatable", risk_level: "low", requires_human_approval: false,
        trigger: "daily", inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: "ready", open_questions: null, candidate_pattern: null,
      }]),
      transcript: "Jane cleans stale forecast records daily now.",
      people, pedigree: makePedigree(), registry, rules: [],
    });
    const p = proposals.find((x) => x.type === "task_changed");
    expect(p).toBeDefined();
    expect(p!.summary).toContain("cadence");
    expect(p!.affected.agent_ids).toEqual([registry[0].agent_id]);
  });

  it("flags authority expansion when a task moves toward delegatable or adds tools", () => {
    const classExpand = runStackDiffDeterministic({
      parsed: parsedWith(bob.id, "Financial reporting", { delegatable: ["Compile aging report"] }, [{
        name: "Compile aging report", delegation_class: "delegatable", risk_level: "low", requires_human_approval: false,
        trigger: null, inputs: null, outputs: null, tools_mentioned: ["NetSuite"], definition_of_done: null, readiness: null, open_questions: null, candidate_pattern: null,
      }]),
      transcript: "Bob compiles the aging report with NetSuite.",
      people, pedigree: makePedigree(), registry: [], rules: [],
    });
    const toolAdd = classExpand.find((x) => x.type === "task_changed");
    expect(toolAdd).toBeDefined();
    expect(toolAdd!.authority_expanding).toBe(true); // new tool added

    const moveToApproval = runStackDiffDeterministic({
      parsed: parsedWith(jane.id, "Forecast hygiene", { approval: ["Clean stale forecast records"] }),
      transcript: "Cleaning forecast records now needs sign-off.",
      people, pedigree: makePedigree(), registry: [], rules: [],
    });
    const restricted = moveToApproval.find((x) => x.type === "task_changed");
    expect(restricted).toBeDefined();
    expect(restricted!.authority_expanding).toBe(false); // tightening is not expansion
  });

  it("proposes ownership_transfer (always authority-expanding) when a task moves between people", () => {
    const registry = makeRegistry();
    const proposals = runStackDiffDeterministic({
      parsed: parsedWith(bob.id, "Forecast hygiene", { delegatable: ["Clean stale forecast records"] }),
      transcript: "Bob is taking over cleaning stale forecast records from Jane.",
      people, pedigree: makePedigree(), registry, rules: [],
    });
    const p = proposals.find((x) => x.type === "ownership_transfer");
    expect(p).toBeDefined();
    expect(p!.authority_expanding).toBe(true);
    expect(p!.affected.person_ids.sort()).toEqual([jane.id, bob.id].sort());
    expect(p!.affected.agent_ids).toEqual([registry[0].agent_id]);
  });

  it("proposes rule_changed for rule-shaped sentences not in the current rule set", () => {
    const proposals = runStackDiffDeterministic({
      parsed: {},
      transcript: "From now on Finance signs off on all refunds.",
      people, pedigree: makePedigree(), registry: [], rules: [],
    });
    const p = proposals.find((x) => x.type === "rule_changed");
    expect(p).toBeDefined();
    expect(p!.evidence_quote).toContain("Finance signs off");
  });

  it("skips rule_changed when the rule already exists", () => {
    const rules = extractGovernanceRulesDeterministic({ approvalRules: ["From now on Finance signs off on all refunds."] });
    const proposals = runStackDiffDeterministic({
      parsed: {},
      transcript: "From now on Finance signs off on all refunds.",
      people, pedigree: makePedigree(), registry: [], rules,
    });
    expect(proposals.filter((x) => x.type === "rule_changed")).toHaveLength(0);
  });

  it("excludes retired agents from diffs", () => {
    const registry = makeRegistry().map((e) => ({ ...e, status: "retired" as const }));
    const proposals = runStackDiffDeterministic({
      parsed: parsedWith(jane.id, "Forecast hygiene", { delegatable: ["Clean stale forecast records"] }, [{
        name: "Clean stale forecast records", delegation_class: "delegatable", risk_level: "low", requires_human_approval: false,
        trigger: "daily", inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: null, open_questions: null, candidate_pattern: null,
      }]),
      transcript: "Jane stopped cleaning stale forecast records. The Forecast Cleanup Agent did great.",
      people, pedigree: makePedigree(), registry, rules: [],
    });
    for (const p of proposals) {
      expect(p.affected.agent_ids).toHaveLength(0);
    }
    expect(proposals.filter((p) => p.type === "retire_candidate")).toHaveLength(0);
    expect(proposals.filter((p) => p.type === "agent_feedback")).toHaveLength(0);
  });

  it("proposes retire_candidate and agent_feedback for active agents", () => {
    const registry = makeRegistry();
    const proposals = runStackDiffDeterministic({
      parsed: {},
      transcript: "Jane no longer cleans stale forecast records. The Forecast Cleanup Agent has been flagging the wrong fields.",
      people, pedigree: makePedigree(), registry, rules: [],
    });
    expect(proposals.some((p) => p.type === "retire_candidate" && p.affected.agent_ids.includes(registry[0].agent_id))).toBe(true);
    expect(proposals.some((p) => p.type === "agent_feedback" && p.affected.agent_ids.includes(registry[0].agent_id))).toBe(true);
  });
});

describe("applyStackProposals", () => {
  const baseProposal = (over: Partial<StackChangeProposal>): StackChangeProposal => ({
    id: "SCP-test-1",
    type: "new_task",
    summary: "test",
    evidence_quote: "the transcript sentence",
    transcript_id: "T-1",
    confidence: 0.8,
    affected: { person_ids: [jane.id], agent_ids: [], rule_ids: [] },
    authority_expanding: false,
    proposed_patch: null,
    ...over,
  });

  it("applies nothing without a decision record", () => {
    const proposal = baseProposal({
      proposed_patch: { kind: "new_task", personId: jane.id, respTitle: "Forecast hygiene", label: "New work", delegation_class: "delegatable" },
    });
    const out = applyStackProposals({ proposals: [proposal], approver: "ceo@x.co", people, pedigree: makePedigree(), registry: [], auditLog: [] });
    expect(out.applied).toBe(0);
    expect(out.auditLog).toHaveLength(0);
    expect(out.pedigree[jane.id].tasks.delegatable).toHaveLength(1);
  });

  it("a rule_changed application updates company context and marks every affected agent stale", () => {
    const registry = makeRegistry();
    const rule = extractGovernanceRulesDeterministic({ approvalRules: ["Forecast record exports must be approved by the manager."] })[0];
    const proposal = baseProposal({
      type: "rule_changed",
      affected: { person_ids: [jane.id], agent_ids: [registry[0].agent_id], rule_ids: [rule.rule_id] },
      proposed_patch: { kind: "rule_changed", rule },
      decision: { by: "ceo@x.co", at: "2026-06-09T00:00:00.000Z", action: "applied" },
    });
    const out = applyStackProposals({
      proposals: [proposal], approver: "ceo@x.co", people,
      pedigree: makePedigree(), companyContext: { company: "X", whatWeDo: "" }, registry, auditLog: [],
    });
    expect(out.applied).toBe(1);
    expect(out.companyContext?.approvalRules).toContain(rule.evidence_quote);
    expect(out.registry[0].stale).toBe(true);
    expect(out.auditLog).toHaveLength(1);
    expect(out.auditLog[0].approver).toBe("ceo@x.co");
    expect(out.auditLog[0].evidence_quote).toBe("the transcript sentence");
  });

  it("retire_candidate sets the registry entry to retired", () => {
    const registry = makeRegistry();
    const proposal = baseProposal({
      type: "retire_candidate",
      affected: { person_ids: [jane.id], agent_ids: [registry[0].agent_id], rule_ids: [] },
      proposed_patch: { kind: "retire_candidate", agentIds: [registry[0].agent_id] },
      decision: { by: "ceo@x.co", at: "2026-06-09T00:00:00.000Z", action: "applied" },
    });
    const out = applyStackProposals({ proposals: [proposal], approver: "ceo@x.co", people, pedigree: makePedigree(), registry, auditLog: [] });
    expect(out.registry[0].status).toBe("retired");
    expect(out.auditLog).toHaveLength(1);
  });

  it("new_task application is idempotent against existing labels", () => {
    const proposal = baseProposal({
      proposed_patch: { kind: "new_task", personId: jane.id, respTitle: "Forecast hygiene", label: "Clean stale forecast records", delegation_class: "delegatable" },
      decision: { by: "ceo@x.co", at: "2026-06-09T00:00:00.000Z", action: "applied" },
    });
    const out = applyStackProposals({ proposals: [proposal], approver: "ceo@x.co", people, pedigree: makePedigree(), registry: [], auditLog: [] });
    expect(out.pedigree[jane.id].tasks.delegatable).toHaveLength(1);
  });
});
