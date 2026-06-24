import type { AgentRegistryEntry, Person, RiskFinding } from "@/types";

// ── ID generation ───────────────────────────────────────────────────────

export function newRiskFindingId(): string {
  return `risk-${Date.now()}`;
}

// ── Creator ─────────────────────────────────────────────────────────────

export function createRiskFinding(
  category: RiskFinding["category"],
  severity: RiskFinding["severity"],
  title: string,
  description: string,
  whyItMatters: string,
  recommendedAction: string,
): RiskFinding {
  const now = new Date().toISOString();
  return {
    id: newRiskFindingId(),
    category,
    severity,
    title,
    plainEnglishDescription: description,
    whyItMatters,
    recommendedAction,
    relatedAgentIds: [],
    relatedPersonIds: [],
    relatedSystemIds: [],
    relatedControlIds: [],
    status: "open",
    evidenceIds: [],
    createdAt: now,
  };
}

// ── Derivation: orphan agents ───────────────────────────────────────────

/**
 * For each person whose lifecycle is "offboarded", find registry agents they
 * own and create a risk finding of category "orphaned_agent".
 */
export function deriveOrphanRiskFindings(
  people: Person[],
  registry: AgentRegistryEntry[],
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  const offboardedPeople = people.filter((p) => p.lifecycle === "offboarded");

  for (const person of offboardedPeople) {
    const ownedAgents = registry.filter(
      (e) => e.owner_person_id === person.id,
    );

    for (const agent of ownedAgents) {
      findings.push(
        createRiskFinding(
          "orphaned_agent",
          "high",
          `Orphaned agent: ${agent.agent_id}`,
          `Agent "${agent.agent_id}" is owned by offboarded person "${person.name}" (${person.email}) and has no active human owner.`,
          "Orphaned agents pose an operational and security risk — they may continue executing tasks with stale or excessive authority, and no one is accountable for their actions.",
          `Reassign agent "${agent.agent_id}" to an active owner, or retire it if no longer needed.`,
        ),
      );
    }
  }

  return findings;
}

// ── Derivation: drift ───────────────────────────────────────────────────

/**
 * For each stale registry entry, create a drift risk finding.
 */
export function deriveDriftRiskFindings(
  registry: AgentRegistryEntry[],
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  const staleEntries = registry.filter((e) => e.stale);

  for (const entry of staleEntries) {
    const reason = entry.stale_reason ?? "Unknown drift cause";
    findings.push(
      createRiskFinding(
        "drift",
        "medium",
        `Drift detected: ${entry.agent_id}`,
        `Agent "${entry.agent_id}" has drifted from its ingredient baseline. Reason: ${reason}`,
        "Drift means the agent's runtime configuration or authority no longer matches its approved specification, which can lead to unauthorized behavior or compliance gaps.",
        `Review the drift cause ("${reason}"), reconcile the agent's ingredients, and recompile a new version.`,
      ),
    );
  }

  return findings;
}

// ── Color and label helpers ────────────────────────────────────────────

const RISK_COLORS: Record<RiskFinding["severity"], string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
  info: "#6b7280",
};

const RISK_LABELS: Record<RiskFinding["severity"], string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

export function getRiskColor(severity: RiskFinding["severity"]): string {
  return RISK_COLORS[severity];
}

export function getRiskLabel(severity: RiskFinding["severity"]): string {
  return RISK_LABELS[severity];
}

// ── Filter ──────────────────────────────────────────────────────────────

export function filterRiskFindings(
  riskFindings: RiskFinding[],
  filters: { severity?: string; status?: string; category?: string },
): RiskFinding[] {
  return riskFindings.filter((f) => {
    if (filters.severity && f.severity !== filters.severity) return false;
    if (filters.status && f.status !== filters.status) return false;
    if (filters.category && f.category !== filters.category) return false;
    return true;
  });
}

// ── Resolve ─────────────────────────────────────────────────────────────

export function resolveRiskFinding(finding: RiskFinding): RiskFinding {
  return {
    ...finding,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  };
}

// ── Summary statistics ──────────────────────────────────────────────────

export function riskSummaryStats(riskFindings: RiskFinding[]): {
  total: number;
  open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<string, number>;
} {
  let open = 0;
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  const byCategory: Record<string, number> = {};

  for (const f of riskFindings) {
    if (f.status === "open") open++;
    if (f.severity === "critical") critical++;
    else if (f.severity === "high") high++;
    else if (f.severity === "medium") medium++;
    else if (f.severity === "low") low++;

    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  return {
    total: riskFindings.length,
    open,
    critical,
    high,
    medium,
    low,
    byCategory,
  };
}
