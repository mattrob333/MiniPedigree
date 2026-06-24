import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { RiskFinding } from "@/types";
import { riskSummaryStats, filterRiskFindings, resolveRiskFinding, getRiskColor, getRiskLabel } from "@/lib/riskFindings";
import { demoWescoRiskFindings } from "@/lib/wescoDemoData";

interface Props {
  riskFindings?: RiskFinding[];
  onUpdateFinding?: (id: string, patch: Partial<RiskFinding>) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  orphaned_agent: "Orphaned Agents",
  sox_system_access: "SOX System Access",
  drift: "Drift",
  policy_violation: "Policy Violation",
  sod_conflict: "SOD Conflict",
};

export function RiskDashboard({ riskFindings, onUpdateFinding }: Props) {
  const actualFindings = riskFindings ?? demoWescoRiskFindings();
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => riskSummaryStats(actualFindings), [actualFindings]);

  const filtered = useMemo(() => {
    return filterRiskFindings(actualFindings, {
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
    });
  }, [actualFindings, severityFilter, categoryFilter, statusFilter]);

  const categories = useMemo(() => Object.keys(stats.byCategory).sort(), [stats.byCategory]);

  const handleResolve = (finding: RiskFinding) => {
    const resolved = resolveRiskFinding(finding);
    onUpdateFinding?.(finding.id, resolved);
    setExpandedId(null);
  };

  return (
    <div className="screen-panel risk-dashboard">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="warning" size={16} /> Risk Dashboard
          </h2>
          <span className="count">{stats.open} open / {stats.total} total</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="risk-summary-cards">
        <div className="risk-summary-card critical">
          <span className="risk-summary-count">{stats.critical}</span>
          <span className="risk-summary-label">Critical</span>
        </div>
        <div className="risk-summary-card high">
          <span className="risk-summary-count">{stats.high}</span>
          <span className="risk-summary-label">High</span>
        </div>
        <div className="risk-summary-card medium">
          <span className="risk-summary-count">{stats.medium}</span>
          <span className="risk-summary-label">Medium</span>
        </div>
        <div className="risk-summary-card low">
          <span className="risk-summary-count">{stats.low}</span>
          <span className="risk-summary-label">Low</span>
        </div>
        <div className="risk-summary-card open">
          <span className="risk-summary-count">{stats.open}</span>
          <span className="risk-summary-label">Open</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Severity</label>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Category</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="warning" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No risk findings</h3>
          {actualFindings.length === 0 ? (
            <>
              <p>Risk findings appear when governance issues are detected — orphaned agents, unreviewed SOX access, scope drift, or policy violations.</p>
              <p className="empty-hint">Why this matters: Risk findings are your early warning system for governance gaps that could lead to audit failures or security incidents.</p>
              <p className="empty-hint">What to do: Run the governance derivation pipeline to detect orphaned agents and drift findings, or create manual risk entries.</p>
            </>
          ) : (
            <>
              <p>No findings match the current filter criteria.</p>
              <button className="link-btn" onClick={() => { setSeverityFilter(""); setCategoryFilter(""); setStatusFilter(""); }}>
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Risk findings list */}
      {filtered.length > 0 && (
        <div className="risk-finding-list">
          {filtered.map((finding) => (
            <div
              key={finding.id}
              className={`risk-finding-item ${expandedId === finding.id ? "expanded" : ""} ${finding.status === "resolved" ? "resolved" : ""}`}
              onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            >
              <div className="risk-item-header">
                <span className="risk-severity-badge" style={{ borderLeftColor: getRiskColor(finding.severity) }}>
                  <span className="severity-text" style={{ color: getRiskColor(finding.severity) }}>
                    {getRiskLabel(finding.severity)}
                  </span>
                  <span className="risk-cat">{CATEGORY_LABELS[finding.category] ?? finding.category}</span>
                </span>
                <span className={`finding-status ${finding.status}`}>{finding.status}</span>
              </div>
              <div className="risk-item-title">{finding.title}</div>
              <div className="risk-item-desc">{finding.plainEnglishDescription}</div>

              {expandedId === finding.id && (
                <div className="risk-item-detail" onClick={(e) => e.stopPropagation()}>
                  <div className="risk-why-matters">
                    <span className="risk-detail-label">Why it matters</span>
                    <p>{finding.whyItMatters}</p>
                  </div>
                  <div className="risk-recommended-action">
                    <span className="risk-detail-label">Recommended action</span>
                    <p>{finding.recommendedAction}</p>
                  </div>
                  {finding.relatedAgentIds.length > 0 && (
                    <div className="risk-related">
                      <span className="risk-detail-label">Related agents</span>
                      <span className="related-tags">{finding.relatedAgentIds.join(", ")}</span>
                    </div>
                  )}
                  {finding.relatedSystemIds.length > 0 && (
                    <div className="risk-related">
                      <span className="risk-detail-label">Related systems</span>
                      <span className="related-tags">{finding.relatedSystemIds.join(", ")}</span>
                    </div>
                  )}
                  {finding.status === "open" && (
                    <button className="btn btn-sm" onClick={() => handleResolve(finding)}>
                      <Icon name="checkmark" size={11} /> Resolve
                    </button>
                  )}
                  {finding.status === "resolved" && finding.resolvedAt && (
                    <p className="muted" style={{ fontSize: 11 }}>
                      Resolved {new Date(finding.resolvedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
