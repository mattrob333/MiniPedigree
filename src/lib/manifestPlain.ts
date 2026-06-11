import type { AgentRecord, AgentRegistryEntry, FreshnessConfig } from "@/types";
import { agentFreshness, DEFAULT_FRESHNESS_CONFIG } from "./freshness";
import type { FreshnessState } from "@/types";

// ── Living Stack B.3: plain-language manifest renderer ─────────────────
// Members see their agents as plain-language cards, never raw JSON: what it
// does, what it may do alone, what needs my approval, what it's blocked
// from, which tools at which scope. Invariant (tested): every blocked task
// and approval gate in the manifest appears in the card — no silent
// omissions.

export interface PlainAgentCard {
  agent_id: string;
  name: string;
  owner_name: string;
  what_it_does: string;
  may_do_alone: string[];
  needs_my_approval: { action: string; approver: string }[];
  blocked_from: string[];
  tools: { name: string; scope: string; scope_plain: string }[];
  version: number;
  status: string;
  freshness: FreshnessState;
  policy_notes: string[];     // evidence-backed reasons ("why is this blocked?")
}

const SCOPE_PLAIN: Record<string, string> = {
  read_only: "can look, never change anything",
  draft_only: "can prepare drafts for a human to send",
  read_write: "can make changes (review-approved scope)",
  none: "no access",
};

export function buildPlainAgentCard(
  agent: AgentRecord,
  entry?: AgentRegistryEntry,
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
  now = new Date(),
): PlainAgentCard {
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const gov = manifest.governance as Record<string, any> | undefined;

  const approval: { action: string; approver: string }[] = Array.isArray(gov?.approval) && gov.approval.length
    ? gov.approval.map((a: { action: string; approver?: string }) => ({ action: a.action, approver: a.approver || agent.person.email }))
    : ((manifest.human_approval_required ?? []) as string[]).map((action) => ({ action, approver: agent.person.email }));

  const blocked: string[] = Array.isArray(gov?.blocked) && gov.blocked.length
    ? gov.blocked.map((b: { action: string }) => b.action)
    : ((manifest.blocked_tasks ?? []) as string[]);

  const allowed: string[] = (manifest.allowed_tasks ?? []) as string[];

  const tools = ((manifest.recommended_mcp_servers ?? []) as { name: string; scope: string }[]).map((server) => ({
    name: server.name,
    scope: server.scope,
    scope_plain: SCOPE_PLAIN[server.scope] ?? server.scope,
  }));

  const provenanceNotes: string[] = [];
  for (const p of (gov?.rule_provenance ?? []) as { evidence_quote?: string }[]) {
    if (p.evidence_quote) provenanceNotes.push(`Policy: "${p.evidence_quote}"`);
  }

  return {
    agent_id: String(manifest.agent_id ?? agent.id),
    name: agent.name,
    owner_name: agent.person.name,
    what_it_does: String(manifest.purpose ?? `Helps ${agent.person.name} with "${agent.task.label}" under the ${agent.respTitle} responsibility.`),
    may_do_alone: allowed,
    needs_my_approval: approval,
    blocked_from: blocked,
    tools,
    version: entry ? Math.max(...entry.versions.map((v) => v.version), 1) : 1,
    status: entry?.status ?? "draft",
    freshness: entry ? agentFreshness(entry, config, now) : "stale",
    policy_notes: provenanceNotes.slice(0, 4),
  };
}
