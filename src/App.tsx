import { useEffect, useMemo, useState } from "react";
import { Topbar } from "./components/Topbar";
import { UploadScreen } from "./components/UploadScreen";
import { Spreadsheet } from "./components/Spreadsheet";
import { OrgMap } from "./components/OrgMap";
import { Drawer, type CreateAgentCtx } from "./components/Drawer";
import { MappingSessionWizard } from "./components/MappingSessionWizard";
import { CreateAgentModal, type GenerateCtx } from "./components/modals/CreateAgentModal";
import { ManifestScreen } from "./components/ManifestScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { Toasts, type Toast } from "./components/Toasts";
import { LoginScreen } from "./components/LoginScreen";
import { Icon } from "./components/Icon";

import type { AgentRecord, MappingSessionType, ParsedMap, PedigreeState, Person, UserProfile } from "./types";
import { parsePeopleCsv } from "./lib/csv";
import { DEMO_PEOPLE } from "./lib/demoData";
import { applyParsed, computeMetrics, exportEnrichedCsv, initialPedigreeState, downloadFile } from "./lib/state";
import { buildAgentArtifacts, newAgentRecord } from "./lib/agent";
import { computeNextRecommendedSessions } from "./lib/sessions";
import { useTheme } from "./lib/useTheme";
import { saveWorkspace, loadWorkspace, loadProfile, saveProfile, clearProfile, workspaceIdFor } from "./lib/persist";

type Screen = "login" | "upload" | "workspace" | "manifest" | "profile";
type Tab = "spreadsheet" | "orgmap" | "agents";

