import type {
  CompanyContext,
  DiscoveryPlan,
  PedigreeState,
  Person,
  PlannedSession,
  PlannedSessionStatus,
  QuestionBacklogItem,
} from "@/types";
import { directReports, getScopePersonIds, isMapped, recommendSessionType } from "./sessions";

// ── Guided Discovery Stage 2: the cascade as a first-class object ──────
// Generated deterministically from the org chart, the plan is a persistent,
// visible checklist: leadership first, then departments (bottleneck/goal-
// critical first, then headcount), then targeted and clarification sessions.
// Regeneration is non-destructive: statuses of existing sessions survive.

const STATUS_RANK: Record<PlannedSessionStatus, number> = {
  planned: 0,
  briefed: 1,
  captured: 2,
  parsed: 3,
  applied: 4,
  rerun_suggested: 5,
};

/** Stable id so plan regeneration can preserve session status. */
export function plannedSessionId(type: string, anchorPersonId: string): string {
  return `PS-${type}-${anchorPersonId}`;
}

function departmentMentionScore(department: string, companyContext?: CompanyContext): number {
  if (!companyContext || !department || department === "—") return 0;
  const hay = [companyContext.bottlenecks, companyContext.strategicGoals, companyContext.initiatives]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return 0;
  return hay.includes(department.toLowerCase()) ? 1 : 0;
}

/**
 * Generate the discovery plan from the org chart. Deterministic. Pass the
 * previous plan to preserve session statuses and brief links across
 * regeneration — only ordering and new proposals change.
 */
export function generatePlan(
  people: Person[],
  pedigree: PedigreeState,
  companyContext?: CompanyContext,
  previous?: DiscoveryPlan,
): DiscoveryPlan {
  const prevById = new Map((previous?.sessions ?? []).map((s) => [s.id, s]));
  const sessions: PlannedSession[] = [];
  const active = people.filter((p) => p.lifecycle !== "offboarded");

  const carry = (id: string): Pick<PlannedSession, "status" | "brief_id"> => {
    const prev = prevById.get(id);
    return prev ? { status: prev.status, ...(prev.brief_id ? { brief_id: prev.brief_id } : {}) } : { status: "planned" };
  };

  // 1) Leadership: the top node + direct reports.
  const roots = active.filter((p) => !p.managerId && directReports(p.id, active).length > 0);
  for (const root of roots) {
    const id = plannedSessionId("leadership_session", root.id);
    sessions.push({
      id,
      type: "leadership_session",
      anchor_person_id: root.id,
      scope_ids: getScopePersonIds("leadership", root, active, pedigree),
      priority: sessions.length + 1,
      rationale: "Start at the top — company-level ownership map, overlaps, what stays human.",
      ...carry(id),
    });
  }

  // 2) Departments: one per department head (manager + reports), ordered by
  //    bottleneck/goal mention then headcount.
  const heads = active
    .filter((p) => p.managerId && directReports(p.id, active).length > 0)
    .map((p) => ({
      person: p,
      headcount: directReports(p.id, active).length,
      flagged: departmentMentionScore(p.department, companyContext),
    }))
    .sort((a, b) => b.flagged - a.flagged || b.headcount - a.headcount || a.person.name.localeCompare(b.person.name));
  for (const { person, flagged, headcount } of heads) {
    const id = plannedSessionId("department_session", person.id);
    sessions.push({
      id,
      type: "department_session",
      anchor_person_id: person.id,
      scope_ids: getScopePersonIds("department", person, active, pedigree),
      priority: sessions.length + 1,
      rationale: flagged
        ? `${person.department} is named in the company's bottlenecks/goals.`
        : `${person.department} team of ${headcount} — map the department head and cascade down.`,
      ...carry(id),
    });
  }

  // 3) Clarification sessions from needs-review / blocked statuses.
  for (const person of active) {
    const status = pedigree[person.id]?.status;
    if (status !== "needs-review" && status !== "blocked") continue;
    if (recommendSessionType(person, active, pedigree) !== "clarification_session") continue;
    const id = plannedSessionId("clarification_session", person.id);
    sessions.push({
      id,
      type: "clarification_session",
      anchor_person_id: person.id,
      scope_ids: [person.id],
      priority: sessions.length + 1,
      rationale: "Earlier parse marked this person needs-review — clarify ambiguous signals.",
      ...carry(id),
    });
  }

  // Carry over targeted sessions proposed by adaptPlan (they are not derivable
  // from the org chart alone, so regeneration must not drop them).
  for (const prev of previous?.sessions ?? []) {
    if (prev.type === "individual_role_session" && !sessions.some((s) => s.id === prev.id)) {
      if (active.some((p) => p.id === prev.anchor_person_id)) {
        sessions.push({ ...prev, priority: sessions.length + 1 });
      }
    }
  }

  return {
    id: previous?.id ?? `PLAN-${Date.now().toString(36)}`,
    sessions,
    coverage: computeCoverage(active, pedigree),
    updated_at: new Date().toISOString(),
  };
}

