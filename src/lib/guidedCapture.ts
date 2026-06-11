import type { BriefQuestion, Person, SessionBrief, SessionNote } from "@/types";

// ── Guided Discovery Stage 4: facilitator mode ─────────────────────────
// Structured notes are gold for the parser: each note arrives pre-associated
// with a question, an intent tag, and a target person, removing the hardest
// part of parsing (attribution). Serialization produces the tagged block
// format the parse prompt recognizes:
//
//   [Q12 | target: jane@x.co | intent: cadence]
//   "Every Monday she pulls the pipeline report from Salesforce..."

export interface GuidedCaptureState {
  notes: SessionNote[];
  asked: string[];       // question ids marked asked
  skipped: string[];     // question ids explicitly skipped
  parked: SessionNote[]; // out-of-scope / follow-up items ("park it")
}

export function emptyCaptureState(): GuidedCaptureState {
  return { notes: [], asked: [], skipped: [], parked: [] };
}

function questionTag(question: BriefQuestion, targetEmail: string | undefined, noteTags: string[]): string {
  const target = targetEmail ?? (question.target_person_id === "group" ? "group" : question.target_person_id);
  const intent = noteTags.length ? `${question.intent} | tags: ${noteTags.join(",")}` : question.intent;
  return `[${question.id} | target: ${target} | intent: ${intent}]`;
}

/**
 * Serialize a guided session into parse input. Notes are the attribution
 * backbone; the raw transcript (when recorded simultaneously) follows as the
 * evidence source for quotes. Guided-capture attribution overrides model
 * inference during parse.
 */
export function serializeGuidedSession(
  brief: SessionBrief,
  notes: SessionNote[],
  people: Person[],
  transcript?: string,
): string {
  const emailOf = (personId: string | undefined): string | undefined =>
    personId ? people.find((p) => p.id === personId)?.email || personId : undefined;
  const blocks: string[] = [];

  blocks.push("=== GUIDED CAPTURE NOTES (structured; target attribution is authoritative) ===");
  for (const question of brief.questions) {
    const questionNotes = notes.filter((n) => n.question_id === question.id && n.text.trim());
    for (const note of questionNotes) {
      const target = emailOf(note.target_person_id)
        ?? (question.target_person_id === "group" ? "group" : emailOf(question.target_person_id));
      blocks.push(`${questionTag(question, target, note.tags)}\nQ: ${question.text}\n"${note.text.trim()}"`);
    }
  }
  const parked = notes.filter((n) => n.question_id === "parked" && n.text.trim());
  for (const note of parked) {
    const target = emailOf(note.target_person_id) ?? "group";
    blocks.push(`[PARKED | target: ${target} | intent: clarification]\n"${note.text.trim()}"`);
  }

  if (transcript?.trim()) {
    blocks.push("=== RAW TRANSCRIPT (evidence source for quotes) ===");
    blocks.push(transcript.trim());
  }

  return blocks.join("\n\n");
}

/**
 * Auto-set question outcomes after a guided session: answered if notes exist,
 * skipped if explicitly skipped, parked stays visible in the backlog.
 */
export function applyQuestionOutcomes(
  brief: SessionBrief,
  state: GuidedCaptureState,
): SessionBrief {
  const noted = new Set(state.notes.filter((n) => n.text.trim()).map((n) => n.question_id));
  const skipped = new Set(state.skipped);
  const parkedQ = new Set(state.parked.map((n) => n.question_id));
  return {
    ...brief,
    questions: brief.questions.map((question) => {
      const outcome = noted.has(question.id)
        ? ("answered" as const)
        : parkedQ.has(question.id)
          ? ("parked" as const)
          : skipped.has(question.id)
            ? ("skipped" as const)
            : question.outcome;
      const notes = state.notes.filter((n) => n.question_id === question.id && n.text.trim());
      return { ...question, ...(outcome ? { outcome } : {}), ...(notes.length ? { notes } : {}) };
    }),
  };
}

/** Per-participant coverage: how many of the questions targeting them have notes. */
export function participantCoverage(
  brief: SessionBrief,
  notes: SessionNote[],
  participants: Person[],
): { person: Person; answered: number; total: number }[] {
  const answeredQ = new Set(notes.filter((n) => n.text.trim()).map((n) => n.question_id));
  return participants.map((person) => {
    const mine = brief.questions.filter(
      (q) => q.target_person_id === person.id || q.target_person_id === "group",
    );
    return {
      person,
      answered: mine.filter((q) => answeredQ.has(q.id)).length,
      total: mine.length,
    };
  });
}
