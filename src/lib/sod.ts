import type { PedigreeRow, PedigreeState, Person, TaskItem } from "@/types";

// ── Segregation-of-Duties engine (v0, deterministic) ───────────────────
// SOD rules are pairs of duties that no single actor may hold both sides of.
// An AI agent inherits its human owner's SOD constraints: the actor is the
// owner, so conflicts are checked within a proposed agent's task set AND
// across everything else the same owner (and their agents) already holds.
//
// v0 matches duties by keyword phrases against task labels — deliberately
// simple, explainable, and auditable ("matched 'vendor record' in task X").

export interface SodRule {
  id: string;
  name: string;
  /** Phrases identifying side A (any match counts). Lower-case. */
  dutyA: string[];
  /** Phrases identifying side B (any match counts). Lower-case. */
  dutyB: string[];
  severity: "block" | "flag";
  description: string;
}

export interface SodFinding {
  ruleId: string;
  ruleName: string;
  severity: "block" | "flag";
  /** Where the conflict lives: inside one agent, across the owner's holdings, or on a person. */
  scope: "agent" | "owner" | "person";
  personId?: string;
  personName?: string;
  agentName?: string;
  dutyAMatches: string[];
  dutyBMatches: string[];
  message: string;
}

// Seeded from the bundled Granite Ridge SOD policy; phrased generically so
// they fire on common ERP/finance/distribution task language.
export const DEFAULT_SOD_RULES: SodRule[] = [
  {
    id: "SOD-01",
    name: "Vendor master data vs. invoice/payment approval",
    dutyA: ["vendor master", "vendor record", "vendor bank", "create vendor", "supplier master", "supplier record", "vendor onboarding"],
    dutyB: ["approve invoice", "approve payment", "payment run", "release payment", "approve write-off", "pay vendor"],
    severity: "block",
    description: "Whoever creates or changes vendor records (incl. bank details) must not also approve invoices or release payments.",
  },
  {
    id: "SOD-02",
    name: "Purchase order creation vs. goods receipt",
    dutyA: ["create purchase order", "purchase order creation", "raise po", "issue purchase order", "approve purchase order", "supplier award"],
    dutyB: ["goods receipt", "post receipt", "confirm receipt", "receive goods", "receiving dock"],
    severity: "block",
    description: "Whoever orders may not also confirm receipt of what was ordered.",
  },
  {
    id: "SOD-03",
    name: "Goods receipt vs. invoice processing",
    dutyA: ["goods receipt", "post receipt", "confirm receipt", "receive goods"],
    dutyB: ["process invoice", "invoice processing", "three-way match", "3-way match", "enter invoice"],
    severity: "block",
    description: "Receipt posting and invoice processing must be separate hands in the 3-way match.",
  },
  {
    id: "SOD-04",
    name: "Credit functions vs. sales order entry",
    // Releasing credit-blocked orders is a CREDIT-side duty (same side as
    // setting limits) — the violation is combining it with order entry, not
    // a credit manager doing both credit functions.
    dutyA: ["credit limit", "customer credit", "credit hold", "release blocked order", "releasing blocked orders", "release of blocked orders"],
    dutyB: ["enter sales order", "enters sales orders", "entering sales orders", "sales order entry", "order entry", "quote order", "create sales order"],
    severity: "block",
    description: "Whoever controls customer credit (limits, releasing blocked orders) may not also enter sales orders.",
  },
  {
    id: "SOD-05",
    name: "Price/discount maintenance vs. credit or rebate approval",
    dutyA: ["price file", "price maintenance", "maintain pricing", "discount maintenance", "update price"],
    dutyB: ["approve rebate", "rebate approval", "approve credit memo", "credit approval"],
    severity: "flag",
    description: "Pricing maintenance combined with rebate/credit approval enables margin manipulation.",
  },
  {
    id: "SOD-06",
    name: "Access provisioning vs. access certification",
    dutyA: ["provision access", "grant access", "role provisioning", "assign role", "create account", "erp role"],
    dutyB: ["access review", "access certification", "certify access", "approve access request", "user access review"],
    severity: "block",
    description: "Whoever provisions access may not certify or approve that same access.",
  },
  {
    id: "SOD-07",
    name: "Journal entry creation vs. approval",
    dutyA: ["create journal", "journal entry creation", "post journal", "prepare journal"],
    dutyB: ["approve journal", "journal approval", "period close approval", "approve close"],
    severity: "block",
    description: "Journal entries must be approved by someone other than their creator.",
  },
  {
    id: "SOD-08",
    name: "Credit memo / RMA creation vs. approval",
    dutyA: ["create credit memo", "issue rma", "create rma", "rma creation", "process return"],
    dutyB: ["approve credit memo", "credit memo approval", "approve return", "approve refund"],
    severity: "flag",
    description: "Return/credit creation and its approval must be segregated above the de-minimis threshold.",
  },
];

function findMatches(labels: string[], phrases: string[]): string[] {
  const out: string[] = [];
  for (const label of labels) {
    const hay = label.toLowerCase();
    if (phrases.some((p) => hay.includes(p))) out.push(label);
  }
  return out;
}

