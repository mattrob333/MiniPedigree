import type {
  BriefQuestion,
  BriefQuestionIntent,
  CompanyContext,
  MappingSessionType,
  PedigreeState,
  Person,
  PlannedSession,
  QuestionBacklogItem,
  SessionBrief,
} from "@/types";
import { isMapped } from "./sessions";

// ── Guided Discovery Stage 3: Pedigree leads the session ───────────────
// A SessionBrief is the talking-points document: objectives, an ordered
// question script (each question tagged with target, intent, and a "why"),
// system probe areas, carried-over open questions, and coverage targets.
// AI generation happens server-side; this module is the deterministic
// template fallback plus shared assembly helpers.
//
// Question-quality rules (Mom Test discipline), enforced here and in the AI
// prompt: ask about what people actually did last week/month, not what they
// would do; prefer "walk me through the last time you..." over "do you
// ever..."; never pitch the agent to the interviewee — delegation framing
// stays interviewer-side ("what would you hand to a competent new hire?");
// one question per question.

export interface ResponsibilityClaim {
  person_id: string;
  person_name: string;
  title: string;       // responsibility title claimed elsewhere (overlap probes)
}

export interface BriefBuildInput {
  session: Pick<PlannedSession, "id" | "type" | "anchor_person_id" | "scope_ids">;
  participants: Person[];
  companyContext?: CompanyContext;
  pedigree?: PedigreeState;
  backlog?: QuestionBacklogItem[];        // open questions for these participants
  claimedElsewhere?: ResponsibilityClaim[]; // responsibilities claimed by scope-adjacent people
}

const MAX_QUESTIONS = 18;

/** Interviewee-facing questions must never pitch automation. */
const PITCH_RE = /\b(an?\s+)?(a\.?i\.?|agents?|bots?|automat\w*|llm)\b/i;

export function isPitchQuestion(text: string): boolean {
  return PITCH_RE.test(text);
}

let qSeq = 0;
function q(
  text: string,
  target: string | "group",
  intent: BriefQuestionIntent,
  why: string,
): BriefQuestion {
  qSeq += 1;
  return { id: `Q-${qSeq}`, text, target_person_id: target, intent, why, order: qSeq };
}

function firstName(name: string): string {
  return name.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "").split(/\s+/)[0];
}

function objectivesFor(type: MappingSessionType, participants: Person[], anchor: Person | undefined): string {
  const anchorName = anchor?.name ?? "the session owner";
  switch (type) {
    case "leadership_session":
      return `Establish the company-level ownership map: what ${anchorName} personally owns, what each direct report owns, where ownership overlaps, and which decisions stay with leadership. Leave with every participant attached to at least one named responsibility.`;
    case "department_session":
      return `Map ${anchor?.department ?? "the department"} end to end: the head's responsibilities, what each report owns, the recurring work the team performs, and where approval boundaries sit. Leave with concrete, evidence-backed tasks for each participant.`;
    case "clarification_session":
      return `Resolve the ambiguous signals from earlier sessions for ${anchorName}: confirm what they are actually accountable for and pin down the open questions below.`;
    default:
      return `Map ${anchorName}'s role in concrete terms: what they deliver, on what cadence, in which systems, and where their approval ceiling sits.`;
  }
}

/**
 * Deterministic template brief — works with no API key for any participant
 * set. Produces ≥6 questions; carried-over backlog questions are included
 * verbatim and last (they need the rapport).
 */
