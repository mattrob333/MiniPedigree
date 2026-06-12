import type { ReactNode } from "react";

export interface BrandDefinition {
  id: string;
  label: string;
  logo: string;
  aliases: string[];
}

export const BRAND_DEFINITIONS: BrandDefinition[] = [
  { id: "workday", label: "Workday", logo: "/brand-logos/workday.svg", aliases: ["workday", "workday hris"] },
  { id: "oracle", label: "Oracle", logo: "/brand-logos/oracle.svg", aliases: ["oracle", "oracle hris", "oracle hcm", "oracle cloud hcm"] },
  { id: "salesforce", label: "Salesforce", logo: "/brand-logos/salesforce.svg", aliases: ["salesforce", "salesforce mcp", "sales cloud"] },
  { id: "hubspot", label: "HubSpot", logo: "/brand-logos/hubspot.svg", aliases: ["hubspot", "hubspot mcp"] },
  { id: "slack", label: "Slack", logo: "/brand-logos/slack.svg", aliases: ["slack", "slack mcp"] },
  { id: "gmail", label: "Gmail", logo: "/brand-logos/gmail.svg", aliases: ["gmail", "gmail mcp", "google mail"] },
  { id: "google", label: "Google", logo: "/brand-logos/google.svg", aliases: ["google", "google workspace", "google workspace mcp"] },
  { id: "google-drive", label: "Google Drive", logo: "/brand-logos/google-drive.svg", aliases: ["google drive", "google drive mcp", "drive"] },
  { id: "google-docs", label: "Google Docs", logo: "/brand-logos/google-docs.svg", aliases: ["google docs", "docs"] },
  { id: "google-sheets", label: "Google Sheets", logo: "/brand-logos/google-sheets.svg", aliases: ["google sheets", "sheets"] },
  { id: "google-meet", label: "Google Meet", logo: "/brand-logos/google-meet.svg", aliases: ["google meet", "meet"] },
  { id: "google-analytics", label: "Google Analytics", logo: "/brand-logos/google-analytics.svg", aliases: ["google analytics", "ga4"] },
  { id: "looker", label: "Looker", logo: "/brand-logos/looker.svg", aliases: ["looker", "looker mcp"] },
  { id: "snowflake", label: "Snowflake", logo: "/brand-logos/snowflake.svg", aliases: ["snowflake", "snowflake mcp"] },
  { id: "zendesk", label: "Zendesk", logo: "/brand-logos/zendesk.svg", aliases: ["zendesk", "zendesk mcp"] },
  { id: "asana", label: "Asana", logo: "/brand-logos/asana.svg", aliases: ["asana", "asana mcp"] },
  { id: "linear", label: "Linear", logo: "/brand-logos/linear.svg", aliases: ["linear", "linear mcp"] },
  { id: "github", label: "GitHub", logo: "/brand-logos/github.svg", aliases: ["github", "github mcp", "github actions", "github copilot"] },
  { id: "notion", label: "Notion", logo: "/brand-logos/notion.svg", aliases: ["notion", "notion mcp"] },
  { id: "airflow", label: "Apache Airflow", logo: "/brand-logos/airflow.svg", aliases: ["airflow", "apache airflow"] },
  { id: "airtable", label: "Airtable", logo: "/brand-logos/airtable.svg", aliases: ["airtable"] },
  { id: "apollo", label: "Apollo.io", logo: "/brand-logos/apollo.svg", aliases: ["apollo", "apollo.io", "apollodotio"] },
  { id: "aws", label: "AWS", logo: "/brand-logos/aws.svg", aliases: ["aws", "amazon web services"] },
  { id: "datadog", label: "Datadog", logo: "/brand-logos/datadog.svg", aliases: ["datadog"] },
  { id: "figma", label: "Figma", logo: "/brand-logos/figma.svg", aliases: ["figma"] },
  { id: "greenhouse", label: "Greenhouse", logo: "/brand-logos/greenhouse.svg", aliases: ["greenhouse"] },
  { id: "gusto", label: "Gusto", logo: "/brand-logos/gusto.svg", aliases: ["gusto"] },
  { id: "intercom", label: "Intercom", logo: "/brand-logos/intercom.svg", aliases: ["intercom"] },
  { id: "jira", label: "Jira", logo: "/brand-logos/jira.svg", aliases: ["jira", "jira software", "jira mcp"] },
  { id: "langgraph", label: "LangGraph", logo: "/brand-logos/langgraph.svg", aliases: ["langgraph", "langgraph langchain"] },
  { id: "linkedin", label: "LinkedIn", logo: "/brand-logos/linkedin.svg", aliases: ["linkedin", "linked in", "linkedin ads"] },
  { id: "microsoft-defender", label: "Microsoft Defender", logo: "/brand-logos/microsoft-defender.svg", aliases: ["microsoft defender", "defender"] },
  { id: "microsoft-entra", label: "Microsoft Entra", logo: "/brand-logos/microsoft-entra.svg", aliases: ["microsoft entra", "microsoft entra id", "microsoft intra id", "entra", "entra id", "azure ad"] },
  { id: "microsoft-copilot", label: "Microsoft Copilot", logo: "/brand-logos/microsoft-copilot.svg", aliases: ["microsoft copilot", "microsoft co pilot", "copilot", "copilot studio", "microsoft co-pilot"] },
  { id: "microsoft-excel", label: "Microsoft Excel", logo: "/brand-logos/microsoft-excel.svg", aliases: ["excel", "microsoft excel"] },
  { id: "microsoft-office", label: "Microsoft Office", logo: "/brand-logos/microsoft-office.svg", aliases: ["microsoft office", "microsoft 365", "m365", "office 365"] },
  { id: "microsoft-teams", label: "Microsoft Teams", logo: "/brand-logos/microsoft-teams.svg", aliases: ["microsoft teams", "teams"] },
  { id: "monday", label: "Monday.com", logo: "/brand-logos/monday.svg", aliases: ["monday", "monday.com", "monday com"] },
  { id: "nousresearch-hermes", label: "NousResearch Hermes", logo: "/brand-logos/nousresearch-hermes.svg", aliases: ["hermes", "hermes agent", "nousresearch hermes", "nousresearch", "nous research hermes"] },
  { id: "okta", label: "Okta", logo: "/brand-logos/okta.svg", aliases: ["okta"] },
  { id: "claude", label: "Claude", logo: "/brand-logos/claude.svg", aliases: ["claude", "anthropic claude", "claude agent"] },
  { id: "openai", label: "OpenAI", logo: "/brand-logos/openai.svg", aliases: ["openai", "chatgpt", "gpt"] },
  { id: "openclaw", label: "OpenClaw", logo: "/brand-logos/openclaw.svg", aliases: ["openclaw", "open claw", "openclaude", "open claude", "openclaude agent"] },
  { id: "quickbooks", label: "QuickBooks", logo: "/brand-logos/quickbooks.svg", aliases: ["quickbooks", "intuit quickbooks"] },
  { id: "supabase", label: "Supabase", logo: "/brand-logos/supabase.svg", aliases: ["supabase"] },
  { id: "vercel", label: "Vercel", logo: "/brand-logos/vercel.svg", aliases: ["vercel", "v0 vercel"] },
  { id: "webflow", label: "Webflow", logo: "/brand-logos/webflow.svg", aliases: ["webflow"] },
  { id: "zoom", label: "Zoom", logo: "/brand-logos/zoom.svg", aliases: ["zoom", "zoom meetings"] },
];

