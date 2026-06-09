import type { CompanyContext, ParsedMap, ParsedResponsibility, Person } from "@/types";
import { generateParsed } from "./parse";
import { recommendMcp } from "./mcpCatalog";
import { companyContextSchema, parsedDiscoverySchema } from "./schemas";

export interface ParseOutcome {
  parsed: ParsedMap;
  source: "ai" | "local";
  notes: string[];
}

/**
 * Parse a discovery transcript into a per-person ParsedMap.
 * Tries the server (real OpenAI structured outputs) first; on any failure or
 * when the server signals demo mode, falls back to deterministic local parsing
 * so the flow always works.
 */
export async function parseDiscovery(
  people: Person[],
  transcript: string,
  scopeIds?: string[],
  companyContext?: CompanyContext,
): Promise<ParseOutcome> {
  const scoped = scopeIds && scopeIds.length ? people.filter((p) => scopeIds.includes(p.id)) : people;

  try {
    const res = await fetch("/api/discovery/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        company_context: companyContext,
        people: scoped.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          title: p.title,
          department: p.department,
          known_tools: p.tools.join(", "),
        })),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json?.mode === "ai" && json?.discovery) {
        const discovery = parsedDiscoverySchema.parse(json.discovery);
        return { parsed: discoveryToMap(discovery, scoped), source: "ai", notes: discovery.global_notes };
      }
    }
  } catch {
    // fall through to local
  }

  return { parsed: generateParsed(scoped, transcript), source: "local", notes: [] };
}

function discoveryToMap(
  discovery: ReturnType<typeof parsedDiscoverySchema.parse>,
  people: Person[],
): ParsedMap {
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const out: ParsedMap = {};
  let rc = 0;

  for (const upd of discovery.people_updates) {
    const person = byEmail.get(upd.person_email.toLowerCase());
    if (!person) continue;

    const responsibilities: ParsedResponsibility[] = upd.responsibilities.map((r) => {
      rc += 1;
      const id = `R-${String(rc).padStart(3, "0")}`;
      const tasks = { delegatable: [] as string[], approval: [] as string[], not_delegatable: [] as string[] };
      for (const t of r.tasks) {
        if (t.delegation_class === "delegatable") tasks.delegatable.push(t.name);
        else if (t.delegation_class === "not_delegatable") tasks.not_delegatable.push(t.name);
        else tasks.approval.push(t.name);
      }
      return {
        id,
        title: r.name,
        description: r.description,
        confidence: r.confidence,
        evidence_quote: r.evidence_quote,
        tasks,
        taskDetails: r.tasks,
      };
    });

    out[person.id] = {
      summary: upd.summary || `${person.title} in ${person.department}.`,
      needsReview: upd.match_confidence < 0.6,
      responsibilities,
      recommended_mcp_servers: upd.recommended_mcp_servers.length
        ? upd.recommended_mcp_servers
        : recommendMcp(responsibilities.map((r) => r.title).join(" "), person.tools),
    };
  }

  // Anyone not returned by the model gets a role-based fallback so the map is complete.
  for (const p of people) {
    if (!out[p.id]) {
      const fallback = generateParsed([p], "");
      out[p.id] = fallback[p.id];
    }
  }
  return out;
}

import type { AgentConstructionSpec } from "./agent";

export interface AuthorAgentPayload {
  agentName: string;
  person: { name: string; title: string; department: string; email: string; tools: string[] };
  responsibility: { title: string };
  task: { label: string };
  allowed: string[];
  approval: string[];
  blocked: string[];
  mcp: { name: string; scope: string }[];
  company_context?: CompanyContext;
  policy: string;
  riskLevel: string;
}

/**
 * Ask the server (GPT-5.5) to author the agent construction spec. Returns the authored
 * object, or null to signal the caller should fall back to the deterministic template.
 */
export async function authorAgent(payload: AuthorAgentPayload): Promise<AgentConstructionSpec | null> {
  try {
    const res = await fetch("/api/agents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.mode === "ai" && json.authored) return json.authored as AgentConstructionSpec;
    return null;
  } catch {
    return null;
  }
}

export async function transcribeAudio(file: File): Promise<{ transcript: string; provider: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "Transcription failed. Try a smaller file or paste the transcript directly.");
  }
  const json = await res.json();
  if (!json?.transcript) throw new Error("Transcription returned no text.");
  return { transcript: json.transcript, provider: json.provider ?? "openai" };
}

export interface CompanyProfileParseOutcome {
  profile: CompanyContext;
  source: "ai" | "demo";
  reason?: string;
}

export async function parseCompanyProfile(args: {
  company?: string;
  url?: string;
  notes: string;
  researchUrl: boolean;
}): Promise<CompanyProfileParseOutcome> {
  const res = await fetch("/api/company/profile/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: args.company,
      url: args.url,
      notes: args.notes,
      research_url: args.researchUrl,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "Company profile parsing failed.");
  }
  const json = await res.json();
  if (!json?.profile) throw new Error("Company profile parser returned no profile.");
  return {
    profile: companyContextSchema.parse(json.profile) as CompanyContext,
    source: json.mode === "ai" ? "ai" : "demo",
    reason: typeof json.reason === "string" ? json.reason : undefined,
  };
}
