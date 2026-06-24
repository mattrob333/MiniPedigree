import { Icon } from "./Icon";
import type { SystemManifest, RiskFinding } from "@/types";

interface Props {
  system: SystemManifest;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  erp: "ERP",
  hris: "HRIS",
  crm: "CRM",
  finance: "Finance",
  identity: "Identity",
  collaboration: "Collaboration",
  data: "Data Platform",
  custom: "Custom",
  other: "Other",
};

const SENSITIVITY_ORDER = ["public", "internal", "confidential", "regulated"];

export function SystemDetailDrawer({ system, onClose }: Props) {
  const riskColor = (s: string): string => {
    switch (s) {
      case "critical": return "var(--red, #e53e3e)";
      case "high": return "var(--orange, #ed8936)";
      case "medium": return "var(--yellow, #ecc94b)";
      case "low": return "var(--green, #48bb78)";
      default: return "var(--muted, #a0aec0)";
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>
            <Icon name="monitor" size={16} /> {system.name}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          {/* Overview section */}
          <section className="drawer-section">
            <h4>System Overview</h4>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-label">ID</span>
                <span className="detail-value mono">{system.id}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Category</span>
                <span className="detail-value">{CATEGORY_LABELS[system.category] ?? system.category}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Owner</span>
                <span className="detail-value">{system.ownerPersonId || <span className="muted">Unassigned</span>}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  {system.soxInScope ? <span className="badge badge-sox">SOX in scope</span> : "Non-SOX"}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Data sensitivity</span>
                <span className="detail-value" style={{ color: riskColor(system.dataSensitivity) }}>
                  {system.dataSensitivity}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Integration</span>
                <span className="detail-value">{system.integrationStatus}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Created</span>
                <span className="detail-value">{new Date(system.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Updated</span>
                <span className="detail-value">{new Date(system.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </section>

          {/* Connections section */}
          <section className="drawer-section">
            <h4>Connections</h4>
            <div className="connection-cards">
              <div className="connection-card">
                <Icon name="users" size={14} />
                <span className="conn-count">{system.connectedHumanIds.length}</span>
                <span className="conn-label">Humans</span>
              </div>
              <div className="connection-card">
                <Icon name="robot" size={14} />
                <span className="conn-count">{system.connectedAgentIds.length}</span>
                <span className="conn-label">Agents</span>
              </div>
              <div className="connection-card">
                <Icon name="shield" size={14} />
                <span className="conn-count">{system.connectedControlIds.length}</span>
                <span className="conn-label">Controls</span>
              </div>
            </div>
            {system.connectedAgentIds.length === 0 && (
              <div className="empty-hint-section">
                <p className="empty-hint">No agents are connected to this system yet. Agents must be mapped to systems during the approval process to ensure proper governance.</p>
              </div>
            )}
          </section>

          {/* Risk findings */}
          {system.riskFindings.length > 0 && (
            <section className="drawer-section">
              <h4>Risk Findings ({system.riskFindings.length})</h4>
              {system.riskFindings.map((rf) => (
                <div key={rf.id} className="risk-finding-card" style={{ borderLeftColor: riskColor(rf.severity) }}>
                  <div className="risk-finding-header">
                    <span className="risk-severity" style={{ color: riskColor(rf.severity) }}>{rf.severity}</span>
                    <span className="risk-category">{rf.category}</span>
                  </div>
                  <p className="risk-description">{rf.plainEnglishDescription || rf.title}</p>
                </div>
              ))}
            </section>
          )}

          {/* Approval requirements */}
          {system.approvalRequirements.length > 0 && (
            <section className="drawer-section">
              <h4>Approval Gates ({system.approvalRequirements.length})</h4>
              <ul className="approval-list">
                {system.approvalRequirements.map((ar, i) => (
                  <li key={i} className={ar.met ? "gate-met" : "gate-pending"}>
                    <Icon name={ar.met ? "checkmark" : "warning"} size={12} />
                    <span>{ar.gate}</span>
                    {ar.approver && <span className="approver">— {ar.approver}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Empty risk message */}
          {system.riskFindings.length === 0 && system.soxInScope && (
            <section className="drawer-section">
              <h4>Risk Findings</h4>
              <p className="empty-hint">No risk findings reported. This is expected for well-governed systems. Run a risk assessment to identify potential issues.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
