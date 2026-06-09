import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, ValidationWarning } from "./types";
import { slugify } from "../agent";

export const claudeAdapter: RuntimeAdapter = {
  id: "claude",
  label: "Claude",
  description: "Claude Project instructions + MCP server config",
  emit(input: CompiledAgent): RuntimeArtifact[] {
    return [
      { path: "claude-project-instructions.md", content: buildInstructions(input), mime: "text/markdown" },
      { path: "mcp-config.json", content: JSON.stringify(buildMcpConfig(input), null, 2), mime: "application/json" },
    ];
  },
  validate(input: CompiledAgent): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    if (input.governance.approval.length) {
      warnings.push({
        code: "claude_prompt_level_gates",
        message: "Claude Projects enforce approval gates at the instruction level; the owner must approve every approval-required action before execution.",
      });
    }
    return warnings;
  },
};

function buildInstructions(input: CompiledAgent): string {
  const docs = (input.company_context?.contextDocuments ?? []).map((d) => `- ${d.title || d.fileName} (${d.bucket})`);
  return `# ${input.agent_name} — Claude Project

Compiled by Pedigree v${input.version} · trace ${input.provenance.trace_id}

## Setup
1. Create a Claude Project for this agent.
2. Paste the instructions below into the Project's custom instructions.
3. Connect the MCP servers from \`mcp-config.json\` at the stated scopes only.
${docs.length ? `4. Upload these documents into Project knowledge:\n${docs.map((d) => `   ${d}`).join("\n")}` : "4. No knowledge documents required."}

## Project instructions

${input.system_prompt}
`;
}

function buildMcpConfig(input: CompiledAgent): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const grant of input.mcp_grants) {
    mcpServers[slugify(grant.name)] = {
      // Endpoint/command intentionally left for the operator: Pedigree records
      // the approved scope, not credentials.
      command: "TODO_MCP_COMMAND_OR_URL",
      "x-pedigree": {
        server_id: grant.server_id,
        scope: grant.scope,
        source: grant.source,
        reason: grant.reason,
      },
    };
  }
  return {
    generated_by: `pedigree-compiler ${input.provenance.compiler_version}`,
    agent_id: input.agent_id,
    mcpServers,
  };
}
