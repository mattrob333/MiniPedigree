import { useState } from "react";
import { Icon } from "./Icon";
import type { BriefQuestion, BriefQuestionIntent, Person, SessionBrief } from "@/types";
import { downloadFile } from "@/lib/state";
import { copyText } from "@/lib/util";

// ── Transcript-first discovery: the facilitator brief ──────────────────
// The brief runs the meeting — the app doesn't. Questions are grouped into
// agenda sections (round-robin and core topics expanded; person-specific,
// KPI, and carried-over follow-ups collapsed) so the facilitator gets an
// agenda, not a survey. Editable before the session; copyable into the
// meeting doc; downloadable as Markdown.

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

// Agenda sections: which intents group together, and whether the section
// starts expanded (the facilitator's main agenda) or collapsed (follow-ups
// to use when the conversation stalls).
const SECTIONS: { id: string; title: string; hint: string; intents: BriefQuestionIntent[]; expanded: boolean }[] = [
  { id: "roundrobin", title: "Opening round-robin", hint: "ownership warm-ups — let people answer naturally", intents: ["responsibility"], expanded: true },
  { id: "core", title: "Core topics: recurring work, systems, approvals", hint: "the main agenda — cadences, tools, and boundaries", intents: ["cadence", "system", "approval_boundary"], expanded: true },
  { id: "kpi", title: "KPI follow-ups", hint: "use when the conversation stalls", intents: ["kpi_ownership"], expanded: false },
  { id: "overlap", title: "Overlaps & handoffs", hint: "use when ownership sounds shared", intents: ["overlap"], expanded: false },
  { id: "carried", title: "Carried-over questions", hint: "open questions from earlier sessions — ask last, they need the rapport", intents: ["clarification"], expanded: false },
];

interface Props {
  brief: SessionBrief;
  participants: Person[];
  editable?: boolean;
  onChange?: (brief: SessionBrief) => void;
  onRegenerate?: () => void;
  busy?: boolean;
  onToast?: (t1: string, t2?: string, green?: boolean) => void;
}

export function briefToMarkdown(brief: SessionBrief, participants: Person[]): string {
  const nameOf = (id: string) => (id === "group" ? "Group" : participants.find((p) => p.id === id)?.name ?? id);
  const lines = [
    `# Session Brief`,
    ``,
    `## Objectives`,
    brief.objectives,
    ``,
    `## How to run this meeting`,
    `1. Keep the recording/transcript on.`,
    `2. Open with the round-robin and let people answer naturally.`,
    `3. Use the follow-up sections only when the conversation stalls.`,
    `4. Upload the transcript to Pedigree after the call.`,
  ];
  for (const section of SECTIONS) {
    const questions = brief.questions.filter((q) => section.intents.includes(q.intent));
    if (!questions.length) continue;
    lines.push("", `## ${section.title}`);
    for (const q of questions) {
      lines.push(`- **[${nameOf(q.target_person_id)}]** ${q.text}`);
    }
  }
  if (brief.probe_areas.length) {
    lines.push("", "## System probe areas", ...brief.probe_areas.map((p) => `- **${p.system}** — ${p.prompt}`));
  }
  lines.push("", `_Source: ${brief.source}${brief.edited_by_user ? " (edited)" : ""} · generated ${brief.generated_at}_`);
  return lines.join("\n");
}

export function SessionBriefView({ brief, participants, editable = true, onChange, onRegenerate, busy, onToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const nameOf = (id: string) => (id === "group" ? "Group" : participants.find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? id);

  const update = (questions: BriefQuestion[]) => {
    onChange?.({ ...brief, questions: questions.map((q, i) => ({ ...q, order: i + 1 })), edited_by_user: true });
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
  const copyAgenda = async () => {
    const ok = await copyText(briefToMarkdown(brief, participants));
    onToast?.(ok ? "Agenda copied" : "Copy failed", ok ? "Paste it into your meeting doc or Google Meet chat" : "Use the Brief.md download instead", ok);
  };

  const renderQuestion = (q: BriefQuestion) => (
    <li className="brief-question" key={q.id}>
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
          <button className="icon-btn" aria-label="Edit" onClick={() => { setEditingId(q.id); setEditText(q.text); }}><Icon name="build" size={11} /></button>
          <button className="icon-btn" aria-label="Delete" onClick={() => remove(q.id)}><Icon name="close" size={11} /></button>
        </div>
      )}
    </li>
  );

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
          <button className="btn btn-sm btn-outline-cyan" onClick={copyAgenda} title="Copy the agenda as Markdown — paste it into your meeting doc"><Icon name="copy" size={11} /> Copy agenda</button>
          {onRegenerate && <button className="btn btn-sm btn-ghost" onClick={onRegenerate} disabled={busy} title="Regenerate from current company context and open questions"><Icon name="sparkles" size={11} /> {busy ? "Generating..." : "Regenerate"}</button>}
          <button className="btn btn-sm btn-ghost" onClick={() => downloadFile("session-brief.md", briefToMarkdown(brief, participants), "text/markdown")} title="Run the session from a phone or printout"><Icon name="download" size={11} /> Brief.md</button>
        </div>
      </div>

      {brief.coverage_targets.length > 0 && (
        <div className="brief-coverage-targets">
          <Icon name="target" size={11} /> Must not leave unmapped: {brief.coverage_targets.map((id) => nameOf(id)).join(", ")}
        </div>
      )}

      {SECTIONS.map((section) => {
        const questions = brief.questions.filter((q) => section.intents.includes(q.intent));
        if (!questions.length) return null;
        return (
          <details className="brief-section" key={section.id} open={section.expanded}>
            <summary className="brief-section-head">
              <Icon name="chevron-right" size={11} className="brief-section-chevron" />
              {section.title} <span className="tag">{questions.length}</span>
              <span className="brief-section-hint">{section.hint}</span>
            </summary>
            <ol className="brief-question-list">{questions.map(renderQuestion)}</ol>
          </details>
        );
      })}

      {editable && (
        <button className="btn btn-sm btn-ghost" onClick={addQuestion}><Icon name="sparkles" size={11} /> Add question</button>
      )}

      {brief.probe_areas.length > 0 && (
        <details className="brief-section">
          <summary className="brief-section-head">
            <Icon name="chevron-right" size={11} className="brief-section-chevron" />
            System probe areas <span className="tag">{brief.probe_areas.length}</span>
            <span className="brief-section-hint">system-by-system walk-through prompts</span>
          </summary>
          <div style={{ padding: "4px 0 8px" }}>
            {brief.probe_areas.map((p) => (
              <div className="brief-probe" key={p.system}><span className="tag cyan">{p.system}</span> {p.prompt}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
