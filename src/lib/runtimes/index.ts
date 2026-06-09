import type {
  AgentRecord,
  CompanyContext,
  CompanyMcpServer,
  GovernanceResolution,
} from "@/types";
import type { AgentConstructionSpec } from "../agent";
import { slugify } from "../agent";
import { resolveMcpGrants } from "../mcpLibrary";
import { getGovernanceRules } from "../governance";
import { hashObject } from "../hash";
import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, RuntimeTargetId, ValidationWarning } from "./types";
import { pedigreeAdapter } from "./pedigree";
import { hermesAdapter } from "./hermes";
import { openclawAdapter } from "./openclaw";
import { openaiAdapter } from "./openai";
import { claudeAdapter } from "./claude";
import { genericAdapter } from "./generic";

export type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, RuntimeTargetId, ValidationWarning } from "./types";

export const COMPILER_VERSION = "pedigree-compiler/0.2.0";

export const RUNTIME_ADAPTERS: RuntimeAdapter[] = [
  pedigreeAdapter,
  hermesAdapter,
  openclawAdapter,
  openaiAdapter,
  claudeAdapter,
  genericAdapter,
];

export function getRuntimeAdapter(id: RuntimeTargetId): RuntimeAdapter {
  const adapter = RUNTIME_ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(`Unknown runtime adapter: ${id}`);
  return adapter;
}

export interface CompileAgentInput {
  agent: AgentRecord;
  runtime: RuntimeTargetId;
  companyContext?: CompanyContext;
  mcpLibrary?: CompanyMcpServer[];
  version?: number;
}

/**
 * Stage A–C assembly point: build the single CompiledAgent every runtime
 * adapter renders from. Adapters format; this function (and the stages that
 * fed the agent manifest) decide policy.
 */
export function compileAgent(input: CompileAgentInput): CompiledAgent {
  const { agent, runtime, companyContext, mcpLibrary = [] } = input;
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const version = input.version ?? 1;

  const constructionSpec = (manifest.construction_spec ?? {}) as AgentConstructionSpec;
  const governance = normalizeGovernance(manifest);
  const mcpGrants = resolveMcpGrants(agent.task, mcpLibrary, agent.person.tools);
  const governanceRules = getGovernanceRules(companyContext);

  // Ingredient hashes — staleness is detected by drift in any of these.
  const ingredientHashes: Record<string, string> = {
    human_manifest: hashObject(agent.person),
    task: hashObject({ task: agent.task, respId: agent.respId, respTitle: agent.respTitle }),
    company_context: hashObject(companyContext ?? null),
    governance_rules: hashObject(governanceRules),
    mcp_grants: hashObject(mcpGrants),
    runtime: hashObject(runtime),
  };

  const slug = slugify(agent.name) || "pedigree-agent";

  return {
    agent_id: String(manifest.agent_id ?? slug),
    agent_name: agent.name,
    version,
    owner: agent.person,
    responsibility: { id: agent.respId, title: agent.respTitle },
    task: agent.task,
    company_context_snapshot_id: companyContext ? `ctx-${hashObject(companyContext).slice(0, 12)}` : "none",
    company_context: companyContext,
    governance,
    construction_spec: constructionSpec,
    system_prompt: agent.systemPrompt ?? String(manifest.system_prompt ?? ""),
    manifest,
    mcp_grants: mcpGrants,
    runtime,
    policy: agent.policy,
    risk_level: agent.riskLevel,
    provenance: {
      trace_id: String(manifest.audit?.trace_id ?? `pdg-${slug}-v${version}`),
      ingredient_hashes: ingredientHashes,
      compiler_version: COMPILER_VERSION,
      compiled_at: new Date().toISOString(),
    },
  };
}

/** Read the structured governance block; older manifests fall back to the flat lists. */
function normalizeGovernance(manifest: Record<string, any>): GovernanceResolution {
  const gov = manifest.governance as GovernanceResolution | undefined;
  const owner = manifest.human_owner ?? {};
  if (gov && Array.isArray(gov.approval) && Array.isArray(gov.blocked)) {
    return {
      allowed: manifest.allowed_tasks ?? gov.allowed ?? [],
      approval: gov.approval,
      blocked: gov.blocked,
      audit_events: gov.audit_events ?? [],
      sod_findings: gov.sod_findings ?? [],
      rule_provenance: gov.rule_provenance ?? [],
    };
  }
  return {
    allowed: manifest.allowed_tasks ?? [],
    approval: (manifest.human_approval_required ?? []).map((action: string) => ({
      action,
      approver: String(owner.email ?? owner.name ?? "owner"),
    })),
    blocked: (manifest.blocked_tasks ?? []).map((action: string) => ({ action })),
    audit_events: [],
    sod_findings: [],
    rule_provenance: [],
  };
}

/** Emit every runtime's artifacts, namespaced per runtime (the full deployment package). */
export function emitAllRuntimes(compiled: CompiledAgent): { artifacts: RuntimeArtifact[]; warnings: ValidationWarning[] } {
  const artifacts: RuntimeArtifact[] = [];
  const warnings: ValidationWarning[] = [];
  for (const adapter of RUNTIME_ADAPTERS) {
    const scoped = adapter.id === compiled.runtime ? compiled : { ...compiled, runtime: adapter.id };
    for (const artifact of adapter.emit(scoped)) {
      artifacts.push({ ...artifact, path: `${adapter.id}/${artifact.path}` });
    }
    warnings.push(...adapter.validate(scoped));
  }
  return { artifacts, warnings };
}
