import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { RiskBadge } from "./ProvenanceBadge";
import type { AgentRecord, AgentRegistryEntry, ControlManifest, GovernanceException, PedigreeState, Person, PersonLifecycleStatus, RiskFinding, SystemManifest } from "@/types";
import { controlsForAgent, inferAgentSystems, validateAgentTransfer } from "@/lib/wescoGovernance";

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  systems: SystemManifest[];
  controls: ControlManifest[];
  findings: RiskFinding[];
  registry: AgentRegistryEntry[];
  exceptions: GovernanceException[];
  currentUserEmail: string;
  onControlsChange: (controls: ControlManifest[]) => void;
  onLifecycleChange: (personId: string, status: PersonLifecycleStatus) => void;
  onTransferAgent: (agent: AgentRecord, newOwner: Person, findings: RiskFinding[]) => void;
  onExceptionsChange: (exceptions: GovernanceException[]) => void;
  onToast: (title: string, detail?: string, green?: boolean) => void;
}

type View = "controls" | "systems" | "findings" | "lifecycle";

function allAgents(people: Person[], pedigree: PedigreeState): AgentRecord[] {
  return people.flatMap((person) => pedigree[person.id]?.agents ?? []);
}

function agentId(agent: AgentRecord): string {
  return String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id);
}

function personName(people: Person[], id?: string): string {
  return people.find((person) => person.id === id)?.name ?? "Unassigned";
}