export function computeCoverage(people: Person[], pedigree: PedigreeState): DiscoveryPlan["coverage"] {
  const active = people.filter((p) => p.lifecycle !== "offboarded");
  const departments = [...new Set(active.map((p) => p.department).filter((d) => d && d !== "—"))];
  const covered = departments.filter((d) =>
    active.some((p) => p.department === d && isMapped(pedigree[p.id]?.status)),
  );
  return {
    people_mapped: active.filter((p) => isMapped(pedigree[p.id]?.status)).length,
    people_total: active.length,
    departments_covered: covered.length,
    departments_total: departments.length,
  };
}

export interface AdaptPlanInput {
  plan: DiscoveryPlan;
  people: Person[];
  pedigree: PedigreeState;
  questionBacklog: QuestionBacklogItem[];
}

const TARGETED_QUESTION_THRESHOLD = 3;

/**
 * Adapt the plan after a parse/apply: re-prioritize, propose targeted
 * individual sessions for people with heavy question backlogs, and flag
 * applied sessions that produced thin evidence as rerun_suggested rather
 * than silently done. Never deletes session history or statuses.
 */
export function adaptPlan({ plan, people, pedigree, questionBacklog }: AdaptPlanInput): DiscoveryPlan {
  const open = questionBacklog.filter((q) => !q.resolved_by_session_id);
  const openByPerson = new Map<string, number>();
  for (const q of open) openByPerson.set(q.person_id, (openByPerson.get(q.person_id) ?? 0) + 1);

  let sessions = plan.sessions.map((session) => {
    // Thin applied session: < 1 responsibility per participant on average.
    if (session.status === "applied") {
      const scope = session.scope_ids.filter((id) => people.some((p) => p.id === id));
      const resps = scope.reduce((sum, id) => sum + (pedigree[id]?.responsibilities.length ?? 0), 0);
      if (scope.length > 0 && resps < scope.length) {
        return { ...session, status: "rerun_suggested" as const, rationale: `${session.rationale} Re-run with a better brief: the applied session produced ${resps} responsibilit${resps === 1 ? "y" : "ies"} across ${scope.length} participants.` };
      }
    }
    return session;
  });

  // Targeted sessions where a person has ≥3 open questions and no pending
  // session already covering them.
  for (const [personId, count] of openByPerson) {
    if (count < TARGETED_QUESTION_THRESHOLD) continue;
    const person = people.find((p) => p.id === personId);
    if (!person || person.lifecycle === "offboarded") continue;
    const pendingCoverage = sessions.some(
      (s) => STATUS_RANK[s.status] < STATUS_RANK.applied && s.scope_ids.includes(personId),
    );
    if (pendingCoverage) continue;
    const id = plannedSessionId("individual_role_session", personId);
    if (sessions.some((s) => s.id === id && STATUS_RANK[s.status] < STATUS_RANK.applied)) continue;
    if (!sessions.some((s) => s.id === id)) {
      sessions = [
        ...sessions,
        {
          id,
          type: "individual_role_session",
          anchor_person_id: personId,
          scope_ids: [personId],
          priority: 0, // re-ranked below
          rationale: `${person.name} has ${count} open questions — a targeted deep-dive will resolve them.`,
          status: "planned",
        },
      ];
    }
  }

  // Re-prioritize: pending sessions first (leadership → backlog-heavy →
  // original order), completed history keeps its place at the end.
  const pending = sessions.filter((s) => STATUS_RANK[s.status] < STATUS_RANK.applied);
  const done = sessions.filter((s) => STATUS_RANK[s.status] >= STATUS_RANK.applied);
  pending.sort((a, b) => {
    if (a.type === "leadership_session" !== (b.type === "leadership_session")) {
      return a.type === "leadership_session" ? -1 : 1;
    }
    const aq = a.scope_ids.reduce((sum, id) => sum + (openByPerson.get(id) ?? 0), 0);
    const bq = b.scope_ids.reduce((sum, id) => sum + (openByPerson.get(id) ?? 0), 0);
    if (aq !== bq) return bq - aq;
    return a.priority - b.priority;
  });
  const ordered = [...pending, ...done].map((s, i) => ({ ...s, priority: i + 1 }));

  return {
    ...plan,
    sessions: ordered,
    coverage: computeCoverage(people, pedigree),
    updated_at: new Date().toISOString(),
  };
}

