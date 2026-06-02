import net from "node:net";
import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import { companyContextSchema } from "../../src/lib/schemas.js";
import type { CompanyContext } from "../../src/types.js";

const SYSTEM_PROMPT = `You are Pedigree's Company Context Analyst.

Turn a company URL plus user-provided notes into operational company context used to ground responsibility mapping and governed AI-agent construction.

You are not writing marketing copy. You are building context for safe delegation.

Rules:
- Prefer user-provided information over inferred research.
- Use the company's own terminology when available.
- Do not invent facts.
- If a detail is inferred, keep it conservative and lower confidence.
- Separate unknowns that need human confirmation.
- Capture software systems/tools mentioned by the user or reliable sources.
- Capture SOPs, approval rules, segregation of duties, compliance notes, and governance risks when present.
- Return only structured JSON matching the schema.`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" },
    url: { type: "string" },
    rawNotes: { type: "string" },
    whatWeDo: { type: "string" },
    industry: { type: "string" },
    market: { type: "string" },
    businessModel: { type: "string" },
    mission: { type: "string" },
    strategicGoals: { type: "string" },
    products: { type: "string" },
    competitors: { type: "string" },
    initiatives: { type: "string" },
    terminology: { type: "string" },
    currentState: { type: "string" },
    bottlenecks: { type: "string" },
    systems: { type: "array", items: { type: "string" } },
    sops: { type: "array", items: { type: "string" } },
    approvalRules: { type: "array", items: { type: "string" } },
    segregationOfDuties: { type: "array", items: { type: "string" } },
    complianceNotes: { type: "array", items: { type: "string" } },
    governanceRisks: { type: "array", items: { type: "string" } },
    departments: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    researchSources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          snippet: { type: "string" },
          source_type: { type: "string", enum: ["company_site", "user_text", "manual", "other"] },
        },
        required: ["url", "title", "snippet", "source_type"],
      },
    },
    confidence: { type: "number" },
    researchedAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "company",
    "url",
    "rawNotes",
    "whatWeDo",
    "industry",
    "market",
    "businessModel",
    "mission",
    "strategicGoals",
    "products",
    "competitors",
    "initiatives",
    "terminology",
    "currentState",
    "bottlenecks",
    "systems",
    "sops",
    "approvalRules",
    "segregationOfDuties",
    "complianceNotes",
    "governanceRisks",
    "departments",
    "unknowns",
    "researchSources",
    "confidence",
    "researchedAt",
    "updatedAt",
  ],
} as const;

export interface CompanyProfileParseInput {
  company?: unknown;
  url?: unknown;
  notes?: unknown;
  research_url?: unknown;
}

export type CompanyProfileParseResult =
  | { mode: "ai"; profile: CompanyContext }
  | { mode: "demo"; profile: CompanyContext; reason: string };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function titleFromHost(url?: string): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    const stem = host.split(".")[0] ?? "";
    return stem
      .split(/[-_]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function firstMeaningfulSentence(notes: string): string {
  const compact = notes.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const sentence = compact.match(/^(.{40,260}?[.!?])\s/)?.[1] ?? compact.slice(0, 260);
  return sentence.trim();
}

function extractKnownSystems(notes: string): string[] {
  const candidates = [
    "ADP",
    "Airtable",
    "Apollo",
    "Ashby",
    "BambooHR",
    "Deel",
    "Epic",
    "Excel",
    "Freshdesk",
    "Gong",
    "Google Workspace",
    "Greenhouse",
    "HubSpot",
    "Intercom",
    "Jira",
    "Lever",
    "Linear",
    "Looker",
    "Marketo",
    "Microsoft 365",
    "Microsoft Teams",
    "NetSuite",
    "Notion",
    "Okta",
    "Outreach",
    "Power BI",
    "QuickBooks",
    "Rippling",
    "Salesforce",
    "ServiceNow",
    "Shopify",
    "Slack",
    "Snowflake",
    "Stripe",
    "Tableau",
    "Waystar",
    "Workday",
    "Xero",
    "Zendesk",
  ];
  const haystack = notes.toLowerCase();
  return candidates.filter((name) => haystack.includes(name.toLowerCase()));
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata" || host === "metadata.google.internal") return true;
  return false;
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const clean = host.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(clean)) return true;
  const mapped = clean.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== "https:") throw new Error("Company URL must use https://");
  if (url.username || url.password) throw new Error("Company URL cannot include credentials");
  if (isBlockedHostname(url.hostname)) throw new Error("Company URL must be a public domain");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isBlockedIpv4(host)) throw new Error("Company URL cannot use private or local IP ranges");
  if (ipVersion === 6 && isBlockedIpv6(host)) throw new Error("Company URL cannot use private or local IP ranges");
}

