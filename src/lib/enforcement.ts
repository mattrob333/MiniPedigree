import type { RuntimeTargetId } from "./runtimes/types";

// ── Enforcement reality (UX backlog P0-2) ──────────────────────────────
// The manifest mixes prompt-advisory instructions with fields a runtime can
// enforce. This table states — honestly, per runtime target — where each
// control is actually enforced. Nothing here may claim enforcement for a
// runtime path that is not shipped: "enforceable" always means "the exported
// package carries this as machine-readable policy for a compatible runtime",
// never that MiniPedigree itself executes anything.

export type EnforcementStatus = "advisory" | "enforceable" | "not_yet";

export interface EnforcementEntry {
  control: string;            // manifest field/control name
  status: EnforcementStatus;
  note: string;               // plain-language where/how
}

export const ENFORCEMENT_LEGEND: Record<EnforcementStatus, { label: string; description: string }> = {
  advisory: {
    label: "Prompt-advisory",
    description: "An instruction the model is asked to follow. The human owner must review outputs; nothing technically prevents violation.",
  },
  enforceable: {
    label: "Runtime-enforceable (requires compatible runtime)",
    description: "Exported as machine-readable policy a compatible runtime can enforce. Enforcement happens in that runtime, not in Pedigree.",
  },
  not_yet: {
    label: "Not yet enforceable",
    description: "No shipped mechanism enforces this control on this runtime path today. It remains documentation.",
  },
};

type Profile = Record<string, [EnforcementStatus, string]>;

const PROFILES: Record<RuntimeTargetId, Profile> = {
  pedigree: {
    "Blocked tasks": ["enforceable", "Declared in manifest.json blocked_tasks for a consuming runtime's policy check."],
    "Approval gates": ["enforceable", "Declared with named approvers in the manifest for a consuming runtime."],
    "Tool / MCP scopes": ["enforceable", "Scoped grants in the manifest; the operator configures tools at these scopes."],
    "Schedule": ["advisory", "Recorded in the manifest; scheduling happens wherever the agent is hosted."],
    "Delivery targets": ["advisory", "Recorded in the manifest; routing is configured at the runtime."],
    "Escalation rules": ["advisory", "System-prompt instructions to escalate to the owner."],
    "Workflow steps": ["advisory", "System-prompt instructions."],
    "Memory policy": ["not_yet", "No shipped mechanism enforces memory limits."],
    "Audit events": ["not_yet", "Event names are declared; no shipped audit bus consumes them."],
  },
  hermes: {
    "Blocked tasks": ["enforceable", "Carried in hermes-manifest.json for the Hermes runtime's policy checks."],
    "Approval gates": ["enforceable", "Carried with approvers in the Hermes manifest and SOUL.md autonomy boundaries."],
    "Tool / MCP scopes": ["enforceable", "Hermes tool config restricts servers to the granted scopes."],
    "Schedule": ["enforceable", "config.yaml cron + timezone are executed by the Hermes scheduler."],
    "Delivery targets": ["enforceable", "distribution.yaml routes on_complete/on_error/on_approval."],
    "Escalation rules": ["advisory", "SOUL.md instructions; the model is asked to escalate."],
    "Workflow steps": ["advisory", "SKILL.md instructions."],
    "Memory policy": ["not_yet", "Hermes memory enforcement is not shipped."],
    "Audit events": ["not_yet", "Declared; no shipped audit bus consumes them."],
  },
  openclaw: {
    "Blocked tasks": ["enforceable", "manifest.json + APPROVAL-GATES.md feed the workspace's runtime policy checks."],
    "Approval gates": ["enforceable", "Gate list imported for runtime policy checks; owner approval stays in the loop."],
    "Tool / MCP scopes": ["enforceable", "Workspace tool mounts are configured at the granted scopes."],
    "Schedule": ["advisory", "Recorded; scheduling is configured in the workspace."],
    "Delivery targets": ["advisory", "Recorded; routing is configured in the workspace."],
    "Escalation rules": ["advisory", "Instruction-level."],
    "Workflow steps": ["advisory", "Instruction-level."],
    "Memory policy": ["not_yet", "No shipped enforcement."],
    "Audit events": ["not_yet", "Declared only."],
  },
  openai: {
    "Blocked tasks": ["advisory", "Custom GPTs/Assistants cannot block actions; the prompt instructs refusal and the owner reviews."],
    "Approval gates": ["advisory", "Prompt-level only; the owner must review before anything is sent or written."],
    "Tool / MCP scopes": ["enforceable", "Only the tools in openai-tools.json are attached; an unattached tool cannot be called."],
    "Schedule": ["not_yet", "No native scheduler for Custom GPTs/Assistants."],
    "Delivery targets": ["not_yet", "No native delivery routing."],
    "Escalation rules": ["advisory", "Instruction-level."],
    "Workflow steps": ["advisory", "Instruction-level."],
    "Memory policy": ["advisory", "Instruction-level."],
    "Audit events": ["not_yet", "Declared only."],
  },
  claude: {
    "Blocked tasks": ["advisory", "Project instructions only; the owner reviews outputs."],
    "Approval gates": ["advisory", "Prompt-level only; owner approval before execution."],
    "Tool / MCP scopes": ["enforceable", "Only the MCP servers in mcp-config.json are connected, at the stated scopes."],
    "Schedule": ["not_yet", "No native scheduler for Claude Projects."],
    "Delivery targets": ["not_yet", "No native delivery routing."],
    "Escalation rules": ["advisory", "Instruction-level."],
    "Workflow steps": ["advisory", "Instruction-level."],
    "Memory policy": ["advisory", "Instruction-level."],
    "Audit events": ["not_yet", "Declared only."],
  },
  generic: {
    "Blocked tasks": ["advisory", "Prompt-level until you implement a policy check (see SETUP.md)."],
    "Approval gates": ["not_yet", "You must implement an approval gate before any write/send (see SETUP.md)."],
    "Tool / MCP scopes": ["advisory", "Register tools at the stated scopes; enforcement depends on your harness."],
    "Schedule": ["advisory", "Configure in your scheduler."],
    "Delivery targets": ["advisory", "Configure in your harness."],
    "Escalation rules": ["advisory", "Instruction-level."],
    "Workflow steps": ["advisory", "Instruction-level."],
    "Memory policy": ["advisory", "Instruction-level."],
    "Audit events": ["advisory", "Log with the manifest trace_id (see SETUP.md)."],
  },
};

export function enforcementProfile(runtime: RuntimeTargetId): EnforcementEntry[] {
  return Object.entries(PROFILES[runtime]).map(([control, [status, note]]) => ({ control, status, note }));
}

export function enforcementSummary(entries: EnforcementEntry[]): { enforceable: number; advisory: number; notYet: number; total: number } {
  return {
    enforceable: entries.filter((e) => e.status === "enforceable").length,
    advisory: entries.filter((e) => e.status === "advisory").length,
    notYet: entries.filter((e) => e.status === "not_yet").length,
    total: entries.length,
  };
}
