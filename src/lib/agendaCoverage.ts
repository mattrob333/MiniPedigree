import type { ParsedMap, SessionBrief } from "@/types";
import { significantKeywords, tokenOverlap } from "./governance";

// ── Transcript-first discovery: agenda coverage ────────────────────────
// The facilitator runs the meeting from the brief; one transcript comes
// back. This maps the transcript (and what the parse extracted) back to the
// agenda so the review step can say "9 of 12 topics answered — 3 carried
// forward", and unanswered questions flow into the open-questions backlog
// via the existing brief-outcome ingestion.

export interface AgendaCoverage {
  answered: number;
  partial: number;
  unanswered: number;
  total: number;
}

const ANSWERED_THRESHOLD = 0.34;
const PARTIAL_THRESHOLD = 0.18;

/** Intents whose questions are warm-ups: covered when the person produced findings. */
const WARMUP_INTENTS = new Set(["responsibility", "cadence", "system"]);

export function assessAgendaCoverage(
  brief: SessionBrief,
  transcript: string,
  parsed: ParsedMap,
): { brief: SessionBrief; coverage: AgendaCoverage } {
  // Who actually produced extracted work? A warm-up question targeting them
  // is answered by definition — the conversation covered their role.
  const yielded = new Set(
    Object.entries(parsed)
      .filter(([, person]) => person.responsibilities.some((r) => r.tasks.delegatable.length + r.tasks.approval.length + r.tasks.not_delegatable.length > 0))
      .map(([id]) => id),
  );

  // Evidence pool: sliding two-sentence windows (answers span sentences)
  // plus every extracted evidence quote and task text.
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const windows: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    windows.push(sentences[i]);
    if (i + 1 < sentences.length) windows.push(`${sentences[i]} ${sentences[i + 1]}`);
  }
  for (const person of Object.values(parsed)) {
    for (const resp of person.responsibilities) {
      if (resp.evidence_quote) windows.push(resp.evidence_quote);
      for (const detail of resp.taskDetails ?? []) {
        windows.push([detail.name, detail.trigger ?? "", detail.evidence_quote ?? "", (detail.inputs ?? []).join(" "), (detail.outputs ?? []).join(" ")].join(" "));
      }
    }
  }

  let answered = 0;
  let partial = 0;
  let unanswered = 0;

  const questions = brief.questions.map((question) => {
    // Warm-ups: answered when the targeted person (or, for group questions,
    // anyone in scope) produced extracted findings.
    if (WARMUP_INTENTS.has(question.intent)) {
      const covered = question.target_person_id === "group" ? yielded.size > 0 : yielded.has(question.target_person_id);
      if (covered) {
        answered++;
        return { ...question, outcome: "answered" as const };
      }
    }

    // Topical questions: token match against transcript windows + evidence.
    const subject = question.text.replace(/walk me through|the last time|last week|tell me about|going around the room/gi, "");
    if (!significantKeywords(subject).length) {
      unanswered++;
      return { ...question, outcome: "skipped" as const };
    }
    let best = 0;
    for (const window of windows) {
      const score = tokenOverlap(subject, window);
      if (score > best) best = score;
      if (best >= ANSWERED_THRESHOLD) break;
    }
    if (best >= ANSWERED_THRESHOLD) {
      answered++;
      return { ...question, outcome: "answered" as const };
    }
    if (best >= PARTIAL_THRESHOLD) {
      partial++;
      return { ...question, outcome: "partial" as const };
    }
    unanswered++;
    return { ...question, outcome: "skipped" as const };
  });

  return {
    brief: { ...brief, questions },
    coverage: { answered, partial, unanswered, total: brief.questions.length },
  };
}
