import { useMemo } from "react";
import { Icon } from "./Icon";
import type { ApprovalGate } from "@/types";
import { allGatesMet, pendingGates, approveGate } from "@/lib/approvalGates";

interface Props {
  gates: ApprovalGate[];
  onApproveGate?: (gateName: string, approver: string) => void;
  compact?: boolean;
}

const GATE_LABELS: Record<string, string> = {
  SOX_COMPLIANCE_REVIEW: "SOX Compliance Review",
  FINANCIAL_SYSTEM_ACCESS: "Financial System Access Review",
  HR_SYSTEM_ACCESS: "HR System Access Review",
  WRITE_ACCESS_REVIEW: "Write Access Review",
  HIGH_RISK_REVIEW: "High Risk Review",
  SERVICE_ACCOUNT_EXCEPTION: "Service Account Exception",
};

export function ApprovalChecklist({ gates, onApproveGate, compact = false }: Props) {
  const allMet = useMemo(() => allGatesMet(gates), [gates]);
  const pending = useMemo(() => pendingGates(gates), [gates]);

  if (gates.length === 0) {
    return (
      <div className="approval-checklist">
        <div className="empty-state" style={{ margin: "20px auto", maxWidth: 360 }}>
          <Icon name="checkmark" size={24} stroke="var(--green, #48bb78)" />
          <h3>No approval gates required</h3>
          <p>This item has no approval requirements. If it needs governance, add approval gates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="approval-checklist">
      <div className="checklist-header">
        <h4>
          <Icon name="shield" size={14} />
          Approval Checklist
        </h4>
        <span className="checklist-summary">
          {allMet ? (
            <span className="badge badge-approved">All gates met</span>
          ) : (
            <span className="badge badge-suspended">{pending.length} of {gates.length} pending</span>
          )}
        </span>
      </div>

      <div className={`checklist-gates ${compact ? "compact" : ""}`}>
        {gates.map((gate) => (
          <div
            key={gate.gate}
            className={`gate-row ${gate.met ? "gate-met" : "gate-pending"}`}
          >
            <div className="gate-status-icon">
              {gate.met ? (
                <Icon name="check-circle" size={16} stroke="var(--green, #48bb78)" />
              ) : (
                <Icon name="warning" size={16} stroke="var(--orange, #ed8936)" />
              )}
            </div>
            <div className="gate-info">
              <span className="gate-name">
                {GATE_LABELS[gate.gate] ?? gate.gate}
              </span>
              {gate.approver && (
                <span className="gate-approver">Approved by: {gate.approver}</span>
              )}
              {gate.metAt && (
                <span className="gate-met-at">
                  {new Date(gate.metAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="gate-action">
              {!gate.met && onApproveGate && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    const approver = prompt("Approver email:");
                    if (approver) onApproveGate(gate.gate, approver);
                  }}
                >
                  Approve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {allMet && (
        <div className="checklist-complete">
          <Icon name="checkmark" size={12} />
          All required approvals obtained. Ready for birth certificate creation.
        </div>
      )}
    </div>
  );
}
