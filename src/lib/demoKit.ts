import type { CompanyContext, MappingSessionType, ParsedMap, ParsedTask, Person } from "@/types";
import { buildDemoSessionText } from "./sessions";

// ── Demo kit: curated inputs for every step of the flow ────────────────
// Built around the Lumen Bay sample org (8 people) so a presenter can walk
// upload → context → discovery → review → matrix → agents → digest →
// My Pedigree with realistic data at each beat. Every transcript deliberately
// exercises the engine: cadences and tools by name (completion context),
// approval statements (authority assertions), prohibitions (governance
// rules), pain language (optimizer scoring), and open questions (backlog).
// Falls back to the generic generator for non-demo orgs.
// Presenter walkthrough: docs/demo-script.md.

// ── Company context: scores 16/16 on the readiness rubric ──────────────

const SOD_DOC_TEXT = `Lumen Bay — Segregation of Duties (v1.2)

1. The same person may not both prepare and release a vendor payment. Jordan
   Kim prepares payment runs; Avery Collins releases them.
2. The same person may not both issue a customer discount and approve it.
   Account Executives prepare discounted proposals; the Head of Revenue
   approves any discount above 15%.
3. Engineers may not approve their own production deploys for billing-path
   services; a second engineer must review.
4. Whoever administers HubSpot may not also approve CRM data deletions.`;

const POLICY_DOC_TEXT = `Lumen Bay — Approval & Operating Policy (v2.0)

Spending: purchases above $2,000 must be approved by Avery Collins. Purchases
above $10,000 require board notification.
Discounts: discounts above 15% require Head of Revenue approval; above 25%
require the CEO to sign off.
Refunds: customer refunds above $500 require Avery's sign-off and must be
logged in the refund register.
External communication: no AI-drafted email may be sent to a customer without
human review. Outbound pricing pages must be approved by Priya Shah.
Data: customer PII must never leave HubSpot or Intercom. All access grants
must be logged and reviewed quarterly.
SOP-7 (Onboarding): every new customer gets a kickoff within 5 business days;
the CSM owns the checklist in Notion and marks completion in HubSpot.
SOP-12 (Pipeline hygiene): stale deals (30+ days without activity) are
flagged every Monday and either revived or closed-lost by Friday.`;

