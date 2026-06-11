import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type {
  BriefQuestion,
  CompanyContext,
  MappingSessionType,
  ParsedMap,
  PedigreeState,
  Person,
  PlannedSessionStatus,
  QuestionBacklogItem,
  SessionBrief,
  SessionNote,
  SessionNoteTag,
  SessionScope,
} from "@/types";
import {
  SESSION_LABEL,
  defaultScopeFor,
  directReports,
  getScopePersonIds,
  isMapped,
  recommendSessionType,
} from "@/lib/sessions";
import { parseDiscovery, requestSessionBrief, transcribeAudio } from "@/lib/api";
import { collectStaleItems, staleConfirmationQuestions } from "@/lib/freshness";
import { computeReadiness, readinessGaps, READINESS_DIMENSION_LABEL } from "@/lib/readiness";
import { SessionBriefView } from "./SessionBriefView";
import {
  applyQuestionOutcomes,
  emptyCaptureState,
  participantCoverage,
  serializeGuidedSession,
  type GuidedCaptureState,
} from "@/lib/guidedCapture";
import { countFindings, filterParsedMap, responsibilityKey, taskKey, type FindingKey } from "@/lib/parseReview";
import { demoTranscript } from "@/lib/demoKit";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { deriveProvenance } from "@/lib/provenance";
import { initials } from "@/lib/util";
import { getDepartmentColor } from "@/lib/departments";

// ── UX reset Sprint 2: the full-screen Session Workspace ───────────────
// Discovery happens during a live client call — it needs room, readability,
// and confidence, not a cramped modal. Three modes:
//   Prepare — is this session ready to run? (objective, gaps, script)
//   Run     — what do I ask now, and what did we capture?
//   Review  — which extracted findings are trustworthy enough to apply?

export interface ApplyMappingArgs {
  scopeIds: string[];
  sessionType: MappingSessionType;
  sessionLabel: string;
  parsed: ParsedMap;
  plannedSessionId?: string;
  brief?: SessionBrief;
  parkedNotes?: SessionNote[];
}

type Mode = "prepare" | "run" | "review";

const TAGS: { id: SessionNoteTag; label: string }[] = [
  { id: "responsibility", label: "responsibility" },
  { id: "task", label: "task" },
  { id: "approval", label: "approval" },
  { id: "system", label: "system" },
  { id: "open_question", label: "open question" },
];

interface Props {
  person: Person;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  plannedSessionId?: string;
  questionBacklog?: QuestionBacklogItem[];
  onClose: () => void;
  onApply: (args: ApplyMappingArgs) => void;
  onPlanEvent?: (sessionId: string, status: PlannedSessionStatus, briefId?: string) => void;
}

let noteSeq = 0;

