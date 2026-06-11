import type {
  ParsedMap,
  QuestionBacklogItem,
  SessionBrief,
  SessionNote,
} from "@/types";
import { tokenOverlap } from "./governance";

// ── Guided Discovery Stage 5: the question ledger / backlog ────────────
// Unanswered brief questions, parser open_questions, and parked items flow
// into one backlog grouped by person. Items resolve automatically when a
// later session answers them (match by task linkage) or manually. Carried-
// over questions are never dropped silently: they reappear in the next
// relevant brief or stay visible here.

let backlogSeq = 0;
function nextId(): string {
  backlogSeq += 1;
  return `QB-${Date.now().toString(36)}-${backlogSeq}`;
}

const normText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function hasQuestion(backlog: QuestionBacklogItem[], personId: string, question: string): boolean {
  const key = normText(question);
  return backlog.some((b) => b.person_id === personId && normText(b.question) === key);
}

/** Ingest parser open_questions for the people in scope. Dedupes by person + text. */
export function ingestParserOpenQuestions(
  backlog: QuestionBacklogItem[],
  parsed: ParsedMap,
  scopeIds: string[],
): QuestionBacklogItem[] {
  const next = [...backlog];
  for (const personId of scopeIds) {
    const data = parsed[personId];
    if (!data) continue;
    for (const resp of data.responsibilities) {
      for (const task of resp.taskDetails ?? []) {
        for (const question of task.open_questions ?? []) {
          if (!question.trim() || hasQuestion(next, personId, question)) continue;
          next.push({
            id: nextId(),
            person_id: personId,
            question: question.trim(),
            source: "parser_open_question",
            source_ref: `${resp.id}:${task.name}`,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }
  return next;
}

/**
 * Ingest brief outcomes after a session: questions that were skipped or never
 * answered go into the backlog (targeted at their person, or the session
 * anchor for group questions); parked notes land as parked items.
 */
export function ingestBriefOutcomes(
  backlog: QuestionBacklogItem[],
  brief: SessionBrief,
  parkedNotes: SessionNote[],
  anchorPersonId: string,
): QuestionBacklogItem[] {
  const next = [...backlog];
  for (const question of brief.questions) {
    // Skipped, parked, never-asked, and weakly-answered topics all carry
    // forward — a partial answer is an open question with a head start.
    const unanswered = question.outcome !== "answered";
    if (!unanswered) continue;
    const personId = question.target_person_id === "group" ? anchorPersonId : question.target_person_id;
    if (hasQuestion(next, personId, question.text)) continue;
    next.push({
      id: nextId(),
      person_id: personId,
      question: question.text,
      source: "unanswered_brief",
      source_ref: question.id,
      created_at: new Date().toISOString(),
    });
  }
  for (const note of parkedNotes) {
    if (!note.text.trim()) continue;
    const personId = note.target_person_id ?? anchorPersonId;
    if (hasQuestion(next, personId, note.text)) continue;
    next.push({
      id: nextId(),
      person_id: personId,
      question: note.text.trim(),
      source: "parked",
      source_ref: note.id,
      created_at: new Date().toISOString(),
    });
  }
  return next;
}

const RESOLVE_THRESHOLD = 0.5;

/**
 * Auto-resolve backlog items answered by a newly applied parse: the person's
 * new tasks cover the question's subject (token match against task name +
 * completion context) and the parser did not re-emit the same open question.
 */
export function resolveBacklogFromParse(
  backlog: QuestionBacklogItem[],
  parsed: ParsedMap,
  scopeIds: string[],
  sessionId: string,
): QuestionBacklogItem[] {
  const scope = new Set(scopeIds);
  return backlog.map((item) => {
    if (item.resolved_by_session_id || !scope.has(item.person_id)) return item;
    const data = parsed[item.person_id];
    if (!data) return item;

    const stillOpen = data.responsibilities.some((resp) =>
      (resp.taskDetails ?? []).some((task) =>
        (task.open_questions ?? []).some((open) => normText(open) === normText(item.question)),
      ),
    );
    if (stillOpen) return item;

    const answered = data.responsibilities.some((resp) =>
      (resp.taskDetails ?? []).some((task) => {
        const taskText = [
          task.name,
          task.trigger ?? "",
          (task.inputs ?? []).join(" "),
          (task.outputs ?? []).join(" "),
          task.definition_of_done ?? "",
          task.evidence_quote ?? "",
        ].join(" ");
        return tokenOverlap(item.question, taskText) >= RESOLVE_THRESHOLD;
      }),
    );
    return answered ? { ...item, resolved_by_session_id: sessionId } : item;
  });
}

/** Manually resolve a backlog item (e.g. from the backlog UI or a member answer). */
export function resolveBacklogItem(backlog: QuestionBacklogItem[], itemId: string, sessionId: string): QuestionBacklogItem[] {
  return backlog.map((b) => (b.id === itemId ? { ...b, resolved_by_session_id: sessionId } : b));
}

export function openBacklog(backlog: QuestionBacklogItem[]): QuestionBacklogItem[] {
  return backlog.filter((b) => !b.resolved_by_session_id);
}

export function backlogByPerson(backlog: QuestionBacklogItem[]): Map<string, QuestionBacklogItem[]> {
  const out = new Map<string, QuestionBacklogItem[]>();
  for (const item of openBacklog(backlog)) {
    const list = out.get(item.person_id) ?? [];
    list.push(item);
    out.set(item.person_id, list);
  }
  return out;
}

/**
 * Serialize a member's written answer to a backlog question into the tagged
 * block format the parser treats as authoritative attribution
 * (Living Stack B.3 — asynchronous discovery).
 */
export function serializeBacklogAnswer(item: QuestionBacklogItem, answer: string, personEmail: string): string {
  return `[backlog:${item.id} | target: ${personEmail} | intent: clarification]\nQ: ${item.question}\n"${answer.trim()}"`;
}
