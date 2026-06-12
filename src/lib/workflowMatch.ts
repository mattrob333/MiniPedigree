import type { Person, TaskItem, TaskSpec, WorkflowTemplate } from "@/types";

export interface WorkflowMatch {
  templateId: string;
  confidence: number;
}

function tokens(value: string | undefined): Set<string> {
  return new Set((value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits++;
  return hits / Math.max(a.size, b.size);
}

export function matchWorkflow(task: TaskItem, templates: WorkflowTemplate[]): WorkflowMatch[] {
  const completion = task.completion;
  const taskText = [
    task.label,
    task.respTitle,
    completion?.candidate_pattern,
    completion?.definition_of_done,
    ...(completion?.inputs ?? []),
    ...(completion?.outputs ?? []),
    ...(completion?.tools_mentioned ?? []),
  ].join(" ");
  const taskTokens = tokens(taskText);

  return templates
    .map((template) => {
      const templateText = [
        template.name,
        template.category,
        template.description,
        ...template.requiredInputs.map((input) => `${input.name} ${input.description} ${input.example ?? ""}`),
        ...template.requiredTools.map((tool) => `${tool.name ?? ""} ${tool.type}`),
        ...template.outputSchema.requiredSections,
        ...template.definitionOfDone,
      ].join(" ");
      const keywordScore = overlap(taskTokens, tokens(templateText));
      const toolScore = overlap(tokens((completion?.tools_mentioned ?? []).join(" ")), tokens(template.requiredTools.map((tool) => tool.name ?? tool.type).join(" ")));
      const outputScore = overlap(tokens((completion?.outputs ?? []).join(" ")), tokens([template.outputSchema.format, ...template.outputSchema.requiredSections].join(" ")));
      const confidence = Math.min(0.95, Number((keywordScore * 0.65 + toolScore * 0.2 + outputScore * 0.15).toFixed(2)));
      return { templateId: template.id, confidence };
    })
    .filter((match) => match.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence);
}

export function missingFieldsForWorkflow(task: TaskItem, template: WorkflowTemplate | undefined): string[] {
  if (!template) return ["workflow template"];
  const completion = task.completion;
  const haystack = [
    task.label,
    completion?.definition_of_done,
    ...(completion?.inputs ?? []),
    ...(completion?.outputs ?? []),
    ...(completion?.tools_mentioned ?? []),
  ].join(" ").toLowerCase();
  const missing = [
    ...template.requiredInputs.filter((input) => input.required && !haystack.includes(input.name.toLowerCase())).map((input) => input.name),
    ...template.requiredTools.filter((tool) => tool.required && tool.name && !haystack.includes(tool.name.toLowerCase())).map((tool) => tool.name as string),
  ];
  if (!completion?.definition_of_done) missing.push("definition of done");
  return Array.from(new Set(missing));
}

// ── Silent agent design ─────────────────────────────────────────────────
// The workflow library is backend machinery, not a user concept. When the
// user asks for an agent, this drafts a complete TaskSpec on the spot:
// best-matching template fields where one fits, the task's own discovery
// evidence (completion context) where stated, and conservative governed
// defaults for the rest. Human review happens on the manifest screen.

function splitDone(text: string): string[] {
  return text.split(/\n|;|\.\s+/).map((item) => item.trim()).filter(Boolean);
}

function keep(existing: string[] | undefined, ...fallbacks: (string[] | undefined)[]): string[] {
  if (existing?.length) return existing;
  for (const fb of fallbacks) if (fb?.length) return fb;
  return [];
}

export function draftTaskSpec(
  task: TaskItem,
  person: Person,
  respTitle: string,
  templates: WorkflowTemplate[],
  existing?: TaskSpec,
): TaskSpec {
  const matches = matchWorkflow(task, templates);
  const template = matches.length ? templates.find((t) => t.id === matches[0].templateId) : undefined;
  const completion = task.completion;
  const first = person.name.split(/\s+/)[0];

  const inputSources = keep(
    existing?.inputSources,
    completion?.inputs ?? undefined,
    template?.requiredInputs.map((input) => input.name),
    [`${respTitle} records named in discovery`],
  );
  const requiredTools = keep(
    existing?.requiredTools,
    completion?.tools_mentioned ?? undefined,
    template?.requiredTools.map((tool) => tool.name ?? tool.type).filter(Boolean) as string[],
    person.tools.slice(0, 3),
    ["owner's primary system"],
  );
  const definitionOfDone = keep(
    existing?.definitionOfDone,
    completion?.definition_of_done ? splitDone(completion.definition_of_done) : undefined,
    template?.definitionOfDone,
    [`"${task.label}" is produced on its agreed cadence, flags missing data instead of guessing, and is reviewed by ${first} before anything leaves the company.`],
  );
  const aiAllowedTo = keep(
    existing?.aiAllowedTo,
    template?.steps.map((step) => step.instruction),
    ["Read the named source records", "Group, compare, and summarize them", "Draft the output for human review", "Flag missing or stale data"],
  );
  const aiMustNot = keep(
    existing?.aiMustNot,
    template?.approvalPolicy.blockedActions,
    ["Send anything externally without approval", "Change records of authority", "Make commitments on the owner's behalf"],
  );
  const approvalRequiredFor = keep(
    existing?.approvalRequiredFor,
    template?.approvalPolicy.approvalRequiredFor,
    [`${first} approves before the output is sent, published, or acted on`],
  );
  const testCases = existing?.testCases?.length
    ? existing.testCases
    : template?.evalTests?.length
      ? template.evalTests
      : [{
          name: "sample run with a gap",
          inputExample: `A typical batch of ${respTitle.toLowerCase()} source data including one record with missing fields`,
          expectedOutput: "Output follows the definition of done and flags the missing fields instead of guessing.",
        }];

  return {
    id: existing?.id ?? `SPEC-${task.id}`,
    name: existing?.name ?? task.label,
    plainLanguageDescription:
      existing?.plainLanguageDescription?.trim()
      || task.description?.trim()
      || (template ? `${template.description} Owned by ${person.name} under "${respTitle}".` : `${task.label} for ${person.name} under "${respTitle}".`),
    ownerId: person.id,
    parentResponsibilityId: task.respId,
    trigger: existing?.trigger ?? (completion?.cadence ? "scheduled" : "manual"),
    ...(existing?.cadence ?? completion?.cadence ? { cadence: existing?.cadence ?? completion?.cadence ?? undefined } : {}),
    inputSources,
    requiredTools,
    outputFormat: existing?.outputFormat?.trim()
      || (completion?.outputs?.length ? completion.outputs.join("; ") : template?.outputSchema.format ?? "internal brief for the owner"),
    ...(existing?.recipient ? { recipient: existing.recipient } : {}),
    definitionOfDone,
    aiAllowedTo,
    aiMustNot,
    approvalRequiredFor,
    ...(existing?.businessKpi ? { businessKpi: existing.businessKpi } : {}),
    ...(existing?.operationalMetric ? { operationalMetric: existing.operationalMetric } : {}),
    evidenceIds: existing?.evidenceIds?.length ? existing.evidenceIds : task.provenance?.evidence_quote || task.evidence ? [task.id] : [],
    ...(template ? { workflowTemplateId: template.id, workflowMatchConfidence: matches[0].confidence } : existing?.workflowTemplateId ? { workflowTemplateId: existing.workflowTemplateId } : {}),
    testCases,
    readiness: "agent_ready",
  };
}
