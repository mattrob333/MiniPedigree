import type { TaskItem, WorkflowTemplate } from "@/types";

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