export function demoCompanyContext(companyName: string): CompanyContext {
  const now = new Date().toISOString();
  return {
    companyId: "",
    company: companyName,
    url: "https://lumenbay.example",
    whatWeDo:
      "Lumen Bay builds an analytics layer for mid-market e-commerce brands: we ingest storefront, ad, and fulfillment data and give operators a daily margin picture per SKU, replacing the spreadsheet stitching their ops teams do by hand.",
    industry: "B2B SaaS — e-commerce analytics",
    market: "Mid-market DTC and marketplace brands ($5–50M GMV), North America first",
    businessModel: "Monthly SaaS subscription tiered by order volume, plus an onboarding fee",
    mission: "Every operator should know their true margin by 9am.",
    strategicGoals:
      "1. Reach $2M ARR by Q4 (currently $1.1M)\n2. Cut onboarding time from 3 weeks to 1 week this year\n3. Launch the agency partner channel in H2\n4. Keep logo churn under 2% monthly",
    products: "Margin dashboard, SKU profitability alerts, ad-spend reconciliation",
    competitors: "Triple Whale, Glew, in-house spreadsheets",
    initiatives: "Onboarding automation push (Q3); HubSpot data hygiene cleanup; agency partner pilot",
    terminology:
      "margin snapshot, SKU ledger, blended ROAS, onboarding runway, kickoff call, hygiene pass, stale deal, refund register, partner desk",
    currentState: "8 people, founder-led sales transitioning to a small revenue team; product-market fit in the $5–20M GMV segment.",
    bottlenecks:
      "Customer onboarding eats Camila's week — the kickoff checklist is manual and takes forever. Pipeline hygiene slips every single week because Lucas does it by hand in HubSpot. Vendor invoicing and scheduling pile up on Jordan. Investor updates take Avery two days a month.",
    systems: ["HubSpot", "Intercom", "Notion", "Linear", "GitHub", "Slack", "Google Workspace", "Apollo", "Vercel", "Supabase"],
    sops: [
      "SOP-7 Customer onboarding: kickoff within 5 business days, CSM owns the Notion checklist",
      "SOP-12 Pipeline hygiene: stale deals flagged Mondays, revived or closed-lost by Friday",
    ],
    approvalRules: [
      "Purchases above $2,000 must be approved by Avery Collins.",
      "Discounts above 15% require Head of Revenue approval; above 25% the CEO signs off.",
      "Customer refunds above $500 require Avery's sign-off and must be logged in the refund register.",
      "No AI-drafted email may be sent to a customer without human review.",
    ],
    segregationOfDuties: [
      "The same person may not both prepare and release a vendor payment.",
      "The same person may not both issue a customer discount and approve it.",
    ],
    complianceNotes: ["Customer PII must never leave HubSpot or Intercom."],
    governanceRisks: ["Founder approves most things — single point of failure on approvals."],
    departments: ["Executive", "Product", "Engineering", "Revenue", "Sales", "Customer Success", "Operations"],
    unknowns: ["Who owns the renewal handoff after onboarding?"],
    kpis: [
      { department: "Executive", metric: "ARR", cadence: "monthly", owner_hint: "Avery" },
      { department: "Revenue", metric: "Pipeline coverage (3x)", cadence: "weekly", owner_hint: "Priya" },
      { department: "Sales", metric: "Stale-deal count", cadence: "weekly", owner_hint: "Lucas" },
      { department: "Customer Success", metric: "Onboarding runway (days to kickoff)", cadence: "weekly", owner_hint: "Camila" },
      { department: "Product", metric: "Activation rate", cadence: "monthly", owner_hint: "Maya" },
      { department: "Engineering", metric: "Deploy frequency", cadence: "weekly", owner_hint: "Ethan" },
      { department: "Operations", metric: "Vendor invoice cycle time", cadence: "monthly", owner_hint: "Jordan" },
    ],
    contextDocuments: [
      {
        id: "demo:sod-matrix",
        bucket: "segregation_of_duties",
        fileName: "lumen-bay-sod-matrix.md",
        title: "Segregation of Duties v1.2",
        mimeType: "text/markdown",
        sizeBytes: SOD_DOC_TEXT.length,
        text: SOD_DOC_TEXT,
        uploadedAt: now,
        classification: "internal",
      },
      {
        id: "demo:approval-policy",
        bucket: "policy",
        fileName: "lumen-bay-approval-policy.md",
        title: "Approval & Operating Policy v2.0",
        mimeType: "text/markdown",
        sizeBytes: POLICY_DOC_TEXT.length,
        text: POLICY_DOC_TEXT,
        uploadedAt: now,
        classification: "internal",
      },
    ],
    researchSources: [{ url: "user-provided-notes", title: "Demo context (Lumen Bay)", source_type: "user_text" }],
    confidence: 0.92,
    updatedAt: now,
  };
}

// ── Discovery session transcripts (curated per anchor) ─────────────────

