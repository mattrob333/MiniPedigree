import type { McpRecommendation, RiskLevel } from "@/types";

export interface McpCatalogEntry {
  name: string;
  keywords: string[];
  default_scope: "read_only" | "draft_only";
  risk: RiskLevel;
  reason: string;
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  { name: "Salesforce MCP", keywords: ["salesforce", "crm", "opportunity", "forecast", "pipeline", "account", "deal"], default_scope: "read_only", risk: "medium", reason: "Forecast records and CRM opportunity updates" },
  { name: "HubSpot MCP", keywords: ["hubspot", "contacts", "deals", "marketing"], default_scope: "read_only", risk: "medium", reason: "CRM contacts, deals, and pipeline data" },
  { name: "Slack MCP", keywords: ["slack", "message", "notify", "channel", "nudge", "internal update", "follow-up", "follow up"], default_scope: "draft_only", risk: "low", reason: "Drafting internal summaries and nudges" },
  { name: "Gmail MCP", keywords: ["email", "gmail", "send", "reply", "inbox", "outreach"], default_scope: "draft_only", risk: "medium", reason: "Drafting outbound email follow-ups" },
  { name: "Google Drive MCP", keywords: ["docs", "drive", "document", "policy", "spreadsheet", "google workspace", "workspace", "readout", "shared drive"], default_scope: "read_only", risk: "low", reason: "Reading approved documents and policy files" },
  { name: "Looker MCP", keywords: ["looker", "dashboard", "report", "analytics", "variance", "metric"], default_scope: "read_only", risk: "low", reason: "Reading dashboards and reporting metrics" },
  { name: "Snowflake MCP", keywords: ["snowflake", "warehouse", "query", "revenue data", "analytics", "data model"], default_scope: "read_only", risk: "medium", reason: "Querying the data warehouse" },
  { name: "Zendesk MCP", keywords: ["zendesk", "ticket", "support", "customer issue", "escalation"], default_scope: "read_only", risk: "medium", reason: "Reading support tickets and escalations" },
  { name: "Asana MCP", keywords: ["asana", "task", "project", "milestone", "delivery", "implementation"], default_scope: "read_only", risk: "low", reason: "Reading project tasks and milestones" },
  { name: "Linear MCP", keywords: ["linear", "issue", "sprint", "backlog", "roadmap"], default_scope: "read_only", risk: "low", reason: "Reading issues and roadmap items" },
  { name: "GitHub MCP", keywords: ["github", "git", "repo", "pull request", "pr", "code review"], default_scope: "read_only", risk: "medium", reason: "Reading repositories and pull requests" },
  { name: "Notion MCP", keywords: ["notion", "wiki", "notes", "knowledge base", "doc"], default_scope: "read_only", risk: "low", reason: "Reading internal notes and wikis" },
  { name: "Zendesk MCP", keywords: ["zendesk"], default_scope: "read_only", risk: "medium", reason: "Reading support data" },
];

/**
 * Recommend MCP servers based on free text (tools, responsibilities, tasks).
 * Default to read_only; only draft_only when the text is clearly about drafting
 * communication. Never recommends write access in v0.
 */
export function recommendMcp(text: string, knownTools: string[] = []): McpRecommendation[] {
  const hay = (text + " " + knownTools.join(" ")).toLowerCase();
  const draftSignal = /\b(draft|send|reply|nudge|notify|message|outreach|follow[- ]?up)\b/.test(hay);
  const seen = new Set<string>();
  const out: McpRecommendation[] = [];

  for (const entry of MCP_CATALOG) {
    if (seen.has(entry.name)) continue;
    if (entry.keywords.some((k) => hay.includes(k))) {
      const scope = entry.default_scope === "draft_only" && draftSignal ? "draft_only" : "read_only";
      out.push({
        name: entry.name,
        reason: entry.reason,
        recommended_scope: scope,
        risk_level: entry.risk,
      });
      seen.add(entry.name);
    }
  }
  return out.slice(0, 5);
}
