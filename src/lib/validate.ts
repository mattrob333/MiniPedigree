import type { AgentRecord, CompanyMcpServer, McpScope, PedigreeRow } from "@/types";
import type { CompiledAgent } from "./runtimes/types";
import { getRuntimeAdapter } from "./runtimes";

// ── Stage E: validation gates ──────────────────────────────────────────
// Hard failures block export; warnings are shown but exportable.

export interface ValidationResult {
  failures: string[];
  warnings: string[];
  ok: boolean;
}

const SCOPE_RANK: Record<McpScope, number> = { read_only: 0, draft_only: 1, read_write: 2 };

export function validateCompiledAgent(compiled: CompiledAgent, library: CompanyMcpServer[] = []): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const gov = compiled.governance;
  const spec = compiled.construction_spec;

  // FAIL: any blocked task appears in allowed tasks.
  const allowedKeys = new Set(gov.allowed.map(keyOf));
  for (const blocked of gov.blocked) {
    if (allowedKeys.has(keyOf(blocked.action))) {
      failures.push(`Blocked task "${blocked.action}" appears in allowed tasks.`);
    }
  }

  // FAIL: any approval-required action lacks a named approver.
  for (const entry of gov.approval) {
    if (!entry.approver?.trim()) {
      failures.push(`Approval-required action "${entry.action}" has no named approver.`);
    }
  }

  // FAIL: scheduled agent lacks cron + timezone.
  if (spec.operating_mode === "scheduled") {
    const schedule = spec.recommended_schedule;
    if (!schedule?.cron || !schedule.timezone) {
      failures.push("Scheduled agent is missing a cron expression and/or timezone.");
    }
    // FAIL: scheduled/delivering agent lacks a delivery target.
    if (!spec.delivery_recommendations?.some((d) => d.recipient?.trim())) {
      failures.push("Scheduled agent has no delivery target.");
    }
  }

  // FAIL: an MCP grant exceeds the scope registered in the company library.
  const byId = new Map(library.map((s) => [s.id, s]));
  for (const grant of compiled.mcp_grants) {
    if (grant.source !== "library") continue;
    const server = byId.get(grant.server_id);
    if (!server) {
      failures.push(`MCP grant "${grant.name}" references a server not in the company library.`);
      continue;
    }
    const maxApproved = Math.max(...server.approved_scopes.map((s) => SCOPE_RANK[s]));
    if (SCOPE_RANK[grant.scope] > maxApproved) {
      failures.push(`MCP grant "${grant.name}" scope ${grant.scope} exceeds the library's approved scopes (${server.approved_scopes.join(", ")}).`);
    }
  }

  // FAIL: full tool access requested without an explicit policy justification.
  for (const server of spec.tool_permissions?.mcp_servers ?? []) {
    if (server.scope === "full" && !/polic|justif|approved/i.test(server.reason ?? "")) {
      failures.push(`Full tool access requested for "${server.name}" without an explicit policy justification.`);
    }
  }

  // WARN: MCP resolved from catalog fallback rather than the company library.
  if (compiled.mcp_grants.some((g) => g.source === "catalog_fallback")) {
    warnings.push("MCP servers were resolved from the generic catalog (catalog_fallback) — register the company MCP library for governed grants.");
  }

  // WARN: task readiness was needs_clarification.
  if (compiled.task.completion?.readiness === "needs_clarification") {
    const questions = compiled.task.completion.open_questions ?? [];
    warnings.push(`Task readiness is needs_clarification${questions.length ? `: ${questions.join("; ")}` : "."}`);
  }

  // WARN: SoD finding was auto-split.
  for (const finding of gov.sod_findings) {
    if (finding.resolution === "split") {
      warnings.push(`Segregation-of-duties conflict was auto-split (${finding.rule_id}): ${finding.description}`);
    }
  }

  // WARN: runtime cannot natively enforce approval gates (prompt-level only).
  try {
    const adapter = getRuntimeAdapter(compiled.runtime);
    for (const w of adapter.validate(compiled)) warnings.push(w.message);
  } catch {
    /* unknown runtime — compileAgent would have thrown earlier */
  }

  return { failures, warnings, ok: failures.length === 0 };
}

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── "Governance preserved" pre-export checks (UX backlog P0-4) ─────────
// The invariant the product sells, made a visible step: blocked stays
// blocked, approval gates persist, nothing got demoted during enrichment.
// Hard fail blocks the download; warns are shown but exportable.

