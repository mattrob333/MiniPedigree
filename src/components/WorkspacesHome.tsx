import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { BrandLogo } from "./BrandLogo";
import type { WorkspaceSummary } from "@/types";

export interface DemoCompany {
  file: string;
  label: string;
  sub: string;
}

const DEMOS: DemoCompany[] = [
  { file: "01_lumen_bay_startup_8_people.csv", label: "Lumen Bay", sub: "Startup · 8 people" },
  { file: "02_northstar_saas_20_people.csv", label: "Northstar SaaS", sub: "B2B SaaS · 20 people" },
  { file: "03_summit_clinic_network_34_people.csv", label: "Summit Clinic", sub: "Healthcare · 34 people" },
  { file: "04_atlas_channel_group_52_people.csv", label: "Atlas Channel Group", sub: "Channel · 52 people" },
];

const HRIS_INTEGRATIONS = [
  {
    name: "Workday",
    label: "Workday HRIS",
    description: "Import people, managers, departments, titles, and known systems directly from Workday.",
  },
  {
    name: "Oracle",
    label: "Oracle HRIS",
    description: "Sync workforce structure from Oracle HCM once the connector is available.",
  },
];

interface Props {
  userName: string;
  workspaces: WorkspaceSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadText: (text: string, fileName: string) => void;
  onOpenDemo: (demo: DemoCompany) => void;
  error?: string | null;
}

export function WorkspacesHome({ userName, workspaces, onOpen, onDelete, onUploadText, onOpenDemo, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

  const readFile = (file: File) => {
    const r = new FileReader();
    r.onload = () => onUploadText(String(r.result ?? ""), file.name);
    r.readAsText(file);
  };

  return (
    <div className="home-screen">
      <div className="home-inner">
        <div className="home-head">
          <div>
            <div className="eyebrow"><Icon name="network" size={12} stroke="var(--cyan)" /> Pedigree Discover Lite</div>
            <h1>Welcome{userName ? `, ${userName.split(/\s+/)[0]}` : ""}.</h1>
            <p className="lead">Pick a company to work in, open a demo org, or upload a new client CSV. Each company keeps its own people, mappings, agents, and profile.</p>
          </div>
        </div>

        {/* Upload */}
        <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
        <div
          className="home-dropzone"
          data-tour="upload-team"
          style={dragOver ? { borderColor: "var(--cyan)", background: "var(--cyan-faint)" } : undefined}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
        >
          <Icon name="upload" size={18} stroke="var(--cyan-dim)" />
          <div><div className="di">Upload a new company CSV</div><div className="dh mono">name, email, title, manager_email, department, known_tools</div></div>
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}><Icon name="upload" size={12} /> Choose file…</button>
        </div>
        {error && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #5a2024", background: "rgba(248,113,113,0.06)", color: "var(--red)", fontSize: 12, whiteSpace: "pre-wrap" }}>
            <Icon name="warning" size={12} stroke="var(--red)" style={{ verticalAlign: -2, marginRight: 6 }} />{error}
          </div>
        )}

        {/* HRIS integrations */}
        <div className="home-section-head" style={{ marginTop: 22 }}>
          <Icon name="build" size={12} /> HRIS integrations <span className="dim" style={{ fontSize: 11 }}>connectors coming soon</span>
        </div>
        <div className="integration-grid">
          {HRIS_INTEGRATIONS.map((integration) => (
            <div key={integration.name} className="integration-card coming-soon" aria-disabled="true">
              <BrandLogo name={integration.name} size={34} />
              <div className="integration-copy">
                <div className="integration-name">{integration.label}</div>
                <div className="integration-desc">{integration.description}</div>
              </div>
              <span className="coming-soon-badge">Coming soon</span>
            </div>
          ))}
        </div>

        {/* Your companies */}
        <div className="home-section-head"><Icon name="users" size={13} /> Your companies <span className="tag">{workspaces.length}</span></div>
        {workspaces.length === 0 ? (
          <div className="home-empty">No companies yet — upload a CSV above or open a demo company below.</div>
        ) : (
          <div className="home-grid">
            {workspaces.map((w) => {
              const pct = w.peopleCount ? Math.round((w.mappedCount / w.peopleCount) * 100) : 0;
              return (
                <div key={w.id} className="home-card" onClick={() => onOpen(w.id)}>
                  <div className="hc-head">
                    <div className="hc-name">{w.name}</div>
                    <button className="hc-del" title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${w.name}"? This can't be undone.`)) onDelete(w.id); }}><Icon name="close" size={12} /></button>
                  </div>
                  <div className="hc-stats">
                    <span><b>{w.peopleCount}</b> people</span>
                    <span><b className="cy">{w.mappedCount}</b> mapped</span>
                    <span><b className="gr">{w.agentsCount}</b> agents</span>
                  </div>
                  <div className="hc-bar"><span style={{ width: `${pct}%` }} /></div>
                  <div className="hc-foot">
                    <span className="mono">{new Date(w.updatedAt).toLocaleDateString()}</span>
                    <span className="open">Open <Icon name="arrow-right" size={11} /></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Demo companies */}
        <div className="home-section-head" style={{ marginTop: 26 }}><Icon name="play" size={12} /> Demo companies <span className="dim" style={{ fontSize: 11 }}>open a sample org to explore</span></div>
        <div className="home-grid">
          {DEMOS.map((d) => (
            <div key={d.file} className="home-card demo" onClick={async () => { setLoadingDemo(d.file); await onOpenDemo(d); setLoadingDemo(null); }}>
              <div className="hc-head"><div className="hc-name"><Icon name="csv" size={13} stroke="var(--cyan-dim)" style={{ verticalAlign: -2, marginRight: 6 }} />{d.label}</div></div>
              <div className="hc-sub">{d.sub}</div>
              <div className="hc-foot"><span className="mono">demo</span><span className="open">{loadingDemo === d.file ? "Loading…" : <>Open <Icon name="arrow-right" size={11} /></>}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
