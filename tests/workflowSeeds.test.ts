import { describe, it, expect } from "vitest";
import { GLOBAL_WORKFLOW_TEMPLATES } from "../src/lib/workflowSeeds";

describe("global workflow template library", () => {
  it("ships the full seed set (10-15 templates)", () => {
    expect(GLOBAL_WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(GLOBAL_WORKFLOW_TEMPLATES.length).toBeLessThanOrEqual(15);
  });

  it("every template is fully populated and globally scoped", () => {
    const ids = new Set<string>();
    for (const t of GLOBAL_WORKFLOW_TEMPLATES) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.scope).toBe("global");
      expect(t.requiredInputs.length, `${t.id} requiredInputs`).toBeGreaterThan(0);
      expect(t.requiredTools.length, `${t.id} requiredTools`).toBeGreaterThan(0);
      expect(t.steps.length, `${t.id} steps`).toBeGreaterThanOrEqual(2);
      expect(t.outputSchema.requiredSections.length, `${t.id} sections`).toBeGreaterThan(0);
      expect(t.definitionOfDone.length, `${t.id} definitionOfDone`).toBeGreaterThan(0);
      expect(t.evalTests.length, `${t.id} evalTests`).toBeGreaterThan(0);
      expect(t.missingInfoQuestions.length, `${t.id} missingInfoQuestions`).toBeGreaterThan(0);
      expect(t.approvalPolicy.approvalRequiredFor.length, `${t.id} approvalRequiredFor`).toBeGreaterThan(0);
      expect(t.approvalPolicy.blockedActions.length, `${t.id} blockedActions`).toBeGreaterThan(0);
    }
  });

  it("steps are ordered sequentially from 1", () => {
    for (const t of GLOBAL_WORKFLOW_TEMPLATES) {
      const orders = t.steps.map((s) => s.order);
      expect(orders, `${t.id} step order`).toEqual(orders.map((_, i) => i + 1));
    }
  });
});
