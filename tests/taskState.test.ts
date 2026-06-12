import { describe, expect, it } from "vitest";
import type { AgentRecord, Person, TaskItem, TaskSpec } from "../src/types";
import { deriveOperationalState, missingBirthCertificateFields, taskActionLabel } from "../src/lib/taskState";
import { draftTaskSpec } from "../src/lib/workflowMatch";
import { GLOBAL_WORKFLOW_TEMPLATES } from "../src/lib/workflowSeeds";

const person: Person = {
  id: "p1",
  name: "Morgan Hayes",
  email: "morgan@example.com",
  title: "VP Revenue",
  managerId: null,
  department: "Revenue",
  tools: ["Salesforce"],
};

const task: TaskItem = {
  id: "t1",
  label: "Summarize open customer claims",
  respId: "r1",
  respTitle: "Revenue cycle operations",
  evidence: "Morgan needs a weekly claims brief.",
  completion: {
    trigger: "weekly",
    inputs: ["claims records"],
    outputs: ["weekly brief"],
    tools_mentioned: ["Salesforce"],
    definition_of_done: "Includes count, value, aging, exceptions, and approvals needed.",
    readiness: "needs_clarification",
    open_questions: [],
    candidate_pattern: "claims summary",
  },
  operationalState: "workflow_needed",
};

const designedSpec: TaskSpec = {
  id: task.id,
  name: task.label,
  plainLanguageDescription: "Summarize open customer claims into a weekly revenue-risk brief.",
  ownerId: person.id,
  parentResponsibilityId: task.respId,
  trigger: "scheduled",
  cadence: "weekly",
  inputSources: ["Salesforce claims"],
  requiredTools: ["Salesforce"],
  outputFormat: "Weekly claims brief",
  definitionOfDone: ["Includes count", "Includes aging", "Flags missing data"],
  aiAllowedTo: ["read claims", "draft internal brief"],
  aiMustNot: ["approve claims"],
  approvalRequiredFor: ["sending brief", "approving claims"],
  evidenceIds: ["ev1"],
  workflowTemplateId: "wf-claims-summary",
  readiness: "workflow_matched",
};

describe("taskState", () => {
  it("keeps classified candidates below agent-ready until a workflow is complete", () => {
    expect(deriveOperationalState(task)).toBe("workflow_needed");
    expect(taskActionLabel("workflow_needed")).toBe("Design agent");
  });

  it("recognizes matched workflows separately from complete specs", () => {
    expect(deriveOperationalState({ ...task, workflowTemplateId: "wf-claims-summary" })).toBe("workflow_matched");
    expect(taskActionLabel("workflow_matched")).toBe("Design agent");
  });

  it("requires a test case before agent_ready", () => {
    expect(deriveOperationalState(task, designedSpec)).toBe("workflow_designed");
    expect(deriveOperationalState(task, { ...designedSpec, testCases: [{ name: "sample", inputExample: "10 claims", expectedOutput: "brief with exceptions" }] })).toBe("agent_ready");
  });

  it("agent records advance the state after generation/export", () => {
    const agent = { id: "a1", name: "Claims Agent", taskId: task.id, respId: task.respId, respTitle: task.respTitle, policy: "read-only", riskLevel: "low", person, task, createdAt: "now", manifest: { status: "draft" } } satisfies AgentRecord;
    expect(deriveOperationalState(task, designedSpec, agent)).toBe("agent_generated");
    expect(deriveOperationalState(task, designedSpec, { ...agent, manifest: { status: "exported" } })).toBe("exported");
  });

  it("reports missing birth-certificate fields", () => {
    expect(missingBirthCertificateFields(task)).toEqual(expect.arrayContaining(["workflow template or custom spec", "required inputs", "required tools", "test case"]));
  });
});

describe("draftTaskSpec (silent agent design)", () => {
  it("always produces an agent-ready spec, even from a bare task", () => {
    const bare: TaskItem = { id: "t9", label: "Track quarterly objectives", respId: "r9", respTitle: "Leadership operating cadence" };
    const spec = draftTaskSpec(bare, person, "Leadership operating cadence", GLOBAL_WORKFLOW_TEMPLATES);
    expect(deriveOperationalState(bare, spec)).toBe("agent_ready");
    expect(spec.testCases?.length).toBeGreaterThan(0);
    expect(spec.approvalRequiredFor.length).toBeGreaterThan(0);
    expect(spec.aiMustNot.length).toBeGreaterThan(0);
  });

  it("prefers the task's own discovery evidence over template defaults", () => {
    const spec = draftTaskSpec(task, person, task.respTitle, GLOBAL_WORKFLOW_TEMPLATES);
    expect(spec.inputSources).toEqual(["claims records"]);
    expect(spec.requiredTools).toEqual(["Salesforce"]);
    expect(spec.definitionOfDone.join(" ")).toContain("aging");
    expect(deriveOperationalState(task, spec)).toBe("agent_ready");
  });

  it("never overwrites human-entered spec fields", () => {
    const existing = draftTaskSpec(task, person, task.respTitle, GLOBAL_WORKFLOW_TEMPLATES);
    existing.definitionOfDone = ["Human-edited done state"];
    existing.plainLanguageDescription = "Human-edited description";
    const redrafted = draftTaskSpec(task, person, task.respTitle, GLOBAL_WORKFLOW_TEMPLATES, existing);
    expect(redrafted.definitionOfDone).toEqual(["Human-edited done state"]);
    expect(redrafted.plainLanguageDescription).toBe("Human-edited description");
  });
});
