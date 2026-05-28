import { useEffect, useMemo, useState } from "react";
import { Topbar } from "./components/Topbar";
import { UploadScreen } from "./components/UploadScreen";
import { Spreadsheet } from "./components/Spreadsheet";
import { OrgMap } from "./components/OrgMap";
import { Drawer, type CreateAgentCtx } from "./components/Drawer";
import { ResponsibilityInputModal } from "./components/modals/ResponsibilityInputModal";
import { ParseReviewModal } from "./components/modals/ParseReviewModal";
import { CreateAgentModal, type GenerateCtx } from "./components/modals/CreateAgentModal";
import { ManifestScreen } from "./components/ManifestScreen";
import { Toasts, type Toast } from "./components/Toasts";
import { Icon } from "./components/Icon";

import type { AgentRecord, ParsedMap, PedigreeState, Person } from "./types";
import { parsePeopleCsv } from "./lib/csv";
import { DEMO_PEOPLE, DEMO_PARSED, DEMO_TRANSCRIPT } from "./lib/demoData";
import { applyParsed, computeMetrics, exportEnrichedCsv, initialPedigreeState, downloadFile } from "./lib/state";
import { parseDiscovery } from "./lib/api";
import { buildAgentArtifacts, newAgentRecord } from "./lib/agent";
import { useTheme } from "./lib/useTheme";
import { saveWorkspace } from "./lib/persist";

type Screen = "upload" | "workspace" | "manifest";
type Tab = "spreadsheet" | "orgmap" | "agents";

