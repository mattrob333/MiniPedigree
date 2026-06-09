import type { AgentConstructionSpec } from "../agent";
import type {
  CompanyContext,
  GovernanceResolution,
  McpGrant,
  Person,
  RiskLevel,
  TaskItem,
} from "@/types";

export type RuntimeTargetId = "pedigree" | "hermes" | "openclaw" | "openai" | "claude" | "generic";

export interface RuntimeArtifact {
  path: string;
  content: string;
  mime: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

/**
 * The single object every runtime adapter renders from. Adapters format; they
 * never decide policy — all constraints were resolved upstream (Stages A–C).
 */
export interface CompiledAgent {
  agent_id: string;
  agent_name: string;
  version: number;
  owner: Person;
  responsibility: { id: string; title: string };
  task: TaskItem;
  company_context_snapshot_id: string;
  company_context?: CompanyContext;
  governance: GovernanceResolution;
  construction_spec: AgentConstructionSpec;
  system_prompt: string;
  manifest: Record<string, unknown>;
  mcp_grants: McpGrant[];
  runtime: RuntimeTargetId;
  policy: string;
  risk_level: RiskLevel;
  provenance: {
    trace_id: string;
    ingredient_hashes: Record<string, string>;
    compiler_version: string;
    compiled_at: string;
  };
}

export interface RuntimeAdapter {
  id: RuntimeTargetId;
  label: string;
  description: string;
  emit(input: CompiledAgent): RuntimeArtifact[];
  validate(input: CompiledAgent): ValidationWarning[];
}
