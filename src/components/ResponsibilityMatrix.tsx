import { Fragment, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ProvenanceBadge } from "./ProvenanceBadge";
import type { AgentRecord, PedigreeState, Person, ResponsibilityRow, TaskItem } from "@/types";
import { getDepartmentColor } from "@/lib/departments";
import { initials } from "@/lib/util";
import { taskFreshness, DEFAULT_FRESHNESS_CONFIG } from "@/lib/freshness";
import { deriveOperationalState, taskActionLabel } from "@/lib/taskState";

// ── UX reset Sprint 3: the Responsibility Matrix ───────────────────────
// The serious working surface between discovery and agent creation: which
// responsibilities are real, who owns them, and which tasks under them can
// be delegated. Tasks never float without a responsibility owner — every
// row reinforces owner → responsibility → task → agent.

interface MatrixRow {
  person: Person;
  responsibility: ResponsibilityRow;
  tasks: { task: TaskItem; cls: "delegatable" | "approval" | "blocked" }[];
  agents: AgentRecord[];
}

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  onCreateAgent: (ctx: { person: Person; task: TaskItem; respTitle: string }) => void;
  onOpenAgent: (agent: AgentRecord) => void;
  onStartSession: (personId: string) => void;
  onSelectPerson: (personId: string) => void;
}

