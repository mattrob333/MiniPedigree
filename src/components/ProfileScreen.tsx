import type { AgentRecord, PedigreeState, Person } from "@/types";
import { Icon } from "./Icon";
import { BrandChip } from "./BrandLogo";
import { StatusBadge } from "./StatusBadge";
import { initials } from "@/lib/util";
import { getDepartmentColor } from "@/lib/departments";
import { directReports, teamMapped, recommendSessionType, SESSION_LABEL, isMapped } from "@/lib/sessions";
import type { CreateAgentCtx } from "./Drawer";
import { deriveOperationalState, taskActionLabel } from "@/lib/taskState";

interface Props {
  person: Person;
  people: Person[];
  pedigree: PedigreeState;
  onBack: () => void;
  onOpenPerson: (id: string) => void;
  onCreateAgent: (ctx: CreateAgentCtx) => void;
  onOpenAgent: (a: AgentRecord) => void;
  onStartSession: (personId: string) => void;
}

function managerChain(personId: string, people: Person[]): Person[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain: Person[] = [];
  const seen = new Set<string>();
  let cur = byId.get(personId)?.managerId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const m = byId.get(cur);
    if (m) chain.unshift(m);
    cur = m?.managerId ?? null;
  }
  return chain;
}

export function ProfileScreen({ person, people, pedigree, onBack, onOpenPerson, onCreateAgent, onOpenAgent, onStartSession }: Props) {
  const dept = getDepartmentColor(person.department);
  const ped = pedigree[person.id] ?? { status: "needs-discovery" as const, responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [] };
  const reports = directReports(person.id, people);
  const team = teamMapped(person.id, people, pedigree);
  const chain = managerChain(person.id, people);
  const sessionType = recommendSessionType(person, people, pedigree);
  const agents = ped.agents;
  const createdTaskIds = new Set(agents.map((a) => a.taskId));

  // Tasks grouped by responsibility for the review-style layout.
  const byResp = ped.responsibilities.map((r) => ({
    resp: r,
    delegatable: ped.tasks.delegatable.filter((t) => t.respId === r.id),
    approval: ped.tasks.approval.filter((t) => t.respId === r.id),
    not_delegatable: ped.tasks.not_delegatable.filter((t) => t.respId === r.id),
  }));

  const mcpScopes = Array.from(
    new Set(agents.flatMap((a) => ((a.manifest?.recommended_mcp_servers as any[]) ?? []).map((m) => `${m.name} · ${String(m.scope).replace("_", "-")}`))),
  );

  return (
    <div className="profile-screen">
      {/* Header */}
      <div className="profile-head" style={{ borderTop: `3px solid ${dept.accent}` }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={12} /> Back</button>
        <div className="profile-id">
          {chain.map((m) => (
            <span key={m.id}>
              <span className="crumb" onClick={() => onOpenPerson(m.id)}>{m.name}</span>
              <span className="sep">›</span>
            </span>
          ))}
          <span className="cur">{person.name}</span>
        </div>
      </div>

      <div className="profile-body">
        <div className="profile-hero">
          <div className="avatar-lg" style={{ borderColor: dept.border }}>{initials(person.name)}</div>
          <div className="who">
            <h1>{person.name}</h1>
            <div className="meta">
              {person.title}
              <span className="dept-pill" style={{ marginLeft: 8, color: dept.accent, background: dept.bg, border: `1px solid ${dept.border}`, padding: "2px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{person.department}</span>
            </div>
            <div className="rel">
              <span><span className="k">Manager</span> {people.find((p) => p.id === person.managerId)?.name ?? "None"}</span>
              <span><span className="k">Direct reports</span> {reports.length}</span>
              <span><span className="k">Email</span> <span className="mono">{person.email}</span></span>
            </div>
          </div>
          <div className="profile-actions">
            <StatusBadge status={ped.status} />
            <button className="btn btn-primary btn-sm" onClick={() => onStartSession(person.id)}>
              <Icon name="sparkles" size={12} /> {isMapped(ped.status) ? "Update" : "Start"} {SESSION_LABEL[sessionType]}
            </button>
          </div>
        </div>

        {/* Progress stat strip */}
        <div className="profile-stats">
          <Stat v={ped.responsibilities.length} l="Responsibilities" />
          <Stat v={ped.tasks.delegatable.length} l="Delegation candidates" color="cy" />
          <Stat v={ped.tasks.approval.length} l="Approval req." color="yl" />
          <Stat v={agents.length} l="Agents" color="gr" />
          {reports.length > 0 && <Stat v={`${team.mapped}/${team.total}`} l="Team mapped" />}
        </div>

        <div className="profile-grid">
          {/* Responsibilities */}
          <section className="profile-section">
            <div className="ps-head"><Icon name="shield" size={13} stroke="var(--cyan)" /> Responsibilities <span className="tag">{ped.responsibilities.length}</span></div>
            {byResp.length === 0 ? (
              <div className="profile-empty">No responsibilities discovered yet. Start a discovery pass for {person.name.split(/\s+/)[0]}.</div>
            ) : byResp.map(({ resp, delegatable, approval, not_delegatable }) => (
              <div key={resp.id} className="resp-card">
                <div className="rc-head">
                  <span className="tag cyan">{resp.id}</span>
                  <span className="rc-title">{resp.title}</span>
                  {resp.source && <span className="resp-source" style={{ marginLeft: "auto" }}>via {resp.source}{resp.confidence ? ` · ${Math.round(resp.confidence * 100)}%` : ""}</span>}
                </div>
                {delegatable.length > 0 && (
                  <div className="rc-group">
                    <div className="rc-label cy">Delegation candidate</div>
                    {delegatable.map((t) => {
                      const created = createdTaskIds.has(t.id);
                      const agent = agents.find((x) => x.taskId === t.id);
                      const operationalState = deriveOperationalState(t, undefined, agent);
                      return (
                        <div key={t.id} className={"task-row" + (created ? " created" : "")}>
                          <div className="marker">{created ? <Icon name="checkmark" size={10} /> : "T"}</div>
                          <div className="label">{t.label}</div>
                          {created && <span className="tag cyan">{operationalState.replace(/_/g, " ")}</span>}
                          {created ? (
                            <button className="btn btn-sm btn-ghost" onClick={() => { if (agent) onOpenAgent(agent); }}>Open agent <Icon name="external" size={11} /></button>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-cyan"
                              title="Pedigree drafts the spec from the task's evidence and generates the agent - you review the manifest before export."
                              onClick={() => onCreateAgent({ person, task: t, respTitle: t.respTitle })}
                            >
                              <Icon name="sparkles" size={11} /> {taskActionLabel(operationalState)}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {approval.length > 0 && (
                  <div className="rc-group">
                    <div className="rc-label yl">Approval required</div>
                    {approval.map((t) => <div key={t.id} className="list-item-line"><Icon name="warning" size={12} stroke="var(--yellow)" className="icon" /><span style={{ flex: 1 }}>{t.label}</span></div>)}
                  </div>
                )}
                {not_delegatable.length > 0 && (
                  <div className="rc-group">
                    <div className="rc-label">Not delegatable</div>
                    {not_delegatable.map((t) => <div key={t.id} className="list-item-line"><Icon name="lock" size={12} stroke="var(--text-4)" className="icon" /><span style={{ flex: 1 }}>{t.label}</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Right column */}
          <div className="profile-aside">
            <section className="profile-section">
              <div className="ps-head"><Icon name="robot" size={13} stroke="var(--cyan)" /> Agent inventory <span className="tag">{agents.length}</span></div>
              {agents.length === 0 ? (
                <div className="profile-empty">No agents yet.</div>
              ) : agents.map((a) => (
                <div key={a.id} className="task-row created" onClick={() => onOpenAgent(a)} style={{ cursor: "pointer" }}>
                  <div className="marker"><Icon name="robot" size={11} /></div>
                  <div className="label">{a.name}</div>
                  <span className="tag">{a.lifecycle === "task" ? "task" : "standing"}</span>
                  <Icon name="arrow-right" size={12} stroke="var(--text-4)" />
                </div>
              ))}
            </section>

            <section className="profile-section">
              <div className="ps-head"><Icon name="build" size={13} stroke="var(--cyan)" /> Tools & access</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: mcpScopes.length ? 10 : 0 }}>
                {person.tools.length ? person.tools.map((t) => <BrandChip key={t} name={t} tone="cyan">{t}</BrandChip>) : <span className="dim" style={{ fontSize: 12 }}>No tools listed</span>}
              </div>
              {mcpScopes.length > 0 && (
                <>
                  <div className="rc-label" style={{ marginBottom: 4 }}>Permitted MCP scopes (from agents)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {mcpScopes.map((m) => <BrandChip key={m} name={m}>{m}</BrandChip>)}
                  </div>
                </>
              )}
            </section>

            <section className="profile-section">
              <div className="ps-head"><Icon name="history" size={13} stroke="var(--text-4)" /> Delegated task feed</div>
              <div className="profile-empty" style={{ textAlign: "center", padding: "18px 8px" }}>
                <Icon name="info" size={16} stroke="var(--text-5)" />
                <div style={{ marginTop: 6 }}>Coming soon — tasks delegated down the org to {person.name.split(/\s+/)[0]} will appear here in real time.</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ v, l, color }: { v: number | string; l: string; color?: string }) {
  const c = color === "cy" ? "var(--cyan)" : color === "gr" ? "var(--green)" : color === "yl" ? "var(--yellow)" : "var(--text-1)";
  return (
    <div className="pstat">
      <div className="v" style={{ color: c }}>{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
