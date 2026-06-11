import { useState } from "react";
import { Icon } from "./Icon";
import type { BriefQuestion, BriefQuestionIntent, Person, SessionBrief } from "@/types";
import { downloadFile } from "@/lib/state";

// ── Guided Discovery: the editable session brief ───────────────────────
// The facilitator's talking-points document. Editable before the session
// (reorder, edit, delete, add — edits are kept and flagged), downloadable as
// Markdown for running the session from a phone or printout.

const INTENT_LABEL: Record<BriefQuestionIntent, string> = {
  responsibility: "ownership",
  cadence: "cadence",
  system: "system",
  approval_boundary: "approval",
  kpi_ownership: "KPI",
  overlap: "overlap",
  clarification: "carried over",
};

const INTENT_COLOR: Record<BriefQuestionIntent, string> = {
  responsibility: "var(--cyan)",
  cadence: "var(--text-3)",
  system: "var(--purple, #a78bfa)",
  approval_boundary: "var(--yellow)",
  kpi_ownership: "var(--green)",
  overlap: "var(--orange, #fb923c)",
  clarification: "var(--red)",
};

interface Props {
  brief: SessionBrief;
  participants: Person[];
  editable?: boolean;
  onChange?: (brief: SessionBrief) => void;
  onRegenerate?: () => void;
  busy?: boolean;
}

export function briefToMarkdown(brief: SessionBrief, participants: Person[]): string {
  const nameOf = (id: string) => (id === "group" ? "Group" : participants.find((p) => p.id === id)?.name ?? id);
  const lines = [
    `# Session Brief`,
    ``,
    `## Objectives`,
    brief.objectives,
    ``,
    `## Question script`,
    ...brief.questions.map((q, i) => `${i + 1}. **[${nameOf(q.target_person_id)} · ${INTENT_LABEL[q.intent]}]** ${q.text}\n   _why: ${q.why}_`),
  ];
  if (brief.probe_areas.length) {
    lines.push("", "## Probe areas", ...brief.probe_areas.map((p) => `- **${p.system}** — ${p.prompt}`));
  }
  if (brief.carried_over.length) {
    lines.push("", "## Carried-over open questions", ...brief.carried_over.map((c) => `- ${c.question}`));
  }
  lines.push("", `_Source: ${brief.source}${brief.edited_by_user ? " (edited)" : ""} · generated ${brief.generated_at}_`);
  return lines.join("\n");
}

export function SessionBriefView({ brief, participants, editable = true, onChange, onRegenerate, busy }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const nameOf = (id: string) => (id === "group" ? "Group" : participants.find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? id);

  const update = (questions: BriefQuestion[]) => {
    onChange?.({ ...brief, questions: questions.map((q, i) => ({ ...q, order: i + 1 })), edited_by_user: true });
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...brief.questions];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    update(next);
  };
  const remove = (id: string) => update(brief.questions.filter((q) => q.id !== id));
  const saveEdit = (id: string) => {
    if (editText.trim()) update(brief.questions.map((q) => (q.id === id ? { ...q, text: editText.trim() } : q)));
    setEditingId(null);
  };
  const addQuestion = () => {
    const q: BriefQuestion = {
      id: `Q-U-${Date.now().toString(36)}`,
      text: "",
      target_person_id: "group",
      intent: "responsibility",
      why: "Added by the facilitator.",
      order: brief.questions.length + 1,
    };
    update([...brief.questions, q]);
    setEditingId(q.id);
    setEditText("");
  };

  return (
    <div className="brief-view">
      <div className="brief-head">
        <div>
          <div className="brief-title"><Icon name="doc" size={13} stroke="var(--cyan)" /> Session brief
            <span className="tag">{brief.source === "ai" ? "AI-generated" : "template"}</span>
            {brief.edited_by_user && <span className="tag cyan">edited</span>}
          </div>
          <p className="brief-objectives">{brief.objectives}</p>
        </div>
        <div className="brief-actions">
          {onRegenerate && <button className="btn btn-sm btn-ghost" onClick={onRegenerate} disabled={busy} title="Regenerate from current company context and backlog"><Icon name="sparkles" size={11} /> {busy ? "Generating..." : "Regenerate"}</button>}
          <button className="btn btn-sm btn-ghost" onClick={() => downloadFile("session-brief.md", briefToMarkdown(brief, participants), "text/markdown")} title="Run the session from a phone or printout"><Icon name="download" size={11} /> Brief.md</button>
        </div>
      </div>

      {brief.coverage_targets.length > 0 && (
        <div className="brief-coverage-targets">
          <Icon name="target" size={11} /> Must not leave unmapped: {brief.coverage_targets.map((id) => nameOf(id)).join(", ")}
        </div>
      )}

      <ol className="brief-question-list">
        {brief.questions.map((q, i) => (
          <li className="brief-question" key={q.id}>
            <span className="brief-q-n">{i + 1}</span>
            <div className="brief-q-body">
              {editingId === q.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    value={editText}
                    autoFocus
                    placeholder="Walk me through the last time you..."
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(q.id); if (e.key === "Escape") setEditingId(null); }}
                  />
                  <button className="btn btn-sm btn-outline-cyan" onClick={() => saveEdit(q.id)}>Save</button>
                </div>
              ) : (
                <div className="brief-q-text" title={`Why: ${q.why}`}>{q.text || <em className="dim">empty question</em>}</div>
              )}
              <div className="brief-q-meta">
                <span className="brief-q-target">{nameOf(q.target_person_id)}</span>
                <span className="brief-q-intent" style={{ color: INTENT_COLOR[q.intent] }}>{INTENT_LABEL[q.intent]}</span>
                <span className="brief-q-why">{q.why}</span>
              </div>
            </div>
            {editable && editingId !== q.id && (
              <div className="brief-q-controls">
                <button className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><Icon name="chevron-down" size={11} style={{ transform: "rotate(180deg)" }} /></button>
                <button className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === brief.questions.length - 1}><Icon name="chevron-down" size={11} /></button>
                <button className="icon-btn" aria-label="Edit" onClick={() => { setEditingId(q.id); setEditText(q.text); }}><Icon name="build" size={11} /></button>
                <button className="icon-btn" aria-label="Delete" onClick={() => remove(q.id)}><Icon name="close" size={11} /></button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <button className="btn btn-sm btn-ghost" onClick={addQuestion}><Icon name="sparkles" size={11} /> Add question</button>
      )}

      {brief.probe_areas.length > 0 && (
        <div className="brief-probes">
          <div className="sh">System probe areas</div>
          {brief.probe_areas.map((p) => (
            <div className="brief-probe" key={p.system}><span className="tag cyan">{p.system}</span> {p.prompt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
