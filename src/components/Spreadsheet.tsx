import { useMemo, useState } from "react";
import type { DiscoveryPlan, PedigreeState, Person, TaskItem } from "@/types";
import { Icon } from "./Icon";
import { BrandChip } from "./BrandLogo";
import { StatusBadge } from "./StatusBadge";
import { SESSION_LABEL, isMapped } from "@/lib/sessions";
import { initials } from "@/lib/util";
import { OrgMapMini } from "./OrgMapMini";

function Empty() {
  return <span className="empty">Not mapped yet</span>;
}

// Collapsed by default (2 chips + "+N"); click "+N" to expand the cell (P2.3).
function TaskCell({ list, color }: { list: TaskItem[]; color?: string }) {
  const [open, setOpen] = useState(false);
  if (!list || list.length === 0) return <Empty />;
  const max = 2;
  const shown = open ? list : list.slice(0, max);
  const extra = list.length - max;
  return (
    <div className="pill-list">
      {shown.map((t, i) => (
        <span key={i} className={"tag " + (color || "")}>{t.label}</span>
      ))}
      {!open && extra > 0 && (
        <span className="tag" style={{ cursor: "pointer" }} title="Expand" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>+{extra}</span>
      )}
      {open && list.length > max && (
        <span className="tag" style={{ cursor: "pointer" }} title="Collapse" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>− less</span>
      )}
    </div>
  );
}

interface RowQuality {
  issues: string[];
}

function rowQuality(p: Person, people: Person[]): RowQuality {
  const issues: string[] = [];
  if (!p.email) issues.push("missing email");
  if (!p.title || p.title === "—") issues.push("missing title");
  if (!p.department || p.department === "—") issues.push("missing department");
  if (!p.tools.length) issues.push("no known tools");
  if (p.managerEmail && !p.managerId) issues.push(`manager "${p.managerEmail}" not found`);
  void people;
  return { issues };
}

interface SpreadsheetProps {
  people: Person[];
  pedigree: PedigreeState;
  department?: string;
  rosterValidated: boolean;
  onValidateRoster: () => void;
  plan: DiscoveryPlan | null;
  onOpenDiscovery: () => void;
  onSwitchTab: (tab: string) => void;
  onExport: () => void;
  selectedId: string | null;
  onSelectRow: (id: string) => void;
}

