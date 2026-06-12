import { describe, expect, it } from "vitest";
import type { AgentRecord, Person, TaskItem, TaskSpec } from "../src/types";
import { deriveOperationalState, missingBirthCertificateFields, taskActionLabel } from "../src/lib/taskState";

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
    expect(taskActionLabel("workflow_needed")).toBe("Design workflow");
  });

  it("recognizes matched workflows separately from complete specs", () => {
    expect(deriveOperationalState({ ...task, workflowTemplateId: "wf-claims-summary" })).toBe("workflow_matched");
    expect(taskActionLabel("workflow_matched")).toBe("Complete task spec");
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
