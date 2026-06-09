import type { CompanyContext, CompanyMcpServer, McpGrant, McpScope, Person, TaskItem } from "@/types";
import { MCP_CATALOG, recommendMcp } from "./mcpCatalog";

// ── Company MCP Library: CRUD over the workspace's approved tool surface ──
// The library is the company's own registered MCP servers. Grants are always
// resolved from it when present; the static catalog is only a tagged fallback.

export interface McpServerDraft {
  name: string;
  endpoint?: string;
  approved_scopes?: McpScope[];
  default_scope?: "read_only" | "draft_only";
  owner_email: string;
  systems_matched?: string[];
  notes?: string;
}

export function addMcpServer(library: CompanyMcpServer[], draft: McpServerDraft): CompanyMcpServer[] {
  const server: CompanyMcpServer = {
    id: newServerId(draft.name),
    name: draft.name.trim(),
    endpoint: draft.endpoint?.trim() || undefined,
    approved_scopes: normalizeScopes(draft.approved_scopes),
    default_scope: draft.default_scope === "draft_only" ? "draft_only" : "read_only",
    owner_email: draft.owner_email,
    systems_matched: (draft.systems_matched ?? []).map((s) => s.trim()).filter(Boolean),
    notes: draft.notes,
    added_at: new Date().toISOString(),
  };
  // default_scope must always be inside approved_scopes
  if (!server.approved_scopes.includes(server.default_scope)) {
    server.approved_scopes = [...server.approved_scopes, server.default_scope];
  }
  return [...library, server];
}

export function updateMcpServer(library: CompanyMcpServer[], id: string, patch: Partial<McpServerDraft>): CompanyMcpServer[] {
  return library.map((server) => {
    if (server.id !== id) return server;
    const next: CompanyMcpServer = {
      ...server,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.endpoint !== undefined ? { endpoint: patch.endpoint.trim() || undefined } : {}),
      ...(patch.approved_scopes !== undefined ? { approved_scopes: normalizeScopes(patch.approved_scopes) } : {}),
      ...(patch.default_scope !== undefined ? { default_scope: patch.default_scope === "draft_only" ? "draft_only" as const : "read_only" as const } : {}),
      ...(patch.owner_email !== undefined ? { owner_email: patch.owner_email } : {}),
      ...(patch.systems_matched !== undefined ? { systems_matched: patch.systems_matched.map((s) => s.trim()).filter(Boolean) } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    };
    if (!next.approved_scopes.includes(next.default_scope)) {
      next.approved_scopes = [...next.approved_scopes, next.default_scope];
    }
    return next;
  });
}

export function removeMcpServer(library: CompanyMcpServer[], id: string): CompanyMcpServer[] {
  return library.filter((server) => server.id !== id);
}

function normalizeScopes(scopes?: McpScope[]): McpScope[] {
  const valid = (scopes ?? []).filter((s): s is McpScope => s === "read_only" || s === "draft_only" || s === "read_write");
  return valid.length ? Array.from(new Set(valid)) : ["read_only"];
}

function newServerId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "mcp";
  return `mcp-${slug}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// ── Seeding: propose library entries from company systems + known tools ──

export interface McpLibraryProposal {
  draft: McpServerDraft;
  reason: string;
}

/**
 * Propose library entries from company-context `systems` and people `known_tools`,
 * mapped through the static catalog. Proposals require user confirmation before
 * becoming library entries — this function never writes.
 */
export function seedLibraryProposals(
  companyContext: CompanyContext | undefined,
  people: Person[],
  existing: CompanyMcpServer[] = [],
  ownerEmail = "",
): McpLibraryProposal[] {
  const systems = companyContext?.systems ?? [];
  const tools = Array.from(new Set(people.flatMap((p) => p.tools)));
  const existingNames = new Set(existing.map((s) => keyOf(s.name)));
  const proposals: McpLibraryProposal[] = [];
  const seen = new Set<string>();

  for (const term of [...systems, ...tools]) {
    const hay = term.toLowerCase();
    for (const entry of MCP_CATALOG) {
      if (!entry.keywords.some((k) => hay.includes(k))) continue;
      const key = keyOf(entry.name);
      if (seen.has(key) || existingNames.has(key)) continue;
      seen.add(key);
      proposals.push({
        draft: {
          name: entry.name,
          approved_scopes: [entry.default_scope],
          default_scope: entry.default_scope,
          owner_email: ownerEmail,
          systems_matched: [term],
        },
        reason: `${entry.reason} (matched "${term}")`,
      });
      break;
    }
  }
  return proposals;
}

// ── Resolution: match a task against the library and emit scoped grants ──

/**
 * Resolve the MCP grants a task needs from the company library.
 * Matches on tools_mentioned, inputs/outputs sources, and systems_matched.
 * Grant scope is the library default_scope — never wider. If the library is
 * empty, falls back to the static catalog tagged `source: "catalog_fallback"`.
 */
export function resolveMcpGrants(task: TaskItem, library: CompanyMcpServer[], knownTools: string[] = []): McpGrant[] {
  if (!library.length) {
    return recommendMcp([task.respTitle, task.label, ...(task.completion?.tools_mentioned ?? [])].join(" "), knownTools)
      .map((rec) => ({
        server_id: `catalog:${keyOf(rec.name).replace(/\s+/g, "-")}`,
        name: rec.name,
        scope: rec.recommended_scope === "draft_only" ? "draft_only" as const : "read_only" as const,
        source: "catalog_fallback" as const,
        reason: rec.reason,
      }));
  }

  const completion = task.completion;
  const matchTerms = [
    ...(completion?.tools_mentioned ?? []),
    ...(completion?.inputs ?? []),
    ...(completion?.outputs ?? []),
    ...knownTools,
    task.label,
    task.respTitle,
  ].map((t) => t.toLowerCase());

  const grants: McpGrant[] = [];
  for (const server of library) {
    const names = [server.name, ...server.systems_matched].map((n) => n.toLowerCase()).filter(Boolean);
    const matched = matchTerms.find((term) => names.some((n) => term.includes(n) || n.includes(term)));
    if (!matched) continue;
    // Scope = library default, clamped to the approved scope list — never wider.
    const scope: McpScope = server.approved_scopes.includes(server.default_scope) ? server.default_scope : "read_only";
    grants.push({
      server_id: server.id,
      name: server.name,
      scope,
      source: "library",
      reason: `Matched task context "${matched}" against the company MCP library.`,
    });
  }
  return grants;
}

function keyOf(s: string): string {
  return s.trim().toLowerCase();
}