const MATCHERS = BRAND_DEFINITIONS.flatMap((brand) =>
  brand.aliases.map((alias) => ({ brand, alias: normalizeBrandText(alias) })),
).sort((a, b) => b.alias.length - a.alias.length);

export function findBrand(name: string | undefined | null): BrandDefinition | null {
  const normalized = normalizeBrandText(name ?? "");
  if (!normalized) return null;
  return MATCHERS.find(({ alias }) => normalized === alias || normalized.includes(alias))?.brand ?? null;
}

export function BrandLogo({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const brand = findBrand(name);
  if (!brand) return null;
  return (
    <span className={`brand-logo ${className}`} style={{ width: size, height: size }} title={`${brand.label} logo`}>
      <img src={brand.logo} alt={`${brand.label} logo`} loading="lazy" />
    </span>
  );
}

export function BrandChip({
  name,
  children,
  suffix,
  tone = "default",
  className = "",
}: {
  name: string;
  children?: ReactNode;
  suffix?: ReactNode;
  tone?: "default" | "cyan";
  className?: string;
}) {
  const brand = findBrand(name);
  return (
    <span className={`brand-chip ${tone === "cyan" ? "cyan" : ""} ${className}`}>
      {brand && <BrandLogo name={name} size={16} />}
      <span className="brand-chip-label">{children ?? name}</span>
      {suffix && <span className="brand-chip-suffix">{suffix}</span>}
    </span>
  );
}

function normalizeBrandText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(mcp|server|connector|integration|software|tool|tools|hris)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