export function SessionWorkspace({ person, people, pedigree, companyContext, plannedSessionId, questionBacklog = [], onClose, onApply, onPlanEvent }: Props) {
  const sessionType: MappingSessionType = useMemo(
    () => recommendSessionType(person, people, pedigree),
    [person, people, pedigree],
  );
  const [mode, setMode] = useState<Mode>("prepare");
  const [scope, setScope] = useState<SessionScope>(() => defaultScopeFor(sessionType));
  const [brief, setBrief] = useState<SessionBrief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [capture, setCapture] = useState<GuidedCaptureState>(emptyCaptureState());
  const [currentQ, setCurrentQ] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMap | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local">("local");
  const [rejected, setRejected] = useState<Set<FindingKey>>(new Set());
  const [parkText, setParkText] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const scopeIds = useMemo(
    () => getScopePersonIds(scope, person, people, pedigree),
    [scope, person, people, pedigree],
  );
  const scopedPeople = useMemo(() => people.filter((p) => scopeIds.includes(p.id)), [people, scopeIds]);
  const reports = directReports(person.id, people);
  const dept = getDepartmentColor(person.department);
  const sessionId = plannedSessionId ?? `PS-${sessionType}-${person.id}`;
  const readiness = useMemo(
    () => computeReadiness(companyContext, companyContext?.contextDocuments ?? [], people),
    [companyContext, people],
  );
  const gaps = useMemo(() => readinessGaps(readiness, 4), [readiness]);
  const openQuestions = useMemo(
    () => questionBacklog.filter((b) => !b.resolved_by_session_id && scopeIds.includes(b.person_id)),
    [questionBacklog, scopeIds],
  );

  // Brief generation (AI with deterministic template fallback) on mount.
  const generateBrief = async () => {
    setBriefBusy(true);
    setErr(null);
    try {
      const claimedElsewhere = people
        .filter((p) => !scopeIds.includes(p.id))
        .flatMap((p) => (pedigree[p.id]?.responsibilities ?? []).map((r) => ({ person_id: p.id, person_name: p.name, title: r.title })))
        .filter((claim) => scopedPeople.some((sp) => sp.department === people.find((p) => p.id === claim.person_id)?.department))
        .slice(0, 4);
      const staleQuestions = staleConfirmationQuestions(collectStaleItems(scopedPeople, pedigree, []), scopeIds);
      const { brief: generated } = await requestSessionBrief({
        session: { id: sessionId, type: sessionType, anchor_person_id: person.id, scope_ids: scopeIds },
        participants: scopedPeople,
        companyContext,
        pedigree,
        backlog: [...questionBacklog, ...staleQuestions],
        claimedElsewhere,
      });
      setBrief(generated);
      setCurrentQ(0);
      onPlanEvent?.(sessionId, "briefed", generated.id);
    } finally {
      setBriefBusy(false);
    }
  };

  useEffect(() => {
    void generateBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeIds.join(",")]);

  // ── Run-mode note capture ──
  const noteFor = (questionId: string): SessionNote | undefined =>
    capture.notes.find((n) => n.question_id === questionId);

  const upsertNote = (question: BriefQuestion, patch: Partial<SessionNote>) => {
    const existing = noteFor(question.id);
    if (existing) {
      setCapture((c) => ({ ...c, notes: c.notes.map((n) => (n.question_id === question.id ? { ...n, ...patch } : n)) }));
    } else {
      noteSeq += 1;
      setCapture((c) => ({
        ...c,
        notes: [...c.notes, {
          id: `N-${Date.now().toString(36)}-${noteSeq}`,
          question_id: question.id,
          target_person_id: question.target_person_id === "group" ? undefined : question.target_person_id,
          tags: [],
          text: "",
          captured_at: new Date().toISOString(),
          ...patch,
        }],
      }));
    }
  };

  const advance = () => setCurrentQ((i) => Math.min(i + 1, (brief?.questions.length ?? 1) - 1));

  const markAnswered = (question: BriefQuestion) => {
    setCapture((c) => ({ ...c, asked: [...new Set([...c.asked, question.id])], skipped: c.skipped.filter((id) => id !== question.id) }));
    advance();
  };
  const skip = (question: BriefQuestion) => {
    setCapture((c) => ({ ...c, skipped: [...new Set([...c.skipped, question.id])], asked: c.asked.filter((id) => id !== question.id) }));
    advance();
  };
  const parkIt = () => {
    if (!parkText.trim()) return;
    noteSeq += 1;
    setCapture((c) => ({
      ...c,
      parked: [...c.parked, { id: `N-P-${Date.now().toString(36)}-${noteSeq}`, question_id: "parked", tags: ["open_question"], text: parkText.trim(), captured_at: new Date().toISOString() }],
    }));
    setParkText("");
  };

  // ── Recording / transcription ──
  const startRecording = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy("Transcribing…");
        try {
          const { transcript: text } = await transcribeAudio(new File([new Blob(chunksRef.current, { type: "audio/webm" })], "rec.webm", { type: "audio/webm" }));
          setTranscript((t) => (t ? t + "\n\n" : "") + text);
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(null);
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setErr("Microphone access denied. Paste the transcript instead.");
    }
  };
  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); };

  // ── Parse + review ──
  const guidedNotesCount = capture.notes.filter((n) => n.text.trim()).length + capture.parked.length;
  const parseInput = brief && guidedNotesCount > 0
    ? serializeGuidedSession(brief, [...capture.notes, ...capture.parked], scopedPeople, transcript || undefined)
    : transcript;

  const runParse = async () => {
    setBusy("Parsing session…");
    setErr(null);
    try {
      onPlanEvent?.(sessionId, "captured", brief?.id);
      const r = await parseDiscovery(scopedPeople, parseInput, scopeIds, companyContext);
      setParsed(r.parsed);
      setParseSource(r.source);
      setRejected(new Set());
      onPlanEvent?.(sessionId, "parsed", brief?.id);
      setMode("review");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleRejected = (key: FindingKey) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    if (!parsed) return;
    const accepted = filterParsedMap(parsed, rejected);
    const finalBrief = brief && guidedNotesCount > 0 ? applyQuestionOutcomes(brief, capture) : brief ?? undefined;
    onApply({
      scopeIds,
      sessionType,
      sessionLabel: SESSION_LABEL[sessionType] + " · " + person.name,
      parsed: accepted,
      plannedSessionId: sessionId,
      ...(finalBrief ? { brief: finalBrief } : {}),
      ...(capture.parked.length ? { parkedNotes: capture.parked } : {}),
    });
  };

  const canParse = guidedNotesCount > 0 || Boolean(transcript.trim());
  const coverage = brief ? participantCoverage(brief, capture.notes, scopedPeople) : [];
  const question = brief?.questions[currentQ];
  const surviving = parsed ? countFindings(filterParsedMap(parsed, rejected), scopeIds) : { responsibilities: 0, tasks: 0 };

  const MODES: [Mode, string, string][] = [
    ["prepare", "Prepare", "Is this session ready to run?"],
    ["run", "Run", "Ask, listen, capture, confirm."],
    ["review", "Review", "Which findings are trustworthy enough to apply?"],
  ];

  return (
    <div className="session-screen">
      <div className="session-head" style={{ borderTop: `3px solid ${dept.accent}` }}>
        <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="chevron-left" size={12} /> Exit session</button>
        <div className="session-title">
          <h2><Icon name="sparkles" size={15} stroke="var(--cyan)" /> {SESSION_LABEL[sessionType]} — {person.name}</h2>
          <span className="session-sub">{person.title} · {person.department} · {scopedPeople.length} participant{scopedPeople.length === 1 ? "" : "s"}</span>
        </div>
        <div className="session-modes" role="tablist">
          {MODES.map(([id, label, hint]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={"session-mode" + (mode === id ? " active" : "")}
              title={hint}
              disabled={id === "review" && !parsed}
              onClick={() => setMode(id)}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── PREPARE ───────────────────────────────────────────────────── */}
      {mode === "prepare" && (
        <div className="session-body prepare">
          <aside className="session-prepare-rail">
            <section className="profile-section">
              <div className="ps-head"><Icon name="target" size={13} stroke="var(--cyan)" /> Objective</div>
              <p className="session-objective">{brief?.objectives ?? "Generating the session brief…"}</p>

              <div className="ps-head" style={{ marginTop: 14 }}><Icon name="users" size={13} stroke="var(--cyan)" /> Participants</div>
              {reports.length > 0 && (
                <select className="select" style={{ marginBottom: 8 }} value={scope} onChange={(e) => setScope(e.target.value as SessionScope)} aria-label="Session scope">
                  <option value="self">Only {person.name}</option>
                  <option value="self_and_reports">{person.name} + {reports.length} direct reports</option>
                  <option value="unmapped_reports">{person.name} + unmapped reports only</option>
                </select>
              )}
              {scopedPeople.map((p) => {
                const openQs = openQuestions.filter((b) => b.person_id === p.id).length;
                return (
                  <div className="scope-person" key={p.id}>
                    <span className="avatar">{initials(p.name)}</span>
                    <div><div style={{ color: "var(--text-1)" }}>{p.name}</div><div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>{p.title}</div></div>
                    {!isMapped(pedigree[p.id]?.status) && <span className="tag yellow">unmapped</span>}
                    {openQs > 0 && <span className="tag">{openQs} open Q</span>}
                  </div>
                );
              })}

              <div className="ps-head" style={{ marginTop: 14 }}><Icon name="info" size={13} stroke="var(--cyan)" /> Gaps this session closes</div>
              {gaps.length === 0 && openQuestions.length === 0 && (
                <div className="drawer-empty">Context is in good shape — this session deepens task evidence.</div>
              )}
              {gaps.map((g) => (
                <div className="list-item-line" key={g.id}><Icon name="warning" size={11} stroke="var(--yellow)" className="icon" /><span style={{ flex: 1 }}>{READINESS_DIMENSION_LABEL[g.id]}: {g.gap}</span></div>
              ))}
              {openQuestions.length > 0 && (
                <div className="list-item-line"><Icon name="history" size={11} className="icon" /><span style={{ flex: 1 }}>{openQuestions.length} carried-over question{openQuestions.length === 1 ? "" : "s"} appear at the end of the script</span></div>
              )}

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-primary" disabled={!brief || briefBusy} onClick={() => setMode("run")}>
                  <Icon name="play" size={13} /> Start live session
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setPasteOpen(true); setMode("run"); }}>
                  Paste a transcript instead
                </button>
              </div>
            </section>
          </aside>

          <main className="session-prepare-main">
            {brief ? (
              <SessionBriefView brief={brief} participants={scopedPeople} onChange={setBrief} onRegenerate={generateBrief} busy={briefBusy} />
            ) : (
              <div className="drawer-empty" style={{ marginTop: 40 }}>Preparing the question script from the company context, KPIs, and open questions…</div>
            )}
          </main>
        </div>
      )}

      {/* ── RUN ───────────────────────────────────────────────────────── */}
      {mode === "run" && brief && (
        <div className="session-body run">
          {/* Left: question queue */}
          <aside className="session-queue">
            <div className="sh">Question queue <span className="count">{capture.notes.filter((n) => n.text.trim()).length}/{brief.questions.length}</span></div>
            {brief.questions.map((q, i) => {
              const answered = Boolean(noteFor(q.id)?.text.trim()) || capture.asked.includes(q.id);
              const skipped = capture.skipped.includes(q.id);
              return (
                <button key={q.id} className={"queue-item" + (i === currentQ ? " active" : "") + (answered ? " answered" : "") + (skipped ? " skipped" : "")} onClick={() => setCurrentQ(i)}>
                  <span className="queue-n">{answered ? <Icon name="checkmark" size={10} /> : i + 1}</span>
                  <span className="queue-text">{q.text}</span>
                </button>
              );
            })}
          </aside>

          {/* Center: current question, large */}
          <main className="session-current">
            {question && (
              <>
                <div className="current-q-meta">
                  <span className="tag cyan">{question.target_person_id === "group" ? "Group" : scopedPeople.find((p) => p.id === question.target_person_id)?.name ?? question.target_person_id}</span>
                  <span className="tag">{question.intent.replace(/_/g, " ")}</span>
                  <span className="current-q-why" title={question.why}><Icon name="info" size={11} /> {question.why}</span>
                </div>
                <h1 className="current-q-text">{question.text}</h1>
                <textarea
                  className="textarea current-q-note"
                  rows={5}
                  placeholder="Capture the answer here — what did they actually say?"
                  value={noteFor(question.id)?.text ?? ""}
                  onChange={(e) => upsertNote(question, { text: e.target.value })}
                />
                <div className="current-q-foot">
                  <div className="capture-tags">
                    {TAGS.map((tag) => {
                      const on = noteFor(question.id)?.tags.includes(tag.id);
                      return (
                        <button key={tag.id} className={"capture-tag" + (on ? " on" : "")} onClick={() => {
                          const tags = on ? (noteFor(question.id)?.tags ?? []).filter((t) => t !== tag.id) : [...(noteFor(question.id)?.tags ?? []), tag.id];
                          upsertNote(question, { tags });
                        }}>{tag.label}</button>
                      );
                    })}
                  </div>
                  {scopedPeople.length > 1 && (
                    <select
                      className="select capture-target-select"
                      value={noteFor(question.id)?.target_person_id ?? "group"}
                      aria-label="Attribute to"
                      onChange={(e) => upsertNote(question, { target_person_id: e.target.value === "group" ? undefined : e.target.value })}
                    >
                      <option value="group">whole group</option>
                      {scopedPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="current-q-controls">
                  <button className="btn btn-primary" onClick={() => markAnswered(question)}><Icon name="checkmark" size={12} /> Mark answered</button>
                  <button className="btn" onClick={() => skip(question)}>Skip</button>
                  <button className="btn btn-ghost" disabled={currentQ === 0} onClick={() => setCurrentQ((i) => Math.max(0, i - 1))}>Previous</button>
                  <span style={{ flex: 1 }} />
                  <span className="dim" style={{ fontSize: 12 }}>{currentQ + 1} of {brief.questions.length}</span>
                </div>
              </>
            )}
            <div className="capture-park" style={{ marginTop: "auto" }}>
              <Icon name="history" size={12} stroke="var(--text-4)" />
              <input className="input" placeholder="Park it — log an out-of-scope or follow-up item without derailing the session" value={parkText} onChange={(e) => setParkText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && parkIt()} />
              <button className="btn btn-sm" onClick={parkIt} disabled={!parkText.trim()}>Park</button>
            </div>
          </main>

          {/* Right: live capture rail */}
          <aside className="session-capture-rail">
            <div className="sh">Coverage</div>
            {coverage.map(({ person: p, answered, total }) => (
              <div className="capture-person" key={p.id} style={{ display: "flex", marginBottom: 6 }}>
                <span className="avatar">{initials(p.name)}</span>
                <span className="capture-meter" style={{ flex: 1 }}><span style={{ width: total ? `${Math.round((answered / total) * 100)}%` : "0%" }} /></span>
                <span className="capture-count mono">{answered}/{total}</span>
              </div>
            ))}

            <div className="sh" style={{ marginTop: 14 }}>Recording</div>
            {recording
              ? <button className="btn btn-sm" onClick={stopRecording}><Icon name="stop" size={11} /> Stop & transcribe</button>
              : <button className="btn btn-sm btn-ghost" onClick={startRecording}><Icon name="mic" size={11} /> Record alongside notes</button>}
            {busy && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{busy}</div>}

            {capture.parked.length > 0 && (
              <>
                <div className="sh" style={{ marginTop: 14 }}>Parked <span className="count">{capture.parked.length}</span></div>
                {capture.parked.map((n) => <div className="list-item-line" key={n.id} style={{ fontSize: 12 }}>{n.text}</div>)}
              </>
            )}

            <button className="btn btn-sm btn-ghost" style={{ marginTop: 14 }} onClick={() => setPasteOpen((v) => !v)}>
              <Icon name={pasteOpen ? "chevron-down" : "chevron-right"} size={11} /> Transcript {transcript ? `(${transcript.trim().split(/\s+/).length} words)` : ""}
            </button>
            {pasteOpen && (
              <>
                <textarea className="textarea" rows={6} style={{ marginTop: 6 }} placeholder="Paste or transcribe here — feeds the parse alongside the structured notes." value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                <button className="btn btn-sm btn-ghost" style={{ marginTop: 4 }} onClick={() => setTranscript(demoTranscript(person, reports, sessionType))}><Icon name="play" size={10} /> Insert demo transcript</button>
              </>
            )}
            {err && <div className="hint" style={{ color: "var(--red)", marginTop: 8 }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}

            <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} disabled={!canParse || !!busy} onClick={runParse}>
              <Icon name="sparkles" size={12} /> {busy === "Parsing session…" ? "Parsing…" : "End session & parse"}
            </button>
          </aside>
        </div>
      )}

      {/* ── REVIEW ────────────────────────────────────────────────────── */}
      {mode === "review" && parsed && (
        <div className="session-body review">
          <main className="session-review-main">
            <div className="session-review-head">
              <div>
                <h3 style={{ margin: 0 }}>Review extracted findings</h3>
                <span className="dim" style={{ fontSize: 13 }}>
                  Parsed by {parseSource === "ai" ? "AI" : "the local engine"}{guidedNotesCount ? ` from ${guidedNotesCount} attributed notes` : ""} · uncheck anything that isn't trustworthy — rejected items never enter the map
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="tag cyan">{surviving.responsibilities} responsibilities</span>
                <span className="tag">{surviving.tasks} tasks</span>
                <button className="btn" onClick={() => setMode("run")}>Back to session</button>
                <button className="btn btn-primary" onClick={apply}><Icon name="checkmark" size={12} /> Apply {surviving.responsibilities} finding{surviving.responsibilities === 1 ? "" : "s"}</button>
              </div>
            </div>

            {scopedPeople.map((p) => {
              const d = parsed[p.id];
              if (!d || d.responsibilities.length === 0) return null;
              const dc = getDepartmentColor(p.department);
              return (
                <section className="review-person" key={p.id}>
                  <div className="review-person-head">
                    <span className="dept-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: dc.accent }} />
                    <strong>{p.name}</strong>
                    <span className="dim">{p.title}</span>
                  </div>
                  {d.responsibilities.map((r) => {
                    const rKey = responsibilityKey(p.id, r.id);
                    const rRejected = rejected.has(rKey);
                    const allTasks: { label: string; cls: string; color: string }[] = [
                      ...r.tasks.delegatable.map((label) => ({ label, cls: "delegatable", color: "cyan" })),
                      ...r.tasks.approval.map((label) => ({ label, cls: "approval required", color: "yellow" })),
                      ...r.tasks.not_delegatable.map((label) => ({ label, cls: "not delegatable", color: "" })),
                    ];
                    return (
                      <div className={"review-finding" + (rRejected ? " rejected" : "")} key={r.id}>
                        <label className="review-finding-row">
                          <input type="checkbox" checked={!rRejected} onChange={() => toggleRejected(rKey)} aria-label={`Accept responsibility: ${r.title}`} />
                          <span className="review-finding-title">{r.title}</span>
                          <ProvenanceBadge provenance={deriveProvenance({ evidence: r.evidence_quote, confidence: r.confidence })} compact />
                          {r.confidence !== undefined && <span className="dim mono" style={{ fontSize: 11 }}>{Math.round(r.confidence * 100)}%</span>}
                        </label>
                        {r.evidence_quote && <blockquote className="digest-evidence" style={{ marginLeft: 26 }}>“{r.evidence_quote}”</blockquote>}
                        {!rRejected && (
                          <div className="review-tasks">
                            {allTasks.map((t) => {
                              const tKey = taskKey(p.id, r.id, t.label);
                              const tRejected = rejected.has(tKey);
                              const detail = r.taskDetails?.find((x) => x.name.trim().toLowerCase() === t.label.trim().toLowerCase());
                              return (
                                <label className={"review-task" + (tRejected ? " rejected" : "")} key={tKey}>
                                  <input type="checkbox" checked={!tRejected} onChange={() => toggleRejected(tKey)} aria-label={`Accept task: ${t.label}`} />
                                  <span className="review-task-label">{t.label}</span>
                                  <span className={"tag " + t.color}>{t.cls}</span>
                                  {detail?.evidence_quote && <span className="dim" style={{ fontSize: 11.5 }} title={detail.evidence_quote}><Icon name="transcript" size={10} /> evidence</span>}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </main>
        </div>
      )}
    </div>
  );
}