export function buildTemplateBrief(input: BriefBuildInput): SessionBrief {
  qSeq = 0;
  const { session, participants, companyContext, pedigree } = input;
  const anchor = participants.find((p) => p.id === session.anchor_person_id) ?? participants[0];
  const kpis = companyContext?.kpis ?? [];
  const questions: BriefQuestion[] = [];

  // Warm-up ownership (group first for multi-person sessions).
  if (participants.length > 1) {
    questions.push(q(
      "Going around the room: walk me through the last thing each of you personally delivered last week — the thing that wouldn't have happened without you.",
      "group",
      "responsibility",
      "Past-behavior warm-up; surfaces real ownership before titles get in the way.",
    ));
  }
  for (const p of participants) {
    const f = firstName(p.name);
    questions.push(q(
      `${f}, walk me through your last full week — what did you produce, and who was waiting on it?`,
      p.id,
      "responsibility",
      "Concrete recent work beats hypothetical role descriptions.",
    ));
  }

  // Cadence / system walk-throughs.
  for (const p of participants) {
    const f = firstName(p.name);
    const tool = p.tools[0];
    if (tool) {
      questions.push(q(
        `${f}, walk me through what happened in ${tool} the last time you opened it for real work — start to finish.`,
        p.id,
        "system",
        `System-specific walk-throughs extract far better task evidence; ${tool} is in ${f}'s listed tools.`,
      ));
    }
    // Solo deep-dives always get the cadence probe; in group sessions it only
    // covers people with no listed tools (to keep the script under budget).
    if (!tool || participants.length === 1) {
      questions.push(q(
        `${f}, what happens every Monday in your world? Walk me through the most recent one.`,
        p.id,
        "cadence",
        "Recurring cadence work is where delegatable tasks concentrate.",
      ));
    }
  }
  if (participants.length === 1) {
    const f = firstName(participants[0].name);
    questions.push(q(
      `${f}, what do you prepare that someone else finishes or signs off on? Walk me through the latest handoff.`,
      participants[0].id,
      "overlap",
      "Handoffs mark both the approval boundary and where a preparer/approver split lives.",
    ));
  }

  // KPI ownership probes.
  for (const kpi of kpis) {
    const owners = participants.filter((p) => p.department.toLowerCase() === kpi.department.toLowerCase());
    const target = owners.find((p) => kpi.owner_hint && p.name.toLowerCase().includes(kpi.owner_hint.toLowerCase())) ?? owners[0];
    if (!target) continue;
    questions.push(q(
      `${firstName(target.name)}, the ${kpi.metric} number — walk me through how it got produced last ${kpi.cadence?.trim() || "cycle"}, step by step.`,
      target.id,
      "kpi_ownership",
      "KPI ownership is responsibility ownership; the production steps are the task evidence.",
    ));
    if (questions.length >= MAX_QUESTIONS - 4) break;
  }

  // Overlap probes from responsibilities claimed by scope-adjacent people.
  for (const claim of (input.claimedElsewhere ?? []).slice(0, 2)) {
    questions.push(q(
      `${claim.person_name} also touches "${claim.title}" — where does the work in this room end and theirs begin?`,
      "group",
      "overlap",
      "Shared responsibilities are where agents get double-built or orphaned; pin the boundary now.",
    ));
  }

  // Approval boundaries.
  questions.push(q(
    participants.length > 1
      ? "For each of you: what's the biggest thing you can approve or send out without anyone else signing off? Where exactly is the ceiling?"
      : "What's the biggest thing you can approve or send out without anyone else signing off? Where exactly is the ceiling?",
    "group",
    "approval_boundary",
    "Verbal confirmation of approval boundaries becomes classification evidence and feeds the authority profile.",
  ));

  // Delegation candidates — interviewer-side framing, never pitched as automation.
  questions.push(q(
    "If a competent new hire started tomorrow, what would you hand them on day one without worrying?",
    "group",
    "responsibility",
    "Delegation framing without pitching automation — the answer marks the delegatable surface.",
  ));
  questions.push(q(
    "And what would you never hand off, no matter how good they were? Why?",
    "group",
    "approval_boundary",
    "The never-hand-off list seeds blocked tasks with the owner's own words as evidence.",
  ));

  // Carried-over open questions — verbatim, last (they need the rapport).
  const carriedOver: SessionBrief["carried_over"] = [];
  const participantIds = new Set(participants.map((p) => p.id));
  for (const item of (input.backlog ?? []).filter((b) => !b.resolved_by_session_id && participantIds.has(b.person_id))) {
    carriedOver.push({ question: item.question, source_task_id: item.source_ref });
    if (questions.length < MAX_QUESTIONS) {
      questions.push(q(
        item.question,
        item.person_id,
        "clarification",
        "Carried over from an earlier session — never dropped silently.",
      ));
    }
  }

  // Probe areas: systems shared across participants (or named company systems).
  const systemCounts = new Map<string, number>();
  for (const p of participants) {
    for (const tool of p.tools) {
      const key = tool.trim();
      if (key) systemCounts.set(key, (systemCounts.get(key) ?? 0) + 1);
    }
  }
  const probeAreas = [...systemCounts.entries()]
    .filter(([, n]) => n >= 2 || participants.length === 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([system, n]) => ({
      system,
      prompt: participants.length > 1
        ? `${system} appears in ${n} of ${participants.length} participants' tools — walk through the recurring ${system} flow end to end (who starts it, who finishes it).`
        : `Walk through the recurring ${system} flow end to end — what kicks it off, and what does done look like?`,
    }));

  const coverageTargets = participants
    .filter((p) => !isMapped(pedigree?.[p.id]?.status))
    .map((p) => p.id);

  return {
    id: `BRIEF-${session.id}-${Date.now().toString(36)}`,
    session_id: session.id,
    objectives: objectivesFor(session.type, participants, anchor),
    questions: questions.slice(0, MAX_QUESTIONS),
    probe_areas: probeAreas,
    carried_over: carriedOver,
    coverage_targets: coverageTargets,
    source: "template",
    edited_by_user: false,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Defensive pass over AI-generated questions: drop anything that pitches
 * automation to the interviewee and re-append any missing carried-over
 * backlog questions (they may never be dropped silently).
 */
export function sanitizeBrief(brief: SessionBrief, backlog: QuestionBacklogItem[], participantIds: string[]): SessionBrief {
  const idSet = new Set(participantIds);
  const kept = brief.questions.filter((question) => !isPitchQuestion(question.text));
  const presentTexts = new Set(kept.map((question) => question.text.trim().toLowerCase()));
  const extras: BriefQuestion[] = [];
  for (const item of backlog.filter((b) => !b.resolved_by_session_id && idSet.has(b.person_id))) {
    if (presentTexts.has(item.question.trim().toLowerCase())) continue;
    extras.push({
      id: `Q-CO-${extras.length + 1}`,
      text: item.question,
      target_person_id: item.person_id,
      intent: "clarification",
      why: "Carried over from an earlier session — never dropped silently.",
      order: kept.length + extras.length + 1,
    });
  }
  const questions = [...kept, ...extras].map((question, i) => ({ ...question, order: i + 1 }));
  return { ...brief, questions };
}
