import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { RiskBadge, ProvenanceBadge } from "./ProvenanceBadge";
import type { AgentRecord, AgentRegistryEntry, PedigreeState, Person, TaskItem } from "@/types";
import type { Recommendation } from "@/lib/optimizer";
import { getDepartmentColor } from "@/lib/departments";
import { initials } from "@/lib/util";

// ── UX reset Sprint 3: Agent Plan ──────────────────────────────────────
// Which tasks should become agents, under what human-owned boundary?
// Candidates are grouped by responsibility, never by runtime — business
// justification, owner, scope, and evidence come first. Runtime selection
// lives in Export (the manifest screen), after an agent is approved.
// No orphan agents: every candidate carries its parent human and parent
// responsibility.

interface CandidateGroup {
  person: Person;
  respId: string;
  respTitle: string;
  candidates: TaskItem[];   // delegatable tasks without an agent yet
  agents: AgentRecord[];    // already built under this responsibility
  approvalContext: number;  // sibling approval-required tasks (boundary signal)
  blockedContext: number;
}

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  recommendations: Recommendation[];
  onCreateAgent: (ctx: { person: Person; task: TaskItem; respTitle: string }) => void;
  onOpenAgent: (agent: AgentRecord) => void;
}

export function AgentPlan({ people, pedigree, registry, recommendations, onCreateAgent, onOpenAgent }: Props) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const registryById = useMemo(() => new Map(registry.map((e) => [e.agent_id, e])), [registry]);
  const suspended = registry.filter((e) => e.status === "suspended");

  const groups = useMemo(() => {
    const out: CandidateGroup[] = [];
    for (const person of people) {
      if (person.lifecycle === "offboarded") continue;
      const ped = pedigree[person.id];
      if (!ped) continue;
      const agentTaskIds = new Set(ped.agents.map((a) => a.taskId));
      for (const resp of ped.responsibilities) {
        const candidates = ped.tasks.delegatable.filter((t) => t.respId === resp.id && !agentTaskIds.has(t.id));
        const agents = ped.agents.filter((a) => a.respId === resp.id);
        if (!candidates.length && !agents.length) continue;
        out.push({
          person,
          respId: resp.id,
          respTitle: resp.title,
          candidates,
          agents,
          approvalContext: ped.tasks.approval.filter((t) => t.respId === resp.id).length,
          blockedContext: ped.tasks.not_delegatable.filter((t) => t.respId === resp.id).length,
        });
      }
    }
    // Groups with un-built candidates first.
    return out.sort((a, b) => Number(b.candidates.length > 0) - Number(a.candidates.length > 0));
  }, [people, pedigree]);

  if (!groups.length) {
    return (
      <div className="sheet-wrap" style={{ padding: 24 }}>
        <div className="empty-state">
          <h3>No agent candidates yet</h3>
          <p>Agent candidates appear after discovery sessions extract tasks and classify delegation fit. From there, one click designs the agent — Pedigree drafts the spec from the task's evidence, and you review the manifest before export.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-wrap" style={{ padding: 20 }}>
      {/* Inventory optimizer: standing recommendations from the signal ledger. */}
      {recommendations.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Stack recommendations</h3>
            <span className="tag">{recommendations.length}</span>
            <span style={{ fontSize: 12, color: "var(--text-4)" }}>composed from meeting signals — every score carries its evidence</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {recommendations.slice(0, 6).map((rec) => (
              <div className="manifest-card" key={rec.id} style={{ marginBottom: 0 }}>
                <div className="manifest-card-head">
                  <Icon name={rec.kind === "build_candidate" ? "sparkles" : rec.kind === "retirement" ? "warning" : "info"} size={11} style={{ marginRight: 6 }} />
                  {rec.kind.replace(/_/g, " ")}
                  <span className="right"><span className="tag cyan" title={Object.entries(rec.score_breakdown).map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : v}`).join(" · ")}>score {rec.score.toFixed(1)}</span></span>
                </div>
                <div className="manifest-card-body">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{rec.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 6 }}>{rec.detail}</div>
                  {rec.evidence.slice(0, 2).map((quote, i) => (
                    <blockquote key={i} style={{ margin: "4px 0", padding: "4px 8px", borderLeft: "2px solid var(--border-1)", fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>“{quote}”</blockquote>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {suspended.length > 0 && (
        <div className="manifest-card" style={{ marginBottom: 20, border: "1px solid var(--red)" }}>
          <div className="manifest-card-body" style={{ fontSize: 13 }}>
            <Icon name="warning" size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
            {suspended.length} agent{suspended.length === 1 ? " is" : "s are"} <strong>suspended</strong> (owner offboarded or paused). Export packages are invalid until each is reassigned and recompiled under the new owner's authority ceiling.
          </div>
        </div>
      )}

      {groups.map((group) => {
        const dept = getDepartmentColor(group.person.department);
        return (
          <section className="agentplan-group" key={`${group.person.id}:${group.respId}`} style={{ borderLeft: `3px solid ${dept.accent}` }}>
            <div className="agentplan-group-head">
              <span className="avatar">{initials(group.person.name)}</span>
              <div style={{ flex: 1 }}>
                <div className="agentplan-resp">{group.respTitle}</div>
                <div className="agentplan-owner">Owner: <strong>{group.person.name}</strong> · {group.person.title} · {group.person.department}</div>
              </div>
              <span className="dim" style={{ fontSize: 12 }}>
                boundary: {group.approvalContext} approval gate{group.approvalContext === 1 ? "" : "s"} · {group.blockedContext} blocked task{group.blockedContext === 1 ? "" : "s"}
              </span>
            </div>

            {group.candidates.map((task) => {
              const expanded = expandedTaskId === task.id;
              const completion = task.completion;
              const done = completion?.definition_of_done ? completion.definition_of_done.split(/\n|;|\.\s+/).map((s) => s.trim()).filter(Boolean) : [];
              const hasDetail = Boolean(task.description || completion?.inputs?.length || completion?.outputs?.length || completion?.tools_mentioned?.length || done.length);
              return (
                <div className={"agentplan-candidate" + (expanded ? " expanded" : "")} key={task.id}>
                  <div className="agentplan-candidate-row" onClick={() => hasDetail && setExpandedTaskId(expanded ? null : task.id)} style={hasDetail ? { cursor: "pointer" } : undefined}>
                    <Icon name={hasDetail ? (expanded ? "chevron-down" : "chevron-right") : "sparkles"} size={12} stroke="var(--cyan)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="agentplan-task">{task.label}</div>
                      <div className="agentplan-meta">
                        {task.description && <span className="agentplan-desc">{task.description}</span>}
                        {!task.description && completion?.cadence && <span>{completion.cadence}</span>}
                        {!task.description && task.evidence && <span title={task.evidence}><Icon name="transcript" size={10} /> evidence</span>}
                      </div>
                    </div>
                    <ProvenanceBadge provenance={task.provenance} compact />
                    <RiskBadge level={task.riskLevel} />
                    <button
                      className="btn btn-sm btn-outline-cyan"
                      title="Pedigree drafts the spec from the task's evidence and generates the agent — you review the manifest before anything is exported."
                      onClick={(e) => { e.stopPropagation(); onCreateAgent({ person: group.person, task, respTitle: group.respTitle }); }}
                    >
                      <Icon name="sparkles" size={11} /> Design agent
                    </button>
                  </div>
                  {expanded && hasDetail && (
                    <div className="review-task-actionitems" style={{ margin: "10px 0 4px 24px" }}>
                      {completion?.inputs?.length ? (
                        <div><div className="ai-col-head">Inputs</div><ul>{completion.inputs.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      ) : null}
                      {completion?.outputs?.length ? (
                        <div><div className="ai-col-head">Outputs</div><ul>{completion.outputs.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      ) : null}
                      {completion?.tools_mentioned?.length ? (
                        <div><div className="ai-col-head">Tools</div><ul>{completion.tools_mentioned.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      ) : null}
                      {done.length ? (
                        <div><div className="ai-col-head">Definition of done</div><ul className="dod">{done.map((item) => <li key={item}>☐ {item}</li>)}</ul></div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {group.agents.map((agent) => {
              const manifestId = String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id);
              const entry = registryById.get(manifestId);
              const status = entry?.status ?? "draft";
              return (
                <div className="agentplan-candidate built" key={agent.id}>
                  <Icon name="robot" size={12} stroke="var(--green)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="agentplan-task">{agent.name}</div>
                    <div className="agentplan-meta"><span>{agent.task.label}</span></div>
                  </div>
                  {entry?.stale && <span className="tag yellow">needs re-review</span>}
                  <span className={"tag " + (status === "approved" || status === "deployed" ? "green" : status === "suspended" ? "" : "cyan")} style={status === "suspended" ? { color: "var(--red)", borderColor: "var(--red)" } : undefined}>{status}</span>
                  <RiskBadge level={agent.riskLevel} />
                  <button className="btn btn-sm" onClick={() => onOpenAgent(agent)}>Open <Icon name="arrow-right" size={10} /></button>
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
        <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
        Runtime and export format are chosen on the agent's manifest screen after approval — planning decides whether the agent should exist, under whose authority, with what boundary.
      </div>
    </div>
  );
}
