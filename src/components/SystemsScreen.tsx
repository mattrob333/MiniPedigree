import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { SystemDetailDrawer } from "./SystemDetailDrawer";
import type { SystemManifest } from "@/types";
import { filterSystemsBySox } from "@/lib/systems";
import { demoWescoSystems } from "@/lib/wescoDemoData";

const SYSTEM_CATEGORIES = ["erp", "hris", "crm", "finance", "identity", "collaboration", "data", "custom", "other"] as const;

interface Props {
  systems?: SystemManifest[];
}

const CATEGORY_ICONS: Record<string, string> = {
  erp: "spreadsheet",
  hris: "users",
  crm: "network",
  finance: "spreadsheet",
  identity: "lock",
  collaboration: "transcript",
  data: "doc",
};

export function SystemsScreen({ systems }: Props) {
  const actualSystems = systems ?? demoWescoSystems();
  const [search, setSearch] = useState("");
  const [soxOnly, setSoxOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<SystemManifest | null>(null);

  const filtered = useMemo(() => {
    let result = filterSystemsBySox(actualSystems, soxOnly);
    if (categoryFilter) {
      result = result.filter((s) => s.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.ownerPersonId && s.ownerPersonId.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [actualSystems, search, soxOnly, categoryFilter]);

  const dataSensitivityColor = (s: string): string => {
    switch (s) {
      case "regulated": return "var(--red, #e53e3e)";
      case "confidential": return "var(--orange, #ed8936)";
      case "internal": return "var(--yellow, #ecc94b)";
      case "public": return "var(--green, #48bb78)";
      default: return "var(--muted, #a0aec0)";
    }
  };

  return (
    <div className="screen-panel systems-screen">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="monitor" size={16} /> Systems
          </h2>
          <span className="count">{filtered.length} of {actualSystems.length} systems</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="System name, owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {SYSTEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="filter-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={soxOnly}
                onChange={(e) => setSoxOnly(e.target.checked)}
              />
              SOX in scope only
            </label>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="monitor" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No systems found</h3>
          {actualSystems.length === 0 ? (
            <>
              <p>No systems have been registered yet. Systems are the IT applications, databases, and platforms that agents interact with.</p>
              <p className="empty-hint">Why this matters: Every SOX-relevant system represents a risk surface. Unregistered systems can't be governed or audited.</p>
              <p className="empty-hint">What to do: Register your ERP, HRIS, CRM, and other critical systems through the company context or add them manually.</p>
            </>
          ) : (
            <>
              <p>No systems match the current filter criteria.</p>
              <button className="link-btn" onClick={() => { setSearch(""); setSoxOnly(false); setCategoryFilter(""); }}>
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}

      {/* System cards */}
      <div className="system-cards">
        {filtered.map((sys) => (
          <div
            key={sys.id}
            className="system-card"
            onClick={() => setSelectedSystem(sys)}
          >
            <div className="system-card-header">
              <Icon name={CATEGORY_ICONS[sys.category] ?? "monitor"} size={18} />
              <div className="system-card-title">
                <span className="system-name">{sys.name}</span>
                <span className="system-category">{sys.category.toUpperCase()}</span>
              </div>
            </div>
            <div className="system-card-body">
              <div className="system-detail-row">
                <span className="detail-label">Data sensitivity</span>
                <span className="detail-value" style={{ color: dataSensitivityColor(sys.dataSensitivity) }}>
                  {sys.dataSensitivity}
                </span>
              </div>
              <div className="system-detail-row">
                <span className="detail-label">Integration</span>
                <span className="detail-value">{sys.integrationStatus}</span>
              </div>
              <div className="system-detail-row">
                <span className="detail-label">Humans connected</span>
                <span className="detail-value">{sys.connectedHumanIds.length}</span>
              </div>
              <div className="system-detail-row">
                <span className="detail-label">Agents connected</span>
                <span className="detail-value">{sys.connectedAgentIds.length}</span>
              </div>
            </div>
            <div className="system-card-footer">
              {sys.soxInScope && <span className="badge badge-sox">SOX</span>}
              {sys.ownerPersonId && <span className="system-owner">Owner: {sys.ownerPersonId}</span>}
              <Icon name="chevron-right" size={12} className="card-arrow" />
            </div>
          </div>
        ))}
      </div>

      {/* Detail drawer */}
      {selectedSystem && (
        <SystemDetailDrawer
          system={selectedSystem}
          onClose={() => setSelectedSystem(null)}
        />
      )}
    </div>
  );
}
