import { useState } from "react";
import type { PedigreeState, Person, TaskItem } from "@/types";
import { Icon } from "./Icon";
import { BrandChip } from "./BrandLogo";
import { StatusBadge } from "./StatusBadge";
import { initials } from "@/lib/util";

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

interface SpreadsheetProps {
  people: Person[];
  pedigree: PedigreeState;
  department?: string;
  onOpenInput: () => void;
  onSwitchTab: (tab: string) => void;
  onExport: () => void;
  selectedId: string | null;
  onSelectRow: (id: string) => void;
}

export function Spreadsheet({ people, pedigree, department, onOpenInput, onSwitchTab, onExport, selectedId, onSelectRow }: SpreadsheetProps) {
  return (
    <div className="sheet-wrap" id="spreadsheet-pane">
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
        {/* Export + Map Responsibilities live in the global header; toolbar only switches view. */}
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
            <th>Responsibilities</th>
            <th>Delegatable Tasks</th>
            <th>Approval Required</th>
            <th>Not Delegatable</th>
            <th>Agent Candidates</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const ped = pedigree[p.id] ?? { responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [], status: "needs-discovery" as const };
            const mgr = people.find((x) => x.id === p.managerId);
            const respList = ped.responsibilities;
            const t = ped.tasks;
            const agents = ped.agents;
            return (
              <tr key={p.id} className={selectedId === p.id ? "selected" : ""} onClick={() => onSelectRow(p.id)}>
                <td className="row-index">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <div className="name">
                    <span className="avatar">{initials(p.name)}</span>
                    <div>
                      <div className="name-text">{p.name}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{p.email}</div>
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
                <td>
                  {respList.length === 0 ? <Empty /> : (
                    <div className="pill-list">
                      {respList.slice(0, 2).map((r) => <span key={r.id} className="tag cyan">{r.title}</span>)}
                      {respList.length > 2 && <span className="tag">+{respList.length - 2}</span>}
                    </div>
                  )}
                </td>
                <td><TaskCell list={t.delegatable} color="cyan" /></td>
                <td><TaskCell list={t.approval} color="yellow" /></td>
                <td><TaskCell list={t.not_delegatable} /></td>
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
                <td><StatusBadge status={ped.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
