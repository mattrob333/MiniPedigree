import { describe, it, expect } from "vitest";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { addMcpServer } from "../src/lib/mcpLibrary";
import { compileAgent } from "../src/lib/runtimes";
import type { CompiledAgent } from "../src/lib/runtimes";
import { validateCompiledAgent } from "../src/lib/validate";
import { computeIngredientHashes, markStale, nextVersion, refreshStaleness, setRegistryStatus, upsertCompiledVersion } from "../src/lib/registry";
import { hashObject, sha256Hex, stableStringify } from "../src/lib/hash";
import type { AgentRegistryEntry, CompanyContext, PedigreeRow, Person, TaskItem } from "../src/types";

const person: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: "vp@x.co", tools: ["Salesforce"],
};

const task: TaskItem = { id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };

const row: PedigreeRow = {
  status: "ready",
  responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
  tasks: { delegatable: [task], approval: [], not_delegatable: [] },
  agents: [],
};

const library = addMcpServer([], {
  name: "Salesforce", approved_scopes: ["read_only"], default_scope: "read_only",
  owner_email: "it@x.co", systems_matched: ["Salesforce", "forecast"],
});

function makeCompiled(overrides?: { companyContext?: CompanyContext; version?: number }): CompiledAgent {
  const buildCtx = { person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const, companyContext: overrides?.companyContext };
  const artifacts = buildAgentArtifacts(buildCtx);
  const agent = newAgentRecord(buildCtx, artifacts);
  return compileAgent({ agent, runtime: "pedigree", companyContext: overrides?.companyContext, mcpLibrary: library, version: overrides?.version });
}

describe("sha-256 hashing", () => {
  it("matches the known SHA-256 test vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("stable stringify is key-order independent", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(hashObject({ x: 1, y: 2 })).toBe(hashObject({ y: 2, x: 1 }));
  });
});

describe("Stage E validation gates", () => {
  it("passes a well-formed compiled agent", () => {
    const out = validateCompiledAgent(makeCompiled(), library);
    expect(out.ok).toBe(true);
    expect(out.failures).toHaveLength(0);
  });

  it("fails when a blocked task appears in allowed", () => {
    const compiled = makeCompiled();
    compiled.governance.allowed.push(compiled.governance.blocked[0].action);
    const out = validateCompiledAgent(compiled, library);
    expect(out.ok).toBe(false);
    expect(out.failures.some((f) => f.includes("appears in allowed"))).toBe(true);
  });

  it("fails when an approval-required action lacks a named approver", () => {
    const compiled = makeCompiled();
    compiled.governance.approval.push({ action: "Export forecast report", approver: "" });
    const out = validateCompiledAgent(compiled, library);
    expect(out.failures.some((f) => f.includes("no named approver"))).toBe(true);
  });

  it("fails a scheduled agent without cron/timezone or delivery target", () => {
    const compiled = makeCompiled();
    compiled.construction_spec.operating_mode = "scheduled";
    compiled.construction_spec.recommended_schedule = { type: "cron", reason: "weekly" };
    compiled.construction_spec.delivery_recommendations = [];
    const out = validateCompiledAgent(compiled, library);
    expect(out.failures.some((f) => f.includes("cron"))).toBe(true);
    expect(out.failures.some((f) => f.includes("delivery target"))).toBe(true);
  });

  it("fails when an MCP grant exceeds the library's approved scope", () => {
    const compiled = makeCompiled();
    compiled.mcp_grants = [{ server_id: library[0].id, name: "Salesforce", scope: "read_write", source: "library", reason: "test" }];
    const out = validateCompiledAgent(compiled, library);
    expect(out.failures.some((f) => f.includes("exceeds the library's approved scopes"))).toBe(true);
  });

  it("fails full tool access without an explicit policy justification", () => {
    const compiled = makeCompiled();
    compiled.construction_spec.tool_permissions = {
      enabled: [], blocked: [],
      mcp_servers: [{ name: "Salesforce MCP", scope: "full", reason: "just because" }],
    };
    const out = validateCompiledAgent(compiled, library);
    expect(out.failures.some((f) => f.includes("explicit policy justification"))).toBe(true);
  });

  it("warns on catalog fallback and needs_clarification readiness", () => {
    const buildCtx = { person, row, task: { ...task, completion: { trigger: null, inputs: null, outputs: null, tools_mentioned: null, definition_of_done: null, readiness: "needs_clarification" as const, open_questions: ["What defines stale?"], candidate_pattern: null } }, respTitle: "Forecast hygiene", agentName: "Agent", policy: "read-only", riskLevel: "low" as const };
    const artifacts = buildAgentArtifacts(buildCtx);
    const agent = newAgentRecord(buildCtx, artifacts);
    const compiled = compileAgent({ agent, runtime: "openai", mcpLibrary: [] });
    const out = validateCompiledAgent(compiled, []);
    expect(out.ok).toBe(true); // warnings only
    expect(out.warnings.some((w) => w.includes("catalog_fallback"))).toBe(true);
    expect(out.warnings.some((w) => w.includes("needs_clarification"))).toBe(true);
    expect(out.warnings.some((w) => w.includes("prompt-level"))).toBe(true);
  });
});

