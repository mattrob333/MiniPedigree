import { describe, it, expect } from "vitest";
import { computeChangeset, applyOrgSync } from "../src/lib/orgSync";
import type { ParsedMap, PedigreeState, Person } from "../src/types";

const people: Person[] = [
  { id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Ops Manager", department: "Revenue Ops", managerId: null, managerEmail: null, tools: [] },
  { id: "P-002", name: "Tom Reid", email: "tom@x.co", title: "Analyst", department: "Revenue Ops", managerId: "P-001", managerEmail: "jane@x.co", tools: [] },
];

function pedigreeWithJaneOwningTask(): PedigreeState {
  return {
    "P-001": {
      status: "ready",
      responsibilities: [{ id: "R-1", title: "Forecast hygiene" }],
      tasks: {
        delegatable: [{ id: "R-1-d-0", label: "Compile weekly variance summary", respId: "R-1", respTitle: "Forecast hygiene" }],
        approval: [],
        not_delegatable: [],
      },
      agents: [],
    },
    "P-002": {
      status: "needs-discovery",
      responsibilities: [],
      tasks: { delegatable: [], approval: [], not_delegatable: [] },
      agents: [],
    },
  };
}

describe("org sync reassignment", () => {
  it("moves a reassigned task to the new owner and removes it from the previous owner", () => {
    const pedigree = pedigreeWithJaneOwningTask();
    const parsed: ParsedMap = {
      "P-002": {
        summary: "Tom now owns the weekly variance summary.",
        responsibilities: [
          {
            id: "X-1",
            title: "Reporting & analysis",
            tasks: { delegatable: ["Compile weekly variance summary"], approval: [], not_delegatable: [] },
          },
        ],
      },
    };

    const changeset = computeChangeset(people, pedigree, parsed);
    expect(changeset.summary.reassignments).toBe(1);
    expect(changeset.deltas[0].reassignedFrom[0].fromPersonId).toBe("P-001");

    const next = applyOrgSync(people, pedigree, parsed, changeset, new Set(["P-002"]));
    const tomTasks = next["P-002"].tasks.delegatable.map((t) => t.label);
    const janeTasks = next["P-001"].tasks.delegatable.map((t) => t.label);
    expect(tomTasks).toContain("Compile weekly variance summary");
    expect(janeTasks).not.toContain("Compile weekly variance summary");
  });

  it("leaves the previous owner untouched when the delta is not approved", () => {
    const pedigree = pedigreeWithJaneOwningTask();
    const parsed: ParsedMap = {
      "P-002": {
        summary: "",
        responsibilities: [
          { id: "X-1", title: "Reporting & analysis", tasks: { delegatable: ["Compile weekly variance summary"], approval: [], not_delegatable: [] } },
        ],
      },
    };
    const changeset = computeChangeset(people, pedigree, parsed);
    const next = applyOrgSync(people, pedigree, parsed, changeset, new Set());
    expect(next["P-001"].tasks.delegatable).toHaveLength(1);
    expect(next["P-002"].tasks.delegatable).toHaveLength(0);
  });
});