const LEADERSHIP_TRANSCRIPT = `Avery: Let me walk through how the company actually runs. I own fundraising, the investor update, final pricing, and hiring. The investor update takes me two full days every month — I pull metrics from HubSpot and our margin dashboard, write the narrative, and send it to the board on the first Friday. Honestly the data-pull part is pure drudgery; the narrative is the part only I can do.

Avery: On approvals — I can approve spend up to ten thousand dollars on my own; anything above that goes to the board. I sign off on every refund above five hundred dollars, and I release the vendor payments that Jordan prepares. I never want anyone else releasing payments.

Maya: I own the product roadmap and discovery. Every other Monday I compile the roadmap update from Linear and customer calls and publish it to Notion. I also triage the feedback inbox weekly — tagging Intercom conversations and pulling themes. Tagging is mechanical; deciding what makes the roadmap is mine. I approve every roadmap commitment myself.

Priya: I own revenue — pipeline, partnerships, and pricing. Every Monday morning I review pipeline coverage in HubSpot and prep the forecast for Avery by noon; it means pulling the deal list, checking stage accuracy, and writing a one-paragraph summary. Lucas does the hygiene pass before that. I approve any discount above fifteen percent — Lucas can't approve his own discounts, that's deliberate.

Jordan: I keep the lights on — scheduling, vendor management, and internal admin. Every month I prepare the vendor payment run: collect invoices from email, enter them in the sheet, match them to POs, and hand the run to Avery to release. I also book all the team travel and keep the equipment inventory in Notion. The invoice matching takes forever, it's all manual.

Avery: The thing that worries me operationally is onboarding — Camila is drowning, and nobody is sure who owns the renewal handoff after onboarding finishes. That's the gap I want this exercise to close.`;

const REVENUE_TRANSCRIPT = `Priya: Our world runs on a weekly rhythm. Monday is the hygiene pass and forecast; Wednesday is partner day; Friday we close out the week's deals.

Lucas: I'll walk through my Monday. Every Monday morning I go deal by deal in HubSpot: anything without activity for thirty days gets flagged stale, I update the stage and next step on each one, then I send the stale-deal list to Priya before our ten o'clock. It takes me about two hours, every single week, and it's entirely mechanical — read the deal, check the last activity date, flag it.

Lucas: After that I draft follow-up emails for the deals that went quiet. I write maybe fifteen a week. I'd happily hand the first drafts to a competent new hire — I rewrite half of them anyway. I can send routine follow-ups myself, but anything with pricing in it goes through Priya. I can offer up to fifteen percent discount without sign-off; beyond that Priya approves.

Camila: My week is onboarding and renewals. When a deal closes, I run SOP-7: create the Notion checklist, schedule the kickoff within five days, configure their HubSpot properties, and walk them through the first margin snapshot. The checklist setup is identical every time — create pages, copy the template, fill in the account fields. Pure copy-paste, takes forever. The kickoff call itself is the part I'd never hand off.

Camila: For renewals, ninety days out I pull the usage report from Intercom and HubSpot, write a health summary, and decide whether it's a green renewal or needs an exec touch. I can renew green accounts at flat pricing on my own; any renewal with a price change needs Priya. One open question from my side: after onboarding ends, the renewal handoff is fuzzy — sometimes Lucas keeps the relationship, sometimes I do.

Priya: To be explicit about my ceiling: I approve discounts from fifteen to twenty-five percent, Avery signs off beyond that. I prepare the final forecast number but Avery owns committing it to the board. And nobody on my team approves their own discounts — preparer and approver stay separate.`;

const PRODUCT_TRANSCRIPT = `Maya: Product runs two-week cycles. Every other Monday I compile the roadmap update: pull shipped items and slipped items from Linear, summarize customer feedback themes, and publish the update to Notion for the whole company. The compiling is rote; the prioritization calls are mine alone — I approve every roadmap commitment.

Ethan: I own delivery. Daily I review open pull requests and keep the build green; every Friday I compile the release notes from merged PRs and post them to Slack. Release notes are completely mechanical — title, ticket link, one line each. I monitor Vercel and Supabase dashboards for errors each morning. I approve production deploys, except billing-path services where a second engineer reviews — that's our rule.

Noah: I build the internal AI workflows. Weekly I review the automation backlog, prototype one workflow, and demo it Friday. I also maintain the prompt library in Notion and update evals when models change. The eval runs are scripted — kick off, wait, paste results into the tracker. I'd hand the tracker updates off in a heartbeat. I have admin on our OpenAI org, for the record, and read-write on GitHub.

Maya: Open question for this exercise: feedback tagging — I do it today, but if Camila's onboarding load lightens, it might sit better with her team since they're in Intercom all day anyway.`;

