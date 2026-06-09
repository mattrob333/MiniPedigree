import { describe, it, expect } from "vitest";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { addMcpServer } from "../src/lib/mcpLibrary";
import { compileAgent, emitAllRuntimes, getRuntimeAdapter, RUNTIME_ADAPTERS } from "../src/lib/runtimes";
import type { CompiledAgent } from "../src/lib/runtimes";
import type { CompanyContext, PedigreeRow, Person, TaskItem } from "../src/types";

const person: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: "vp@x.co", tools: ["Salesforce", "Slack"],
};

const task: TaskItem = {
  id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene",
  evidence: "I spend Fridays cleaning stale forecast records",
  completion: {
    trigger: "every Friday",
    inputs: ["Salesforce opportunity export"],
    outputs: ["Cleaned forecast list"],
    tools_mentioned: ["Salesforce"],
    definition_of_done: "Stale records flagged and summarized",
    readiness: "ready",
    open_questions: ["Which fields define staleness?"],
    candidate_pattern: "record-hygiene",
  },
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

const companyContext: CompanyContext = {
  company: "Acme", whatWeDo: "B2B SaaS",
  approvalRules: ["Exporting forecast reports requires manager approval."],
  contextDocuments: [
    { id: "policy:sod.txt", bucket: "segregation_of_duties", fileName: "sod.txt", text: "The same person may not prepare and approve a payment.", uploadedAt: "2026-06-01T00:00:00.000Z" },
  ],
};

const mcpLibrary = addMcpServer([], {
  name: "Salesforce",
  approved_scopes: ["read_only"],
  default_scope: "read_only",
  owner_email: "it@acme.co",
  systems_matched: ["Salesforce"],
});

function makeCompiled(): CompiledAgent {
  const buildCtx = { person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const, companyContext };
  const artifacts = buildAgentArtifacts(buildCtx);
  const agent = newAgentRecord(buildCtx, artifacts);
  return compileAgent({ agent, runtime: "pedigree", companyContext, mcpLibrary });
}

describe("compileAgent", () => {
  const compiled = makeCompiled();

  it("assembles the six ingredients with provenance hashes", () => {
    expect(compiled.owner.name).toBe("Jane Smith");
    expect(compiled.responsibility.title).toBe("Forecast hygiene");
    expect(compiled.task.completion?.candidate_pattern).toBe("record-hygiene");
    expect(compiled.governance.approval.length).toBeGreaterThan(0);
    expect(compiled.mcp_grants[0].source).toBe("library");
    for (const key of ["human_manifest", "task", "company_context", "governance_rules", "mcp_grants", "runtime"]) {
      expect(compiled.provenance.ingredient_hashes[key]).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(compiled.provenance.compiler_version).toContain("pedigree-compiler");
  });

  it("resolves library-scoped grants, never wider than the registered scope", () => {
    for (const grant of compiled.mcp_grants) {
      expect(["read_only", "draft_only"]).toContain(grant.scope);
    }
  });
});

describe("runtime adapters", () => {
  const compiled = makeCompiled();

  it("every adapter renders from the same CompiledAgent fixture", () => {
    for (const adapter of RUNTIME_ADAPTERS) {
      const artifacts = adapter.emit({ ...compiled, runtime: adapter.id });
      expect(artifacts.length, `${adapter.id} should emit artifacts`).toBeGreaterThan(0);
      for (const artifact of artifacts) {
        expect(artifact.path).toBeTruthy();
        expect(artifact.content).toBeTruthy();
        expect(artifact.mime).toBeTruthy();
      }
    }
  });

  it("blocked tasks appear in every runtime's output", () => {
    const blockedAction = compiled.governance.blocked[0]?.action;
    expect(blockedAction).toBeTruthy();
    for (const adapter of RUNTIME_ADAPTERS) {
      const all = adapter.emit({ ...compiled, runtime: adapter.id }).map((a) => a.content).join("\n");
      expect(all, `${adapter.id} output should contain blocked task`).toContain(blockedAction!);
    }
  });

  it("no adapter mutates the input", () => {
    const frozen = JSON.parse(JSON.stringify(compiled)) as CompiledAgent;
    for (const adapter of RUNTIME_ADAPTERS) {
      adapter.emit(frozen);
      adapter.validate(frozen);
    }
    expect(frozen).toEqual(JSON.parse(JSON.stringify(compiled)));
  });

  it("hermes emits SOUL.md, config, distribution, and one SKILL.md per pattern with references", () => {
    const artifacts = getRuntimeAdapter("hermes").emit({ ...compiled, runtime: "hermes" });
    const paths = artifacts.map((a) => a.path);
    for (const expected of ["SOUL.md", "config.yaml", "distribution.yaml", "hermes-manifest.json", "hermes-agent.md"]) {
      expect(paths).toContain(expected);
    }
    expect(paths).toContain("skills/record-hygiene/SKILL.md");
    expect(paths).toContain("skills/record-hygiene/references/evidence.md");
    const soul = artifacts.find((a) => a.path === "SOUL.md")!.content;
    for (const section of ["## Core Identity", "## Primary Mission", "## Autonomy Boundaries", "## Escalation", "## Pushback & Standards", "## Accountability & Output Rules"]) {
      expect(soul).toContain(section);
    }
    const skill = artifacts.find((a) => a.path === "skills/record-hygiene/SKILL.md")!.content;
    expect(skill.length).toBeLessThan(2600); // lean: ~500 tokens
    expect(skill).toContain("every Friday");
    const refs = artifacts.find((a) => a.path === "skills/record-hygiene/references/evidence.md")!.content;
    expect(refs).toContain("Which fields define staleness?");
  });

  it("openclaw emits the workspace package with mounted knowledge and approval gates", () => {
    const artifacts = getRuntimeAdapter("openclaw").emit({ ...compiled, runtime: "openclaw" });
    const paths = artifacts.map((a) => a.path);
    expect(paths).toContain("INSTRUCTIONS.md");
    expect(paths).toContain("manifest.json");
    expect(paths).toContain("APPROVAL-GATES.md");
    expect(paths.some((p) => p.startsWith("knowledge/segregation_of_duties/"))).toBe(true);
    const gates = artifacts.find((a) => a.path === "APPROVAL-GATES.md")!.content;
    expect(gates).toContain("Export forecast report");
  });

  it("openai emits instructions + tool schema with pedigree scope metadata", () => {
    const artifacts = getRuntimeAdapter("openai").emit({ ...compiled, runtime: "openai" });
    const tools = JSON.parse(artifacts.find((a) => a.path === "openai-tools.json")!.content);
    expect(tools.tools.length).toBeGreaterThan(0);
    expect(tools.tools[0]["x-pedigree"].scope).toBe("read_only");
    const warnings = getRuntimeAdapter("openai").validate({ ...compiled, runtime: "openai" });
    expect(warnings.some((w) => w.code === "openai_prompt_level_gates")).toBe(true);
  });

  it("emitAllRuntimes namespaces artifacts per runtime", () => {
    const { artifacts } = emitAllRuntimes(compiled);
    expect(artifacts.some((a) => a.path === "pedigree/manifest.json")).toBe(true);
    expect(artifacts.some((a) => a.path === "hermes/SOUL.md")).toBe(true);
    expect(artifacts.some((a) => a.path === "claude/mcp-config.json")).toBe(true);
  });
});