export function normalizeCompanyUrl(raw: unknown): string | undefined {
  const input = asText(raw);
  if (!input) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Company URL is malformed");
  }

  assertPublicHttpsUrl(parsed);
  parsed.hash = "";
  parsed.search = "";
  if ((parsed.pathname || "") === "/") parsed.pathname = "";
  return parsed.toString().replace(/\/$/, "");
}

function buildDemoProfile(input: {
  company: string;
  url?: string;
  notes: string;
  reason?: string;
}): CompanyContext {
  const now = new Date().toISOString();
  const company = input.company || titleFromHost(input.url) || "Your company";
  const notes = input.notes;
  const systems = extractKnownSystems(notes);
  const parsed = companyContextSchema.parse({
    company,
    url: input.url ?? "",
    rawNotes: notes,
    whatWeDo: firstMeaningfulSentence(notes),
    systems,
    researchSources: notes
      ? [{ url: "user-provided-notes", title: "User-provided notes", snippet: firstMeaningfulSentence(notes), source_type: "user_text" }]
      : [],
    unknowns: input.reason ? [input.reason] : [],
    confidence: notes ? 0.35 : 0.15,
    updatedAt: now,
  });
  return parsed;
}

export async function runCompanyProfileParse(input: CompanyProfileParseInput): Promise<CompanyProfileParseResult> {
  const company = asText(input.company);
  const notes = asText(input.notes);
  const researchUrl = Boolean(input.research_url);
  let safeUrl: string | undefined;

  try {
    safeUrl = normalizeCompanyUrl(input.url);
  } catch (e) {
    return {
      mode: "demo",
      reason: (e as Error).message || "invalid_url",
      profile: buildDemoProfile({ company, notes, reason: (e as Error).message }),
    };
  }

  if (!openaiEnabled) {
    return {
      mode: "demo",
      reason: "OPENAI_API_KEY not configured",
      profile: buildDemoProfile({ company, url: safeUrl, notes, reason: "OPENAI_API_KEY not configured" }),
    };
  }

  if (!notes && !safeUrl) {
    return {
      mode: "demo",
      reason: "empty company profile input",
      profile: buildDemoProfile({ company, notes, reason: "Add a URL or notes to build richer company context." }),
    };
  }

  try {
    const now = new Date().toISOString();
    const user = `Company name: ${company || "(unknown)"}
Company URL: ${safeUrl || "(none)"}
Research requested: ${researchUrl && safeUrl ? "yes" : "no"}

User-provided raw notes:
"""
${notes}
"""

Return a single company profile. If research is requested, use web search for factual information about the company and include source URLs. If the notes conflict with public research about internal goals, systems, SOPs, or governance, prefer the notes and mark uncertain items in unknowns. researchedAt and updatedAt should be "${now}".`;

    const parsed = await callStructured<Record<string, unknown>>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: "company_profile",
      schema: responseSchema as unknown as Record<string, unknown>,
      tools: researchUrl && safeUrl ? [{ type: "web_search" }] : undefined,
      include: researchUrl && safeUrl ? ["web_search_call.action.sources"] : undefined,
    });

    const profile = companyContextSchema.parse({
      ...parsed,
      company: asText(parsed.company) || company || titleFromHost(safeUrl) || "Your company",
      url: asText(parsed.url) || safeUrl || "",
      rawNotes: notes,
      systems: uniq(Array.isArray(parsed.systems) ? parsed.systems.map(String) : []),
      sops: uniq(Array.isArray(parsed.sops) ? parsed.sops.map(String) : []),
      approvalRules: uniq(Array.isArray(parsed.approvalRules) ? parsed.approvalRules.map(String) : []),
      segregationOfDuties: uniq(Array.isArray(parsed.segregationOfDuties) ? parsed.segregationOfDuties.map(String) : []),
      complianceNotes: uniq(Array.isArray(parsed.complianceNotes) ? parsed.complianceNotes.map(String) : []),
      governanceRisks: uniq(Array.isArray(parsed.governanceRisks) ? parsed.governanceRisks.map(String) : []),
      departments: uniq(Array.isArray(parsed.departments) ? parsed.departments.map(String) : []),
      unknowns: uniq(Array.isArray(parsed.unknowns) ? parsed.unknowns.map(String) : []),
      researchedAt: researchUrl && safeUrl ? asText(parsed.researchedAt) || now : "",
      updatedAt: now,
    });
    return { mode: "ai", profile };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("company profile parse failed:", msg);
    return {
      mode: "demo",
      reason: "ai_error: " + msg.slice(0, 200),
      profile: buildDemoProfile({ company, url: safeUrl, notes, reason: "Research failed; saved user notes for review." }),
    };
  }
}
