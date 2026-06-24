import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { ExternalAgentRecord, Person } from "@/types";
import {
  approveExternalAgent,
  restrictExternalAgent,
  sandboxExternalAgent,
  rejectExternalAgent,
  classifyExternalAgent,
  createExternalAgent,
} from "@/lib/externalAgents";

interface Props {
  externalAgents: ExternalAgentRecord[];
  people: Person[];
  onAddAgent: (agent: ExternalAgentRecord) => void;
  onUpdateAgent: (id: string, patch: Partial<ExternalAgentRecord>) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  copilot: "GitHub Copilot",
  claude_project: "Claude Project",
  gpt: "Custom GPT",
  vendor_bot: "Vendor Bot",
  legacy_automation: "Legacy Automation",
  service_account: "Service Account",
};

const STATUS_LABELS: Record<string, string> = {
  imported_pending_review: "Pending Review",
  approved: "Approved",
  restricted: "Restricted",
  sandboxed: "Sandboxed",
  rejected: "Rejected",
  archived: "Archived",
};

export function AgentCustomsScreen({
  externalAgents,
  people,
  onAddAgent,
  onUpdateAgent,
}: Props) {
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showImportForm, setShowImportForm] = useState(false);
  const [importName, setImportName] = useState("");
  const [importSource, setImportSource] = useState<string>("manual");
  const [importSystems, setImportSystems] = useState("");
  const [importPurpose, setImportPurpose] = useState("");

  const knownSystemNames = useMemo(
    () => people.flatMap((p) => p.tools ?? []).filter(Boolean),
    [people],
  );

  const filtered = useMemo(() => {
    let result = externalAgents;
    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (riskFilter) {
      result = result.filter((a) => a.riskTier === riskFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.purpose?.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q),
      );
    }
    return result;
  }, [externalAgents, statusFilter, riskFilter, search]);

  const handleImport = () => {
    if (!importName.trim()) return;
    const systems = importSystems
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const agent = createExternalAgent({
      name: importName.trim(),
      source: importSource as ExternalAgentRecord["source"],
      systems,
      purpose: importPurpose.trim() || undefined,
    });
    onAddAgent(agent);
    setImportName("");
    setImportSource("manual");
    setImportSystems("");
    setImportPurpose("");
    setShowImportForm(false);
  };

  const handleAction = (
    id: string,
    action: "approve" | "restrict" | "sandbox" | "reject",
  ) => {
    const agent = externalAgents.find((a) => a.id === id);
    if (!agent) return;
    let updated: ExternalAgentRecord;
    switch (action) {
      case "approve":
        updated = approveExternalAgent(agent);
        break;
      case "restrict":
        updated = restrictExternalAgent(agent);
        break;
      case "sandbox":
        updated = sandboxExternalAgent(agent);
        break;
      case "reject":
        updated = rejectExternalAgent(agent);
        break;
    }
    onUpdateAgent(id, updated);
  };

  const statuses = useMemo(
    () => Array.from(new Set(externalAgents.map((a) => a.status))).sort(),
    [externalAgents],
  );

  return (
    <div className="screen-panel agent-customs">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="external" size={16} /> Agent Customs
          </h2>
          <span className="count">{externalAgents.length} agents</span>
          <div className="panel-actions">
            <button
              className="btn btn-sm"
              onClick={() => setShowImportForm(!showImportForm)}
            >
              <Icon name="plus" size={12} /> Import Agent
            </button>
          </div>
        </div>
      </div>

      {/* Import form */}
      {showImportForm && (
        <div className="customs-import-form">
          <div className="form-row">
            <div className="form-group">
              <label>Agent Name *</label>
              <input
                type="text"
                placeholder="e.g. Invoice Scanner Bot"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Source</label>
              <select
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
              >
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Systems (comma-separated)</label>
              <input
                type="text"
                placeholder="oracle, salesforce, workday"
                value={importSystems}
                onChange={(e) => setImportSystems(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Purpose / Description</label>
              <input
                type="text"
                placeholder="What this agent does"
                value={importPurpose}
                onChange={(e) => setImportPurpose(e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={!importName.trim()}
              onClick={handleImport}
            >
              <Icon name="checkmark" size={11} /> Import
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Name, source, purpose..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Risk</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="">All risks</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="external" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No external agents found</h3>
          {externalAgents.length === 0 ? (
            <>
              <p>
                External agents are AI assistants, vendor bots, service accounts, and
                custom GPTs that operate outside the formal agent registry but may
                access enterprise systems.
              </p>
              <p className="empty-hint">
                Why this matters: Unmonitored external agents can access sensitive
                systems without governance oversight, creating compliance and
                security risks.
              </p>
              <p className="empty-hint">
                What to do: Use the Import Agent button above to register known
                external agents from Copilot, Claude projects, GPTs, vendor bots,
                or legacy automation.
              </p>
            </>
          ) : (
            <>
              <p>No agents match the current filter criteria.</p>
              <button
                className="link-btn"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setRiskFilter("");
                }}
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Agent cards */}
      {filtered.length > 0 && (
        <div className="customs-agent-list">
          {filtered.map((agent) => {
            const { flags } = classifyExternalAgent(agent, knownSystemNames);
            return (
              <div
                key={agent.id}
                className={`customs-agent-card status-${agent.status}`}
              >
                <div className="customs-agent-header">
                  <div className="customs-agent-info">
                    <span className="customs-agent-name">{agent.name}</span>
                    <span className="customs-agent-source">
                      {SOURCE_LABELS[agent.source] ?? agent.source}
                    </span>
                  </div>
                  <span
                    className={`badge badge-${agent.status === "approved" ? "success" : agent.status === "rejected" ? "danger" : agent.status === "restricted" ? "warning" : agent.status === "sandboxed" ? "info" : "neutral"}`}
                  >
                    {STATUS_LABELS[agent.status] ?? agent.status}
                  </span>
                </div>

                {agent.purpose && (
                  <p className="customs-agent-purpose">{agent.purpose}</p>
                )}

                <div className="customs-agent-meta">
                  {agent.systems.length > 0 && (
                    <span className="customs-systems">
                      <Icon name="monitor" size={10} /> {agent.systems.join(", ")}
                    </span>
                  )}
                  {agent.tools.length > 0 && (
                    <span className="customs-tools">
                      <Icon name="tool" size={10} /> {agent.tools.join(", ")}
                    </span>
                  )}
                  <span
                    className={`risk-tag risk-${agent.riskTier}`}
                  >
                    {agent.riskTier}
                  </span>
                  {agent.soxRelevant && (
                    <span className="badge badge-sox">SOX</span>
                  )}
                </div>

                {/* Classification flags */}
                {flags.length > 0 && (
                  <div className="customs-flags">
                    {flags.map((flag) => (
                      <span key={flag} className="flag-tag">
                        {flag.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                {agent.status === "imported_pending_review" && (
                  <div className="customs-actions">
                    <button
                      className="btn btn-xs btn-success"
                      onClick={() => handleAction(agent.id, "approve")}
                      title="Approve this agent"
                    >
                      <Icon name="checkmark" size={10} /> Approve
                    </button>
                    <button
                      className="btn btn-xs btn-warning"
                      onClick={() => handleAction(agent.id, "restrict")}
                      title="Restrict this agent"
                    >
                      <Icon name="lock" size={10} /> Restrict
                    </button>
                    <button
                      className="btn btn-xs btn-info"
                      onClick={() => handleAction(agent.id, "sandbox")}
                      title="Sandbox this agent"
                    >
                      <Icon name="box" size={10} /> Sandbox
                    </button>
                    <button
                      className="btn btn-xs btn-danger"
                      onClick={() => handleAction(agent.id, "reject")}
                      title="Reject this agent"
                    >
                      <Icon name="close" size={10} /> Reject
                    </button>
                  </div>
                )}
                {agent.status === "restricted" && (
                  <div className="customs-actions">
                    <button
                      className="btn btn-xs"
                      onClick={() => handleAction(agent.id, "approve")}
                    >
                      <Icon name="checkmark" size={10} /> Upgrade to Approved
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
