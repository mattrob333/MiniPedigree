import { describe, it, expect } from "vitest";
import { classifyTask, generateParsed } from "../src/lib/parse";
import type { Person } from "../src/types";

describe("classifyTask", () => {
  it("classifies cleanup/summary work as delegatable", () => {
    expect(classifyTask("Clean stale forecast records").cls).toBe("delegatable");
    expect(classifyTask("Summarize forecast exceptions").cls).toBe("delegatable");
  });
  it("classifies sending/exporting as approval-required", () => {
    expect(classifyTask("Export forecast reports to Finance").cls).toBe("human_approval_required");
    expect(classifyTask("Send hygiene scorecard to managers").cls).toBe("human_approval_required");
  });
  it("classifies approvals/commitments as not delegatable", () => {
    expect(classifyTask("Approve final forecast number").cls).toBe("not_delegatable");
    expect(classifyTask("Commit company resources").cls).toBe("not_delegatable");
  });
  it("defaults unknown tasks to approval (governance-first)", () => {
    expect(classifyTask("Do the thing").cls).toBe("human_approval_required");
  });
});

describe("generateParsed", () => {
  const people: Person[] = [
    { id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager", department: "Revenue Ops", managerId: null, managerEmail: null, tools: ["Salesforce", "Slack"] },
    { id: "P-002", name: "Mark Lopez", email: "mark@x.co", title: "Account Executive", department: "Sales", managerId: "P-001", managerEmail: "jane@x.co", tools: ["Salesforce"] },
  ];

  it("produces responsibilities for every person", () => {
    const out = generateParsed(people, "");
    expect(Object.keys(out)).toHaveLength(2);
    expect(out["P-001"].responsibilities.length).toBeGreaterThan(0);
    expect(out["P-002"].responsibilities.length).toBeGreaterThan(0);
  });

  it("extracts a transcript-derived responsibility when a person is mentioned", () => {
    const out = generateParsed(people, "Jane reviews CRM changes and cleans stale forecast records every week.");
    const titles = out["P-001"].responsibilities.map((r) => r.title);
    expect(titles).toContain("From discovery input");
  });

  it("recommends MCP servers based on tools/text", () => {
    const out = generateParsed(people, "");
    const names = out["P-001"].recommended_mcp_servers?.map((m) => m.name) ?? [];
    expect(names.some((n) => n.includes("Salesforce"))).toBe(true);
  });
});
