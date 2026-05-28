import type {
  MappingSessionType,
  PedigreeState,
  Person,
  RecommendedSession,
  SessionScope,
  Status,
} from "@/types";

export const SESSION_LABEL: Record<MappingSessionType, string> = {
  leadership_session: "Leadership Session",
  department_session: "Department Session",
  individual_role_session: "Individual Role Session",
  clarification_session: "Clarification Session",
};

const MAPPED_STATUSES: Status[] = ["mapped", "ready", "generated"];

export function directReports(personId: string, people: Person[]): Person[] {
  return people.filter((p) => p.managerId === personId);
}

export function isMapped(status: Status | undefined): boolean {
  return !!status && MAPPED_STATUSES.includes(status);
}

/** Recommend a session type for a node (PRD §5 rules). */
export function recommendSessionType(person: Person, people: Person[], pedigree?: PedigreeState): MappingSessionType {
  const reports = directReports(person.id, people);
  const status = pedigree?.[person.id]?.status;
  if (status === "needs-review" || status === "blocked") return "clarification_session";
  if (!person.managerId && reports.length > 0) return "leadership_session";
  if (person.managerId && reports.length > 0) return "department_session";
  return "individual_role_session";
}

/** Resolve a scope choice into the set of person ids the session covers. */
export function getScopePersonIds(scope: SessionScope, person: Person, people: Person[], pedigree: PedigreeState): string[] {
  const reports = directReports(person.id, people);
  switch (scope) {
    case "self":
      return [person.id];
    case "unmapped_reports":
      return [person.id, ...reports.filter((r) => !isMapped(pedigree[r.id]?.status)).map((r) => r.id)];
    case "leadership":
    case "department":
    case "self_and_reports":
    default:
      return [person.id, ...reports.map((r) => r.id)];
  }
}

export function defaultScopeFor(type: MappingSessionType): SessionScope {
  if (type === "individual_role_session") return "self";
  if (type === "leadership_session") return "leadership";
  if (type === "department_session") return "department";
  return "self_and_reports";
}

/** Guided prompt shown in the wizard, by session type. */
export function sessionPrompt(type: MappingSessionType): string {
  switch (type) {
    case "leadership_session":
      return `Talk through the company from the top down.

Cover:
1. The company's macro goals.
2. The major functions or departments.
3. What each direct report owns.
4. Which responsibilities are shared across departments.
5. Which decisions stay with leadership.
6. Which areas may be good candidates for AI assistance.`;
    case "department_session":
      return `Talk through this department.

Cover:
1. The department's mission.
2. The department head's responsibilities.
3. What each direct report owns.
4. Repeated tasks the team performs.
5. Which tasks are safe to delegate to AI.
6. Which tasks require approval.
7. Which responsibilities should stay human-owned.`;
    case "clarification_session":
      return `Clarify the unclear or blocked responsibilities for this person.

Cover:
1. What this person is actually accountable for.
2. Which earlier signals were ambiguous.
3. What can be delegated vs. what must stay human-owned.`;
    case "individual_role_session":
    default:
      return `Talk through this person's role.

Cover:
1. What this person is responsible for.
2. What they do repeatedly.
3. What decisions they make.
4. What work they prepare for others.
5. What could be delegated to an AI agent.
6. What should never be delegated.`;
  }
}

/**
 * After applying sessions, recommend the next sessions: department heads (have a
 * manager and direct reports) who are not yet mapped, then any unmapped manager.
 */
export function computeNextRecommendedSessions(people: Person[], pedigree: PedigreeState): RecommendedSession[] {
  const out: RecommendedSession[] = [];
  for (const p of people) {
    const reports = directReports(p.id, people);
    const status = pedigree[p.id]?.status ?? "needs-discovery";
    if (reports.length === 0) continue; // only managers lead sessions
    const reportsMapped = reports.filter((r) => isMapped(pedigree[r.id]?.status)).length;
    if (reportsMapped === reports.length) continue; // team already mapped

    if (!p.managerId && !isMapped(status)) {
      out.push({ personId: p.id, type: "leadership_session", reason: "Start at the top — map company-level ownership and direct reports." });
    } else if (isMapped(status) && reportsMapped < reports.length) {
      out.push({ personId: p.id, type: "department_session", reason: "Executive-level responsibility mapped. Department breakdown needed." });
    } else if (!isMapped(status) && p.managerId) {
      out.push({ personId: p.id, type: "department_session", reason: "Department head not yet mapped." });
    }
  }
  // Leadership sessions first, then by team size desc.
  out.sort((a, b) => {
    if (a.type === "leadership_session" && b.type !== "leadership_session") return -1;
    if (b.type === "leadership_session" && a.type !== "leadership_session") return 1;
    return directReports(b.personId, people).length - directReports(a.personId, people).length;
  });
  return out.slice(0, 6);
}