/** Update one session's status (e.g. wizard lifecycle hooks). */
export function setSessionStatus(plan: DiscoveryPlan, sessionId: string, status: PlannedSessionStatus, briefId?: string): DiscoveryPlan {
  return {
    ...plan,
    sessions: plan.sessions.map((s) =>
      s.id === sessionId ? { ...s, status, ...(briefId ? { brief_id: briefId } : {}) } : s,
    ),
    updated_at: new Date().toISOString(),
  };
}

export interface DiscoveryCompleteThreshold {
  managers_pct: number;   // default 100
  ics_pct: number;        // default 80
  max_backlog: number;    // default 10
}

export const DEFAULT_COMPLETE_THRESHOLD: DiscoveryCompleteThreshold = {
  managers_pct: 100,
  ics_pct: 80,
  max_backlog: 10,
};

export interface DiscoveryCompletion {
  complete: boolean;
  managers_mapped: number;
  managers_total: number;
  ics_mapped: number;
  ics_total: number;
  open_backlog: number;
}

/** The definable "discovery complete" milestone that ends a Discovery Sprint. */
export function discoveryCompletion(
  people: Person[],
  pedigree: PedigreeState,
  questionBacklog: QuestionBacklogItem[],
  threshold: DiscoveryCompleteThreshold = DEFAULT_COMPLETE_THRESHOLD,
): DiscoveryCompletion {
  const active = people.filter((p) => p.lifecycle !== "offboarded");
  const managers = active.filter((p) => directReports(p.id, active).length > 0);
  const ics = active.filter((p) => directReports(p.id, active).length === 0);
  const managersMapped = managers.filter((p) => isMapped(pedigree[p.id]?.status)).length;
  const icsMapped = ics.filter((p) => isMapped(pedigree[p.id]?.status)).length;
  const openBacklog = questionBacklog.filter((q) => !q.resolved_by_session_id).length;
  const managersOk = managers.length === 0 || (managersMapped / managers.length) * 100 >= threshold.managers_pct;
  const icsOk = ics.length === 0 || (icsMapped / ics.length) * 100 >= threshold.ics_pct;
  return {
    complete: active.length > 0 && managersOk && icsOk && openBacklog <= threshold.max_backlog,
    managers_mapped: managersMapped,
    managers_total: managers.length,
    ics_mapped: icsMapped,
    ics_total: ics.length,
    open_backlog: openBacklog,
  };
}
