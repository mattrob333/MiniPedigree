import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, ValidationWarning } from "./types";

export const pedigreeAdapter: RuntimeAdapter = {
  id: "pedigree",
  label: "Pedigree Standard",
  description: "Portable Pedigree manifest + system prompt",
  emit(input: CompiledAgent): RuntimeArtifact[] {
    return [
      { path: "system-prompt.txt", content: input.system_prompt, mime: "text/plain" },
      { path: "manifest.json", content: JSON.stringify(withProvenance(input), null, 2), mime: "application/json" },
    ];
  },
  validate(): ValidationWarning[] {
    return [];
  },
};

function withProvenance(input: CompiledAgent): Record<string, unknown> {
  return {
    ...input.manifest,
    version: input.version,
    mcp_grants: input.mcp_grants,
    provenance: input.provenance,
  };
}
