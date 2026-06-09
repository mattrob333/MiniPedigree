import type {
  AgentRecord,
  AgentRegistryEntry,
  CompanyContext,
  CompanyMcpServer,
} from "@/types";
import { getGovernanceRules } from "./governance";
import { hashObject } from "./hash";
import { resolveMcpGrants } from "./mcpLibrary";
import type { CompiledAgent, RuntimeArtifact, RuntimeTargetId } from "./runtimes/types";

// ── Stage F: the Agent Registry IS the company's Agent Stack state ─────
// Versioned, append-only. Staleness = ingredient hash drift since the last
// compiled version.

export function findRegistryEntry(registry: AgentRegistryEntry[], agentId: string): AgentRegistryEntry | undefined {
  return registry.find((e) => e.agent_id === agentId);
}

export function nextVersion(registry: AgentRegistryEntry[], agentId: string): number {
  const entry = findRegistryEntry(registry, agentId);
  if (!entry || !entry.versions.length) return 1;
  return Math.max(...entry.versions.map((v) => v.version)) + 1;
}

/**
 * Write/update a registry entry with a newly compiled version. Append-only:
 * prior versions are always preserved. Returns a new registry array.
 */
export function upsertCompiledVersion(
  registry: AgentRegistryEntry[],
  compiled: CompiledAgent,
  artifacts: RuntimeArtifact[],
): AgentRegistryEntry[] {
  const version = {
    version: compiled.version,
    compiled: compiled as unknown as Record<string, unknown>,
    artifacts_manifest: artifacts.map((a) => a.path),
    created_at: new Date().toISOString(),
  };
  const existing = findRegistryEntry(registry, compiled.agent_id);
  if (!existing) {
    return [
      ...registry,
      {
        agent_id: compiled.agent_id,
        owner_person_id: compiled.owner.id,
        task_id: compiled.task.id,
        resp_id: compiled.responsibility.id,
        runtime: compiled.runtime,
        status: "draft",
        stale: false,
        ingredient_hashes: compiled.provenance.ingredient_hashes,
        versions: [version],
      },
    ];
  }
  if (existing.versions.some((v) => v.version === compiled.version)) {
    throw new Error(`Registry history is append-only: version ${compiled.version} of ${compiled.agent_id} already exists.`);
  }
  return registry.map((entry) =>
    entry.agent_id === compiled.agent_id
      ? {
          ...entry,
          runtime: compiled.runtime,
          owner_person_id: compiled.owner.id,
          task_id: compiled.task.id,
          resp_id: compiled.responsibility.id,
          stale: false, // a recompile resolves staleness by definition
          ingredient_hashes: compiled.provenance.ingredient_hashes,
          versions: [...entry.versions, version],
        }
      : entry,
  );
}

export function setRegistryStatus(registry: AgentRegistryEntry[], agentId: string, status: AgentRegistryEntry["status"]): AgentRegistryEntry[] {
  return registry.map((entry) => (entry.agent_id === agentId ? { ...entry, status } : entry));
}

export function markStale(registry: AgentRegistryEntry[], agentIds: string[]): AgentRegistryEntry[] {
  const ids = new Set(agentIds);
  return registry.map((entry) => (ids.has(entry.agent_id) ? { ...entry, stale: true } : entry));
}

/** Current ingredient hashes for an agent record — the same recipe compileAgent uses. */
export function computeIngredientHashes(
  agent: AgentRecord,
  companyContext: CompanyContext | undefined,
  mcpLibrary: CompanyMcpServer[],
  runtime: RuntimeTargetId | string,
): Record<string, string> {
  return {
    human_manifest: hashObject(agent.person),
    task: hashObject({ task: agent.task, respId: agent.respId, respTitle: agent.respTitle }),
    company_context: hashObject(companyContext ?? null),
    governance_rules: hashObject(getGovernanceRules(companyContext)),
    mcp_grants: hashObject(resolveMcpGrants(agent.task, mcpLibrary, agent.person.tools)),
    runtime: hashObject(runtime),
  };
}

/**
 * Recompute the stale flag for every registry entry against the current state
 * of its ingredients. Retired entries are left untouched. Returns a new array
 * only when something changed.
 */
export function refreshStaleness(
  registry: AgentRegistryEntry[],
  agentsById: Map<string, AgentRecord>,
  companyContext: CompanyContext | undefined,
  mcpLibrary: CompanyMcpServer[],
): AgentRegistryEntry[] {
  let changed = false;
  const next = registry.map((entry) => {
    if (entry.status === "retired") return entry;
    const agent = agentsById.get(entry.agent_id);
    if (!agent) return entry;
    const current = computeIngredientHashes(agent, companyContext, mcpLibrary, entry.runtime);
    const stale = Object.keys(current).some((key) => current[key] !== entry.ingredient_hashes[key]);
    if (stale !== entry.stale) {
      changed = true;
      return { ...entry, stale };
    }
    return entry;
  });
  return changed ? next : registry;
}
