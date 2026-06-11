import type {
  CompanyContext,
  CompanyContextDocument,
  ContextReadiness,
  Person,
  ReadinessDimension,
  ReadinessDimensionScore,
} from "@/types";

// ── Guided Discovery Stage 1: Context Readiness ────────────────────────
// "What good context is", operationally: eight dimensions scored 0 (missing),
// 1 (partial), 2 (good), each with a specific gap message and a fix location.
// Fully deterministic — sessions are never blocked by low readiness; this is
// guidance that materially improves question generation.

export const READINESS_DIMENSION_LABEL: Record<ReadinessDimension, string> = {
  identity: "Identity",
  goals: "Goals",
  kpis: "KPIs",
  bottlenecks: "Bottlenecks",
  stack: "Software stack",
  governance: "Governance",
  org: "Org completeness",
  terminology: "Terminology",
};

export const READINESS_DIMENSION_WHY: Record<ReadinessDimension, string> = {
  identity: "Questions use the company's vocabulary, not generic role-speak.",
  goals: "Sessions probe work connected to stated goals first.",
  kpis: "KPI ownership is responsibility ownership — \"who owns the number?\" questions.",
  bottlenecks: "Pain points are where delegatable work concentrates.",
  stack: "System-specific walk-throughs extract far better task evidence than abstract questions.",
  governance: "Sessions can confirm approval boundaries verbally — that becomes classification evidence.",
  org: "Determines the session cascade and per-person question targeting.",
  terminology: "The parser matches transcript language to records correctly.",
};

export const READINESS_MAX = 16;

function countGoals(text: string | undefined): number {
  if (!text?.trim()) return 0;
  // Goals are typically listed: split on newlines, semicolons, or numbered items.
  return text.split(/\n|;|\d+[.)]\s/).map((s) => s.trim()).filter((s) => s.length > 8).length;
}

function departmentsOf(people: Person[]): string[] {
  return [...new Set(people.map((p) => p.department).filter((d) => d && d !== "—"))];
}

