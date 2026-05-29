import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { CompanyContext, MappingSessionType, ParsedMap, PedigreeState, Person, SessionScope } from "@/types";
import {
  SESSION_LABEL,
  buildDemoSessionText,
  defaultScopeFor,
  directReports,
  getScopePersonIds,
  recommendSessionType,
  sessionPrompt,
} from "@/lib/sessions";
import { parseDiscovery } from "@/lib/api";
import { transcribeAudio } from "@/lib/api";
import { initials } from "@/lib/util";
import { getDepartmentColor } from "@/lib/departments";

interface Props {
  open: boolean;
  person: Person | null;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  onClose: () => void;
  onApply: (args: {
    scopeIds: string[];
    sessionType: MappingSessionType;
    sessionLabel: string;
    parsed: ParsedMap;
  }) => void;
}

type Step = 1 | 2 | 3 | 4;
type InputTab = "paste" | "record" | "upload";

export function MappingSessionWizard({ open, person, people, pedigree, companyContext, onClose, onApply }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [scope, setScope] = useState<SessionScope>("self_and_reports");
  const [text, setText] = useState("");
  const [tab, setTab] = useState<InputTab>("paste");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMap | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local">("local");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const sessionType: MappingSessionType = useMemo(
    () => (person ? recommendSessionType(person, people, pedigree) : "individual_role_session"),
    [person, people, pedigree],
  );

  useEffect(() => {
    if (open && person) {
      setStep(1);
      setScope(defaultScopeFor(sessionType));
      setText("");
      setParsed(null);
      setErr(null);
      setTab("paste");
    }
  }, [open, person, sessionType]);

  // All hooks must run before the early return (Rules of Hooks).
  const scopeIds = useMemo(
    () => (person ? getScopePersonIds(scope, person, people, pedigree) : []),
    [scope, person, people, pedigree],
  );

  const agg = useMemo(() => {
    if (!parsed) return null;
    let resp = 0, deleg = 0, appr = 0, notd = 0;
    for (const id of scopeIds) {
      const d = parsed[id];
      if (!d) continue;
      for (const r of d.responsibilities) {
        resp++;
        deleg += r.tasks.delegatable.length;
        appr += r.tasks.approval.length;
        notd += r.tasks.not_delegatable.length;
      }
    }
    return { resp, deleg, appr, notd };
  }, [parsed, scopeIds]);

  if (!open || !person) return null;

  const reports = directReports(person.id, people);
  const scopedPeople = people.filter((p) => scopeIds.includes(p.id));
  const deptColor = getDepartmentColor(person.department);

  const insertDemo = () => setText(buildDemoSessionText(person, reports, sessionType));

  const startRecording = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await runTranscription(new File([new Blob(chunksRef.current, { type: "audio/webm" })], "rec.webm", { type: "audio/webm" }));
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setErr("Microphone access denied. Paste the transcript instead.");
    }
  };
  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); };
  const runTranscription = async (file: File) => {
    setBusy("Transcribing…");
    setErr(null);
    try {
      const { transcript } = await transcribeAudio(file);
      setText((t) => (t ? t + "\n\n" : "") + transcript);
      setTab("paste");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runParse = async () => {
    setBusy("Parsing session…");
    setErr(null);
    try {
      const r = await parseDiscovery(scopedPeople, text, scopeIds, companyContext);
      setParsed(r.parsed);
      setParseSource(r.source);
      setStep(4);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const STEPS: [Step, string][] = [
    [1, "Scope"],
    [2, "Participants"],
    [3, "Input"],
    [4, "Review"],
  ];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ borderTop: `3px solid ${deptColor.accent}` }}>
          <div className="h">
            <h3><Icon name="sparkles" size={16} stroke="var(--cyan)" /> Responsibility Discovery — {person.name}</h3>
            <div className="sub">{SESSION_LABEL[sessionType]} · responsibility and task discovery for {person.title} · {person.department}</div>
          </div>
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="wizard-steps">
            {STEPS.map(([s, label], i) => (
              <Fragment key={s}>
                <div className="ws" data-active={step === s} data-done={step > s}>
                  <span className="n">{step > s ? "✓" : s}</span> {label}
                </div>
                {i < STEPS.length - 1 && <span className="sep" />}
              </Fragment>
            ))}
          </div>

          {step === 1 && (
            <div>
              <div className="form-readout" style={{ marginBottom: 12 }}>
                <div>
                  <div className="k">Recommended Session Type</div>
                  <div style={{ marginTop: 4 }}>{SESSION_LABEL[sessionType]}</div>
                </div>
                <Icon name="branch" size={14} stroke="var(--text-4)" />
              </div>
              <div className="form-field">
                <div className="lbl">Discovery Scope</div>
                <select className="select" value={scope} onChange={(e) => setScope(e.target.value as SessionScope)}>
                  <option value="self">Selected person only ({person.name})</option>
                  {reports.length > 0 && <option value="self_and_reports">Selected person + {reports.length} direct reports</option>}
                  {reports.length > 0 && <option value="unmapped_reports">Selected person + unmapped reports only</option>}
                </select>
                <div className="hint" style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>
                  {scope === "self"
                    ? "Individual Role: maps just this person's responsibilities and tasks."
                    : scope === "unmapped_reports"
                      ? "Cascades only to direct reports not yet discovered — good for resuming."
                      : sessionType === "leadership_session"
                        ? "Leadership Session: maps the top leader plus company-level ownership across their direct reports."
                        : "Department Session: maps the department head and cascades to their direct reports."}
                </div>
              </div>
              <div className="hint" style={{ fontSize: 11.5, color: "var(--text-4)" }}>
                <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                This session focuses only on the selected person and chosen reports. Mentions of anyone
                outside this scope are flagged as out-of-scope instead of being applied silently.
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="form-field" style={{ marginBottom: 10 }}>
                <div className="lbl">Session Owner</div>
                <div className="scope-person">
                  <span className="avatar">{initials(person.name)}</span>
                  <div><div style={{ color: "var(--text-1)" }}>{person.name}</div><div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{person.title}</div></div>
                  <span className="tag cyan owner-tag">owner</span>
                </div>
              </div>
              <div className="form-field">
                <div className="lbl">People being mapped ({scopedPeople.length})</div>
                <div className="scope-list">
                  {scopedPeople.map((p) => (
                    <div key={p.id} className="scope-person">
                      <span className="avatar">{initials(p.name)}</span>
                      <div><div style={{ color: "var(--text-1)" }}>{p.name}</div><div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{p.title} · {p.department}</div></div>
                      {p.id === person.id && <span className="tag owner-tag">owner</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {([["paste", "Paste Text"], ["record", "Record Audio"], ["upload", "Upload Audio"]] as [InputTab, string][]).map(([k, label]) => (
                  <button key={k} className="btn btn-sm" style={tab === k ? { borderColor: "var(--border-cyan)", color: "var(--cyan)" } : undefined} onClick={() => setTab(k)}>{label}</button>
                ))}
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost" onClick={insertDemo}><Icon name="play" size={11} /> Insert Demo Session</button>
              </div>

              {tab === "record" && (
                <div className="form-readout" style={{ marginBottom: 10 }}>
                  <div><div className="k">Browser Recording</div><div style={{ marginTop: 4, fontSize: 12, color: "var(--text-3)" }}>{recording ? "Recording… then transcribed server-side." : "Record via MediaRecorder."}</div></div>
                  {recording ? <button className="btn btn-sm" onClick={stopRecording}><Icon name="stop" size={11} /> Stop</button> : <button className="btn btn-sm btn-outline-cyan" onClick={startRecording}><Icon name="mic" size={11} /> Record</button>}
                </div>
              )}
              {tab === "upload" && (
                <div className="form-field"><div className="lbl">Audio file</div><input type="file" className="input" accept="audio/*,.mp3,.m4a,.wav,.webm" onChange={(e) => { const f = e.target.files?.[0]; if (f) runTranscription(f); }} /></div>
              )}

              <div className="form-field">
                <div className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{SESSION_LABEL[sessionType]} prompt{busy && <span style={{ color: "var(--cyan)" }}> · {busy}</span>}</span>
                  <span style={{ color: "var(--text-4)", fontSize: 10 }}>{wordCount} words</span>
                </div>
                <pre className="codeblock" style={{ fontSize: 11.5, maxHeight: 120, overflow: "auto", marginBottom: 8 }}>{sessionPrompt(sessionType)}</pre>
                <textarea className="textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or transcribe the session here, or click Insert Demo Session…" style={{ minHeight: 150 }} />
                {err && <div className="hint" style={{ color: "var(--red)" }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}
              </div>
            </div>
          )}

          {step === 4 && parsed && agg && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--border-1)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                {([["Responsibilities", agg.resp, ""], ["Delegatable", agg.deleg, "cyan"], ["Approval", agg.appr, "yellow"], ["Not delegatable", agg.notd, ""]] as [string, number, string][]).map(([l, v, c], i) => (
                  <div key={i} style={{ background: "var(--bg-2)", padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: c === "cyan" ? "var(--cyan)" : c === "yellow" ? "var(--yellow)" : "var(--text-1)" }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 10 }}>
                {SESSION_LABEL[sessionType]} · {scopedPeople.length} people covered · parsed by {parseSource === "ai" ? "GPT" : "local engine"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {scopedPeople.map((p) => {
                  const d = parsed[p.id];
                  if (!d || d.responsibilities.length === 0) return null;
                  const dc = getDepartmentColor(p.department);
                  return (
                    <details key={p.id} className="manifest-card" open={p.id === person.id} style={{ marginBottom: 0 }}>
                      <summary className="manifest-card-head" style={{ cursor: "pointer", listStyle: "none" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", color: "var(--text-1)", fontWeight: 600, fontSize: 12.5 }}>
                          <span className="dept-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: dc.accent }} />
                          {p.name}
                          <span className="dim" style={{ fontWeight: 400, fontSize: 11, textTransform: "none", letterSpacing: 0 }}>{p.title}</span>
                        </span>
                        <span className="right" style={{ display: "flex", gap: 5 }}>
                          <span className="tag">{d.responsibilities.length} resp</span>
                          <span className="tag cyan">{d.responsibilities.reduce((s, r) => s + r.tasks.delegatable.length, 0)} deleg</span>
                        </span>
                      </summary>
                      <div className="manifest-card-body">
                        {d.responsibilities.map((r) => (
                          <div key={r.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px dashed var(--border-1)" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 5, display: "flex", gap: 8, alignItems: "center" }}>
                              <span className="tag cyan">{r.id}</span>{r.title}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {r.tasks.delegatable.map((t, i) => <span key={"d" + i} className="tag cyan">{t}</span>)}
                              {r.tasks.approval.map((t, i) => <span key={"a" + i} className="tag yellow">{t}</span>)}
                              {r.tasks.not_delegatable.map((t, i) => <span key={"n" + i} className="tag">{t}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Scoped session · out-of-scope mentions are not applied.</span>
          <div className="right">
            {step > 1 && step < 4 && <button className="btn" onClick={() => setStep((s) => (s - 1) as Step)}>Back</button>}
            {step === 1 && <button className="btn btn-primary" onClick={() => setStep(2)}>Next: Participants</button>}
            {step === 2 && <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Input</button>}
            {step === 3 && <button className="btn btn-primary" disabled={!text.trim() || !!busy} onClick={runParse}><Icon name="sparkles" size={12} /> Parse Session</button>}
            {step === 4 && <>
              <button className="btn" onClick={() => setStep(3)}>Edit Input</button>
              <button className="btn btn-primary" onClick={() => onApply({ scopeIds, sessionType, sessionLabel: SESSION_LABEL[sessionType] + " · " + person.name, parsed: parsed! })}>
                <Icon name="checkmark" size={12} /> Apply Mapping
              </button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
