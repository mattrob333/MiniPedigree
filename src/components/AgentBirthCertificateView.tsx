import { useMemo } from "react";
import { Icon } from "./Icon";
import type { AgentBirthCertificate } from "@/types";
import { exportBirthCertificateJson, exportBirthCertificateHtml } from "@/lib/birthCertificate";

interface Props {
  certificate: AgentBirthCertificate;
  onClose?: () => void;
}

export function AgentBirthCertificateView({ certificate, onClose }: Props) {
  const handleExportJson = () => {
    const json = exportBirthCertificateJson(certificate);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `birth-certificate-${certificate.agentName.replace(/\s+/g, "-")}-${certificate.manifestVersion}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    const html = exportBirthCertificateHtml(certificate);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `birth-certificate-${certificate.agentName.replace(/\s+/g, "-")}-${certificate.manifestVersion}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <div className="birth-certificate-view">
      {/* Header */}
      <div className="cert-header">
        <div className="cert-title-row">
          <Icon name="doc" size={18} />
          <div>
            <h2>Agent Birth Certificate</h2>
            <p className="cert-subtitle">
              {certificate.agentName} · v{certificate.manifestVersion} · Born {certificate.birthDate}
            </p>
          </div>
        </div>
        <div className="cert-actions">
          <button className="btn btn-sm" onClick={handleExportJson} title="Export as JSON">
            <Icon name="download" size={12} /> JSON
          </button>
          <button className="btn btn-sm" onClick={handleExportHtml} title="Export as HTML">
            <Icon name="download" size={12} /> HTML
          </button>
          <span className="badge badge-sox" style={{ marginLeft: 8 }}>
            {certificate.soxRelevant ? "SOX Relevant" : "Non-SOX"}
          </span>
        </div>
      </div>

      {/* Identity section */}
      <section className="cert-section">
        <h3>Identity</h3>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">Certificate ID</span>
            <span className="detail-value mono">{certificate.id}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Agent ID</span>
            <span className="detail-value mono">{certificate.agentId}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Agent Name</span>
            <span className="detail-value">{certificate.agentName}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Created By</span>
            <span className="detail-value">{certificate.createdBy}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Human Owner</span>
            <span className="detail-value">{certificate.humanOwnerId}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Birth Date</span>
            <span className="detail-value">{certificate.birthDate}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Created At</span>
            <span className="detail-value">{new Date(certificate.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Lineage section */}
      <section className="cert-section">
        <h3>Lineage</h3>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">Parent Role</span>
            <span className="detail-value">{certificate.parentRole || <span className="muted">—</span>}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Parent Responsibility</span>
            <span className="detail-value mono">{certificate.parentResponsibilityId}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Parent Task</span>
            <span className="detail-value mono">{certificate.parentTaskId}</span>
          </div>
        </div>
      </section>

      {/* Approvals */}
      <section className="cert-section">
        <h3>Approvals ({certificate.approvedBy.length})</h3>
        {certificate.approvedBy.length > 0 ? (
          <table className="cert-table">
            <thead>
              <tr>
                <th>Approver</th>
                <th>Gate</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {certificate.approvedBy.map((a, i) => (
                <tr key={i}>
                  <td>{a.approver}</td>
                  <td className="mono">{a.gate}</td>
                  <td>{new Date(a.approvedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-hint">No approvals recorded on this certificate.</p>
        )}
      </section>

      {/* Authority Ceiling */}
      <section className="cert-section">
        <h3>Authority Ceiling</h3>
        <div className="authority-columns">
          <div className="authority-col">
            <span className="authority-col-label">Allowed</span>
            {certificate.authorityCeiling.allowedActions.length > 0 ? (
              <ul className="authority-list">
                {certificate.authorityCeiling.allowedActions.map((a, i) => (
                  <li key={i}><Icon name="checkmark" size={11} stroke="var(--green, #48bb78)" /> {a}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
          <div className="authority-col">
            <span className="authority-col-label">Requires Approval</span>
            {certificate.authorityCeiling.approvalRequiredActions.length > 0 ? (
              <ul className="authority-list">
                {certificate.authorityCeiling.approvalRequiredActions.map((a, i) => (
                  <li key={i}><Icon name="warning" size={11} stroke="var(--orange, #ed8936)" /> {a}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
          <div className="authority-col">
            <span className="authority-col-label">Blocked</span>
            {certificate.authorityCeiling.blockedActions.length > 0 ? (
              <ul className="authority-list">
                {certificate.authorityCeiling.blockedActions.map((a, i) => (
                  <li key={i}><Icon name="close" size={11} stroke="var(--red, #e53e3e)" /> {a}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
        </div>
      </section>

      {/* Systems */}
      <section className="cert-section">
        <h3>Systems</h3>
        <div className="authority-columns">
          <div className="authority-col">
            <span className="authority-col-label">Allowed Systems</span>
            {certificate.systemsAllowed.length > 0 ? (
              <ul className="authority-list">
                {certificate.systemsAllowed.map((s, i) => (
                  <li key={i}><Icon name="monitor" size={11} /> {s.systemName} ({s.accessNeeded})</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
          <div className="authority-col">
            <span className="authority-col-label">Denied Systems</span>
            {certificate.systemsDenied.length > 0 ? (
              <ul className="authority-list">
                {certificate.systemsDenied.map((s, i) => (
                  <li key={i}><Icon name="close" size={11} stroke="var(--red, #e53e3e)" /> {s}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="cert-section">
        <h3>Related Controls ({certificate.relatedControlIds.length})</h3>
        {certificate.relatedControlIds.length > 0 ? (
          <div className="control-chip-list">
            {certificate.relatedControlIds.map((cid) => (
              <span key={cid} className="badge badge-sox">{cid}</span>
            ))}
          </div>
        ) : (
          <p className="empty-hint">No related controls recorded.</p>
        )}
      </section>

      {/* Evidence */}
      <section className="cert-section">
        <h3>Evidence</h3>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">Evidence Packet ID</span>
            <span className="detail-value mono">{certificate.evidencePacketId || <span className="muted">Not generated</span>}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Approval Evidence</span>
            <span className="detail-value">{certificate.approvalEvidenceIds.length} record(s)</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Initial Risk Score</span>
            <span className="detail-value">{certificate.initialRiskScore}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Prompt Version</span>
            <span className="detail-value mono">{certificate.initialPromptVersion}</span>
          </div>
        </div>
      </section>
    </div>
  );

  // If onClose is provided, render as drawer; otherwise standalone
  if (onClose) {
    return (
      <div className="drawer-overlay" onClick={onClose}>
        <div className="drawer-panel drawer-panel-wide" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-header">
            <h3>
              <Icon name="doc" size={16} /> Birth Certificate
            </h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="drawer-body">{content}</div>
        </div>
      </div>
    );
  }

  return <div className="screen-panel">{content}</div>;
}
