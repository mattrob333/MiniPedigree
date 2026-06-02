import { describe, it, expect } from "vitest";
import { buildAgentArtifacts, buildDeploymentGuide, type AgentConstructionSpec } from "../src/lib/agent";
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

  it("surfaces uploaded company context documents as manifest stores and IO inputs", () => {
    const artifact = buildAgentArtifacts({
      person,
      row,
      task,
      respTitle: "Forecast hygiene",
      agentName: "Context Store Agent",
      policy: "read-only",
      riskLevel: "medium",
      companyContext: {
        company: "Policy Co",
        whatWeDo: "Runs governed revenue operations.",
        contextDocuments: [
          {
            id: "segregation_of_duties:sod.txt:42:1",
            bucket: "segregation_of_duties",
            fileName: "sod.txt",
            text: "Sales cannot approve its own discounts.",
            uploadedAt: "2026-06-02T00:00:00.000Z",
          },
          {
            id: "policy:approval.txt:40:1",
            bucket: "policy",
            fileName: "approval.txt",
            text: "VP approval is required above $500.",
            uploadedAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      },
    });
    const manifest = artifact.manifest as any;
    expect(manifest.company_context.context_documents).toHaveLength(2);
    expect(manifest.company_context.context_documents[0].bucket).toBe("segregation_of_duties");
    expect(manifest.company_context.context_documents[0].text).toContain("Sales cannot approve");
    expect(manifest.io_contract.inputs.some((input: any) => input.source.includes("company_context.contextDocuments[segregation_of_duties]"))).toBe(true);
    expect(manifest.io_contract.inputs.some((input: any) => input.source.includes("company_context.contextDocuments[policy]"))).toBe(true);
    expect(artifact.systemPrompt).toContain("Uploaded company context document stores");
  });

  it("emits a deterministic construction spec even without AI authoring", () => {
    const m = out.manifest as any;
    expect(m.construction_spec).toBeDefined();
    expect(m.goal).toBe(m.construction_spec.goal);
    expect(m.operating_mode).toBe(m.construction_spec.operating_mode);
    expect(m.construction_spec.workflow_steps.length).toBeGreaterThan(0);
    expect(m.construction_spec.input_requirements.length).toBeGreaterThan(0);
    expect(m.construction_spec.output_artifacts.length).toBeGreaterThan(0);
    expect(m.construction_spec.audit_events).toContain("request_received");
    expect(m.construction_spec.test_prompts.length).toBeGreaterThan(0);
  });

  it("accepts legacy authored prompt sections and fills construction defaults", () => {
    const legacy = buildAgentArtifacts({
      person,
      row,
      task,
      respTitle: "Forecast hygiene",
      agentName: "Legacy Agent",
      policy: "read-only",
      riskLevel: "low",
      authored: {
        role: "Legacy role",
        authority_ceiling: "Legacy authority ceiling",
        purpose: "Legacy purpose",
        goal: "Legacy goal",
        allowed_tasks: ["Summarize exceptions"],
        approval_required: ["Export forecast report"],
        blocked_tasks: ["Approve final forecast number"],
        escalation_rules: ["Escalate when asked to approve the forecast"],
        output_style: "Concise",
      },
    });
    const spec = (legacy.manifest as any).construction_spec as AgentConstructionSpec;
    expect(spec.role).toBe("Legacy role");
    expect(spec.goal).toBe("Legacy goal");
    expect(spec.workflow_steps.length).toBeGreaterThan(0);
    expect(spec.memory_policy).toContain("approved");
  });

  it("keeps stricter governance buckets stronger than allowed tasks", () => {
    const guarded = buildAgentArtifacts({
      person,
      row,
      task,
      respTitle: "Forecast hygiene",
      agentName: "Guarded Agent",
      policy: "auto-write-with-approval",
      riskLevel: "medium",
      authored: {
        allowed_tasks: ["Approve final forecast number", "Export forecast report", "Summarize exceptions"],
        approval_required: ["Export forecast report"],
        blocked_tasks: ["Approve final forecast number"],
      },
    });
    expect(guarded.allowed).not.toContain("Approve final forecast number");
    expect(guarded.allowed).not.toContain("Export forecast report");
    expect(guarded.approval).toContain("Export forecast report");
    expect(guarded.blocked).toContain("Approve final forecast number");
  });

  it("downgrades AI-suggested full MCP scope and records a warning", () => {
    const guarded = buildAgentArtifacts({
      person,
      row,
      task,
      respTitle: "Forecast hygiene",
      agentName: "Full Scope Agent",
      policy: "auto-write",
      riskLevel: "high",
      authored: {
        tool_permissions: {
          enabled: ["Salesforce"],
          blocked: [],
          mcp_servers: [{ name: "Salesforce MCP", scope: "full", reason: "Update forecast records" }],
        },
      },
    });
    const spec = (guarded.manifest as any).construction_spec as AgentConstructionSpec;
    expect(spec.tool_permissions.mcp_servers?.[0].scope).toBe("draft_only");
    expect(spec.validation_warnings?.some((w) => w.includes("downgraded"))).toBe(true);
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
    expect(guide).toContain("hermes-manifest.json");
    expect(guide).toContain("Trigger");
  });
});
