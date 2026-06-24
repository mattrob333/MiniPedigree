import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { ControlManifest } from "@/types";

interface Props {
  control: ControlManifest;
  systemNameLookup: Record<string, string>;
  onClose: () => void;
  onUpdate?: (patch: Partial<ControlManifest>) => void;
}

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
  policy_document: "Policy Document",
  sod_document: "SOD Document",
  import: "Import",
};

export function ControlDetailDrawer({
  control,
  systemNameLookup,
  onClose,
  onUpdate,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>
            <Icon name="shield" size={16} /> {control.name || "Untitled Control"}
          </h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="icon-btn"
              title={editing ? "Done editing" : "Edit"}
              onClick={() => setEditing((p) => !p)}
            >
              <Icon name={editing ? "checkmark" : "build"} size={14} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {/* Status and SOX */}
          <section className="drawer-section">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span className={`badge badge-${control.status}`}>{control.status}</span>
              {control.soxRelevant && <span className="badge badge-sox">SOX Relevant</span>}
            </div>
          </section>

          {/* Overview */}
          <section className="drawer-section">
            <h4>Control Details</h4>
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-label">Control ID</span>
                <span className="detail-value mono">{control.controlId}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Owner</span>
                <span className="detail-value">{control.ownerPersonId || <span className="muted">Unassigned</span>}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Process</span>
                <span className="detail-value">{control.process || <span className="muted">Not specified</span>}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Frequency</span>
                <span className="detail-value">{FREQUENCY_LABELS[control.frequency] ?? control.frequency}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Source</span>
                <span className="detail-value">{SOURCE_LABELS[control.source] ?? control.source}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Created</span>
                <span className="detail-value">{new Date(control.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </section>

          {/* SOX toggle */}
          <section className="drawer-section">
            <h4>SOX Relevance</h4>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={control.soxRelevant}
                onChange={(e) => onUpdate?.({ soxRelevant: e.target.checked })}
              />
              <span>This control is SOX-relevant</span>
            </label>
            {control.soxRelevant && (
              <p className="empty-hint" style={{ marginTop: 6 }}>
                Marked as SOX-relevant. This control will appear in SOX audit reports and agent manifests.
              </p>
            )}
          </section>

          {/* Description */}
          <section className="drawer-section">
            <h4>Description</h4>
            {control.description ? (
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>
                {control.description}
              </p>
            ) : (
              <p className="empty-hint">No description provided. Consider adding one to clarify what this control governs.</p>
            )}
          </section>

          {/* Related Risk */}
          <section className="drawer-section">
            <h4>Related Risk</h4>
            {control.relatedRisk ? (
              <div className="risk-finding-card" style={{ borderLeftColor: "var(--orange, #ed8936)" }}>
                <p className="risk-description">{control.relatedRisk}</p>
              </div>
            ) : (
              <p className="empty-hint">No related risk described. A clear risk statement helps link this control to audit findings.</p>
            )}
          </section>

          {/* Systems */}
          <section className="drawer-section">
            <h4>Systems ({control.systemIds.length})</h4>
            {control.systemIds.length > 0 ? (
              <ul className="approval-list">
                {control.systemIds.map((sid) => (
                  <li key={sid}>
                    <Icon name="monitor" size={12} />
                    {systemNameLookup[sid] ?? sid}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">No systems linked. Controls should be mapped to at least one system.</p>
            )}
          </section>

          {/* Evidence Requirements */}
          <section className="drawer-section">
            <h4>Evidence Requirements</h4>
            {control.evidenceRequired.length > 0 ? (
              <ul className="approval-list">
                {control.evidenceRequired.map((ev, i) => (
                  <li key={i}>
                    <Icon name="doc" size={12} />
                    {ev}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">No evidence requirements defined. Evidence requirements specify what audit evidence this control depends on.</p>
            )}
          </section>

          {/* Agents and Tasks */}
          <section className="drawer-section">
            <h4>Linked Agents ({control.relatedAgentIds.length})</h4>
            {control.relatedAgentIds.length > 0 ? (
              <ul className="approval-list">
                {control.relatedAgentIds.map((aid) => (
                  <li key={aid}>
                    <Icon name="robot" size={12} />
                    {aid}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">No agents linked. Agents are linked to controls when they perform actions within the control's scope.</p>
            )}
          </section>

          <section className="drawer-section">
            <h4>Linked Tasks ({control.relatedTaskIds.length})</h4>
            {control.relatedTaskIds.length > 0 ? (
              <ul className="approval-list">
                {control.relatedTaskIds.map((tid) => (
                  <li key={tid}>
                    <Icon name="target" size={12} />
                    {tid}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">No tasks linked. Tasks become linked when agent planning identifies them as SOX-relevant.</p>
            )}
          </section>

          {/* Approval gates */}
          {control.approvalRequirements.length > 0 && (
            <section className="drawer-section">
              <h4>Approval Gates</h4>
              <ul className="approval-list">
                {control.approvalRequirements.map((ar, i) => (
                  <li key={i} className={ar.met ? "gate-met" : "gate-pending"}>
                    <Icon name={ar.met ? "checkmark" : "warning"} size={12} />
                    <span>{ar.gate}</span>
                    {ar.approver && <span className="approver">— {ar.approver}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
