import type {
  ParsedMap,
  ParsedPerson,
  ParsedResponsibility,
  Person,
  DelegationClass,
  RiskLevel,
} from "@/types";
import { recommendMcp } from "./mcpCatalog";

// ── Delegation classification (PRD §11) ───────────────────────────────
const DELEGATABLE_VERBS = ["clean", "compare", "summarize", "summarise", "draft", "identify", "monitor", "review", "compile", "diff", "tag", "flag", "refresh", "pull", "compute", "analyze", "analyse", "track", "prepare", "audit", "research", "collect", "organize", "reconcile", "categorize", "scan", "detect", "generate report", "find", "list"];
const APPROVAL_VERBS = ["send", "notify", "export", "escalate", "recommend", "publish", "distribute", "schedule", "post", "share", "submit", "update record", "create ticket", "message"];
const NOT_DELEGATABLE_VERBS = ["approve", "sign off", "sign-off", "hire", "fire", "terminate", "commit", "negotiate", "set price", "pricing", "contract", "grant access", "authorize", "finalize", "decide", "change official", "official forecast", "discount", "refund"];

export function classifyTask(label: string): { cls: DelegationClass; risk: RiskLevel } {
  const t = label.toLowerCase();
  if (NOT_DELEGATABLE_VERBS.some((v) => t.includes(v))) {
    return { cls: "not_delegatable", risk: "critical" };
  }
  if (APPROVAL_VERBS.some((v) => t.includes(v))) {
    return { cls: "human_approval_required", risk: "medium" };
  }
  if (DELEGATABLE_VERBS.some((v) => t.includes(v))) {
    return { cls: "delegatable", risk: "low" };
  }
  // Conservative default per PRD: unclear -> approval, not delegatable.
  return { cls: "human_approval_required", risk: "medium" };
}

// ── Role → responsibility templates ───────────────────────────────────
interface Template {
  match: RegExp;
  responsibilities: { title: string; tasks: string[] }[];
}