export default function App() {
  const [themePref, setThemePref, resolvedTheme] = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("login");
  const [tab, setTab] = useState<Tab>("orgmap");

  const [people, setPeople] = useState<Person[]>([]);
  const [pedigree, setPedigree] = useState<PedigreeState>({});
  const [workspaceName, setWorkspaceName] = useState("Untitled Workspace");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [wizardPersonId, setWizardPersonId] = useState<string | null>(null);
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
  const recommended = useMemo(() => computeNextRecommendedSessions(people, pedigree), [people, pedigree]);
  const rootId = useMemo(() => people.find((p) => !p.managerId)?.id ?? people[0]?.id, [people]);
  const topDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    return counts.size > 1 ? "All" : [...counts.keys()][0] ?? "";
  }, [people]);

  // Bootstrap: restore session + workspace on load (the refresh / session-resume fix).
  useEffect(() => {
    const p = loadProfile();
    if (!p) {
      setScreen("login");
      setBooting(false);
      return;
    }
    setProfile(p);
    loadWorkspace(workspaceIdFor(p))
      .then((ws) => {
        if (ws && ws.people.length) {
          setPeople(ws.people);
          setPedigree(ws.pedigree);
          setWorkspaceName(ws.name);
          setScreen("workspace");
          setTab("orgmap");
        } else {
          setScreen("upload");
        }
      })
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the workspace (keyed by company so a refresh restores it).
  useEffect(() => {
    if (booting) return;
    if (screen !== "upload" && people.length && profile) {
      const id = workspaceIdFor(profile);
      void saveWorkspace({ id, name: workspaceName, people, pedigree, createdAt: new Date().toISOString() });
    }
  }, [people, pedigree, workspaceName, screen, profile, booting]);

  const onSignIn = (p: UserProfile) => {
    saveProfile(p);
    setProfile(p);
    loadWorkspace(workspaceIdFor(p)).then((ws) => {
      if (ws && ws.people.length) {
        setPeople(ws.people);
        setPedigree(ws.pedigree);
        setWorkspaceName(ws.name);
        setScreen("workspace");
        setTab("orgmap");
        pushToast("Welcome back", `${ws.people.length} people · ${ws.name}`);
      } else {
        setScreen("upload");
      }
    });
  };

  const onSignOut = () => {
    clearProfile();
    setProfile(null);
    setPeople([]);
    setPedigree({});
    setScreen("login");
  };

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

  const startWorkspace = (newPeople: Person[], name: string) => {
    setPeople(newPeople);
    setPedigree(initialPedigreeState(newPeople));
    setWorkspaceName(name);
    setSelectedId(null);
    setDrawerOpen(false);
    setScreen("workspace");
    setTab("orgmap");
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
    startWorkspace(result.people, result.workspaceName);
    const warn = result.warnings.length ? ` · ${result.warnings.length} warning(s)` : "";
    pushToast("CSV imported", `${result.people.length} people loaded${warn}`);
  };

  const onUseDemo = () => {
    startWorkspace(DEMO_PEOPLE, "Northwind Co.");
    pushToast("Demo CSV imported", "4 people loaded · Revenue Ops");
  };

  const onStartSession = (personId: string | undefined) => {
    if (!personId) return;
    setWizardPersonId(personId);
  };

  const onApplyMapping = (args: { scopeIds: string[]; sessionType: MappingSessionType; sessionLabel: string; parsed: ParsedMap }) => {
    const next = applyParsed(people, args.parsed, pedigree, {
      scopeIds: args.scopeIds,
      sessionLabel: args.sessionLabel,
      people,
    });
    setPedigree(next);
    setWizardPersonId(null);
    pushToast("Discovery applied", `${args.scopeIds.length} people updated · ${args.sessionLabel}`, true);
  };

  const onGenerateAgent = (ctx: GenerateCtx) => {
    const row = pedigree[ctx.person.id];
    if (!row) return;
    const buildCtx = {
      person: ctx.person, row, task: ctx.task, respTitle: ctx.respTitle,
      agentName: ctx.agentName, policy: ctx.policy, riskLevel: ctx.riskLevel,
      lifecycleClass: ctx.lifecycleClass,
      companyContext: profile?.companyContext,
    };
    const artifacts = buildAgentArtifacts(buildCtx);
    const agent = newAgentRecord(buildCtx, artifacts);
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
    if (selectedId === id && drawerOpen) {
      setDrawerOpen(false);
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const onOpenProfile = (id: string) => {
    setProfileId(id);
    setDrawerOpen(false);
    setScreen("profile");
  };

  const onExport = () => {
    const csv = exportEnrichedCsv(people, pedigree);
    downloadFile(`${workspaceName.toLowerCase().replace(/\s+/g, "-")}-pedigree.csv`, csv, "text/csv");
    pushToast("CSV exported", "Enriched spreadsheet downloaded", true);
  };

  const allAgents = useMemo(() => people.flatMap((p) => pedigree[p.id]?.agents ?? []), [people, pedigree]);
  const wizardPerson = wizardPersonId ? people.find((p) => p.id === wizardPersonId) ?? null : null;
  const progressPct = metrics.peopleCount ? Math.round((metrics.mappedPeople / metrics.peopleCount) * 100) : 0;

  return (
    <div className="app">
      <Topbar
        screen={screen}
        workspaceName={workspaceName}
        agentName={activeAgent?.name}
        themePref={themePref}
        setThemePref={setThemePref}
        resolvedTheme={resolvedTheme}
        onHome={screen !== "login" ? () => setScreen(people.length ? "workspace" : "upload") : undefined}
        onWorkspace={screen !== "login" && people.length ? () => setScreen("workspace") : undefined}
        userInitials={profile ? profile.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() : undefined}
        onSignOut={profile ? onSignOut : undefined}
      />

      {screen === "login" && <LoginScreen onSignIn={onSignIn} existingProfile={profile} />}

      {screen === "upload" && <UploadScreen onUploadText={onUploadText} onUseDemo={onUseDemo} error={uploadError} />}

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
                <button className="btn btn-primary" onClick={() => onStartSession(selectedId ?? rootId)} title="Run a discovery pass to map responsibilities">
                  <Icon name="sparkles" size={12} /> Map Responsibilities
                </button>
              </div>
            </div>

            {/* Funnel: People → Responsibilities → Delegatable → Candidates → Built */}
            <div className="metrics funnel">
              <Metric label="People" value={metrics.peopleCount} delta={`${metrics.mappedPeople} mapped`} up={metrics.mappedPeople > 0} arrow />
              <Metric label="Responsibilities" value={metrics.respMapped} delta={metrics.respMapped > 0 ? "discovered" : "awaiting discovery"} up={metrics.respMapped > 0} arrow />
              <Metric label="Delegatable Tasks" value={metrics.delegTasks} delta={metrics.delegTasks > 0 ? "automatable" : "—"} up={metrics.delegTasks > 0} arrow />
              <Metric label="Agent Candidates" value={metrics.candidates} delta={metrics.candidates > 0 ? "ready to build" : "—"} up={metrics.candidates > 0} arrow />
              <Metric label="Agents Built" value={metrics.agentsBuilt} delta={metrics.agentsBuilt > 0 ? "governed" : "none yet"} up={metrics.agentsBuilt > 0} />
            </div>

            <div className="map-progress">
              <div className="lbl">
                <span>Discovery Progress</span>
                <span className="mono">{metrics.mappedPeople} / {metrics.peopleCount} people mapped</span>
              </div>
              <div className="bar"><span style={{ width: `${progressPct}%` }} /></div>
            </div>

            <div className="tabs" role="tablist">
              <button className="tab" role="tab" aria-selected={tab === "spreadsheet"} onClick={() => setTab("spreadsheet")}>
                <Icon name="spreadsheet" size={12} /> Spreadsheet <span className="count">{people.length}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "orgmap"} onClick={() => setTab("orgmap")}>
                <Icon name="network" size={12} /> Org Map <span className="count">{people.length}</span>
              </button>
              <button className={"tab" + (metrics.agentsBuilt === 0 ? " disabled" : "")} role="tab" aria-selected={tab === "agents"} onClick={() => metrics.agentsBuilt > 0 && setTab("agents")} title={metrics.agentsBuilt === 0 ? "Available after first agent is generated" : "Generated agents"}>
                <Icon name="robot" size={12} /> Agents <span className="count">{metrics.agentsBuilt}</span>
              </button>
              <span style={{ flex: 1 }} />
              <span className="kbd-hint">Tab <span className="k">1</span> Spreadsheet · <span className="k">2</span> Org Map</span>
            </div>
          </div>

          <div className="workspace-body">
            {tab === "spreadsheet" && (
              <Spreadsheet people={people} pedigree={pedigree} department={topDepartment} onOpenInput={() => onStartSession(selectedId ?? rootId)} onSwitchTab={(t) => setTab(t as Tab)} onExport={onExport} selectedId={selectedId} onSelectRow={onSelect} />
            )}
            {tab === "orgmap" && (
              <OrgMap people={people} pedigree={pedigree} selectedId={selectedId} onSelectNode={onSelect} recommended={recommended} onStartSession={onStartSession} />
            )}
            {tab === "agents" && <AgentsList agents={allAgents} onOpen={(a) => { setActiveAgent(a); setScreen("manifest"); }} />}

            <Drawer
              open={drawerOpen}
              person={selectedPerson}
              state={selectedPerson ? pedigree[selectedPerson.id] : null}
              people={people}
              pedigree={pedigree}
              onClose={() => setDrawerOpen(false)}
              onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
              onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
              onStartSession={onStartSession}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </div>
      )}

      {screen === "manifest" && (
        <ManifestScreen agent={activeAgent} onBack={() => setScreen("workspace")} onSwitchToOrgMap={() => { setScreen("workspace"); setTab("orgmap"); }} onToast={pushToast} />
      )}

      {screen === "profile" && profileId && people.find((p) => p.id === profileId) && (
        <ProfileScreen
          person={people.find((p) => p.id === profileId)!}
          people={people}
          pedigree={pedigree}
          onBack={() => setScreen("workspace")}
          onOpenPerson={(id) => setProfileId(id)}
          onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
          onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
          onStartSession={onStartSession}
        />
      )}

      <MappingSessionWizard
        open={!!wizardPerson}
        person={wizardPerson}
        people={people}
        pedigree={pedigree}
        companyContext={profile?.companyContext}
        onClose={() => setWizardPersonId(null)}
        onApply={onApplyMapping}
      />
      <CreateAgentModal open={!!createAgentCtx} onClose={() => setCreateAgentCtx(null)} ctx={createAgentCtx} onGenerate={onGenerateAgent} />

      <Toasts toasts={toasts} />
    </div>
  );
}