const OPERATIONS_TRANSCRIPT = `Jordan: My month has three recurring blocks. First: the vendor payment run. I collect invoices from the ops inbox, enter each into the payment sheet, match them against POs, chase the missing ones, and hand the prepared run to Avery — I prepare, Avery releases, always. The collect-enter-match loop is four or five hours of pure manual work every month.

Jordan: Second: scheduling. I manage Avery's external calendar, book team travel, and coordinate the board meeting logistics quarterly. Routine scheduling I could hand off tomorrow; the board logistics I'd keep — too many judgment calls.

Jordan: Third: internal admin. I keep the equipment inventory in Notion, order replacements under five hundred dollars on my own authority — that's my ceiling, anything above goes to Avery — and run the monthly all-hands deck assembly: collect each lead's slide, merge, fix formatting. The deck assembly is identical every month and takes a full afternoon.`;

const DEMO_TRANSCRIPTS: { match: RegExp; type: MappingSessionType | "any"; text: string }[] = [
  { match: /avery/i, type: "leadership_session", text: LEADERSHIP_TRANSCRIPT },
  { match: /priya/i, type: "any", text: REVENUE_TRANSCRIPT },
  { match: /maya/i, type: "any", text: PRODUCT_TRANSCRIPT },
  { match: /jordan/i, type: "any", text: OPERATIONS_TRANSCRIPT },
];

/** Curated transcript for the demo org; generic generator for anyone else. */
export function demoTranscript(anchor: Person, reports: Person[], sessionType: MappingSessionType): string {
  const curated = DEMO_TRANSCRIPTS.find(
    (t) => t.match.test(anchor.name) && (t.type === "any" || t.type === sessionType),
  );
  return curated?.text ?? buildDemoSessionText(anchor, reports, sessionType);
}

export const LUMEN_BAY_ENRICHED_DETAILS: Record<string, Partial<ParsedTask>> = {
  "investor update": {
    plain_language_description: "Pull the current company metrics, draft the board-facing update, and separate the mechanical data gathering from Avery's narrative judgment.",
    inputs: ["HubSpot metrics", "margin dashboard data", "monthly KPI notes"],
    outputs: ["draft investor update", "metric summary for Avery"],
    definition_of_done: "Metrics are current; draft narrative is ready for Avery's final edit; board send date is clear.",
  },
  "vendor payment run": {
    plain_language_description: "Collect invoices, match them to purchase orders, prepare the payment run, and leave release authority with Avery.",
    inputs: ["vendor invoices", "PO records", "payment sheet"],
    outputs: ["prepared payment run", "missing-invoice follow-up list"],
    definition_of_done: "Every invoice is matched or flagged; payment run is ready for Avery to release.",
  },
  "roadmap update": {
    plain_language_description: "Compile shipped work, slipped work, and customer feedback into the company roadmap update.",
    inputs: ["Linear issues", "customer call notes", "feedback themes"],
    outputs: ["Notion roadmap update"],
    definition_of_done: "Update is published in Notion with shipped, slipped, and next-priority sections.",
  },
  "feedback inbox": {
    plain_language_description: "Triage Intercom feedback, tag conversations, and surface recurring product themes for Maya's prioritization.",
    inputs: ["Intercom conversations", "customer feedback tags"],
    outputs: ["tagged feedback inbox", "theme summary"],
    definition_of_done: "New feedback is tagged and recurring themes are summarized for roadmap review.",
  },
  "pipeline coverage": {
    plain_language_description: "Review HubSpot coverage, verify deal-stage accuracy, and prepare the forecast summary for Priya and Avery.",
    inputs: ["HubSpot deal list", "stage accuracy checks", "stale-deal notes"],
    outputs: ["pipeline coverage summary", "forecast prep note"],
    definition_of_done: "Coverage is reviewed before Monday noon and follow-ups are clearly called out.",
  },
  "discount": {
    plain_language_description: "Review discount requests against approval thresholds and keep preparer and approver separate.",
    inputs: ["discount request", "deal terms", "approval threshold"],
    outputs: ["approved or escalated discount decision"],
    definition_of_done: "Discount has the right approver and no seller approved their own follow-up.",
  },
  "equipment inventory": {
    plain_language_description: "Maintain the Notion inventory of company equipment and identify replacements needing approval.",
    inputs: ["Notion inventory", "replacement requests"],
    outputs: ["updated equipment inventory", "replacement purchase list"],
    definition_of_done: "Inventory is current and purchases above Jordan's ceiling are routed to Avery.",
  },
};

