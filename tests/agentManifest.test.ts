import { describe, it, expect } from "vitest";
import { buildAgentArtifacts } from "../src/lib/agent";
import type { PedigreeRow, Person, TaskItem } from "../src/types";

const person: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: null, tools: ["Salesforce", "Slack"],
};

const task: TaskItem = { id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };

const row: PedigreeRow = {
  status: "ready",
  responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
  tasks: {
    delegatable: [task, { id: "R-001-d-1", label: "Summarize exceptions", respId: "R-001", respTitle: "Forecast hygiene" }],
    approval: [{ id: "R-001-a-0", label: "Export forecast report", respId: "R-001", respTitle: "Forecast hygiene" }],
    not_delegatable: [{ id: "R-001-n-0", label: "Approve final forecast number", respId: "R-001", respTitle: "Forecast hygiene" }],
  },
  agents: [],
};

describe("buildAgentArtifacts", () => {
  const out = buildAgentArtifacts({ person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "auto-write-with-approval", riskLevel: "low" });

  it("anchors the manifest to a human owner and parent responsibility", () => {
    const m = out.manifest as any;
    expect(m.human_owner.name).toBe("Jane Smith");
    expect(m.parent_responsibility.name).toBe("Forecast hygiene");
    expect(m.agent_id).toBe("forecast-cleanup-agent");
  });

  it("includes allowed, approval, and blocked tasks", () => {
    expect(out.allowed).toContain("Clean stale forecast records");
    expect(out.approval).toContain("Export forecast report");
    expect(out.blocked).toContain("Approve final forecast number");
    // global guardrails always present
    expect(out.blocked.some((b) => b.includes("Commit company resources"))).toBe(true);
  });

  it("emits a bracketed Pedigree Standard System Prompt", () => {
    for (const section of ["[ROLE]", "[ALLOWED TASKS]", "[BLOCKED TASKS]", "[ESCALATION RULES]", "[TOOLS AND MCP SERVERS]"]) {
      expect(out.systemPrompt).toContain(section);
    }
    expect(out.systemPrompt).toContain("Jane Smith");
    expect(out.systemPrompt).toContain("Forecast Cleanup Agent");
  });

  it("recommends only read_only or draft_only MCP scopes (never write)", () => {
    for (const m of out.mcp) {
      expect(["read_only", "draft_only", "none"]).toContain(m.recommended_scope);
    }
  });
});
