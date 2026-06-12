import { describe, expect, it } from "vitest";
import { taskEnrichResponseSchema } from "../server/core/taskEnrich";

describe("task enrichment schema", () => {
  it("requires the full AI-drafted task spec shape", () => {
    const taskSchema = taskEnrichResponseSchema.properties.tasks.items;

    expect(taskEnrichResponseSchema.required).toEqual(["tasks"]);
    expect(taskSchema.required).toEqual([
      "taskId",
      "plainLanguageDescription",
      "suggestedInputs",
      "suggestedOutputs",
      "suggestedTools",
      "definitionOfDone",
      "openQuestions",
    ]);
    expect(Object.keys(taskSchema.properties)).toEqual(expect.arrayContaining(taskSchema.required));
    expect(taskSchema.additionalProperties).toBe(false);
  });
});