function Metric({ label, value, delta, extra, up, arrow }: { label: string; value: number; delta?: string; extra?: string; up?: boolean; arrow?: boolean }) {
  return (
    <div className="metric">
      {arrow && <span className="funnel-arrow" aria-hidden>›</span>}
      <div className="label">{label}</div>
      <div className="value">{value}{extra && <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{extra}</span>}</div>
      {delta && <div className={"delta " + (up ? "up" : "")}>{delta}</div>}
    </div>
  );
}

function AgentsList({ agents, onOpen }: { agents: AgentRecord[]; onOpen: (a: AgentRecord) => void }) {
  const standing = agents.filter((a) => (a.lifecycle ?? "standing") === "standing");
  const task = agents.filter((a) => a.lifecycle === "task");

  const Card = ({ a }: { a: AgentRecord }) => (
    <div className="manifest-card" style={{ marginBottom: 0, cursor: "pointer" }} onClick={() => onOpen(a)}>
      <div className="manifest-card-head">
        <Icon name="robot" size={11} style={{ marginRight: 6 }} /> {a.id}
        <span className="right" style={{ display: "flex", gap: 4 }}>
          <span className="tag">{a.lifecycle === "task" ? "task" : "standing"}</span>
          <span className="badge generated"><span className="dot" />generated</span>
        </span>
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
  );

  const Section = ({ title, hint, list }: { title: string; hint: string; list: AgentRecord[] }) => (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h3>
        <span className="tag">{list.length}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{hint}</span>
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>None yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {list.map((a) => <Card key={a.id} a={a} />)}
        </div>
      )}
    </section>
  );

  return (
    <div className="sheet-wrap" style={{ padding: 20 }}>
      <Section title="Standing agents" hint="persistent, tied to a recurring responsibility" list={standing} />
      <Section title="Task agents (active / recent)" hint="ephemeral but governed — audit log retained on teardown" list={task} />
    </div>
  );
}
