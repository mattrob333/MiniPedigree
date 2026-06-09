import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, ValidationWarning } from "./types";
import { buildDeploymentGuide } from "../agent";

export const genericAdapter: RuntimeAdapter = {
  id: "generic",
  label: "Generic runtime",
  description: "Manifest + prompt + SETUP.md (LangGraph / CrewAI notes)",
  emit(input: CompiledAgent): RuntimeArtifact[] {
    return [
      { path: "manifest.json", content: JSON.stringify({ ...input.manifest, version: input.version, mcp_grants: input.mcp_grants, provenance: input.provenance }, null, 2), mime: "application/json" },
      { path: "prompt.txt", content: input.system_prompt, mime: "text/plain" },
      { path: "SETUP.md", content: buildDeploymentGuide(input.manifest as Record<string, any>), mime: "text/markdown" },
    ];
  },
  validate(input: CompiledAgent): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    if (input.governance.approval.length) {
      warnings.push({
        code: "generic_implement_gates",
        message: "Generic runtimes must implement an approval gate for the human-approval-required actions before any write/send (see SETUP.md).",
      });
    }
    return warnings;
  },
};