export function teamMapped(personId: string, people: Person[], pedigree: PedigreeState): { mapped: number; total: number } {
  const reports = directReports(personId, people);
  return { mapped: reports.filter((r) => isMapped(pedigree[r.id]?.status)).length, total: reports.length };
}

/**
 * Build a realistic demo transcript from the actual scope (real names/titles/depts),
 * so "Insert Demo Session" works for any uploaded CSV — not a single hard-coded org.
 */
export function buildDemoSessionText(owner: Person, reports: Person[], type: MappingSessionType): string {
  const firstName = (n: string) => n.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "").split(/\s+/)[0];
  const ownerFirst = firstName(owner.name);

  if (type === "individual_role_session" || reports.length === 0) {
    return `${owner.name} is the ${owner.title} in ${owner.department}. ${ownerFirst} is responsible for the core work of this role: reviewing incoming work, summarizing status for the team, comparing records for accuracy, and drafting internal updates. ${ownerFirst} can use AI to clean and summarize data, identify anomalies, and prepare draft reports. ${ownerFirst} should not approve final decisions, change official records, or send external communication without approval. Final sign-off stays human-owned.`;
  }

  const reportLines = reports
    .map((r) => {
      const f = firstName(r.name);
      return `${r.name} owns ${roleArea(r.title, r.department)}. ${f} can use AI to summarize ${roleArtifact(r.title)}, identify gaps, and draft internal updates, but ${f} should not approve changes or send external communication without ${ownerFirst}'s review.`;
    })
    .join("\n\n");

  if (type === "leadership_session") {
    return `At the company level, ${ownerFirst} is responsible for strategy, board communication, executive hiring, and major budget decisions.

${reportLines}

Final decisions on budget, hiring, compliance sign-off, and policy should stay human-owned at the leadership level.`;
  }

  // department_session / clarification_session
  return `${ownerFirst} owns ${roleArea(owner.title, owner.department)} overall, including team performance, escalations, and ${owner.department} planning.

${reportLines}

${ownerFirst} keeps approval authority for anything that changes official records, budgets, or external commitments.`;
}

function roleArea(title: string, department: string): string {
  const t = title.toLowerCase();
  if (/finance|account|controller|payable/.test(t)) return "financial operations and reporting";
  if (/revenue|billing|claims|denial|collection/.test(t)) return "revenue cycle and billing operations";
  if (/clinic|clinical|nurse|medical|provider|patient/.test(t)) return "clinical operations and patient throughput";
  if (/\bit\b|information|service desk|systems|security|tech|engineer/.test(t)) return "technology systems and reliability";
  if (/hr|people|talent|recruit|training/.test(t)) return "people operations and staffing";
  if (/complian|quality|audit|risk/.test(t)) return "compliance and quality assurance";
  if (/facilit|operations|logistics/.test(t)) return "operational logistics and facilities";
  if (/sales|account exec|partner|channel/.test(t)) return "pipeline and account management";
  if (/marketing|growth|content/.test(t)) return "marketing programs and reporting";
  return `${department.toLowerCase()} responsibilities`;
}

function roleArtifact(title: string): string {
  const t = title.toLowerCase();
  if (/finance|account/.test(t)) return "ledgers and variance";
  if (/revenue|billing|claims|denial/.test(t)) return "claims and billing exceptions";
  if (/clinic|nurse|patient/.test(t)) return "scheduling and intake bottlenecks";
  if (/\bit\b|service desk|systems|security/.test(t)) return "tickets and incident trends";
  if (/hr|recruit|training/.test(t)) return "staffing and onboarding status";
  if (/complian|quality|audit/.test(t)) return "compliance documentation";
  return "weekly status and recurring issues";
}