const TEMPLATES: Template[] = [
  {
    match: /(chief|ceo|founder|president|owner|executive director)/i,
    responsibilities: [
      { title: "Company strategy & priorities", tasks: ["Summarize weekly business metrics", "Draft board update narrative", "Approve annual operating plan", "Commit company resources"] },
      { title: "Leadership operating cadence", tasks: ["Compile leadership meeting agenda", "Track quarterly objectives", "Make final org decisions"] },
    ],
  },
  {
    match: /(cfo|finance|controller|accounting|revenue cycle|billing|fp&a)/i,
    responsibilities: [
      { title: "Financial reporting", tasks: ["Reconcile monthly ledgers", "Summarize variance vs. budget", "Draft finance review notes", "Approve final financial statements"] },
      { title: "Billing & collections", tasks: ["Identify overdue invoices", "Compile aging report", "Approve write-offs"] },
    ],
  },
  {
    match: /(sales ops|revenue op|rev ?ops)/i,
    responsibilities: [
      { title: "Forecast hygiene", tasks: ["Clean stale forecast records", "Compare CRM updates vs. last snapshot", "Summarize forecast exceptions", "Approve final forecast number"] },
      { title: "CRM change review", tasks: ["Diff CRM field changes weekly", "Compile missing-field list", "Recommend official forecast changes"] },
    ],
  },
  {
    match: /(account executive|sales|ae\b|business development|bdr|sdr)/i,
    responsibilities: [
      { title: "Pipeline ownership", tasks: ["Identify deals with no recent activity", "Draft follow-up emails", "Summarize pipeline health", "Negotiate contract terms"] },
      { title: "Opportunity follow-up", tasks: ["Tag deals past close date", "Send next-step nudges"] },
    ],
  },
  {
    match: /(customer success|csm|support|account manager|client)/i,
    responsibilities: [
      { title: "Customer health monitoring", tasks: ["Summarize account risk notes", "Identify at-risk renewals", "Draft internal escalation summary", "Approve discounts"] },
      { title: "Onboarding & adoption", tasks: ["Track onboarding milestones", "Flag stalled accounts"] },
    ],
  },
  {
    match: /(product manager|head of product|product owner|pm\b)/i,
    responsibilities: [
      { title: "Product roadmap", tasks: ["Summarize discovery findings", "Draft roadmap update", "Compile feature backlog", "Approve roadmap commitments"] },
      { title: "Release coordination", tasks: ["Track release readiness", "Identify blockers"] },
    ],
  },
  {
    match: /(engineer|developer|swe|architect|devops|sre|ai automation)/i,
    responsibilities: [
      { title: "Delivery execution", tasks: ["Summarize open pull requests", "Draft technical notes", "Identify failing builds", "Approve production deploys"] },
      { title: "System health", tasks: ["Monitor error rates", "Compile incident summary"] },
    ],
  },
  {
    match: /(marketing|growth|demand gen|content|brand)/i,
    responsibilities: [
      { title: "Campaign reporting", tasks: ["Summarize campaign performance", "Draft content briefs", "Compile lead report", "Approve external messaging"] },
      { title: "Pipeline contribution", tasks: ["Track MQL conversion", "Identify underperforming channels"] },
    ],
  },
  {
    match: /(clinical|nurse|physician|doctor|provider|medical|care)/i,
    responsibilities: [
      { title: "Care coordination", tasks: ["Summarize patient intake notes", "Compile care-gap list", "Draft visit summaries", "Approve clinical care plans"] },
      { title: "Documentation review", tasks: ["Flag incomplete charts", "Identify follow-up needs"] },
    ],
  },
  {
    match: /(\bit\b|information technology|systems|security|infrastructure|helpdesk)/i,
    responsibilities: [
      { title: "Systems monitoring", tasks: ["Summarize open tickets", "Identify recurring issues", "Draft status update", "Grant system access"] },
      { title: "Access & compliance", tasks: ["Compile access audit", "Flag policy exceptions"] },
    ],
  },
  {
    match: /(hr|people|talent|recruit|human resources)/i,
    responsibilities: [
      { title: "People operations", tasks: ["Summarize headcount changes", "Compile onboarding checklist", "Draft policy reminders", "Approve terminations"] },
      { title: "Recruiting support", tasks: ["Track open requisitions", "Identify stalled candidates"] },
    ],
  },
  {
    match: /(operations|ops|facilities|logistics|implementation|delivery|project|program)/i,
    responsibilities: [
      { title: "Delivery & timelines", tasks: ["Summarize delayed tasks", "Identify accounts behind schedule", "Draft weekly delivery update", "Commit official launch dates"] },
      { title: "Process monitoring", tasks: ["Track milestone completion", "Flag blockers"] },
    ],
  },
  {
    match: /(analyst|data|forecast|reporting|insights|bi\b)/i,
    responsibilities: [
      { title: "Reporting & analysis", tasks: ["Pull data into model template", "Compute variance vs. last period", "Draft commentary", "Publish reports to shared drive"] },
    ],
  },
  {
    match: /(channel|partner|alliance|reseller)/i,
    responsibilities: [
      { title: "Partner management", tasks: ["Summarize partner performance", "Compile partner scorecard", "Draft enablement notes", "Approve partner agreements"] },
    ],
  },
];

const GENERIC_TEMPLATE: { title: string; tasks: string[] }[] = [
  { title: "Operational reporting", tasks: ["Summarize weekly status", "Compile activity report", "Draft internal update", "Approve final decisions"] },
];