export default function App() {
  const [themePref, setThemePref, resolvedTheme] = useTheme();

  const [screen, setScreen] = useState<Screen>("upload");
  const [tab, setTab] = useState<Tab>("spreadsheet");

  const [people, setPeople] = useState<Person[]>([]);
  const [pedigree, setPedigree] = useState<PedigreeState>({});
  const [workspaceName, setWorkspaceName] = useState("Untitled Workspace");
  const [isDemo, setIsDemo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [showInput, setShowInput] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [parsedMap, setParsedMap] = useState<ParsedMap | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "local">("local");
  const [parsing, setParsing] = useState(false);

  const [createAgentCtx, setCreateAgentCtx] = useState<CreateAgentCtx | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentRecord | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (t1: string, t2?: string, green?: boolean) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, t1, t2, green }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3800);
  };

  const metrics = useMemo(() => computeMetrics(people, pedigree), [people, pedigree]);
  const selectedPerson = useMemo(() => people.find((p) => p.id === selectedId), [people, selectedId]);
  const topDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    let best = "";
    let n = 0;
    for (const [k, v] of counts) if (v > n) { best = k; n = v; }
    return counts.size > 1 ? "All" : best;
  }, [people]);

  // Persist workspace on change.
  useEffect(() => {
    if (screen !== "upload" && people.length) {
      const id = workspaceName.toLowerCase().replace(/\s+/g, "-");
      void saveWorkspace({ id, name: workspaceName, people, pedigree, createdAt: new Date().toISOString() });
    }
  }, [people, pedigree, workspaceName, screen]);

  // Keyboard tab shortcuts.
  useEffect(() => {
    if (screen !== "workspace") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") setTab("spreadsheet");
      if (e.key === "2") setTab("orgmap");
      if (e.key === "3" && metrics.agentsBuilt > 0) setTab("agents");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, metrics.agentsBuilt]);

  // ── Upload handlers ──
  const startWorkspace = (newPeople: Person[], name: string, demo: boolean) => {
    setPeople(newPeople);
    setPedigree(initialPedigreeState(newPeople));
    setWorkspaceName(name);
    setIsDemo(demo);
    setSelectedId(null);
    setDrawerOpen(false);
    setScreen("workspace");
    setTab("spreadsheet");
  };

  const onUploadText = (text: string, fileName: string) => {
    setUploadError(null);
    if (!text.trim()) {
      setUploadError("Could not read the file. Please try again.");
      return;
    }
    const result = parsePeopleCsv(text, fileName);
    if (result.errors.length) {
      setUploadError(result.errors.join("\n"));
      return;
    }
    startWorkspace(result.people, result.workspaceName, false);
    const warn = result.warnings.length ? ` · ${result.warnings.length} warning(s)` : "";
    pushToast("CSV imported", `${result.people.length} people loaded${warn}`);
  };

  const onUseDemo = () => {
    startWorkspace(DEMO_PEOPLE, "Northwind Co.", true);
    pushToast("Demo CSV imported", "4 people loaded · Revenue Ops");
  };

  // ── Discovery parse ──
  const onParse = async (text: string, scopeIds: string[] | undefined) => {
    setShowInput(false);
    setParsing(true);
    try {
      let parsed: ParsedMap;
      let source: "ai" | "local" = "local";
      if (isDemo && (!scopeIds || scopeIds.length === people.length || scopeIds.length === 0)) {
        // Curated demo mapping (includes the deliberate "needs review" case).
        parsed = DEMO_PARSED;
      } else if (isDemo && scopeIds) {
        parsed = Object.fromEntries(scopeIds.filter((id) => DEMO_PARSED[id]).map((id) => [id, DEMO_PARSED[id]]));
        if (Object.keys(parsed).length === 0) {
          const r = await parseDiscovery(people, text, scopeIds);
          parsed = r.parsed;
          source = r.source;
        }
      } else {
        const r = await parseDiscovery(people, text, scopeIds);
        parsed = r.parsed;
        source = r.source;
      }
      setParsedMap(parsed);
      setParseSource(source);
      setShowReview(true);
    } catch (e) {
      pushToast("Parse failed", (e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const onApply = () => {
    if (!parsedMap) return;
    const next = applyParsed(people, parsedMap, pedigree);
    setPedigree(next);
    setShowReview(false);
    pushToast("Responsibilities applied", "Spreadsheet and Org Map updated", true);
  };

  // ── Agent generation ──
  const onGenerateAgent = (ctx: GenerateCtx) => {
    const row = pedigree[ctx.person.id];
    if (!row) return;
    const artifacts = buildAgentArtifacts({
      person: ctx.person,
      row,
      task: ctx.task,
      respTitle: ctx.respTitle,
      agentName: ctx.agentName,
      policy: ctx.policy,
      riskLevel: ctx.riskLevel,
    });
    const agent = newAgentRecord(
      { person: ctx.person, row, task: ctx.task, respTitle: ctx.respTitle, agentName: ctx.agentName, policy: ctx.policy, riskLevel: ctx.riskLevel },
      artifacts,
    );
    setPedigree((prev) => {
      const nextRow = { ...prev[ctx.person.id] };
      nextRow.agents = [...nextRow.agents, agent];
      nextRow.status = "generated";
      return { ...prev, [ctx.person.id]: nextRow };
    });
    setActiveAgent(agent);
    setCreateAgentCtx(null);
    setScreen("manifest");
    pushToast("Agent generated", `${agent.name} · owner ${ctx.person.name}`, true);
  };

  const onSelect = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const onExport = () => {
    const csv = exportEnrichedCsv(people, pedigree);
    downloadFile(`${workspaceName.toLowerCase().replace(/\s+/g, "-")}-pedigree.csv`, csv, "text/csv");
    pushToast("CSV exported", "Enriched spreadsheet downloaded", true);
  };

  const allAgents = useMemo(() => people.flatMap((p) => pedigree[p.id]?.agents ?? []), [people, pedigree]);

  return (
    <div className="app">
      <Topbar
        screen={screen}
        workspaceName={workspaceName}
        agentName={activeAgent?.name}
        themePref={themePref}
        setThemePref={setThemePref}
        resolvedTheme={resolvedTheme}
      />

      {screen === "upload" && (
        <UploadScreen onUploadText={onUploadText} onUseDemo={onUseDemo} error={uploadError} />
      )}

      {screen === "workspace" && (
        <div className="workspace">
          <div className="workspace-header">
            <div className="workspace-hero">
              <div>
                <h1>Pedigree Discover Lite</h1>
                <div className="subtitle">CSV-to-Agent Prompt MVP · {workspaceName}{topDepartment && topDepartment !== "All" ? ` · ${topDepartment}` : ""}</div>
              </div>
              <div className="actions">
                <button className="btn btn-sm btn-ghost" onClick={onExport}><Icon name="download" size={12} /> Export</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setScreen("upload")} title="Upload a new CSV"><Icon name="upload" size={12} /></button>
                <button className="btn btn-primary" onClick={() => setShowInput(true)} disabled={parsing}>
                  <Icon name="sparkles" size={12} /> {parsing ? "Parsing…" : "Start Responsibility Input"}
                </button>
              </div>
            </div>

            <div className="metrics">
              <Metric label="People Uploaded" value={metrics.peopleCount} delta="from CSV" />
              <Metric label="Responsibilities Mapped" value={metrics.respMapped} delta={metrics.respMapped > 0 ? "+from parse" : "awaiting input"} up={metrics.respMapped > 0} />
              <Metric label="Delegatable Tasks" value={metrics.delegTasks} delta={metrics.delegTasks > 0 ? "ready to scope" : "awaiting input"} up={metrics.delegTasks > 0} />
              <Metric label="Agent Candidates" value={metrics.candidates} extra={`${metrics.agentsBuilt} built`} up={metrics.candidates > 0} />
            </div>

            <div className="tabs" role="tablist">
              <button className="tab" role="tab" aria-selected={tab === "spreadsheet"} onClick={() => setTab("spreadsheet")}>
                <Icon name="spreadsheet" size={12} /> Spreadsheet <span className="count">{people.length}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "orgmap"} onClick={() => setTab("orgmap")}>
                <Icon name="network" size={12} /> Org Map <span className="count">{people.length}</span>
              </button>
              <button
                className={"tab" + (metrics.agentsBuilt === 0 ? " disabled" : "")}
                role="tab"
                aria-selected={tab === "agents"}
                onClick={() => metrics.agentsBuilt > 0 && setTab("agents")}
                title={metrics.agentsBuilt === 0 ? "Available after first agent is generated" : "Generated agents"}
              >
                <Icon name="robot" size={12} /> Agents <span className="count">{metrics.agentsBuilt}</span>
              </button>
              <span style={{ flex: 1 }} />
              <span className="kbd-hint">Tab <span className="k">1</span> Spreadsheet · <span className="k">2</span> Org Map</span>
            </div>
          </div>

          <div className="workspace-body">
            {tab === "spreadsheet" && (
              <Spreadsheet
                people={people}
                pedigree={pedigree}
                department={topDepartment}
                onOpenInput={() => setShowInput(true)}
                onSwitchTab={(t) => setTab(t as Tab)}
                onExport={onExport}
                selectedId={selectedId}
                onSelectRow={onSelect}
              />
            )}
            {tab === "orgmap" && (
              <OrgMap people={people} pedigree={pedigree} selectedId={selectedId} onSelectNode={onSelect} />
            )}
            {tab === "agents" && (
              <AgentsList agents={allAgents} onOpen={(a) => { setActiveAgent(a); setScreen("manifest"); }} />
            )}

            <Drawer
              open={drawerOpen}
              person={selectedPerson}
              state={selectedPerson ? pedigree[selectedPerson.id] : null}
              people={people}
              onClose={() => setDrawerOpen(false)}
              onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
              onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
            />
          </div>
        </div>
      )}

      {screen === "manifest" && (
        <ManifestScreen
          agent={activeAgent}
          onBack={() => setScreen("workspace")}
          onSwitchToOrgMap={() => { setScreen("workspace"); setTab("orgmap"); }}
          onToast={pushToast}
        />
      )}

      <ResponsibilityInputModal
        open={showInput}
        onClose={() => setShowInput(false)}
        onParse={onParse}
        people={people}
        initialText={isDemo ? DEMO_TRANSCRIPT : ""}
      />
      <ParseReviewModal
        open={showReview}
        onClose={() => setShowReview(false)}
        onApply={onApply}
        people={people}
        parsed={parsedMap}
        source={parseSource}
      />
      <CreateAgentModal
        open={!!createAgentCtx}
        onClose={() => setCreateAgentCtx(null)}
        ctx={createAgentCtx}
        onGenerate={onGenerateAgent}
      />

      <Toasts toasts={toasts} />
    </div>
  );
}

function Metric({ label, value, delta, extra, up }: { label: string; value: number; delta?: string; extra?: string; up?: boolean }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {extra && <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{extra}</span>}
      </div>
      {delta && <div className={"delta " + (up ? "up" : "")}>{delta}</div>}
    </div>
  );
}

function AgentsList({ agents, onOpen }: { agents: AgentRecord[]; onOpen: (a: AgentRecord) => void }) {
  return (
    <div className="sheet-wrap" style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {agents.map((a) => (
          <div key={a.id} className="manifest-card" style={{ marginBottom: 0, cursor: "pointer" }} onClick={() => onOpen(a)}>
            <div className="manifest-card-head">
              <Icon name="robot" size={11} style={{ marginRight: 6 }} /> {a.id}
              <span className="right"><span className="badge generated"><span className="dot" />generated</span></span>
            </div>
            <div className="manifest-card-body">
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{a.person.name} · {a.person.title}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="tag cyan">{a.respTitle}</span>
                <span className="tag yellow">{a.riskLevel} risk</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
