import { useEffect, useRef, useState } from "react";
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
  const [showNotes, setShowNotes] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const actionsRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string) => (id === "group" ? "Group" : participants.find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? id);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

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

  const systemName = (q: BriefQuestion) => {
    const direct = q.text.match(/\b(?:what happened in|opened|inside|from|using|in)\s+([A-Z][A-Za-z0-9+&.\- ]{1,32}?)(?=\s+(?:the last time|last time|for real work|to|when|while)|[,.?]|$)/i);
    return direct?.[1]?.trim() ?? "";
  };

  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const targetChip = (q: BriefQuestion) => {
    const person = participants.find((p) => p.id === q.target_person_id);
    const systemMatch = systemName(q);
    if (systemMatch && person) return `${nameOf(q.target_person_id)} · ${systemMatch}`;
    return nameOf(q.target_person_id);
  };

  const normalizedText = (q: BriefQuestion) => q.text
    .replace(/^[A-Z][A-Za-z'-]+,\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  const groupText = (q: BriefQuestion) => {
    const text = normalizedText(q);
    if (q.intent !== "system") return text;
    const system = systemName(q);
    return system ? text.replace(system, "[system]") : text;
  };

  const groupedQuestions = (questions: BriefQuestion[]) => {
    const byKey = new Map<string, BriefQuestion[]>();
    for (const q of questions) {
      const key = `${q.intent}::${groupText(q).toLowerCase()}`;
      byKey.set(key, [...(byKey.get(key) ?? []), q]);
    }
    return [...byKey.entries()].map(([key, items]) => ({ key, items, displayText: groupText(items[0]) }));
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderQuestion = (q: BriefQuestion, nested = false) => {
    const hasMeta = (q.target_person_id !== "group" && !nested) || nested || showNotes;
    return (
      <li className={"brief-question" + (nested ? " nested" : "")} key={q.id}>
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
            <div className="brief-q-line" title={showNotes ? undefined : `Why: ${q.why}`}>
              <span className="brief-q-text">{q.text ? cap(q.text) : <em className="dim">empty question</em>}</span>
            </div>
          )}
          {hasMeta && (
            <div className="brief-q-meta">
              {q.target_person_id !== "group" && <span className="tag">{targetChip(q)}</span>}
              {showNotes && <span className="brief-q-intent" style={{ color: INTENT_COLOR[q.intent] }}>{INTENT_LABEL[q.intent]}</span>}
              {showNotes && <span className="brief-q-why">{q.why}</span>}
            </div>
          )}
        </div>
        {editable && editingId !== q.id && (
          <div className="brief-q-controls">
            <button className="icon-btn" aria-label="Edit" onClick={() => { setEditingId(q.id); setEditText(q.text); }}><Icon name="build" size={11} /></button>
            <button className="icon-btn" aria-label="Delete" onClick={() => remove(q.id)}><Icon name="close" size={11} /></button>
          </div>
        )}
      </li>
    );
  };

  const renderGroup = (group: { key: string; items: BriefQuestion[]; displayText: string }) => {
    if (group.items.length === 1) return renderQuestion(group.items[0]);
    const first = group.items[0];
    const expanded = expandedGroups.has(group.key);
    return (
      <li className="brief-question grouped" key={group.key}>
        <div className="brief-q-body">
          <div className="brief-q-line">
            <span className="brief-q-text">{cap(group.displayText)}</span>
          </div>
          <div className="brief-q-meta">
            <span className="brief-q-askeach">Ask each:</span>
            {group.items.map((q) => <span className="tag" key={q.id}>{targetChip(q)}</span>)}
            <button className="brief-q-expand" onClick={() => toggleGroup(group.key)}>
              {expanded ? "Hide individual questions" : "Edit individually"}
            </button>
            {showNotes && <span className="brief-q-intent" style={{ color: INTENT_COLOR[first.intent] }}>{INTENT_LABEL[first.intent]}</span>}
            {showNotes && <span className="brief-q-why">{first.why}</span>}
          </div>
          {expanded && <ol className="brief-question-list nested">{group.items.map((q) => renderQuestion(q, true))}</ol>}
        </div>
      </li>
    );
  };

  return (
    <div className="brief-view">
      <div className="brief-head">
        <div>
          <div className="brief-title"><Icon name="doc" size={13} stroke="var(--cyan)" /> Session brief
            <span className="tag" title={brief.source === "ai" ? undefined : "Built from the standard question set - connect an API key for an agenda tailored to this company's context and open questions."}>{brief.source === "ai" ? "AI-generated" : "standard agenda"}</span>
            {brief.edited_by_user && <span className="tag cyan">edited</span>}
          </div>
        </div>
        <div className="brief-actions">
          <button className="btn btn-sm btn-outline-cyan" onClick={copyAgenda} title="Copy the agenda as Markdown — paste it into your meeting doc"><Icon name="copy" size={11} /> Copy agenda</button>
          <button
            className="icon-btn"
            aria-label="Show/hide facilitator notes"
            aria-pressed={showNotes}
            title="Show/hide facilitator notes"
            onClick={() => setShowNotes((v) => !v)}
            style={showNotes ? { borderColor: "var(--border-cyan)", color: "var(--cyan)" } : undefined}
          >
            <Icon name="info" size={12} />
          </button>
          <div className="brief-actions-menu-wrap" ref={actionsRef}>
            <button
              className="icon-btn"
              aria-label="More brief actions"
              aria-expanded={actionsOpen}
              title="More brief actions"
              onClick={() => setActionsOpen((v) => !v)}
            >
              <Icon name="menu-dots" size={13} />
            </button>
            {actionsOpen && (
              <div className="brief-actions-menu" role="menu" aria-label="Brief actions">
                {onRegenerate && (
                  <button
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setActionsOpen(false);
                      onRegenerate();
                    }}
                  >
                    <Icon name="sparkles" size={12} /> {busy ? "Generating..." : "Regenerate brief"}
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    downloadFile("session-brief.md", briefToMarkdown(brief, participants), "text/markdown");
                  }}
                >
                  <Icon name="download" size={12} /> Download Brief.md
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {SECTIONS.filter((s) => brief.questions.some((q) => s.intents.includes(q.intent))).map((section, index) => {
        const questions = brief.questions.filter((q) => section.intents.includes(q.intent));
        return (
          <details className="brief-section" key={section.id} open={section.expanded}>
            <summary className="brief-section-head">
              <Icon name="chevron-right" size={12} className="brief-section-chevron" />
              <span className="brief-section-heading">
                <span className="brief-section-round">Round {index + 1}</span>
                <span className="brief-section-title">{section.title} <span className="brief-section-count">{questions.length}</span></span>
                <span className="brief-section-hint">{cap(section.hint)}</span>
              </span>
            </summary>
            <ol className="brief-question-list">{groupedQuestions(questions).map(renderGroup)}</ol>
          </details>
        );
      })}

      {brief.probe_areas.length > 0 && (
        <details className="brief-section">
          <summary className="brief-section-head">
            <Icon name="chevron-right" size={12} className="brief-section-chevron" />
            <span className="brief-section-heading">
              <span className="brief-section-round">Reference</span>
              <span className="brief-section-title">System probe areas <span className="brief-section-count">{brief.probe_areas.length}</span></span>
              <span className="brief-section-hint">System-by-system walk-through prompts — use during the core topics round</span>
            </span>
          </summary>
          <ul className="brief-question-list">
            {brief.probe_areas.map((p) => (
              <li className="brief-question" key={p.system}>
                <div className="brief-q-body">
                  <div className="brief-q-line"><span className="brief-q-text">{cap(p.prompt)}</span></div>
                  <div className="brief-q-meta"><span className="tag cyan">{p.system}</span></div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editable && (
        <button className="brief-add-question" onClick={addQuestion}><Icon name="sparkles" size={11} /> Add question</button>
      )}
    </div>
  );
}
