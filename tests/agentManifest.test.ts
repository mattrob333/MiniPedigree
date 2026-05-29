import { describe, it, expect } from "vitest";
import { buildAgentArtifacts, buildDeploymentGuide } from "../src/lib/agent";
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

  it("includes an io_contract and lifecycle in the manifest", () => {
    const m = out.manifest as any;
    expect(m.io_contract).toBeDefined();
    expect(Array.isArray(m.io_contract.inputs)).toBe(true);
    expect(Array.isArray(m.io_contract.outputs)).toBe(true);
    expect(typeof m.io_contract.trigger).toBe("string");
    expect(m.lifecycle.class).toBe("standing");
  });

  it("marks task agents ephemeral but keeps a teardown audit policy", () => {
    const t = buildAgentArtifacts({ person, row, task, respTitle: "Forecast hygiene", agentName: "X Agent", policy: "read-only", riskLevel: "low", lifecycleClass: "task" });
    const m = t.manifest as any;
    expect(m.lifecycle.class).toBe("task");
    expect(m.lifecycle.ttl).toBe("on_complete");
    expect(m.lifecycle.teardown_policy).toBe("delete_agent_retain_log");
  });

  it("builds a deployment guide covering OpenAI, Claude, and generic setup", () => {
    const guide = buildDeploymentGuide(out.manifest as any);
    expect(guide).toContain("Deployment Package");
    expect(guide).toContain("OpenAI");
    expect(guide).toContain("Claude");
    expect(guide).toContain("Required tools / MCP servers");
    expect(guide).toContain("Trigger");
  });
});