function firstNames(name: string): string[] {
  return name.split(/\s+/).filter((p) => p.length > 1 && !p.endsWith("."));
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Pull candidate task clauses from a sentence that mentions a person.
function extractTasksFromSentence(sentence: string): string[] {
  const tasks: string[] = [];
  // Split on conjunctions / commas to find verb phrases.
  const parts = sentence.split(/,|\band\b|\bbut\b|;/i);
  for (const part of parts) {
    const m = part.match(/\b(reviews?|cleans?|compares?|summari[sz]es?|drafts?|exports?|identif\w+|monitors?|compiles?|tags?|flags?|sends?|notif\w+|approves?|signs? off|pulls?|computes?|tracks?|audits?|hunts?|chasing|running|owns?)\b\s+([^.;]{4,70})/i);
    if (m) {
      const verb = m[1].replace(/s$|ing$/i, "").trim();
      const obj = m[2].trim().replace(/\s+/g, " ");
      const label = `${capitalize(verb)} ${obj}`.replace(/\s+/g, " ").trim();
      if (label.length > 8 && label.length < 90) tasks.push(label);
    }
  }
  return tasks.slice(0, 4);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function roleResponsibilities(title: string): { title: string; tasks: string[] }[] {
  for (const t of TEMPLATES) {
    if (t.match.test(title)) return t.responsibilities;
  }
  return GENERIC_TEMPLATE;
}

let respCounter = 0;
function nextRespId(): string {
  respCounter += 1;
  return `R-${String(respCounter).padStart(3, "0")}`;
}

function bucketTasks(raw: string[]): ParsedResponsibility["tasks"] {
  const out = { delegatable: [] as string[], approval: [] as string[], not_delegatable: [] as string[] };
  for (const label of raw) {
    const { cls } = classifyTask(label);
    if (cls === "delegatable") out.delegatable.push(label);
    else if (cls === "not_delegatable") out.not_delegatable.push(label);
    else out.approval.push(label);
  }
  return out;
}

/**
 * Deterministically generate a parsed-discovery map for ANY set of people.
 * Combines role-based templates with task clauses extracted from the transcript
 * when a person is mentioned. Used as the demo / no-API-key fallback so the full
 * flow works for every uploaded CSV.
 */
export function generateParsed(people: Person[], transcript: string): ParsedMap {
  respCounter = 0;
  const sentences = splitSentences(transcript || "");
  const out: ParsedMap = {};

  for (const person of people) {
    const names = firstNames(person.name);
    const mentioned = sentences.filter((s) =>
      names.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(s)),
    );

    const responsibilities: ParsedResponsibility[] = [];

    // 1) Responsibility derived from transcript mentions, if any.
    if (mentioned.length) {
      const extracted = Array.from(new Set(mentioned.flatMap(extractTasksFromSentence)));
      if (extracted.length) {
        responsibilities.push({
          id: nextRespId(),
          title: "From discovery input",
          description: mentioned[0],
          confidence: 0.86,
          evidence_quote: mentioned[0],
          tasks: bucketTasks(extracted),
        });
      }
    }

    // 2) Role-template responsibilities (always, to give a complete map).
    for (const r of roleResponsibilities(person.title)) {
      responsibilities.push({
        id: nextRespId(),
        title: r.title,
        confidence: mentioned.length ? 0.8 : 0.62,
        tasks: bucketTasks(r.tasks),
      });
    }

    const hasDeleg = responsibilities.some((r) => r.tasks.delegatable.length > 0);
    const allText = responsibilities.map((r) => r.title + " " + Object.values(r.tasks).flat().join(" ")).join(" ");

    const parsed: ParsedPerson = {
      summary: mentioned.length
        ? trimSummary(mentioned[0])
        : `${person.title} in ${person.department}. Responsibilities inferred from role.`,
      needsReview: !mentioned.length && responsibilities.length <= 1 ? false : false,
      responsibilities,
      recommended_mcp_servers: recommendMcp(allText, person.tools),
    };
    void hasDeleg;
    out[person.id] = parsed;
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimSummary(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? clean.slice(0, 137) + "…" : clean;
}

export function suggestedAgentName(respTitle: string): string {
  const t = respTitle.toLowerCase();
  if (t.includes("forecast")) return "Forecast Cleanup Agent";
  if (t.includes("crm")) return "CRM Hygiene Agent";
  if (t.includes("pipeline")) return "Pipeline Follow-Up Agent";
  if (t.includes("customer health") || t.includes("renewal")) return "Customer Health Summary Agent";
  if (t.includes("onboarding") || t.includes("adoption")) return "Onboarding Monitor Agent";
  if (t.includes("delivery") || t.includes("timeline") || t.includes("implementation")) return "Delivery Status Agent";
  if (t.includes("report") || t.includes("analysis") || t.includes("model")) return "Reporting Analyst Agent";
  if (t.includes("care") || t.includes("clinical")) return "Care Coordination Agent";
  if (t.includes("ticket") || t.includes("systems") || t.includes("monitor")) return "Operations Monitor Agent";
  if (t.includes("partner")) return "Partner Insights Agent";
  if (t.includes("campaign") || t.includes("marketing")) return "Campaign Reporting Agent";
  // "Discovery input" / generic
  const base = respTitle.replace(/\(.*?\)/g, "").trim();
  return `${capitalize(base.split(/\s+/).slice(0, 3).join(" "))} Agent`;
}