function enrichmentFor(name: string): Partial<ParsedTask> {
  const lower = name.toLowerCase();
  const exact = Object.entries(LUMEN_BAY_ENRICHED_DETAILS).find(([key]) => lower.includes(key));
  if (exact) return exact[1];
  return {
    plain_language_description: `Turn "${name}" into a repeatable operating task with named inputs, outputs, and a clear done state.`,
    inputs: ["source system or transcript-mentioned inputs", "owner-provided context"],
    outputs: [`completed ${name.toLowerCase()} artifact or decision`],
    definition_of_done: "Inputs are checked; output is ready for the human owner to approve or use.",
  };
}

export function applyDemoEnrichment(parsed: ParsedMap): ParsedMap {
  const next: ParsedMap = {};
  for (const [personId, row] of Object.entries(parsed)) {
    next[personId] = {
      ...row,
      responsibilities: row.responsibilities.map((resp) => ({
        ...resp,
        taskDetails: resp.taskDetails?.map((task) => ({
          ...task,
          ...enrichmentFor(task.name),
          delegation_class: task.delegation_class,
          evidence_quote: task.evidence_quote,
          source: task.source,
        })),
      })),
    };
  }
  return next;
}

// ── Maintenance standups (Digest tab) ──────────────────────────────────
// Standup 1: confirmations + a vague candidate (stays ledgered) + a rule
// signal (top of digest). Standup 2: corroborates the candidate with
// recurrence language (promotes), drift, agent feedback, and a retirement.

export const DEMO_STANDUPS: { label: string; text: string }[] = [
  {
    label: "Revenue standup — Monday",
    text: `Priya: Quick round. Lucas, where are we?
Lucas: Hygiene pass done — flagged the stale deals in HubSpot this morning and sent the list before ten. Also spent an hour compiling the churn digest for the exec team, the cancel-reason rollup. Painful, all manual.
Camila: Kickoffs on track — ran the SOP-7 checklist for both new accounts and scheduled the kickoff calls inside five days.
Priya: One policy thing from leadership: from now on, every new vendor contract above $1,000 must be approved by Jordan before signature.
Jordan: Vendor run prepared and handed to Avery on Friday.`,
  },
  {
    label: "Revenue standup — Friday",
    text: `Priya: Friday close-out. Lucas?
Lucas: Follow-ups sent. And I spent another hour compiling the churn digest for the exec team — Maya wants it every Friday going forward, so that's weekly now. Takes forever by hand.
Camila: Heads up — I'm moving the renewal usage pull to Thursdays instead of Mondays, the Intercom export is fresher then.
Priya: Noted. Also, the Pipeline Hygiene agent's draft summary missed the two renewals Lucas flagged manually — someone should look at its scope.
Jordan: We killed the weekly equipment export — Notion does it automatically now, so I've stopped producing it.`,
  },
];

/** Org refresh transcript (full discovery refresh / changeset path). */
export const DEMO_ORG_REFRESH = `Avery: Two org changes from this week's leadership sync. First, the renewal handoff question is settled: renewals move from Camila to Lucas — Lucas owns the renewal pipeline end to end now, Camila stays focused on onboarding through day ninety.
Priya: Agreed, and Lucas also picks up compiling the weekly win-loss notes for the exec team, every Friday.
Avery: Second, policy: discounts above twenty percent now require my sign-off as well as Priya's — tightening that while we test new pricing.`;
