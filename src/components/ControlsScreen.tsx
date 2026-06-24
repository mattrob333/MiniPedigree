import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ControlDetailDrawer } from "./ControlDetailDrawer";
import type { ControlManifest, SystemManifest } from "@/types";
import { filterControlsBySox, filterControlsBySystem, createControl } from "@/lib/controls";
import { demoWescoControls } from "@/lib/wescoDemoData";

interface Props {
  controls?: ControlManifest[];
  systems?: SystemManifest[];
  onAddControl?: (control: ControlManifest) => void;
  onUpdateControl?: (id: string, patch: Partial<ControlManifest>) => void;
}

const STATUS_ORDER = ["active", "draft", "retired"] as const;
const FREQUENCY_LABELS: Record<string, string> = {
  ad_hoc: "Ad hoc",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};
const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  policy_document: "Policy Doc",
  sod_document: "SOD Doc",
  import: "Import",
};

export function ControlsScreen({
  controls,
  systems = [],
  onAddControl,
  onUpdateControl,
}: Props) {
  const actualControls = controls ?? demoWescoControls();
  const [search, setSearch] = useState("");
  const [soxOnly, setSoxOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [selectedControl, setSelectedControl] = useState<ControlManifest | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newControlName, setNewControlName] = useState("");

  const systemOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const c of actualControls) {
      for (const sid of c.systemIds) ids.add(sid);
    }
    for (const s of systems) ids.add(s.id);
    return Array.from(ids).sort();
  }, [actualControls, systems]);

  const systemNameLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of systems) map[s.id] = s.name;
    for (const c of actualControls) {
      for (const sid of c.systemIds) {
        if (!map[sid]) map[sid] = sid;
      }
    }
    return map;
  }, [actualControls, systems]);

  const filtered = useMemo(() => {
    let result = filterControlsBySox(actualControls, soxOnly);
    if (systemFilter) {
      result = filterControlsBySystem(result, systemFilter);
    }
    if (statusFilter) {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.controlId.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          c.process.toLowerCase().includes(q) ||
          c.ownerPersonId.toLowerCase().includes(q),
      );
    }
    return result;
  }, [actualControls, search, soxOnly, systemFilter, statusFilter]);

  const handleCreate = () => {
    if (!newControlName.trim()) return;
    const ctrl = createControl({
      name: newControlName.trim(),
      soxRelevant: false,
      status: "draft",
      source: "manual",
    });
    onAddControl?.(ctrl);
    setNewControlName("");
    setShowCreateForm(false);
  };

  return (
    <div className="screen-panel controls-screen">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="shield" size={16} /> Controls
          </h2>
          <span className="count">{filtered.length} of {actualControls.length} controls</span>
          <div className="panel-actions">
            <button className="btn btn-sm" onClick={() => setShowCreateForm((p) => !p)}>
              <Icon name="plus" size={12} /> Add control
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Control name, ID, process..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>System</label>
            <select value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
              <option value="">All systems</option>
              {systemOptions.map((sid) => (
                <option key={sid} value={sid}>{systemNameLookup[sid] ?? sid}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="filter-group checkbox-group">
            <label>
              <input type="checkbox" checked={soxOnly} onChange={(e) => setSoxOnly(e.target.checked)} />
              SOX relevant only
            </label>
          </div>
        </div>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="inline-form">
          <div className="filter-row">
            <div className="filter-group" style={{ flex: 1 }}>
              <label>Control name</label>
              <input
                type="text"
                placeholder="e.g. Vendor Payment Processing Controls"
                value={newControlName}
                onChange={(e) => setNewControlName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreateForm(false); }}
              />
            </div>
            <div className="filter-group" style={{ alignSelf: "flex-end" }}>
              <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={!newControlName.trim()}>
                Create
              </button>
              <button className="btn btn-sm" onClick={() => setShowCreateForm(false)} style={{ marginLeft: 6 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="shield" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No controls found</h3>
          {actualControls.length === 0 ? (
            <>
              <p>No controls have been registered yet. Controls define the policies and checks governing agent behavior, especially for SOX-relevant systems.</p>
              <p className="empty-hint">Why this matters: Without controls, agent actions can't be mapped to compliance requirements. SOX auditors expect to see a control framework.</p>
              <p className="empty-hint">What to do: Create controls from policy documents, import from SOD matrices, or add them manually using the "Add control" button above.</p>
            </>
          ) : (
            <>
              <p>No controls match the current filter criteria.</p>
              <button className="link-btn" onClick={() => { setSearch(""); setSoxOnly(false); setSystemFilter(""); setStatusFilter(""); }}>
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Controls list */}
      {filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="agent-table">
            <thead>
              <tr>
                <th>Control ID</th>
                <th>Name</th>
                <th>Process</th>
                <th>Owner</th>
                <th>SOX</th>
                <th>Frequency</th>
                <th>Status</th>
                <th>Systems</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ctrl) => (
                <tr
                  key={ctrl.id}
                  onClick={() => setSelectedControl(ctrl)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono" style={{ fontSize: 12 }}>{ctrl.controlId}</td>
                  <td className="cell-agent-name">
                    <span className="agent-name">{ctrl.name}</span>
                  </td>
                  <td>{ctrl.process}</td>
                  <td>{ctrl.ownerPersonId}</td>
                  <td>
                    {ctrl.soxRelevant
                      ? <span className="badge badge-sox">SOX</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td>{FREQUENCY_LABELS[ctrl.frequency] ?? ctrl.frequency}</td>
                  <td>
                    <span className={`badge badge-${ctrl.status}`}>{ctrl.status}</span>
                  </td>
                  <td>
                    {ctrl.systemIds.length > 0
                      ? ctrl.systemIds.map((sid) => systemNameLookup[sid] ?? sid).join(", ")
                      : <span className="muted">None</span>}
                  </td>
                  <td className="cell-action">
                    <Icon name="chevron-right" size={14} stroke="var(--muted, #a0aec0)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selectedControl && (
        <ControlDetailDrawer
          control={selectedControl}
          systemNameLookup={systemNameLookup}
          onClose={() => setSelectedControl(null)}
          onUpdate={(patch) => {
            onUpdateControl?.(selectedControl.id, patch);
            setSelectedControl((prev) => prev ? { ...prev, ...patch } : null);
          }}
        />
      )}
    </div>
  );
}
