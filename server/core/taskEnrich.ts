import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";

const SYSTEM_PROMPT = `You enrich reviewed Pedigree tasks into fuller task specs.

Rules:
1. Ground every field in the provided task, reviewer notes, evidence, and company context.
2. Do not invent unknown systems, recipients, cadence, or completion criteria.
3. When a detail is unknown, put a concise question in openQuestions.
4. The output is AI-drafted. It is not human-confirmed.`;

export const taskEnrichResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "string" },
          plainLanguageDescription: { type: "string" },
          suggestedInputs: { type: "array", items: { type: "string" } },
          suggestedOutputs: { type: "array", items: { type: "string" } },
          suggestedTools: { type: "array", items: { type: "string" } },
          definitionOfDone: { type: "array", items: { type: "string" } },
          openQuestions: { type: "array", items: { type: "string" } },
        },
        required: ["taskId", "plainLanguageDescription", "suggestedInputs", "suggestedOutputs", "suggestedTools", "definitionOfDone", "openQuestions"],
      },
    },
  },
  required: ["tasks"],
} as const;

export interface TaskEnrichInput {
  tasks?: unknown[];
  company_context?: unknown;
}

export interface EnrichedTaskDraft {
  taskId: string;
  plainLanguageDescription: string;
  suggestedInputs: string[];
  suggestedOutputs: string[];
  suggestedTools: string[];
  definitionOfDone: string[];
  openQuestions: string[];
}

export type TaskEnrichResult =
  | { mode: "ai"; tasks: EnrichedTaskDraft[] }
  | { mode: "unavailable"; reason: string };

export async function runTaskEnrich({ tasks, company_context }: TaskEnrichInput): Promise<TaskEnrichResult> {
  if (!openaiEnabled) return { mode: "unavailable", reason: "OPENAI_API_KEY not configured" };
  if (!Array.isArray(tasks) || tasks.length === 0) return { mode: "unavailable", reason: "No tasks provided" };

  const out = await callStructured<{ tasks: EnrichedTaskDraft[] }>({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({ tasks, company_context }),
    schemaName: "task_enrichment",
    schema: taskEnrichResponseSchema,
  });
  return { mode: "ai", tasks: out.tasks };
}