export function Spreadsheet({ people, pedigree, department, rosterValidated, onValidateRoster, plan, onOpenDiscovery, onSwitchTab, onExport, selectedId, onSelectRow }: SpreadsheetProps) {
  // Progressive disclosure: future-workflow columns appear only once they
  // hold real data — never a wall of "Not mapped yet".
  const hasResponsibilities = useMemo(
    () => people.some((p) => (pedigree[p.id]?.responsibilities.length ?? 0) > 0),
    [people, pedigree],
  );
  const hasTasks = useMemo(
    () => people.some((p) => {
      const t = pedigree[p.id]?.tasks;
      return Boolean(t && (t.delegatable.length || t.approval.length || t.not_delegatable.length));
    }),
    [people, pedigree],
  );
  const hasAgents = useMemo(
    () => people.some((p) => (pedigree[p.id]?.agents.length ?? 0) > 0),
    [people, pedigree],
  );

  // Sessions start from the Discovery page, not from every table row — rows
  // show which planned session covers each person instead.
  const sessionFor = useMemo(() => {
    const out = new Map<string, { label: string; applied: boolean }>();
    for (const session of plan?.sessions ?? []) {
      const applied = session.status === "applied";
      for (const id of session.scope_ids) {
        const existing = out.get(id);
        if (!existing || (existing.applied && !applied)) {
          out.set(id, { label: SESSION_LABEL[session.type], applied });
        }
      }
    }
    return out;
  }, [plan]);

  const quality = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, rowQuality(p, people)]));
    const issueCount = [...byId.values()].filter((q) => q.issues.length > 0).length;
    const roots = people.filter((p) => !p.managerId).length;
    return { byId, issueCount, roots };
  }, [people]);

  return (
    <div className="sheet-wrap" id="spreadsheet-pane">
      {/* Validation summary: the first decision is "did the roster import
          correctly enough to run discovery?" */}
      {!rosterValidated && people.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <OrgMapMini people={people} pedigree={pedigree} height={300} />
          <div className="org-mini-narrator">{people.length} people · {new Set(people.map((p) => p.department).filter(Boolean)).size} departments · reporting lines resolved</div>
        </div>
      )}
      {!rosterValidated && people.length > 0 && (
        <div className="roster-validation">
          <div className="roster-validation-copy">
            <Icon name={quality.issueCount ? "warning" : "check-circle"} size={14} stroke={quality.issueCount ? "var(--yellow)" : "var(--green)"} />
            <div>
              <div className="roster-validation-title">
                {quality.issueCount
                  ? `${quality.issueCount} of ${people.length} people have import issues`
                  : `${people.length} people imported cleanly`}
              </div>
              <div className="roster-validation-sub">
                {quality.roots > 1 ? `${quality.roots} people have no manager (multiple roots). ` : ""}
                Check names, manager links, and departments — discovery sessions are planned from this data.
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={onValidateRoster}>
            <Icon name="checkmark" size={12} /> Roster looks right — continue
          </button>
        </div>
      )}

      <div className="sheet-toolbar">
        <span className="filter-chip">
          <Icon name="filter" size={11} /> Department:{" "}
          <span className="mono" style={{ color: "var(--text-1)" }}>{department || "All"}</span>
        </span>
        <span className="filter-chip">
          <Icon name="sort" size={11} /> Sort:{" "}
          <span className="mono" style={{ color: "var(--text-1)" }}>Manager → Direct reports</span>
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={onExport}><Icon name="download" size={12} /> Export CSV</button>
        <button className="btn btn-sm" onClick={() => onSwitchTab("orgmap")}>
          <Icon name="network" size={12} /> Org Map
        </button>
      </div>

      <table className="sheet">
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>Name</th>
            <th>Title</th>
            <th>Manager</th>
            <th>Department</th>
            <th>Known Tools</th>
            {!rosterValidated && <th>Data Quality</th>}
            {hasResponsibilities && <th>Responsibilities</th>}
            {hasTasks && <th>Delegation Candidates</th>}
            {hasTasks && <th>Approval Required</th>}
            {hasTasks && <th>Human-only / Blocked</th>}
            {hasAgents && <th>Agents</th>}
            <th>Status</th>
            <th>Next Action</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const ped = pedigree[p.id] ?? { responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [], status: "needs-discovery" as const };
            const mgr = people.find((x) => x.id === p.managerId);
            const respList = ped.responsibilities;
            const t = ped.tasks;
            const agents = ped.agents;
            const q = quality.byId.get(p.id);
            const mapped = isMapped(ped.status);
            return (
              <tr key={p.id} className={selectedId === p.id ? "selected" : ""} onClick={() => onSelectRow(p.id)}>
                <td className="row-index">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <div className="name">
                    <span className="avatar">{initials(p.name)}</span>
                    <div>
                      <div className="name-text">{p.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>{p.email}</div>
                    </div>
                  </div>
                </td>
                <td>{p.title}</td>
                <td>{mgr ? mgr.name : <span className="dim">—</span>}</td>
                <td><span className="mono" style={{ color: "var(--text-3)" }}>{p.department}</span></td>
                <td>
                  <div className="pill-list">
                    {p.tools.slice(0, 3).map((tool) => <BrandChip key={tool} name={tool}>{tool}</BrandChip>)}
                    {p.tools.length > 3 && <span className="tag">+{p.tools.length - 3}</span>}
                  </div>
                </td>
                {!rosterValidated && (
                  <td>
                    {q?.issues.length
                      ? <span className="tag yellow" title={q.issues.join("; ")}>{q.issues.length} issue{q.issues.length === 1 ? "" : "s"}</span>
                      : <span className="tag" style={{ color: "var(--green)" }}>clean</span>}
                  </td>
                )}
                {hasResponsibilities && (
                  <td>
                    {respList.length === 0 ? <Empty /> : (
                      <div className="pill-list">
                        {respList.slice(0, 2).map((r) => <span key={r.id} className="tag cyan">{r.title}</span>)}
                        {respList.length > 2 && <span className="tag">+{respList.length - 2}</span>}
                      </div>
                    )}
                  </td>
                )}
                {hasTasks && <td><TaskCell list={t.delegatable} color="cyan" /></td>}
                {hasTasks && <td><TaskCell list={t.approval} color="yellow" /></td>}
                {hasTasks && <td><TaskCell list={t.not_delegatable} /></td>}
                {hasAgents && (
                  <td>
                    {agents.length === 0 ? <Empty /> : (
                      <div className="pill-list">
                        {agents.map((a) => (
                          <span key={a.id} className="tag green">
                            <Icon name="robot" size={10} />
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                )}
                <td><StatusBadge status={ped.status} /></td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {(() => {
                      const membership = sessionFor.get(p.id);
                      if (mapped) return <span className="tag" style={{ color: "var(--green)" }}>mapped</span>;
                      if (membership && !membership.applied) {
                        return (
                          <button className="tag session-chip" title="Covered by a planned session — open the Discovery page to run it" onClick={(e) => { e.stopPropagation(); onOpenDiscovery(); }}>
                            In {membership.label}
                          </button>
                        );
                      }
                      return <span className="tag yellow">Needs discovery</span>;
                    })()}
                    <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onSelectRow(p.id); }}>View</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
