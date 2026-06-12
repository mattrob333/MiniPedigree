import type { AgentRecord, TaskItem, TaskOperationalState, TaskSpec } from "@/types";

export function isTaskSpecWorkflowDesigned(spec: TaskSpec | undefined): boolean {
  if (!spec) return false;
  return Boolean(
    spec.inputSources.length
      && spec.requiredTools.length
      && spec.outputFormat.trim()
      && spec.definitionOfDone.length
      && (spec.aiAllowedTo.length || spec.aiMustNot.length)
      && spec.approvalRequiredFor.length,
  );
}

export function isTaskSpecAgentReady(spec: TaskSpec | undefined): boolean {
  return Boolean(isTaskSpecWorkflowDesigned(spec) && spec?.testCases?.length);
}

export function deriveOperationalState(task: TaskItem, spec?: TaskSpec, agent?: AgentRecord): TaskOperationalState {
  const lifecycle = String((agent?.manifest as Record<string, unknown> | undefined)?.status ?? "").toLowerCase();
  const exported = Boolean(agent && ["approved", "deployed", "exported"].includes(lifecycle));
  if (exported) return "exported";
  if (agent) return "agent_generated";
  if (isTaskSpecAgentReady(spec)) return "agent_ready";
  if (isTaskSpecWorkflowDesigned(spec)) return "workflow_designed";
  if (task.workflowTemplateId || spec?.workflowTemplateId || task.operationalState === "workflow_matched") return "workflow_matched";
  if (task.operationalState === "workflow_needed" || task.completion || task.provenance) return "workflow_needed";
  return "classified";
}

export function taskActionLabel(state: TaskOperationalState): string {
  switch (state) {
    case "agent_ready":
      return "Create agent";
    case "agent_generated":
    case "exported":
      return "View agent";
    case "workflow_matched":
      return "Complete task spec";
    case "workflow_designed":
      return "Add test";
    case "classified":
    case "workflow_needed":
    case "extracted":
    default:
      return "Design workflow";
  }
}

export function missingBirthCertificateFields(task: TaskItem, spec?: TaskSpec): string[] {
  const missing: string[] = [];
  if (!spec?.ownerId) missing.push("human owner");
  if (!spec?.parentResponsibilityId && !task.respId) missing.push("parent responsibility");
  if (!spec?.plainLanguageDescription && !task.label) missing.push("specific task");
  if (!spec?.workflowTemplateId && !task.workflowTemplateId) missing.push("workflow template or custom spec");
  if (!spec?.inputSources.length) missing.push("required inputs");
  if (!spec?.requiredTools.length) missing.push("required tools");
  if (!spec?.outputFormat) missing.push("output format");
  if (!spec?.definitionOfDone.length) missing.push("definition of done");
  if (!spec?.approvalRequiredFor.length) missing.push("approval boundary");
  if (!spec?.evidenceIds.length && !task.evidence && !task.provenance?.evidence_quote) missing.push("evidence");
  if (!spec?.testCases?.length) missing.push("test case");
  return missing;
}
