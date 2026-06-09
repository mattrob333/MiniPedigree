import { describe, expect, it } from "vitest";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { buildHermesManifest, buildHermesYamlFrontMatter } from "../src/lib/hermesManifest";
import type { PedigreeRow, Person, TaskItem } from "../src/types";

const person: Person = {
  id: "P-001",
  name: "Jane Smith",
  email: "jane@x.co",
  title: "Sales Operations Manager",
  department: "Revenue Ops",
  managerId: null,
  managerEmail: null,
  tools: ["Salesforce", "Slack"],
};

const task: TaskItem = {
  id: "R-001-d-0",
  label: "Clean stale forecast records",
  respId: "R-001",
  respTitle: "Forecast hygiene",
};

const row: PedigreeRow = {
  status: "ready",
  responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
  tasks: {
    delegatable: [task],
    approval: [{ id: "R-001-a-0", label: "Export forecast report", respId: "R-001", respTitle: "Forecast hygiene" }],
    not_delegatable: [{ id: "R-001-n-0", label: "Approve final forecast number", respId: "R-001", respTitle: "Forecast hygiene" }],
  },
  agents: [],
};

function buildAgent() {
  const ctx = {
    person,
    row,
    task,
    respTitle: "Forecast hygiene",
    agentName: "Forecast Cleanup Agent",
    policy: "auto-write-with-approval",
    riskLevel: "medium" as const,
  };
  const artifacts = buildAgentArtifacts(ctx);
  return newAgentRecord(ctx, artifacts);
}

describe("Hermes manifest export", () => {
  it("maps Pedigree owner, task, governance, schedule, tools, and prompt into Hermes", () => {
    const agent = buildAgent();
    const result = buildHermesManifest(agent);

    expect(result.manifest.runtime).toBe("hermes");
    expect(result.manifest.owner.name).toBe("Jane Smith");
    expect(result.manifest.responsibility_title).toBe("Forecast hygiene");
    expect(result.manifest.task_label).toBe("Clean stale forecast records");
    expect(result.manifest.goal).toContain("Clean stale forecast records".toLowerCase());
    expect(result.manifest.policy).toBe("auto-write-with-approval");
    expect(result.manifest.risk_level).toBe("medium");
    expect(result.manifest.allowed_tasks).toContain("Clean stale forecast records");
    expect(result.manifest.approval_required).toContain("Export forecast report");
    expect(result.manifest.blocked_tasks).toContain("Approve final forecast number");
    expect(result.manifest.schedule.type).toBe("cron");
    // Deterministic default schedule: Monday 9am ET, flagged for review.
    expect(result.manifest.schedule.cron).toBe("0 9 * * 1");
    expect(result.manifest.tools.mcp_servers?.length).toBeGreaterThan(0);
    expect(result.manifest.system_prompt).toContain("[ROLE]");
  });

  it("uses draft placeholders and warnings when Hermes runtime details are missing", () => {
    const agent = buildAgent();
    const manifest = JSON.parse(JSON.stringify(agent.manifest));
    manifest.construction_spec.delivery_recommendations = [];
    manifest.construction_spec.recommended_schedule = { type: "cron", cron: "", timezone: "", reason: "Run weekly" };
    const result = buildHermesManifest(manifest);

    expect(result.manifest.schedule.cron).toBe("TODO_CRON");
    expect(result.manifest.schedule.timezone).toBe("America/New_York");
    expect(result.manifest.delivery.on_complete[0].recipient).toBe("jane@x.co");
    expect(result.manifest.data_sources?.some((source) => source.path === "TODO_UPLOAD_PATH" || source.endpoint === "TODO_API_ENDPOINT")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("TODO_CRON"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("delivery target"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("TODO_UPLOAD_PATH") || warning.includes("TODO_API_ENDPOINT"))).toBe(true);
  });

  it("renders YAML front matter and Markdown package with warnings and test prompts", () => {
    const agent = buildAgent();
    const result = buildHermesManifest(agent);
    const yaml = buildHermesYamlFrontMatter(result.manifest);

    expect(yaml).toContain('runtime: "hermes"');
    expect(yaml).toContain("agent_id:");
    expect(yaml).toContain("delivery:");
    expect(result.markdown).toContain("---");
    expect(result.markdown).toContain("## System Prompt");
    expect(result.markdown).toContain("## Validation Warnings");
    expect(result.markdown).toContain("### Test Prompts");
    expect(result.markdown).toContain("hermes-manifest.json");
  });
});
