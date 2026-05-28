import type { ParsedMap, Person } from "@/types";

// ── Northwind Co. demo (matches the original prototype) ───────────────
export const DEMO_PEOPLE: Person[] = [
  { id: "P-001", name: "Jane Smith", email: "jane.smith@northwind.co", title: "Sales Operations Manager", department: "Revenue Ops", managerId: null, managerEmail: null, tools: ["Salesforce", "Looker", "Slack", "Notion"] },
  { id: "P-002", name: "Mark Lopez", email: "mark.lopez@northwind.co", title: "Revenue Operations Analyst", department: "Revenue Ops", managerId: "P-001", managerEmail: "jane.smith@northwind.co", tools: ["Salesforce", "Looker", "Excel"] },
  { id: "P-003", name: "Rina Patel", email: "rina.patel@northwind.co", title: "Sales Operations Specialist", department: "Revenue Ops", managerId: "P-001", managerEmail: "jane.smith@northwind.co", tools: ["Salesforce", "Slack", "Gong"] },
  { id: "P-004", name: "Tom Nguyen", email: "tom.nguyen@northwind.co", title: "Forecast Analyst", department: "Revenue Ops", managerId: "P-001", managerEmail: "jane.smith@northwind.co", tools: ["Salesforce", "Excel", "Looker"] },
];

export const DEMO_TRANSCRIPT = `Jane runs sales operations for the revenue org. Her week is mostly spent
keeping the forecast clean. She reviews CRM changes from reps, hunts down
stale deals that should be closed-lost, and exports forecast exception
reports for the VP every Friday. When the forecast number needs to change
officially, Jane is the only person who can sign off.

Mark and Rina handle most of the day-to-day CRM hygiene. Mark spends
about a third of his time chasing reps for missing close dates and
contact info; Rina is mostly running deal stage audits and sending
follow-up nudges in Slack. Tom owns the weekly forecast model — pulling
Salesforce + Looker, summarizing variance, and drafting commentary for
the leadership readout. He doesn't change the official number; Jane does.

Approvals all flow through Jane. The team has been asking for help
because the spreadsheet review eats two full days every week.`;

export const DEMO_PARSED: ParsedMap = {
  "P-001": {
    summary: "Owns forecast accuracy and the official revenue number.",
    responsibilities: [
      {
        id: "R-001", title: "Forecast hygiene",
        tasks: {
          delegatable: ["Clean stale forecast records", "Compare Salesforce updates vs. last week's snapshot", "Summarize forecast exceptions for review", "Draft internal review notes for VP readout"],
          approval: ["Export forecast reports to Finance", "Notify leadership of material variance"],
          not_delegatable: ["Approve final forecast number", "Change official revenue forecast values"],
        },
      },
      {
        id: "R-002", title: "CRM change review",
        tasks: { delegatable: ["Diff CRM field changes weekly", "Compile reps' missing-field list"], approval: ["Recommend official forecast changes"], not_delegatable: ["Commit company resources"] },
      },
      {
        id: "R-003", title: "Stale deal detection",
        tasks: { delegatable: ["Identify deals past expected close date", "Tag deals for rep follow-up"], approval: [], not_delegatable: [] },
      },
      {
        id: "R-004", title: "Exception reporting",
        tasks: { delegatable: ["Generate weekly exception digest"], approval: ["Distribute exception digest to leadership"], not_delegatable: [] },
      },
    ],
  },
  "P-002": {
    summary: "CRM hygiene specialist; ~1/3 of time chasing missing fields.",
    responsibilities: [
      {
        id: "R-101", title: "CRM data completeness",
        tasks: { delegatable: ["Identify deals missing close date", "Draft Slack nudges to reps", "Compile weekly hygiene scorecard"], approval: ["Send hygiene scorecard to managers"], not_delegatable: [] },
      },
      {
        id: "R-102", title: "Pipeline reporting support",
        tasks: { delegatable: ["Refresh Looker pipeline dashboards"], approval: [], not_delegatable: [] },
      },
    ],
  },
  "P-003": {
    summary: "Mixed signals — needs follow-up before mapping.",
    needsReview: true,
    responsibilities: [
      {
        id: "R-201", title: "Deal stage audits",
        tasks: { delegatable: ["Flag deals in wrong stage"], approval: [], not_delegatable: [] },
      },
      {
        id: "R-202", title: "Rep enablement (unclear scope)", unclear: true,
        tasks: { delegatable: [], approval: [], not_delegatable: [] },
      },
    ],
  },
  "P-004": {
    summary: "Owns weekly forecast model and variance commentary.",
    responsibilities: [
      {
        id: "R-301", title: "Weekly forecast model",
        tasks: { delegatable: ["Pull Salesforce + Looker into model template", "Compute variance vs. last week", "Draft variance commentary"], approval: ["Publish forecast model to shared drive"], not_delegatable: ["Change the official forecast number"] },
      },
    ],
  },
};

export const DEMO_SUGGESTED_AGENT: Record<string, string> = {
  "R-001": "Forecast Cleanup Agent",
  "R-002": "CRM Change Reviewer",
  "R-003": "Stale Deal Detector",
  "R-004": "Exception Digest Composer",
  "R-101": "CRM Hygiene Agent",
  "R-102": "Pipeline Dashboard Refresher",
  "R-201": "Deal Stage Auditor",
  "R-301": "Forecast Model Builder",
};

export const DEMO_CSV = `name,email,title,manager_email,department,known_tools
Jane Smith,jane.smith@northwind.co,Sales Operations Manager,,Revenue Ops,"Salesforce,Looker,Slack,Notion"
Mark Lopez,mark.lopez@northwind.co,Revenue Operations Analyst,jane.smith@northwind.co,Revenue Ops,"Salesforce,Looker,Excel"
Rina Patel,rina.patel@northwind.co,Sales Operations Specialist,jane.smith@northwind.co,Revenue Ops,"Salesforce,Slack,Gong"
Tom Nguyen,tom.nguyen@northwind.co,Forecast Analyst,jane.smith@northwind.co,Revenue Ops,"Salesforce,Excel,Looker"`;
