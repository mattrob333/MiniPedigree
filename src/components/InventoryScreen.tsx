import { useMemo, useState } from "react";
import { AgentPlan } from "./AgentPlan";
import { Icon } from "./Icon";
import { RiskBadge } from "./ProvenanceBadge";
import type { AgentBirthCertificate, AgentRecord, AgentRegistryEntry, ControlManifest, PedigreeState, Person, RiskFinding, SystemManifest, TaskItem } from "@/types";
import type { Recommendation } from "@/lib/optimizer";
import { controlsForAgent, inferAgentSystems, isSoxRelevantAgent } from "@/lib/wescoGovernance";

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  recommendations: Recommendation[];
  systems: SystemManifest[];
  controls: ControlManifest[];
  birthCertificates: AgentBirthCertificate[];
  findings: RiskFinding[];
  onCreateAgent: (ctx: { person: Person; task: TaskItem; respTitle: string }) => void;
  onOpenAgent: (agent: AgentRecord) => void;
}

type View = "agent" | "owner" | "system" | "control";

function agentId(agent: AgentRecord): string {
  return String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id);
}

export function InventoryScreen({ people, pedigree, registry, recommendations, systems, controls, birthCertificates, findings, onCreateAgent, onOpenAgent }: Props) {
  const [view, setView] = useState<View>("agent");
  const [filter, setFilter] = useState("all");
  const agents = useMemo(() => people.flatMap((person) => pedigree[person.id]?.agents ?? []), [people, pedigree]);
  const certByAgent = useMemo(() => new Map(birthCertificates.map((cert) => [cert.agentId, cert])), [birthCertificates]);
  const registryByAgent = useMemo(() => new Map(registry.map((entry) => [entry.agent_id, entry])), [registry]);

  const filteredAgents = agents.filter((agent) => {
    const id = agentId(agent);
    const cert = certByAgent.get(id);
    const linkedFindings = findings.filter((finding) => finding.affected.agentIds.includes(id) && finding.status === "open");
    const agentSystems = inferAgentSystems(agent, systems);
    if (filter === "sox") return isSoxRelevantAgent(agent, controls, systems);
    if (filter === "oracle") return agentSystems.some((system) => /oracle/i.test(system));
    if (filter === "high") return agent.riskLevel === "high" || agent.riskLevel === "critical";
    if (filter === "inactive") return agent.person.lifecycle === "offboarded" || agent.person.lifecycle === "transitioning";
    if (filter === "missing_birth") return !cert;
    if (filter === "findings") return linkedFindings.length > 0;
    return true;
  });

  const ownerGroups = people
    .map((person) => ({ person, agents: filteredAgents.filter((agent) => agent.person.id === person.id) }))
    .filter((group) => group.agents.length);

  const systemGroups = systems
    .map((system) => ({ system, agents: filteredAgents.filter((agent) => inferAgentSystems(agent, systems).some((name) => name.toLowerCase() === system.name.toLowerCase())) }))
    .filter((group) => group.agents.length);

  const controlGroups = controls
    .map((control) => ({ control, agents: filteredAgents.filter((agent) => controlsForAgent(agent, [control], systems).length) }))
    .filter((group) => group.agents.length);

  const renderAgentRow = (agent: AgentRecord) => {
    const id = agentId(agent);
    const cert = certByAgent.get(id);
    const entry = registryByAgent.get(id);
    const linkedFindings = findings.filter((finding) => finding.affected.agentIds.includes(id) && finding.status === "open");
    const agentSystems = inferAgentSystems(agent, systems);
    const linkedControls = controlsForAgent(agent, controls, systems);
    return (
      <article className="inventory-row" key={id}>
        <div>
          <div className="inventory-title"><Icon name="robot" size={12} /> {agent.name}</div>
          <div className="inventory-sub">{agent.person.name} · {agent.person.department} · {agent.task.label}</div>
        </div>
        <div className="chip-row">{agentSystems.slice(0, 3).map((system) => <span className="tag" key={system}>{system}</span>)}{isSoxRelevantAgent(agent, controls, systems) && <span className="tag yellow">SOX</span>}</div>
        <div className="chip-row">{linkedControls.slice(0, 2).map((control) => <span className="tag" key={control.id}>{control.controlId}</span>)}</div>
        <RiskBadge level={agent.riskLevel} />
        <span className={"tag " + (cert?.approval.status === "approved" ? "green" : "yellow")}>{cert?.approval.status ?? "missing birth certificate"}</span>
        {entry?.stale && <span className="tag yellow">drift</span>}
        {linkedFindings.length > 0 && <span className="tag yellow">{linkedFindings.length} finding{linkedFindings.length === 1 ? "" : "s"}</span>}
        <button className="btn btn-sm" onClick={() => onOpenAgent(agent)}>Open</button>
      </article>
    );
  };

  return (
    <div className="inventory-screen">
      <section className="sheet-wrap inventory-panel">
        <div className="governance-head">
          <div>
            <div className="eyebrow"><Icon name="robot" size={12} /> Agent system of record</div>
            <h2>Inventory</h2>
            <p>Search by agent, human owner, system, or control. This is the cross-runtime population Pedigree can defend for AI Council, IT, Internal Controls, and auditors.</p>
          </div>
        </div>
        <div className="governance-stats">
          <div><b>{agents.length}</b><span>Total agents</span></div>
          <div><b>{agents.filter((agent) => isSoxRelevantAgent(agent, controls, systems)).length}</b><span>SOX agents</span></div>
          <div><b>{agents.filter((agent) => inferAgentSystems(agent, systems).some((system) => /oracle/i.test(system))).length}</b><span>Oracle agents</span></div>
          <div><b>{agents.filter((agent) => !certByAgent.has(agentId(agent))).length}</b><span>Missing Birth Certificate</span></div>
          <div><b>{findings.filter((finding) => finding.status === "open").length}</b><span>Open findings</span></div>
        </div>
        <div className="inventory-controls">
          <div className="segmented-tabs">
            <button className={view === "agent" ? "active" : ""} onClick={() => setView("agent")}>By Agent</button>
            <button className={view === "owner" ? "active" : ""} onClick={() => setView("owner")}>By Human</button>
            <button className={view === "system" ? "active" : ""} onClick={() => setView("system")}>By System</button>
            <button className={view === "control" ? "active" : ""} onClick={() => setView("control")}>By Control</button>
          </div>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All agents</option>
            <option value="sox">SOX relevant</option>
            <option value="oracle">Touching Oracle</option>
            <option value="high">High / critical risk</option>
            <option value="inactive">Owner inactive or transitioning</option>
            <option value="missing_birth">Missing Birth Certificate</option>
            <option value="findings">Open findings</option>
          </select>
        </div>

        {view === "agent" && <div className="inventory-list">{filteredAgents.length ? filteredAgents.map(renderAgentRow) : <div className="empty-state"><h3>No agents match this filter.</h3></div>}</div>}
        {view === "owner" && <div className="inventory-group-list">{ownerGroups.map((group) => <section className="manifest-card" key={group.person.id}><div className="manifest-card-head"><Icon name="user" size={11} /> {group.person.name}<span className="right"><span className="tag">{group.agents.length}</span></span></div><div className="inventory-list compact">{group.agents.map(renderAgentRow)}</div></section>)}</div>}
        {view === "system" && <div className="inventory-group-list">{systemGroups.map((group) => <section className="manifest-card" key={group.system.id}><div className="manifest-card-head"><Icon name="build" size={11} /> {group.system.name}<span className="right">{group.system.soxInScope && <span className="tag yellow">SOX</span>}<span className="tag">{group.agents.length}</span></span></div><div className="inventory-list compact">{group.agents.map(renderAgentRow)}</div></section>)}</div>}
        {view === "control" && <div className="inventory-group-list">{controlGroups.map((group) => <section className="manifest-card" key={group.control.id}><div className="manifest-card-head"><Icon name="shield" size={11} /> {group.control.controlId}: {group.control.name}<span className="right">{group.control.soxRelevant && <span className="tag yellow">SOX</span>}<span className="tag">{group.agents.length}</span></span></div><div className="inventory-list compact">{group.agents.map(renderAgentRow)}</div></section>)}</div>}
      </section>

      <AgentPlan people={people} pedigree={pedigree} registry={registry} recommendations={recommendations} onCreateAgent={onCreateAgent} onOpenAgent={onOpenAgent} />
    </div>
  );
}