export interface PreservationCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

export function governancePreservedChecks(agent: AgentRecord, row: PedigreeRow | undefined): PreservationCheck[] {
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const allowed = new Set<string>(((manifest.allowed_tasks ?? []) as string[]).map(keyOf));
  const approval = new Set<string>(((manifest.human_approval_required ?? []) as string[]).map(keyOf));
  const blocked = new Set<string>(((manifest.blocked_tasks ?? []) as string[]).map(keyOf));
  const checks: PreservationCheck[] = [];

  const respId = agent.respId;
  const seedBlocked = (row?.tasks.not_delegatable ?? []).filter((t) => t.respId === respId).map((t) => t.label);
  const seedApproval = (row?.tasks.approval ?? []).filter((t) => t.respId === respId).map((t) => t.label);
  const seedAllowed = new Set([agent.task.label, ...(row?.tasks.delegatable ?? []).filter((t) => t.respId === respId).map((t) => t.label)].map(keyOf));

  // 1. Every blocked task in the workspace appears as blocked in the manifest.
  const droppedBlocked = seedBlocked.filter((label) => !blocked.has(keyOf(label)));
  checks.push({
    id: "blocked_preserved",
    label: "Every blocked task remains blocked in the manifest",
    status: droppedBlocked.length ? "fail" : "pass",
    detail: droppedBlocked.length ? `Missing from blocked list: ${droppedBlocked.join("; ")}` : `${seedBlocked.length} blocked task(s) verified`,
  });

  // 2. Every approval-required task retains its gate (approval or stricter).
  const droppedApproval = seedApproval.filter((label) => !approval.has(keyOf(label)) && !blocked.has(keyOf(label)));
  checks.push({
    id: "approval_preserved",
    label: "Every approval-required task retains its gate",
    status: droppedApproval.length ? "fail" : "pass",
    detail: droppedApproval.length ? `Lost their gate: ${droppedApproval.join("; ")}` : `${seedApproval.length} gate(s) verified`,
  });

  // 3. No demotion: nothing classified approval/blocked shows up as allowed.
  const demoted = [...seedBlocked, ...seedApproval].filter((label) => allowed.has(keyOf(label)));
  checks.push({
    id: "no_demotion",
    label: "No approval-required or blocked task was reclassified as allowed",
    status: demoted.length ? "fail" : "pass",
    detail: demoted.length ? `Demoted to allowed: ${demoted.join("; ")}` : undefined,
  });

  // 4. Authority expansion during workflow enrichment is surfaced, not silent.
  const expanded = ((manifest.allowed_tasks ?? []) as string[]).filter((label) => !seedAllowed.has(keyOf(label)));
  checks.push({
    id: "no_silent_expansion",
    label: "No silent authority expansion during enrichment",
    status: expanded.length ? "warn" : "pass",
    detail: expanded.length ? `Added beyond discovery seeds (review before export): ${expanded.join("; ")}` : undefined,
  });

  // 5. Owner is populated.
  const ownerEmail = String(manifest.human_owner?.email ?? agent.person.email ?? "");
  checks.push({
    id: "owner_populated",
    label: "Human owner is populated",
    status: ownerEmail ? "pass" : "fail",
    detail: ownerEmail || "Manifest has no human owner email",
  });

  // 6. Escalation path exists.
  const escalation = (manifest.construction_spec?.escalation_rules ?? []) as string[];
  checks.push({
    id: "escalation_exists",
    label: "Escalation path exists",
    status: escalation.length ? "pass" : "warn",
    detail: escalation.length ? `${escalation.length} escalation rule(s)` : "No escalation rules defined",
  });

  return checks;
}

export function preservationPassed(checks: PreservationCheck[]): boolean {
  return !checks.some((c) => c.status === "fail");
}
