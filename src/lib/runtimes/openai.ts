import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, ValidationWarning } from "./types";
import { slugify } from "../agent";

export const openaiAdapter: RuntimeAdapter = {
  id: "openai",
  label: "OpenAI",
  description: "Assistant / Custom GPT instruction set + tool schema JSON",
  emit(input: CompiledAgent): RuntimeArtifact[] {
    return [
      { path: "openai-instructions.md", content: buildInstructions(input), mime: "text/markdown" },
      { path: "openai-tools.json", content: JSON.stringify(buildToolSchemas(input), null, 2), mime: "application/json" },
    ];
  },
  validate(input: CompiledAgent): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    if (input.governance.approval.length || input.governance.blocked.length) {
      warnings.push({
        code: "openai_prompt_level_gates",
        message: "OpenAI Assistants/Custom GPTs cannot natively enforce approval gates or blocks; they are prompt-level only. The owner must review outputs before they are sent or written.",
      });
    }
    return warnings;
  },
};

function buildInstructions(input: CompiledAgent): string {
  const docs = (input.company_context?.contextDocuments ?? []).map((d) => `- ${d.title || d.fileName} (${d.bucket})`);
  return `# ${input.agent_name} — OpenAI Assistant / Custom GPT

Compiled by Pedigree v${input.version} · trace ${input.provenance.trace_id}

## Setup
1. Create a new Assistant (platform.openai.com) or Custom GPT.
2. Paste the instructions below into Instructions.
3. Import \`openai-tools.json\` as the tool/function schemas; keep every tool at its stated scope.
${docs.length ? `4. Upload these knowledge documents:\n${docs.map((d) => `   ${d}`).join("\n")}` : "4. No knowledge documents required."}

## Instructions

${input.system_prompt}
`;
}

function buildToolSchemas(input: CompiledAgent): Record<string, unknown> {
  return {
    generated_by: `pedigree-compiler ${input.provenance.compiler_version}`,
    agent_id: input.agent_id,
    tools: input.mcp_grants.map((grant) => ({
      type: "function",
      function: {
        name: `${slugify(grant.name).replace(/-/g, "_")}_${grant.scope}`,
        description: `${grant.name} (${grant.scope.replace("_", "-")}). ${grant.reason} Source: ${grant.source}.`,
        parameters: {
          type: "object",
          properties: {
            request: { type: "string", description: "What to read or draft. Writes beyond the stated scope are not permitted." },
          },
          required: ["request"],
        },
      },
      "x-pedigree": {
        server_id: grant.server_id,
        scope: grant.scope,
        source: grant.source,
      },
    })),
  };
}