export function ResponsibilityMatrix({ people, pedigree, onCreateAgent, onOpenAgent, onStartSession, onSelectPerson }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [department, setDepartment] = useState("all");

  const rows = useMemo(() => {
    const out: MatrixRow[] = [];
    for (const person of people) {
      if (person.lifecycle === "offboarded") continue;
      const ped = pedigree[person.id];
      if (!ped) continue;
      for (const responsibility of ped.responsibilities) {
        const tasks = [
          ...ped.tasks.delegatable.filter((t) => t.respId === responsibility.id).map((task) => ({ task, cls: "delegatable" as const })),
          ...ped.tasks.approval.filter((t) => t.respId === responsibility.id).map((task) => ({ task, cls: "approval" as const })),
          ...ped.tasks.not_delegatable.filter((t) => t.respId === responsibility.id).map((task) => ({ task, cls: "blocked" as const })),
        ];
        out.push({
          person,
          responsibility,
          tasks,
          agents: ped.agents.filter((a) => a.respId === responsibility.id),
        });
      }
    }
    return out;
  }, [people, pedigree]);

  const departments = useMemo(() => [...new Set(rows.map((r) => r.person.department))].sort(), [rows]);
  const filtered = department === "all" ? rows : rows.filter((r) => r.person.department === department);

  if (!rows.length) {
    return (
      <div className="sheet-wrap" style={{ padding: 24 }}>
        <div className="empty-state">
          <h3>No responsibilities confirmed yet</h3>
          <p>Run the leadership session first. Pedigree needs confirmed responsibilities before it can classify tasks or propose agents.</p>
          <button className="btn btn-primary" onClick={() => onStartSession(people.find((p) => !p.managerId)?.id ?? people[0]?.id ?? "")}>
            <Icon name="sparkles" size={12} /> Prepare leadership session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-wrap" id="responsibility-matrix">
      <div className="sheet-toolbar">
        <span className="filter-chip">
          <Icon name="filter" size={11} /> Department:{" "}
          <select className="select matrix-dept-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Filter by department">
            <option value="all">All</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </span>
        <span className="dim" style={{ fontSize: 12 }}>
          {filtered.length} responsibilit{filtered.length === 1 ? "y" : "ies"} · every task inherits its owner, source, and approval context
        </span>
      </div>

      <table className="sheet matrix">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Responsibility</th>
            <th>Delegation candidates</th>
            <th>Approval required</th>
            <th>Not delegatable</th>
            <th>Agents</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => {
            const key = `${row.person.id}:${row.responsibility.id}`;
            const open = openKey === key;
            const dept = getDepartmentColor(row.person.department);
            const counts = {
              delegatable: row.tasks.filter((t) => t.cls === "delegatable").length,
              approval: row.tasks.filter((t) => t.cls === "approval").length,
              blocked: row.tasks.filter((t) => t.cls === "blocked").length,
            };
            const provenance = row.responsibility.provenance;
            return (
              <Fragment key={key}>
                <tr className={open ? "selected" : ""} onClick={() => setOpenKey(open ? null : key)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="name">
                      <span className="avatar" style={{ borderColor: dept.border }}>{initials(row.person.name)}</span>
                      <div>
                        <div className="name-text">{row.person.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>{row.person.department}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
                      <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{row.responsibility.title}</span>
                    </div>
                    {row.responsibility.source && <div className="dim" style={{ fontSize: 11.5, marginLeft: 18 }}>via {row.responsibility.source}</div>}
                  </td>
                  <td><span className={"tag " + (counts.delegatable ? "cyan" : "")}>{counts.delegatable}</span></td>
                  <td><span className={"tag " + (counts.approval ? "yellow" : "")}>{counts.approval}</span></td>
                  <td><span className="tag">{counts.blocked}</span></td>
                  <td>
                    {row.agents.length
                      ? <span className="tag green"><Icon name="robot" size={10} /> {row.agents.length}</span>
                      : counts.delegatable > 0 ? <span className="dim" style={{ fontSize: 12 }}>workflow review needed</span> : <span className="dim">—</span>}
                  </td>
                  <td>{provenance ? <ProvenanceBadge provenance={provenance} compact /> : <span className="dim">—</span>}</td>
                </tr>
                {open && (
                  <tr className="matrix-drawer-row">
                    <td colSpan={7}>
                      <div className="matrix-drawer">
                        {provenance?.evidence_quote && (
                          <blockquote className="digest-evidence" style={{ marginBottom: 10 }}>“{provenance.evidence_quote}”{provenance.source ? <span className="dim"> — {provenance.source}</span> : null}</blockquote>
                        )}
                        {row.tasks.length === 0 && <div className="drawer-empty">No tasks extracted under this responsibility yet — re-run the session with a deeper brief.</div>}
                        {row.tasks.map(({ task, cls }) => {
                          const agent = row.agents.find((a) => a.taskId === task.id);
                          const freshness = taskFreshness(task, DEFAULT_FRESHNESS_CONFIG);
                          const operationalState = deriveOperationalState(task, undefined, agent);
                          const canCreate = operationalState === "agent_ready";
                          return (
                            <div className="matrix-task" key={task.id}>
                              <span className={"tag " + (cls === "delegatable" ? "cyan" : cls === "approval" ? "yellow" : "")}>
                                {cls === "delegatable" ? "delegation candidate" : cls === "approval" ? "approval required" : "not delegatable"}
                              </span>
                              {cls === "delegatable" && <span className="tag">{operationalState.replace(/_/g, " ")}</span>}
                              <span className="matrix-task-label">{task.label}</span>
                              {task.completion?.trigger && <span className="dim" style={{ fontSize: 12 }}>{task.completion.trigger}</span>}
                              {task.completion?.tools_mentioned?.length ? <span className="dim" style={{ fontSize: 12 }}>{task.completion.tools_mentioned.join(", ")}</span> : null}
                              <ProvenanceBadge provenance={task.provenance} compact />
                              <span className="member-freshness" style={{ color: freshness === "fresh" ? "var(--green)" : freshness === "aging" ? "var(--yellow)" : "var(--red)" }}>{freshness}</span>
                              <span style={{ flex: 1 }} />
                              {agent ? (
                                <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onOpenAgent(agent); }}>Open agent <Icon name="external" size={10} /></button>
                              ) : cls === "delegatable" ? (
                                <button
                                  className="btn btn-sm btn-outline-cyan"
                                  disabled={!canCreate}
                                  title={!canCreate ? `Workflow incomplete: ${(task.missingSpecFields ?? ["task spec", "test case"]).join(", ")}` : undefined}
                                  onClick={(e) => { e.stopPropagation(); onCreateAgent({ person: row.person, task, respTitle: row.responsibility.title }); }}
                                >
                                  <Icon name="sparkles" size={10} /> {taskActionLabel(operationalState)}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onSelectPerson(row.person.id); }}><Icon name="user" size={11} /> Open {row.person.name.split(/\s+/)[0]}'s drawer</button>
                          <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onStartSession(row.person.id); }}><Icon name="sparkles" size={11} /> Re-run session</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
