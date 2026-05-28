import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { Person } from "@/types";
import { transcribeAudio } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onParse: (text: string, scopeIds: string[] | undefined) => void;
  people: Person[];
  initialText: string;
}

type Tab = "paste" | "record" | "upload";

export function ResponsibilityInputModal({ open, onClose, onParse, people, initialText }: Props) {
  const [text, setText] = useState(initialText);
  const [scope, setScope] = useState<string>("all");
  const [source, setSource] = useState("transcript");
  const [tab, setTab] = useState<Tab>("paste");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setTab("paste");
      setErr(null);
    }
  }, [open, initialText]);

  if (!open) return null;

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const startRecording = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await runTranscription(new File([blob], "recording.webm", { type: "audio/webm" }));
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setErr("Microphone access was denied. Paste the transcript instead.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

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

  const scopeIds = scope === "all" ? undefined : [scope];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h">
            <h3><Icon name="transcript" size={16} stroke="var(--cyan)" /> Responsibility Input</h3>
            <div className="sub">Paste an interview transcript, weekly notes, or a written brief — or record/upload audio. Pedigree extracts responsibilities and delegatable tasks per person.</div>
          </div>
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Source</div>
              <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="transcript">Interview transcript</option>
                <option value="notes">Weekly notes</option>
                <option value="written">Written brief</option>
                <option value="slack">Slack thread export</option>
              </select>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Scope</div>
              <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All uploaded people ({people.length})</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* input method tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {([["paste", "Paste Text"], ["record", "Record Audio"], ["upload", "Upload Audio"]] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                className="btn btn-sm"
                data-active={tab === k}
                style={tab === k ? { borderColor: "var(--border-cyan)", color: "var(--cyan)" } : undefined}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "record" && (
            <div className="form-readout" style={{ marginBottom: 12 }}>
              <div>
                <div className="k">Browser Recording</div>
                <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>
                  {recording ? "Recording… speak the responsibilities, then stop." : "Records via MediaRecorder, then transcribes on the server."}
                </div>
              </div>
              {recording ? (
                <button className="btn btn-sm" onClick={stopRecording}><Icon name="stop" size={11} /> Stop</button>
              ) : (
                <button className="btn btn-sm btn-outline-cyan" onClick={startRecording}><Icon name="mic" size={11} /> Record</button>
              )}
            </div>
          )}

          {tab === "upload" && (
            <div className="form-field">
              <div className="lbl">Audio file (mp3, m4a, wav, webm…)</div>
              <input
                type="file"
                className="input"
                accept="audio/*,.mp3,.m4a,.wav,.webm,.mp4,.mpeg,.mpga"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) runTranscription(f); }}
              />
            </div>
          )}

          <div className="form-field">
            <div className="lbl" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Discovery input{busy && <span style={{ color: "var(--cyan)" }}> · {busy}</span>}</span>
              <span style={{ color: "var(--text-4)", fontSize: 10 }}>{wordCount} words · {text.length} chars</span>
            </div>
            <textarea
              className="textarea"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste interview notes here, or transcribe audio above…"
              style={{ minHeight: 220, maxHeight: 320 }}
            />
            {err && <div className="hint" style={{ color: "var(--red)" }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}
            <div className="hint">
              <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Pedigree maps named people to your uploaded CSV. If no transcript is provided, responsibilities are inferred from each role.
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Input is processed via your configured provider.</span>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onParse(text, scopeIds)}>
              <Icon name="sparkles" size={12} /> Parse Responsibilities
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
