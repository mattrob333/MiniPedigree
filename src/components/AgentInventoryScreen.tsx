import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ProvenanceBadge } from "./ProvenanceBadge";
import type { FlattenedAgentEntry, AgentFilters } from "@/lib/agentInventory";
import { flattenAgents, filterAgents, sortAgents } from "@/lib/agentInventory";
import type {
  PedigreeState,
  Person,
  AgentRegistryEntry,
  AgentBirthCertificate,
  SystemManifest,
  ControlManifest,
  RiskFinding,
  ExternalAgentRecord,
} from "@/types";

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  birthCertificates?: AgentBirthCertificate[];
  systems?: SystemManifest[];
  controls?: ControlManifest[];
  riskFindings?: RiskFinding[];
  externalAgents?: ExternalAgentRecord[];
  onOpenAgent?: (agent: FlattenedAgentEntry) => void;
  onTransferAgent?: (agent: FlattenedAgentEntry) => void;
}

export function AgentInventoryScreen({
  people,
  pedigree,
  registry,
  birthCertificates = [],
  systems = [],
  controls = [],
  riskFindings = [],
  externalAgents = [],
  onOpenAgent,
  onTransferAgent,
}: Props) {
  const [filters, setFilters] = useState<AgentFilters>({});
  const [sortBy, setSortBy] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const flattened = useMemo(
    () =>
      flattenAgents({
        people,
        pedigree,
        registry,
        birthCertificates,
        systems,
        controls,
        riskFindings,
        externalAgents,
      }),
    [people, pedigree, registry, birthCertificates, systems, controls, riskFindings, externalAgents],
  );

  const filtered = useMemo(() => {
    let result = filterAgents(flattened, filters);
    result = sortAgents(result, sortBy, sortAsc);
    return result;
  }, [flattened, filters, sortBy, sortAsc]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>();
    for (const agent of flattened) {
      if (agent.person.department) depts.add(agent.person.department);
    }
    return Array.from(depts).sort();
  }, [flattened]);

  const uniqueSystems = useMemo(() => {
    const sys = new Set<string>();
    for (const agent of flattened) {
      for (const name of agent.systemNames ?? []) sys.add(name);
    }
    return Array.from(sys).sort();
  }, [flattened]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  const sortIndicator = (field: string) => {
    if (sortBy !== field) return null;
    return <span className="sort-arrow">{sortAsc ? " ▲" : " ▼"}</span>;
  };

  const riskColor = (level?: string): string => {
    switch (level) {
      case "critical": return "var(--red, #e53e3e)";
      case "high": return "var(--orange, #ed8936)";
      case "medium": return "var(--yellow, #ecc94b)";
      case "low": return "var(--green, #48bb78)";
      default: return "var(--muted, #a0aec0)";
    }
  };

  return (
    <div className="screen-panel agent-inventory-screen">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="robot" size={16} /> Agent Inventory
          </h2>
          <span className="count">{filtered.length} of {flattened.length} agents</span>
          <span className="filter-count">
            {filters.search || filters.systemName || filters.soxOnly || filters.riskLevel || filters.orphanedOnly || filters.staleOnly
              ? " (filtered)" : ""}
          </span>
        </div>
        <div className="panel-actions">
          <button className="icon-btn" title="Toggle filters" onClick={() => setShowFilterBar((p) => !p)}>
            <Icon name="filter" size={14} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilterBar && (
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group">
              <label>Search</label>
              <input
                type="text"
                placeholder="Agent, owner, task..."
                value={filters.search ?? ""}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value || undefined }))}
              />
            </div>
            <div className="filter-group">
              <label>System</label>
              <select
                value={filters.systemName ?? ""}
                onChange={(e) => setFilters((p) => ({ ...p, systemName: e.target.value || undefined }))}
              >
                <option value="">All systems</option>
                {uniqueSystems.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Department</label>
              <select
                value={filters.department ?? ""}
                onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value || undefined }))}
              >
                <option value="">All departments</option>
                {uniqueDepartments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Risk level</label>
              <select
                value={filters.riskLevel ?? ""}
                onChange={(e) => setFilters((p) => ({ ...p, riskLevel: e.target.value || undefined }))}
              >
                <option value="">Any</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="filter-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={filters.soxOnly ?? false}
                  onChange={(e) => setFilters((p) => ({ ...p, soxOnly: e.target.checked || undefined }))}
                />
                SOX only
              </label>
            </div>
            <div className="filter-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={filters.orphanedOnly ?? false}
                  onChange={(e) => setFilters((p) => ({ ...p, orphanedOnly: e.target.checked || undefined }))}
                />
                Orphaned
              </label>
            </div>
            <div className="filter-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={filters.staleOnly ?? false}
                  onChange={(e) => setFilters((p) => ({ ...p, staleOnly: e.target.checked || undefined }))}
                />
                Stale
              </label>
            </div>
          </div>
          {(filters.search || filters.systemName || filters.soxOnly || filters.riskLevel || filters.orphanedOnly || filters.staleOnly) && (
            <button className="link-btn" onClick={() => setFilters({})}>Clear all filters</button>
          )}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="robot" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No agents found</h3>
          {flattened.length === 0 ? (
            <>
              <p>No agents have been created or imported yet. Agents are generated from responsibilities during the discovery and mapping process.</p>
              <p className="empty-hint">Why this matters: Every agent needs an accountable human owner and a clear purpose. Without agents, there's nothing to govern.</p>
              <p className="empty-hint">What to do: Start by mapping your organization's roles and responsibilities, then generate agents from delegatable tasks.</p>
            </>
          ) : (
            <>
              <p>No agents match the current filter criteria.</p>
              <button className="link-btn" onClick={() => setFilters({})}>Clear all filters</button>
            </>
          )}
        </div>
      )}

      {/* Agent table */}
      {filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="agent-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("name")}>
                  Agent Name{sortIndicator("name")}
                </th>
                <th className="sortable" onClick={() => toggleSort("personName")}>
                  Owner{sortIndicator("personName")}
                </th>
                <th className="sortable" onClick={() => toggleSort("department")}>
                  Department{sortIndicator("department")}
                </th>
                <th>Systems</th>
                <th className="sortable" onClick={() => toggleSort("riskLevel")}>
                  Risk{sortIndicator("riskLevel")}
                </th>
                <th>SOX</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent) => (
                <tr
                  key={agent.id}
                  className={agent.orphaned ? "row-orphaned" : agent.stale ? "row-stale" : ""}
                  onClick={() => onOpenAgent?.(agent)}
                  style={{ cursor: onOpenAgent ? "pointer" : undefined }}
                >
                  <td className="cell-agent-name">
                    <span className="agent-name">{agent.name}</span>
                    <span className="agent-source-tag">{agent.source === "imported" ? "imported" : "generated"}</span>
                  </td>
                  <td className="cell-owner">
                    <span className="owner-name">{agent.person.name || "—"}</span>
                    {agent.orphaned && <span className="badge badge-orphaned">Orphaned</span>}
                  </td>
                  <td className="cell-dept">{agent.person.department || "—"}</td>
                  <td className="cell-systems">
                    {agent.systemNames && agent.systemNames.length > 0
                      ? agent.systemNames.join(", ")
                      : <span className="muted">None</span>}
                  </td>
                  <td className="cell-risk">
                    {agent.riskLevel ? (
                      <span className="risk-badge" style={{ color: riskColor(agent.riskLevel) }}>
                        {agent.riskLevel}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="cell-sox">
                    {agent.task.soxRelevant
                      ? <span className="badge badge-sox">SOX</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="cell-status">
                    {agent.registryStatus ? (
                      <span className={`badge badge-${agent.registryStatus}`}>{agent.registryStatus}</span>
                    ) : agent.source === "generated" ? (
                      <span className="badge badge-draft">draft</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="cell-action">
                    <div className="cell-action-btns">
                      {onTransferAgent && agent.registryEntry && (
                        <button
                          className="btn btn-xs btn-ghost"
                          title="Transfer ownership"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTransferAgent(agent);
                          }}
                        >
                          <Icon name="transfer" size={11} />
                        </button>
                      )}
                      <Icon name="chevron-right" size={14} stroke="var(--muted, #a0aec0)" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
