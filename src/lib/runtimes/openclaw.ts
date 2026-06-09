import type { CompiledAgent, RuntimeAdapter, RuntimeArtifact, ValidationWarning } from "./types";
import { slugify } from "../agent";

export const openclawAdapter: RuntimeAdapter = {
  id: "openclaw",
  label: "OpenClaw / OpenClaude",
  description: "Workspace package: root instructions, mounted knowledge, runtime policy manifest",
  emit(input: CompiledAgent): RuntimeArtifact[] {
    const artifacts: RuntimeArtifact[] = [
      { path: "INSTRUCTIONS.md", content: buildInstructions(input), mime: "text/markdown" },
      { path: "manifest.json", content: JSON.stringify({ ...input.manifest, version: input.version, mcp_grants: input.mcp_grants, provenance: input.provenance }, null, 2), mime: "application/json" },
      { path: "APPROVAL-GATES.md", content: buildApprovalGates(input), mime: "text/markdown" },
    ];
    for (const doc of input.company_context?.contextDocuments ?? []) {
      if (!doc.text?.trim()) continue;
      const name = slugify(doc.title || doc.fileName) || doc.id.replace(/[^a-z0-9]+/gi, "-");
      artifacts.push({
        path: `knowledge/${doc.bucket}/${name}.md`,
        content: `# ${doc.title || doc.fileName}\n\n> Source: company context document ${doc.id} (bucket: ${doc.bucket})\n\n${doc.text}`,
        mime: "text/markdown",
      });
    }
    return artifacts;
  },
  validate(input: CompiledAgent): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    if (input.governance.approval.length) {
      warnings.push({
        code: "openclaw_prompt_level_gates",
        message: "OpenClaw enforces approval gates at the instruction level; the human owner must review approval-required outputs before they are sent or written.",
      });
    }
    return warnings;
  },
};

function buildInstructions(input: CompiledAgent): string {
  return `# ${input.agent_name} — OpenClaw Workspace Instructions

This workspace was compiled by Pedigree (v${input.version}, trace ${input.provenance.trace_id}).
The root instruction block below is the agent's system prompt. \`manifest.json\` is the
runtime policy source of truth; \`knowledge/\` contains the mounted company context
documents; \`APPROVAL-GATES.md\` lists the gates the runtime must keep active.

## Root instruction block

${input.system_prompt}
`;
}

function buildApprovalGates(input: CompiledAgent): string {
  const gov = input.governance;
  const lines = [
    `# Approval Gates — ${input.agent_name}`,
    "",
    "Keep the owner approval gate active for every action below. The runtime must hold",
    "the output for human review before anything is sent or written.",
    "",
    "## Requires approval",
    ...(gov.approval.length
      ? gov.approval.map((a) => `- ${a.action} — approver: ${a.approver}${a.rule_id ? ` · rule ${a.rule_id}` : ""}`)
      : ["- (none)"]),
    "",
    "## Blocked (never perform, even with approval)",
    ...(gov.blocked.length ? gov.blocked.map((b) => `- ${b.action}${b.rule_id ? ` · rule ${b.rule_id}` : ""}`) : ["- (none)"]),
  ];
  if (gov.rule_provenance.length) {
    lines.push("", "## Why (policy evidence)", ...gov.rule_provenance.map((p) => `- ${p.rule_id} (${p.source_doc}): "${p.evidence_quote}"`));
  }
  return lines.join("\n");
}
