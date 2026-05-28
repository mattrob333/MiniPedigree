import type { AgentRecord, PedigreeRow, Person, TaskItem } from "@/types";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

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
  onClose: () => void;
  onCreateAgent: (ctx: CreateAgentCtx) => void;
  onOpenAgent: (a: AgentRecord) => void;
}

export function Drawer({ open, person, state, people, onClose, onCreateAgent, onOpenAgent }: DrawerProps) {
  const mgr = person ? people.find((p) => p.id === person.managerId) : undefined;
  const reports = person ? people.filter((p) => p.managerId === person.id) : [];
  const respList = state?.responsibilities ?? [];
  const tasks = state?.tasks ?? { delegatable: [], approval: [], not_delegatable: [] };
  const agents = state?.agents ?? [];
  const status = state?.status ?? "needs-discovery";
  const createdTaskIds = new Set(agents.map((a) => a.taskId));
  const respCount = respList.length;
  const delegCount = tasks.delegatable.length;

  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose} />
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
        {person && (
          <>
            <div className="drawer-head">
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
                <span className="dept">{person.department}</span>
              </div>
              <div className="rel-line">
                <div><span className="k">Manager:</span> <span className="v">{mgr ? mgr.name : "None"}</span></div>
                <div><span className="k">Direct Reports:</span> <span className="v">{reports.length === 0 ? "None" : reports.map((r) => r.name).join(", ")}</span></div>
                <div><span className="k">Email:</span> <span className="v mono" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{person.email}</span></div>
              </div>
            </div>

            <div className="drawer-body">
              <section className="drawer-section">
                <div className="sh">
                  Responsibility status
                  <span className="count">{respCount}</span>
                  <span className="meter"><span style={{ width: respCount ? "100%" : "0%" }} /></span>
                </div>
                {respCount === 0 ? (
                  <div className="drawer-empty">No responsibilities mapped yet. Run the Responsibility Input to discover them.</div>
                ) : (
                  respList.map((r) => {
                    const respTasks = tasks.delegatable.filter((t) => t.respId === r.id);
                    return (
                      <div className="resp-row" key={r.id}>
                        <div className="dot" />
                        <div className="lab">{r.title}</div>
                        <div className="stats">{respTasks.length}t · {r.id}</div>
                      </div>
                    );
                  })
                )}
              </section>

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
                          <button className="btn btn-sm btn-ghost" onClick={() => { const a = agents.find((x) => x.taskId === t.id); if (a) onOpenAgent(a); }}>
                            Open agent <Icon name="external" size={11} />
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-outline-cyan" onClick={() => onCreateAgent({ person, task: t, respTitle: t.respTitle })}>
                            <Icon name="sparkles" size={11} /> Create Agent
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              <section className="drawer-section">
                <div className="sh">Approval required<span className="count">{tasks.approval.length}</span></div>
                {tasks.approval.length === 0 ? (
                  <div className="drawer-empty">None.</div>
                ) : (
                  tasks.approval.map((t) => (
                    <div key={t.id} className="list-item-line">
                      <Icon name="warning" size={12} stroke="var(--yellow)" className="icon" />
                      <span style={{ flex: 1 }}>{t.label}</span>
                      <span className="tag yellow">approval</span>
                    </div>
                  ))
                )}
              </section>

              <section className="drawer-section">
                <div className="sh">Not delegatable<span className="count">{tasks.not_delegatable.length}</span></div>
                {tasks.not_delegatable.length === 0 ? (
                  <div className="drawer-empty">None.</div>
                ) : (
                  tasks.not_delegatable.map((t) => (
                    <div key={t.id} className="list-item-line">
                      <Icon name="lock" size={12} stroke="var(--text-4)" className="icon" />
                      <span style={{ flex: 1 }}>{t.label}</span>
                      <span className="tag">human-only</span>
                    </div>
                  ))
                )}
              </section>

              <section className="drawer-section">
                <div className="sh">Agent candidates<span className="count">{agents.length}</span></div>
                {agents.length === 0 ? (
                  <div className="drawer-empty">No agents generated yet.</div>
                ) : (
                  agents.map((a) => (
                    <div key={a.id} className="task-row created">
                      <div className="marker"><Icon name="robot" size={11} /></div>
                      <div className="label">{a.name}</div>
                      <div className="meta">{a.respId || ""}</div>
                      <button className="btn btn-sm" onClick={() => onOpenAgent(a)}>
                        Open Agent <Icon name="arrow-right" size={11} />
                      </button>
                    </div>
                  ))
                )}
              </section>
            </div>

            <div className="drawer-footer">
              <button className="btn" onClick={onClose}>Close</button>
              <span style={{ flex: 1 }} />
              {tasks.delegatable.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const next = tasks.delegatable.find((t) => !createdTaskIds.has(t.id));
                    if (next) onCreateAgent({ person, task: next, respTitle: next.respTitle });
                  }}
                >
                  <Icon name="sparkles" size={12} /> Create Agent
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