/** Compute workspace readiness against the rubric. Pure and deterministic. */
export function computeReadiness(
  companyContext: CompanyContext | undefined,
  contextDocuments: CompanyContextDocument[],
  people: Person[],
): ContextReadiness {
  const ctx = companyContext;
  const departments = departmentsOf(people);
  const dimensions: ReadinessDimensionScore[] = [];

  // Identity — what the company does, in its own words.
  {
    const text = (ctx?.whatWeDo ?? "").trim();
    const hasModel = Boolean(ctx?.businessModel?.trim() || ctx?.market?.trim());
    const score = text.length >= 80 && hasModel ? 2 : text.length >= 20 ? 1 : 0;
    dimensions.push({
      id: "identity",
      score,
      ...(score < 2 ? {
        gap: score === 0
          ? "No company description loaded."
          : "Description is thin — add business model and who the customers are.",
        fix_hint: "Company Profile → What the company does / Market / Business model",
      } : {}),
    });
  }

  // Goals — 3–5 named goals with timeframes.
  {
    const n = countGoals(ctx?.strategicGoals) + countGoals(ctx?.initiatives);
    const score = n >= 3 ? 2 : n >= 1 ? 1 : 0;
    dimensions.push({
      id: "goals",
      score,
      ...(score < 2 ? {
        gap: score === 0 ? "No goals or initiatives stated." : `Only ${n} goal${n === 1 ? "" : "s"} stated — aim for 3–5 with timeframes.`,
        fix_hint: "Company Profile → Goals & initiatives",
      } : {}),
    });
  }

  // KPIs — departments with at least one KPI vs total departments.
  {
    const kpis = ctx?.kpis ?? [];
    const deptsWithKpi = new Set(kpis.map((k) => k.department.toLowerCase()));
    const covered = departments.filter((d) => deptsWithKpi.has(d.toLowerCase())).length;
    const score = departments.length > 0 && covered >= Math.ceil(departments.length / 2)
      ? (covered === departments.length ? 2 : 1)
      : kpis.length > 0 ? 1 : 0;
    const missing = departments.filter((d) => !deptsWithKpi.has(d.toLowerCase()));
    dimensions.push({
      id: "kpis",
      score,
      ...(score < 2 ? {
        gap: kpis.length === 0
          ? "No KPIs captured for any department."
          : `No KPIs for: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` +${missing.length - 4}` : ""}.`,
        fix_hint: "Company Profile → KPIs table",
      } : {}),
    });
  }

  // Bottlenecks — named operating pains.
  {
    const text = (ctx?.bottlenecks ?? "").trim();
    const score = text.length >= 60 ? 2 : text.length > 0 ? 1 : 0;
    dimensions.push({
      id: "bottlenecks",
      score,
      ...(score < 2 ? {
        gap: score === 0 ? "No operating bottlenecks named." : "Bottlenecks are vague — name the specific painful processes.",
        fix_hint: "Company Profile → Bottlenecks",
      } : {}),
    });
  }

  // Software stack — % of departments with at least one system mapped.
  {
    const systems = ctx?.systems ?? [];
    const peopleWithTools = people.filter((p) => p.tools.length > 0).length;
    const score = systems.length >= 3 && peopleWithTools >= Math.ceil(people.length / 2)
      ? 2
      : systems.length > 0 || peopleWithTools > 0 ? 1 : 0;
    const noTools = people.length - peopleWithTools;
    dimensions.push({
      id: "stack",
      score,
      ...(score < 2 ? {
        gap: systems.length === 0
          ? "No systems listed in the company profile."
          : `${noTools} ${noTools === 1 ? "person has" : "people have"} no known_tools — system-specific questions need them.`,
        fix_hint: systems.length === 0 ? "Company Profile → Systems" : "Spreadsheet → known_tools column",
      } : {}),
    });
  }

  // Governance — approval rules and SoD docs loaded into buckets.
  {
    const rules = (ctx?.approvalRules ?? []).length + (ctx?.segregationOfDuties ?? []).length;
    const docs = contextDocuments.filter((d) => d.bucket === "segregation_of_duties" || d.bucket === "policy").length;
    const score = rules > 0 && docs > 0 ? 2 : rules > 0 || docs > 0 ? 1 : 0;
    dimensions.push({
      id: "governance",
      score,
      ...(score < 2 ? {
        gap: score === 0
          ? "No approval rules or SoD/policy documents loaded."
          : rules === 0 ? "Policy docs loaded but no explicit approval rules stated." : "Approval rules stated but no SoD/policy documents uploaded.",
        fix_hint: "Company Profile → Approval rules / upload SOD & policy docs",
      } : {}),
    });
  }

  // Org completeness — title + department + ≥1 tool; reporting lines resolve.
  {
    const total = people.length;
    const complete = people.filter((p) => p.title && p.title !== "—" && p.department && p.department !== "—" && p.tools.length > 0).length;
    const ratio = total ? complete / total : 0;
    const score = total === 0 ? 0 : ratio >= 0.85 ? 2 : ratio >= 0.4 ? 1 : 0;
    dimensions.push({
      id: "org",
      score,
      ...(score < 2 ? {
        gap: total === 0
          ? "No people loaded yet."
          : `${total - complete} of ${total} people are missing a title, department, or tools.`,
        fix_hint: total === 0 ? "Upload a people CSV" : "Spreadsheet → fill title / department / known_tools",
      } : {}),
    });
  }

  // Terminology — company-specific terms captured.
  {
    const text = (ctx?.terminology ?? "").trim();
    const terms = text ? text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).length : 0;
    const score = terms >= 5 ? 2 : terms >= 1 ? 1 : 0;
    dimensions.push({
      id: "terminology",
      score,
      ...(score < 2 ? {
        gap: score === 0 ? "No internal terms captured." : `Only ${terms} term${terms === 1 ? "" : "s"} captured — add product names and team shorthand.`,
        fix_hint: "Company Profile → Terminology",
      } : {}),
    });
  }

  return {
    overall: dimensions.reduce((sum, d) => sum + d.score, 0),
    dimensions,
    computed_at: new Date().toISOString(),
  };
}

/** Top gaps, highest-impact first (lowest score, rubric order breaks ties). */
export function readinessGaps(readiness: ContextReadiness, limit = 3): ReadinessDimensionScore[] {
  return readiness.dimensions
    .filter((d) => d.score < 2 && d.gap)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export function readinessTier(readiness: ContextReadiness): "low" | "medium" | "high" {
  if (readiness.overall >= 12) return "high";
  if (readiness.overall >= 6) return "medium";
  return "low";
}
