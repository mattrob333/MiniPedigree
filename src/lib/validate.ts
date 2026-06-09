import type { CompanyMcpServer, McpScope } from "@/types";
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
