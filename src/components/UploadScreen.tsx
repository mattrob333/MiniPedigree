import { useRef, useState } from "react";
import { Icon } from "./Icon";

interface UploadScreenProps {
  onUploadText: (text: string, fileName: string) => void;
  onUseDemo: () => void;
  error?: string | null;
}

const SAMPLES = [
  { file: "01_lumen_bay_startup_8_people.csv", label: "Lumen Bay", sub: "Startup · 8" },
  { file: "02_northstar_saas_20_people.csv", label: "Northstar SaaS", sub: "B2B SaaS · 20" },
  { file: "03_summit_clinic_network_34_people.csv", label: "Summit Clinic", sub: "Healthcare · 34" },
  { file: "04_atlas_channel_group_52_people.csv", label: "Atlas Channel", sub: "Channel · 52" },
];

export function UploadScreen({ onUploadText, onUseDemo, error }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onUploadText(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
  };

  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    readFile(files[0]);
  };

  const loadSample = async (file: string) => {
    setLoading(file);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
      const text = await res.text();
      onUploadText(text, file);
    } catch {
      onUploadText("", file);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="upload-screen">
      <div className="upload-bg" />
      <div className="upload-card">
        <div className="eyebrow">
          <Icon name="sparkles" size={12} stroke="var(--cyan)" /> CSV-to-Agent Prompt MVP
        </div>
        <h1>Map your org. Map their work. Generate the agents.</h1>
        <p className="lead">
          Upload a People CSV. Pedigree turns it into a spreadsheet, a visual org map, and a per-person
          responsibility canvas — then composes Pedigree-Standard agents anchored to a human owner.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />

        <div
          className="dropzone"
          style={dragOver ? { borderColor: "var(--cyan)", background: "var(--cyan-faint)" } : undefined}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={20} stroke="var(--cyan-dim)" />
          <div className="di" style={{ marginTop: 8 }}>Drop a CSV here, or browse files</div>
          <div className="dh">
            Required columns:{" "}
            <span className="mono" style={{ color: "var(--text-3)" }}>name, email, title, manager_email, department, known_tools</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #5a2024",
              background: "rgba(248,113,113,0.06)",
              color: "var(--red)",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            <Icon name="warning" size={12} stroke="var(--red)" style={{ verticalAlign: -2, marginRight: 6 }} />
            {error}
          </div>
        )}

        <div className="upload-actions">
          <button className="btn" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={12} /> Choose file…
          </button>
          <button className="btn btn-primary" onClick={onUseDemo}>
            <Icon name="play" size={12} /> Use Demo CSV
          </button>
          <span style={{ flex: 1 }} />
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed var(--border-1)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Or try a mock organization
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {SAMPLES.map((s) => (
              <button
                key={s.file}
                className="btn btn-ghost"
                style={{ justifyContent: "flex-start", padding: "8px 12px", borderColor: "var(--border-1)" }}
                disabled={loading === s.file}
                onClick={() => loadSample(s.file)}
              >
                <Icon name="csv" size={13} stroke="var(--cyan-dim)" />
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
                  <span style={{ color: "var(--text-1)", fontWeight: 500 }}>
                    {loading === s.file ? "Loading…" : s.label}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>{s.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="upload-foot">
          <div className="step"><div className="n">01 · UPLOAD</div><div className="t">People CSV → spreadsheet & org map</div></div>
          <div className="step"><div className="n">02 · DISCOVER</div><div className="t">Map responsibilities & delegatable tasks</div></div>
          <div className="step"><div className="n">03 · GENERATE</div><div className="t">Agent manifest + standard system prompt</div></div>
        </div>
      </div>
    </div>
  );
}