/** Conflicts inside a single task set (one actor holding both sides of a rule). */
export function checkTaskSetSod(labels: string[], rules: SodRule[] = DEFAULT_SOD_RULES): Array<Pick<SodFinding, "ruleId" | "ruleName" | "severity" | "dutyAMatches" | "dutyBMatches">> {
  const findings: Array<Pick<SodFinding, "ruleId" | "ruleName" | "severity" | "dutyAMatches" | "dutyBMatches">> = [];
  for (const rule of rules) {
    const a = findMatches(labels, rule.dutyA);
    const b = findMatches(labels, rule.dutyB);
    // a task can match both sides of a rule by itself ("create and approve
    // vendor payments") — that counts, but ignore pure self-overlap noise
    const distinct = a.length && b.length && (a.length + b.length > 1 || a[0] !== b[0]);
    if (distinct) {
      findings.push({ ruleId: rule.id, ruleName: rule.name, severity: rule.severity, dutyAMatches: a, dutyBMatches: b });
    }
  }
  return findings;
}

export interface AgentSodInput {
  person: Person;
  row: PedigreeRow;
  /** The proposed agent's task labels (allowed + approval-gated). */
  agentTaskLabels: string[];
  agentName: string;
  rules?: SodRule[];
}

/**
 * SOD check for a proposed agent:
 * 1. within the agent's own task set;
 * 2. the agent's tasks vs. everything else its human owner already holds
 *    (their other tasks and previously created agents) — the owner is the
 *    accountable actor, so an agent handing them the other side of a duty
 *    pair is a conflict even if the agent alone looks clean.
 */
export function checkAgentSod({ person, row, agentTaskLabels, agentName, rules = DEFAULT_SOD_RULES }: AgentSodInput): SodFinding[] {
  const findings: SodFinding[] = [];

  for (const f of checkTaskSetSod(agentTaskLabels, rules)) {
    findings.push({
      ...f,
      scope: "agent",
      personId: person.id,
      personName: person.name,
      agentName,
      message: `${agentName} would hold both sides of ${f.ruleId} (${f.ruleName}): ${summarize(f.dutyAMatches)} vs. ${summarize(f.dutyBMatches)}.`,
    });
  }

  const ownerLabels = personHeldLabels(row).filter((l) => !agentTaskLabels.includes(l));
  for (const rule of rules) {
    const agentA = findMatches(agentTaskLabels, rule.dutyA);
    const agentB = findMatches(agentTaskLabels, rule.dutyB);
    const ownerA = findMatches(ownerLabels, rule.dutyA);
    const ownerB = findMatches(ownerLabels, rule.dutyB);
    const crossAB = agentA.length && ownerB.length;
    const crossBA = agentB.length && ownerA.length;
    if (!crossAB && !crossBA) continue;
    if (findings.some((f) => f.ruleId === rule.id && f.scope === "agent")) continue; // already reported inside the agent
    const dutyAMatches = crossAB ? agentA : ownerA;
    const dutyBMatches = crossAB ? ownerB : agentB;
    findings.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      scope: "owner",
      personId: person.id,
      personName: person.name,
      agentName,
      dutyAMatches,
      dutyBMatches,
      message: `${agentName} + ${person.name}'s existing duties together span ${rule.id} (${rule.name}): ${summarize(dutyAMatches)} vs. ${summarize(dutyBMatches)}.`,
    });
  }

  return findings;
}

/** Every duty a person currently holds: their mapped tasks + their agents' authority. */
export function personHeldLabels(row: PedigreeRow): string[] {
  const tasks: TaskItem[] = [...row.tasks.delegatable, ...row.tasks.approval, ...row.tasks.not_delegatable];
  const agentTasks = row.agents.flatMap((a) => {
    const m = a.manifest as { allowed_tasks?: string[]; human_approval_required?: string[] } | undefined;
    return [...(m?.allowed_tasks ?? []), ...(m?.human_approval_required ?? [])];
  });
  return [...new Set([...tasks.map((t) => t.label), ...agentTasks])];
}

/**
 * Org-wide SOD scan: for each person, check the full set of duties they hold
 * (their mapped tasks + their agents' allowed/approval tasks). Powers the
 * Compliance tab.
 */
export function checkOrgSod(people: Person[], pedigree: PedigreeState, rules: SodRule[] = DEFAULT_SOD_RULES): SodFinding[] {
  const findings: SodFinding[] = [];
  for (const person of people) {
    const row = pedigree[person.id];
    if (!row) continue;
    const labels = personHeldLabels(row);
    for (const f of checkTaskSetSod(labels, rules)) {
      findings.push({
        ...f,
        scope: "person",
        personId: person.id,
        personName: person.name,
        message: `${person.name} holds both sides of ${f.ruleId} (${f.ruleName}): ${summarize(f.dutyAMatches)} vs. ${summarize(f.dutyBMatches)}.`,
      });
    }
  }
  return findings.sort((a, b) => (a.severity === b.severity ? a.ruleId.localeCompare(b.ruleId) : a.severity === "block" ? -1 : 1));
}

function summarize(labels: string[]): string {
  const shown = labels.slice(0, 2).map((l) => `"${l}"`).join(", ");
  return labels.length > 2 ? `${shown} +${labels.length - 2} more` : shown;
}

/** The task labels a proposed agent would hold, mirroring buildAgentArtifacts seeding. */
export function proposedAgentTaskLabels(row: PedigreeRow, task: TaskItem): string[] {
  const inResp = (t: TaskItem) => t.respId === task.respId;
  return [...new Set([
    task.label,
    ...row.tasks.delegatable.filter(inResp).map((t) => t.label),
    ...row.tasks.approval.filter(inResp).map((t) => t.label),
  ])];
}