export function GovernanceConsole({
  people,
  pedigree,
  systems,
  controls,
  findings,
  registry,
  exceptions,
  currentUserEmail,
  onControlsChange,
  onLifecycleChange,
  onTransferAgent,
  onExceptionsChange,
  onToast,
}: Props) {
  const [view, setView] = useState<View>("controls");
  const [newControlName, setNewControlName] = useState("");
  const [newControlSystem, setNewControlSystem] = useState(systems[0]?.name ?? "");
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id ?? "");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [targetOwnerId, setTargetOwnerId] = useState("");
  const [exceptionKind, setExceptionKind] = useState<GovernanceException["kind"]>("authority_exceedance");
  const [exceptionJustification, setExceptionJustification] = useState("");
  const agents = useMemo(() => allAgents(people, pedigree), [people, pedigree]);
  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? people[0];
  const ownedAgents = selectedPerson ? agents.filter((agent) => agent.person.id === selectedPerson.id) : [];
  const transferAgent = agents.find((agent) => agentId(agent) === selectedAgentId) ?? agents[0];
  const transferOwner = people.find((person) => person.id === targetOwnerId) ?? people.find((person) => person.id !== transferAgent?.person.id && person.lifecycle !== "offboarded") ?? people[0];
  const selectedAgent = agents.find((agent) => agentId(agent) === selectedAgentId) ?? ownedAgents[0] ?? agents[0];

  const systemRows = systems.map((system) => {
    const linkedAgents = agents.filter((agent) => inferAgentSystems(agent, systems).some((name) => name.toLowerCase() === system.name.toLowerCase()));
    const writeAccess = linkedAgents.filter((agent) => JSON.stringify(agent.manifest ?? {}).toLowerCase().includes("read_write")).length;
    const openFindings = findings.filter((finding) => finding.affected.systemIds.includes(system.id) && finding.status === "open").length;
    return { system, linkedAgents, writeAccess, openFindings };
  });
  const ownerSystems = Array.from(new Set(ownedAgents.flatMap((agent) => inferAgentSystems(agent, systems))));
  const ownerControls = Array.from(new Map(ownedAgents.flatMap((agent) => controlsForAgent(agent, controls, systems)).map((control) => [control.id, control])).values());
  const ownerSuspended = selectedPerson ? registry.filter((entry) => entry.owner_person_id === selectedPerson.id && entry.status === "suspended").length : 0;

  const linkAgents = () => {
    const next = controls.map((control) => {
      const linked = agents
        .filter((agent) => controlsForAgent(agent, [control], systems).length)
        .map((agent) => String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id));
      return { ...control, linkedAgentIds: Array.from(new Set([...control.linkedAgentIds, ...linked])), updatedAt: new Date().toISOString() };
    });
    onControlsChange(next);
    onToast("Controls linked", "Matching agents were attached to their control manifests.", true);
  };

  const addControl = () => {
    if (!newControlName.trim()) {
      onToast("Control needs a name", "Add a plain-language control name first.");
      return;
    }
    const stamped = new Date().toISOString();
    const control: ControlManifest = {
      id: `CTRL-manual-${Date.now().toString(36)}`,
      controlId: `MAN-${controls.length + 1}`,
      name: newControlName.trim(),
      process: "Manual review",
      riskAddressed: "Documented by operator in the WESCO MVP.",
      frequency: "As needed",
      system: newControlSystem,
      evidenceRequired: ["Reviewer sign-off"],
      soxRelevant: systems.find((system) => system.name === newControlSystem)?.soxInScope ?? false,
      linkedTaskIds: [],
      linkedAgentIds: [],
      updatedAt: stamped,
    };
    onControlsChange([...controls, control]);
    setNewControlName("");
    onToast("Control added", control.name, true);
  };

  const applyTransfer = () => {
    if (!transferAgent || !transferOwner) {
      onToast("Transfer unavailable", "Choose an agent and a target owner first.");
      return;
    }
    const result = validateAgentTransfer({ agent: transferAgent, newOwner: transferOwner, systems, controls });
    onTransferAgent(transferAgent, transferOwner, result.findings);
    onToast(
      result.ok ? "Agent transfer recorded" : "Agent transfer needs review",
      result.warnings[0] ?? `${transferAgent.name} moved to ${transferOwner.name}; re-approval is required.`,
      result.ok,
    );
  };

  const approveException = () => {
    if (!selectedAgent) {
      onToast("Exception needs an agent", "Generate or select an agent before recording an exception.");
      return;
    }
    if (!exceptionJustification.trim()) {
      onToast("Exception needs justification", "Add a business justification before approval.");
      return;
    }
    const stamped = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const linkedControls = controlsForAgent(selectedAgent, controls, systems);
    const exception: GovernanceException = {
      id: `EX-${Date.now().toString(36)}`,
      kind: exceptionKind,
      agentId: agentId(selectedAgent),
      justification: exceptionJustification.trim(),
      approvedBy: currentUserEmail,
      expiresAt,
      compensatingControls: linkedControls.length ? linkedControls.map((control) => control.controlId) : ["Manual AI Council review"],
      monitoringRequirement: "Monthly owner attestation and evidence export review",
      evidence: `Approved locally in Pedigree by ${currentUserEmail}.`,
      status: "approved",
      createdAt: stamped,
      updatedAt: stamped,
    };
    onExceptionsChange([exception, ...exceptions]);
    setExceptionJustification("");
    onToast("Exception approved", `${exception.kind.replace("_", " ")} exception expires ${expiresAt.slice(0, 10)}`, true);
  };

  return (
    <div className="sheet-wrap governance-screen">
      <div className="governance-head">
        <div>
          <div className="eyebrow"><Icon name="shield" size={12} /> Controls and SOX</div>
          <h2>Governance</h2>
          <p>Controls, systems, and explainable risk findings make the human-to-agent evidence chain inspectable by IT, Internal Controls, SOX owners, and auditors.</p>
        </div>
        <button className="btn btn-outline-cyan" onClick={linkAgents}><Icon name="network" size={12} /> Link matching agents</button>
      </div>

      <div className="governance-stats">
        <div><b>{controls.length}</b><span>Controls</span></div>
        <div><b>{systems.filter((system) => system.soxInScope).length}</b><span>SOX systems</span></div>
        <div><b>{findings.filter((finding) => finding.status === "open").length}</b><span>Open findings</span></div>
        <div><b>{findings.filter((finding) => finding.severity === "critical").length}</b><span>Critical</span></div>
      </div>

      <div className="segmented-tabs">
        <button className={view === "controls" ? "active" : ""} onClick={() => setView("controls")}>Controls</button>
        <button className={view === "systems" ? "active" : ""} onClick={() => setView("systems")}>Systems</button>
        <button className={view === "findings" ? "active" : ""} onClick={() => setView("findings")}>Risk Findings</button>
        <button className={view === "lifecycle" ? "active" : ""} onClick={() => setView("lifecycle")}>Lifecycle</button>
      </div>

      {view === "controls" && (
        <>
          <section className="manifest-card control-add">
            <div className="manifest-card-head"><Icon name="doc" size={11} /> Add control</div>
            <div className="inline-form">
              <input className="input" value={newControlName} onChange={(e) => setNewControlName(e.target.value)} placeholder="Control name" />
              <select className="select" value={newControlSystem} onChange={(e) => setNewControlSystem(e.target.value)}>{systems.map((system) => <option key={system.id} value={system.name}>{system.name}</option>)}</select>
              <button className="btn btn-sm" onClick={addControl}>Add</button>
            </div>
          </section>
          <div className="governance-grid">
            {controls.map((control) => (
              <article className="manifest-card" key={control.id}>
                <div className="manifest-card-head">
                  <Icon name="shield" size={11} /> {control.controlId}
                  <span className="right">{control.soxRelevant && <span className="tag yellow">SOX</span>}</span>
                </div>
                <div className="manifest-card-body">
                  <h3>{control.name}</h3>
                  <p>{control.riskAddressed}</p>
                  <div className="manifest-kv compact">
                    <div className="k">Process</div><div className="v">{control.process}</div>
                    <div className="k">System</div><div className="v">{control.system}</div>
                    <div className="k">Owner</div><div className="v">{personName(people, control.ownerPersonId)}</div>
                    <div className="k">Reviewer</div><div className="v">{personName(people, control.reviewerPersonId)}</div>
                    <div className="k">Frequency</div><div className="v">{control.frequency}</div>
                  </div>
                  <div className="chip-row">{control.evidenceRequired.map((item) => <span className="tag" key={item}>{item}</span>)}</div>
                  <div className="dim">{control.linkedAgentIds.length} linked agent{control.linkedAgentIds.length === 1 ? "" : "s"}</div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {view === "systems" && (
        <div className="governance-grid">
          {systemRows.map(({ system, linkedAgents, writeAccess, openFindings }) => (
            <article className="manifest-card" key={system.id}>
              <div className="manifest-card-head">
                <Icon name="build" size={11} /> {system.name}
                <span className="right">{system.soxInScope && <span className="tag yellow">SOX in scope</span>}</span>
              </div>
              <div className="manifest-card-body">
                <p>{system.notes || `${system.category} system · ${system.dataSensitivity} data`}</p>
                <div className="governance-metric-list">
                  <span><b>{linkedAgents.length}</b> linked agents</span>
                  <span><b>{writeAccess}</b> with write scope</span>
                  <span><b>{openFindings}</b> open findings</span>
                  <span><b>{system.linkedControlIds.length}</b> controls</span>
                </div>
                <div className="chip-row">{system.linkedControlIds.map((id) => <span className="tag" key={id}>{id}</span>)}</div>
              </div>
            </article>
          ))}
        </div>
      )}

      {view === "findings" && (
        <div className="finding-list">
          {!findings.length ? (
            <div className="empty-state"><h3>No risk findings.</h3><p>As agents, controls, systems, and lifecycle events appear, Pedigree will explain any governance issues here.</p></div>
          ) : findings.map((finding) => (
            <article className="manifest-card finding-card" key={finding.id}>
              <div className="manifest-card-head">
                <Icon name="warning" size={11} /> {finding.title}
                <span className="right"><RiskBadge level={finding.severity} /><span className="tag">{finding.type.replace(/_/g, " ")}</span></span>
              </div>
              <div className="manifest-card-body finding-detail">
                <div><span>What happened</span><p>{finding.whatHappened}</p></div>
                <div><span>Why it matters</span><p>{finding.whyItMatters}</p></div>
                <div><span>Recommended action</span><p>{finding.recommendedAction}</p></div>
                {finding.evidence && <blockquote>{finding.evidence}</blockquote>}
              </div>
            </article>
          ))}
        </div>
      )}

      {view === "lifecycle" && (
        <div className="governance-grid lifecycle-grid">
          <section className="manifest-card">
            <div className="manifest-card-head"><Icon name="users" size={11} /> Offboarding simulation</div>
            <div className="manifest-card-body">
              <label><span className="lbl">Person</span><select className="select" value={selectedPerson?.id ?? ""} onChange={(event) => setSelectedPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.lifecycle ?? "active"}</option>)}</select></label>
              <div className="governance-metric-list" style={{ marginTop: 10 }}>
                <span><b>{ownedAgents.length}</b> owned agents</span>
                <span><b>{ownerSystems.length}</b> systems touched</span>
                <span><b>{ownerControls.length}</b> linked controls</span>
                <span><b>{ownerSuspended}</b> suspended registry entries</span>
              </div>
              <div className="chip-row">{ownerSystems.map((system) => <span className="tag" key={system}>{system}</span>)}{ownerControls.map((control) => <span className="tag yellow" key={control.id}>{control.controlId}</span>)}</div>
              <p className="finding-detail">{ownedAgents.length ? "Recommended action: transfer accountable ownership, suspend until reassigned, or archive if the work unit has ended." : "Recommended action: no owned agents found for this person."}</p>
              <div className="request-actions">
                <button className="btn btn-sm" disabled={!selectedPerson} onClick={() => selectedPerson && onLifecycleChange(selectedPerson.id, "transitioning")}>Mark transitioning</button>
                <button className="btn btn-sm btn-outline-cyan" disabled={!selectedPerson} onClick={() => selectedPerson && onLifecycleChange(selectedPerson.id, "offboarded")}>Mark offboarded</button>
              </div>
            </div>
          </section>

          <section className="manifest-card">
            <div className="manifest-card-head"><Icon name="network" size={11} /> Transfer workflow</div>
            <div className="manifest-card-body">
              <div className="governance-form-grid">
                <label><span className="lbl">Agent</span><select className="select" value={transferAgent ? agentId(transferAgent) : ""} onChange={(event) => setSelectedAgentId(event.target.value)}>{agents.map((agent) => <option key={agentId(agent)} value={agentId(agent)}>{agent.name} - {agent.person.name}</option>)}</select></label>
                <label><span className="lbl">New owner</span><select className="select" value={transferOwner?.id ?? ""} onChange={(event) => setTargetOwnerId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.department}</option>)}</select></label>
              </div>
              {transferAgent && transferOwner && (
                <div className="finding-detail" style={{ marginTop: 10 }}>
                  {validateAgentTransfer({ agent: transferAgent, newOwner: transferOwner, systems, controls }).warnings.length
                    ? validateAgentTransfer({ agent: transferAgent, newOwner: transferOwner, systems, controls }).warnings.map((warning) => <p key={warning}><Icon name="warning" size={11} /> {warning}</p>)
                    : <p><Icon name="checkmark" size={11} /> Authority check is within recorded owner context.</p>}
                </div>
              )}
              <div className="request-actions"><button className="btn btn-sm btn-primary" disabled={!transferAgent || !transferOwner} onClick={applyTransfer}>Record transfer</button></div>
            </div>
          </section>

          <section className="manifest-card">
            <div className="manifest-card-head"><Icon name="lock" size={11} /> Exception workflow<span className="right"><span className="tag">{exceptions.length}</span></span></div>
            <div className="manifest-card-body">
              <div className="governance-form-grid">
                <label><span className="lbl">Kind</span><select className="select" value={exceptionKind} onChange={(event) => setExceptionKind(event.target.value as GovernanceException["kind"])}><option value="authority_exceedance">Authority exceedance</option><option value="service_account">Service account</option></select></label>
                <label><span className="lbl">Agent</span><select className="select" value={selectedAgent ? agentId(selectedAgent) : ""} onChange={(event) => setSelectedAgentId(event.target.value)}>{agents.map((agent) => <option key={agentId(agent)} value={agentId(agent)}>{agent.name}</option>)}</select></label>
                <label className="wide"><span className="lbl">Justification</span><textarea className="textarea" value={exceptionJustification} onChange={(event) => setExceptionJustification(event.target.value)} placeholder="Why the exception is needed, who monitors it, and when it should be reviewed" /></label>
              </div>
              <div className="request-actions"><button className="btn btn-sm btn-outline-cyan" onClick={approveException}>Approve local exception</button></div>
              <div className="finding-list" style={{ marginTop: 10 }}>
                {exceptions.slice(0, 4).map((exception) => <div className="finding-detail" key={exception.id}><strong>{exception.kind.replace("_", " ")}</strong> - {exception.status} - expires {exception.expiresAt?.slice(0, 10) ?? "not set"}</div>)}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