describe("Agent Registry (Stage F)", () => {
  it("version history is append-only", () => {
    const v1 = makeCompiled({ version: 1 });
    let registry = upsertCompiledVersion([], v1, [{ path: "manifest.json", content: "{}", mime: "application/json" }]);
    expect(registry).toHaveLength(1);
    expect(registry[0].versions.map((v) => v.version)).toEqual([1]);
    expect(nextVersion(registry, v1.agent_id)).toBe(2);

    const v2 = makeCompiled({ version: 2 });
    registry = upsertCompiledVersion(registry, v2, []);
    expect(registry[0].versions.map((v) => v.version)).toEqual([1, 2]);

    // Re-writing an existing version must throw — history never mutates.
    expect(() => upsertCompiledVersion(registry, makeCompiled({ version: 2 }), [])).toThrow(/append-only/);
  });

  it("hash drift flips stale; recompile clears it", () => {
    const compiled = makeCompiled({ version: 1 });
    const buildCtx = { person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const };
    const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
    (agent.manifest as Record<string, unknown>).agent_id = compiled.agent_id;
    let registry = upsertCompiledVersion([], compiled, []);
    const byId = new Map([[compiled.agent_id, agent]]);

    // Unchanged ingredients → not stale.
    registry = refreshStaleness(registry, byId, undefined, library);
    expect(registry[0].stale).toBe(false);

    // Company context changes → stale.
    const changedCtx: CompanyContext = { company: "Acme", whatWeDo: "Changed", approvalRules: ["Everything needs approval."] };
    registry = refreshStaleness(registry, byId, changedCtx, library);
    expect(registry[0].stale).toBe(true);

    // Recompile (version bump) against the new context clears stale.
    const recompiled = compileAgent({ agent, runtime: "pedigree", companyContext: changedCtx, mcpLibrary: library, version: 2 });
    registry = upsertCompiledVersion(registry, recompiled, []);
    expect(registry[0].stale).toBe(false);
    registry = refreshStaleness(registry, byId, changedCtx, library);
    expect(registry[0].stale).toBe(false);
  });

  it("retired entries are skipped by staleness refresh and markStale marks targets", () => {
    const compiled = makeCompiled({ version: 1 });
    let registry: AgentRegistryEntry[] = upsertCompiledVersion([], compiled, []);
    registry = markStale(registry, [compiled.agent_id]);
    expect(registry[0].stale).toBe(true);
    registry = setRegistryStatus(registry, compiled.agent_id, "retired");
    const buildCtx = { person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const };
    const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
    const refreshed = refreshStaleness(registry, new Map([[compiled.agent_id, agent]]), undefined, library);
    expect(refreshed[0].status).toBe("retired");
    expect(refreshed[0].stale).toBe(true); // untouched
  });

  it("computeIngredientHashes matches compileAgent's recipe", () => {
    const buildCtx = { person, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const };
    const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));
    const compiled = compileAgent({ agent, runtime: "pedigree", mcpLibrary: library });
    const hashes = computeIngredientHashes(agent, undefined, library, "pedigree");
    expect(hashes).toEqual(compiled.provenance.ingredient_hashes);
  });
});
