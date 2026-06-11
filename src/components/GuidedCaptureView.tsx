import { useState } from "react";
import { Icon } from "./Icon";
import type { Person, SessionBrief, SessionNote, SessionNoteTag } from "@/types";
import type { GuidedCaptureState } from "@/lib/guidedCapture";
import { participantCoverage } from "@/lib/guidedCapture";
import { initials } from "@/lib/util";

// ── Guided Discovery Stage 4: live facilitator view ────────────────────
// The question script as a checklist: tap to mark asked, type notes under
// each question, one-tap intent chips, a per-participant coverage meter, and
// a "park it" button that logs follow-ups without derailing the session.

const TAGS: { id: SessionNoteTag; label: string }[] = [
  { id: "responsibility", label: "responsibility" },
  { id: "task", label: "task" },
  { id: "approval", label: "approval" },
  { id: "system", label: "system" },
  { id: "open_question", label: "open question" },
];

interface Props {
  brief: SessionBrief;
  participants: Person[];
  state: GuidedCaptureState;
  onChange: (state: GuidedCaptureState) => void;
}

let noteSeq = 0;

export function GuidedCaptureView({ brief, participants, state, onChange }: Props) {
  const [parkText, setParkText] = useState("");
  const coverage = participantCoverage(brief, state.notes, participants);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? id;

  const noteFor = (questionId: string): SessionNote | undefined =>
    state.notes.find((n) => n.question_id === questionId);

  const upsertNote = (questionId: string, patch: Partial<SessionNote>) => {
    const existing = noteFor(questionId);
    if (existing) {
      onChange({ ...state, notes: state.notes.map((n) => (n.question_id === questionId ? { ...n, ...patch } : n)) });
    } else {
      const question = brief.questions.find((q) => q.id === questionId);
      noteSeq += 1;
      onChange({
        ...state,
        notes: [...state.notes, {
          id: `N-${Date.now().toString(36)}-${noteSeq}`,
          question_id: questionId,
          target_person_id: question?.target_person_id === "group" ? undefined : question?.target_person_id,
          tags: [],
          text: "",
          captured_at: new Date().toISOString(),
          ...patch,
        }],
      });
    }
  };

  const toggleTag = (questionId: string, tag: SessionNoteTag) => {
    const note = noteFor(questionId);
    const tags = note?.tags.includes(tag) ? note.tags.filter((t) => t !== tag) : [...(note?.tags ?? []), tag];
    upsertNote(questionId, { tags });
  };

  const toggleAsked = (questionId: string) => {
    onChange({
      ...state,
      asked: state.asked.includes(questionId) ? state.asked.filter((id) => id !== questionId) : [...state.asked, questionId],
      skipped: state.skipped.filter((id) => id !== questionId),
    });
  };

  const toggleSkip = (questionId: string) => {
    onChange({
      ...state,
      skipped: state.skipped.includes(questionId) ? state.skipped.filter((id) => id !== questionId) : [...state.skipped, questionId],
      asked: state.asked.filter((id) => id !== questionId),
    });
  };

  const parkIt = () => {
    if (!parkText.trim()) return;
    noteSeq += 1;
    onChange({
      ...state,
      parked: [...state.parked, {
        id: `N-P-${Date.now().toString(36)}-${noteSeq}`,
        question_id: "parked",
        tags: ["open_question"],
        text: parkText.trim(),
        captured_at: new Date().toISOString(),
      }],
    });
    setParkText("");
  };

  return (
    <div className="guided-capture">
      {/* Per-participant coverage meter */}
      <div className="capture-coverage" role="status">
        {coverage.map(({ person, answered, total }) => (
          <span className={"capture-person" + (answered > 0 ? " active" : "")} key={person.id} title={`${person.name}: ${answered}/${total} targeted questions answered`}>
            <span className="avatar">{initials(person.name)}</span>
            <span className="capture-meter"><span style={{ width: total ? `${Math.round((answered / total) * 100)}%` : "0%" }} /></span>
            <span className="capture-count mono">{answered}/{total}</span>
          </span>
        ))}
      </div>

      <div className="capture-questions">
        {brief.questions.map((q, i) => {
          const note = noteFor(q.id);
          const asked = state.asked.includes(q.id) || Boolean(note?.text.trim());
          const skipped = state.skipped.includes(q.id);
          return (
            <div className={"capture-q" + (asked ? " asked" : "") + (skipped ? " skipped" : "")} key={q.id}>
              <button className="capture-check" aria-label={asked ? "Asked" : "Mark asked"} onClick={() => toggleAsked(q.id)}>
                {asked ? <Icon name="checkmark" size={11} /> : <span className="n">{i + 1}</span>}
              </button>
              <div className="capture-q-body">
                <div className="capture-q-text" title={`Why: ${q.why}`}>
                  {q.text}
                  <span className="capture-q-target">{q.target_person_id === "group" ? "Group" : nameOf(q.target_person_id)}</span>
                </div>
                <textarea
                  className="textarea capture-note"
                  rows={note?.text ? 2 : 1}
                  placeholder={skipped ? "Skipped." : "Notes — what did they actually say?"}
                  value={note?.text ?? ""}
                  disabled={skipped}
                  onChange={(e) => upsertNote(q.id, { text: e.target.value })}
                />
                <div className="capture-q-foot">
                  <div className="capture-tags">
                    {TAGS.map((tag) => (
                      <button
                        key={tag.id}
                        className={"capture-tag" + (note?.tags.includes(tag.id) ? " on" : "")}
                        onClick={() => toggleTag(q.id, tag.id)}
                        disabled={skipped}
                      >{tag.label}</button>
                    ))}
                  </div>
                  {note?.text.trim() && participants.length > 1 && (
                    <select
                      className="select capture-target-select"
                      value={note.target_person_id ?? "group"}
                      aria-label="Attribute this note to"
                      onChange={(e) => upsertNote(q.id, { target_person_id: e.target.value === "group" ? undefined : e.target.value })}
                    >
                      <option value="group">whole group</option>
                      {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <button className={"btn btn-sm btn-ghost" + (skipped ? " active" : "")} onClick={() => toggleSkip(q.id)}>{skipped ? "Unskip" : "Skip"}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Park it: out-of-scope / follow-up items without derailing the session */}
      <div className="capture-park">
        <Icon name="history" size={12} stroke="var(--text-4)" />
        <input
          className="input"
          placeholder='Park it — log an out-of-scope or follow-up item ("check the data warehouse timeline")'
          value={parkText}
          onChange={(e) => setParkText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && parkIt()}
        />
        <button className="btn btn-sm" onClick={parkIt} disabled={!parkText.trim()}>Park</button>
        {state.parked.length > 0 && <span className="tag">{state.parked.length} parked</span>}
      </div>
    </div>
  );
}
