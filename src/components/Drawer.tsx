import type { AgentRecord, PedigreeRow, PedigreeState, Person, TaskItem } from "@/types";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";
import { getDepartmentColor } from "@/lib/departments";
import { recommendSessionType, SESSION_LABEL, teamMapped } from "@/lib/sessions";

export interface CreateAgentCtx {
  person: Person;
  task: TaskItem;
  respTitle: string;
}

interface DrawerProps {
  open: boolean;
  person: Person | undefined;
  state: PedigreeRow | null;
  people: Person[];
  pedigree: PedigreeState;
  onClose: () => void;
  onCreateAgent: (ctx: CreateAgentCtx) => void;
  onOpenAgent: (a: AgentRecord) => void;
  onStartSession: (personId: string) => void;
}

export function Drawer({ open, person, state, people, pedigree, onClose, onCreateAgent, onOpenAgent, onStartSession }: DrawerProps) {
  const mgr = person ? people.find((p) => p.id === person.managerId) : undefined;
  const reports = person ? people.filter((p) => p.managerId === person.id) : [];
  const respList = state?.responsibilities ?? [];
  const tasks = state?.tasks ?? { delegatable: [], approval: [], not_delegatable: [] };
  const agents = state?.agents ?? [];
  const status = state?.status ?? "needs-discovery";
  const createdTaskIds = new Set(agents.map((a) => a.taskId));
  const respCount = respList.length;
  const delegCount = tasks.delegatable.length;
  const dept = person ? getDepartmentColor(person.department) : null;
  const team = person ? teamMapped(person.id, people, pedigree) : { mapped: 0, total: 0 };
  const sessionType = person ? recommendSessionType(person, people, pedigree) : null;

  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose} />
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
        {person && dept && (
          <>
            <div className="drawer-head" style={{ borderTop: `3px solid ${dept.accent}` }}>
              <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
              <div className="id-line">
                <Icon name="user" size={10} stroke="var(--text-4)" style={{ marginRight: 5, verticalAlign: -1 }} />
                Person · {person.id}
              </div>
              <h2>
                {person.name}
                <StatusBadge status={status} />
              </h2>
              <div className="meta">
                {person.title}
                <span className="dept-pill" style={{ marginLeft: 8, color: dept.accent, background: dept.bg, border: `1px solid ${dept.border}`, padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{person.department}</span>
              </div>
              <div className="rel-line">
                <div><span className="k">Manager:</span> <span className="v">{mgr ? mgr.name : "None"}</span></div>
                <div><span className="k">Direct Reports:</span> <span className="v">{reports.length === 0 ? "None" : reports.map((r) => r.name).join(", ")}</span></div>
                <div><span className="k">Email:</span> <span className="v mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{person.email}</span></div>
              </div>
            </div>

            <div className="drawer-body">
              {/* Mapping progress */}
              <section className="drawer-section">
                <div className="sh">Mapping progress{state?.lastSession && <span className="count" style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }}>{state.lastSession}</span>}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <Stat v={respCount} l="Resps" />
                  <Stat v={delegCount} l="Deleg" color="cy" />
                  <Stat v={agents.length} l="Agents" color="gr" />
                  {reports.length > 0 ? <Stat v={`${team.mapped}/${team.total}`} l="Team" /> : <Stat v={tasks.approval.length} l="Appr" />}
                </div>
              </section>

              {/* Responsibilities + lineage */}
              <section className="drawer-section">
                <div className="sh">
                  Responsibilities
                  <span className="count">{respCount}</span>
                  <span className="meter"><span style={{ width: respCount ? "100%" : "0%" }} /></span>
                </div>
                {respCount === 0 ? (
                  <div className="drawer-empty">No responsibilities mapped yet. Start a mapping session to discover them.</div>
                ) : (
                  respList.map((r) => {
                    const respTasks = tasks.delegatable.filter((t) => t.respId === r.id);
                    return (
                      <div className="task-row" key={r.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)" }} />
                          <div className="label" style={{ flex: 1 }}>{r.title}</div>
                          <div className="meta">{respTasks.length}t · {r.id}</div>
                        </div>
                        {(r.source || r.assignedByName) && (
                          <div className="lineage">
                            {r.assignedByName && <><span className="chip">{r.assignedByName}</span><span className="arrow">→</span><span className="chip" style={{ borderColor: dept.border, color: dept.accent }}>{person.name}</span></>}
                            {r.source && <span className="resp-source" style={{ marginLeft: r.assignedByName ? 8 : 0 }}>via {r.source}{r.confidence ? ` · ${Math.round(r.confidence * 100)}%` : ""}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              {/* Delegatable tasks */}
              <section className="drawer-section">
                <div className="sh">
                  Delegatable tasks
                  <span className="count">{delegCount}</span>
                  <span className="meter"><span style={{ width: delegCount ? "100%" : "0%", background: "var(--cyan)" }} /></span>
                </div>
                {tasks.delegatable.length === 0 ? (
                  <div className="drawer-empty">No delegatable tasks identified yet.</div>
                ) : (
                  tasks.delegatable.map((t) => {
                    const created = createdTaskIds.has(t.id);
                    return (
                      <div key={t.id} className={"task-row" + (created ? " created" : "")}>
                        <div className="marker">{created ? <Icon name="checkmark" size={10} /> : "T"}</div>
                        <div className="label">{t.label}</div>
                        <div className="meta">{t.respId}</div>
                        {created ? (
                          <button className="btn btn-sm btn-ghost" onClick={() => { const a = agents.find((x) => x.taskId === t.id); if (a) onOpenAgent(a); }}>Open agent <Icon name="external" size={11} /></button>
                        ) : (
                          <button className="btn btn-sm btn-outline-cyan" onClick={() => onCreateAgent({ person, task: t, respTitle: t.respTitle })}><Icon name="sparkles" size={11} /> Create Agent</button>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              {/* Approval required */}
              <section className="drawer-section">
                <div className="sh">Approval required<span className="count">{tasks.approval.length}</span></div>
                {tasks.approval.length === 0 ? <div className="drawer-empty">None.</div> : tasks.approval.map((t) => (
                  <div key={t.id} className="list-item-line"><Icon name="warning" size={12} stroke="var(--yellow)" className="icon" /><span style={{ flex: 1 }}>{t.label}</span><span className="tag yellow">approval</span></div>
                ))}
              </section>

              {/* Not delegatable */}
              <section className="drawer-section">
                <div className="sh">Not delegatable<span className="count">{tasks.not_delegatable.length}</span></div>
                {tasks.not_delegatable.length === 0 ? <div className="drawer-empty">None.</div> : tasks.not_delegatable.map((t) => (
                  <div key={t.id} className="list-item-line"><Icon name="lock" size={12} stroke="var(--text-4)" className="icon" /><span style={{ flex: 1 }}>{t.label}</span><span className="tag">human-only</span></div>
                ))}
              </section>

              {/* Agent candidates */}
              <section className="drawer-section">
                <div className="sh">Agent candidates<span className="count">{agents.length}</span></div>
                {agents.length === 0 ? <div className="drawer-empty">No agents generated yet.</div> : agents.map((a) => (
                  <div key={a.id} className="task-row created">
                    <div className="marker"><Icon name="robot" size={11} /></div>
                    <div className="label">{a.name}</div>
                    <div className="meta">{a.respId || ""}</div>
                    <button className="btn btn-sm" onClick={() => onOpenAgent(a)}>Open Agent <Icon name="arrow-right" size={11} /></button>
                  </div>
                ))}
              </section>
            </div>

            <div className="drawer-footer">
              <button className="btn" onClick={onClose}>Close</button>
              <span style={{ flex: 1 }} />
              {tasks.delegatable.length > 0 && (
                <button className="btn btn-ghost" onClick={() => { const next = tasks.delegatable.find((t) => !createdTaskIds.has(t.id)); if (next) onCreateAgent({ person, task: next, respTitle: next.respTitle }); }}>
                  <Icon name="sparkles" size={12} /> Create Agent
                </button>
              )}
              {sessionType && (
                <button className="btn btn-primary" onClick={() => onStartSession(person.id)}>
                  <Icon name="sparkles" size={12} /> Start {SESSION_LABEL[sessionType]}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Stat({ v, l, color }: { v: number | string; l: string; color?: string }) {
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: color === "cy" ? "var(--cyan)" : color === "gr" ? "var(--green)" : "var(--text-1)" }}>{v}</div>
      <div style={{ fontSize: 9.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{l}</div>
    </div>
  );
}
