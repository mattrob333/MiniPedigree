import { useState } from "react";
import { Icon } from "./Icon";
import type { AiCouncilRequest } from "@/types";
import { approveRequest, rejectRequest, requestMoreInfo } from "@/lib/aiCouncil";

interface Props {
  requests: AiCouncilRequest[];
  onUpdateRequest?: (id: string, patch: Partial<AiCouncilRequest>) => void;
  priorityColor: (p: string) => string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  needs_more_info: "Needs More Info",
  approved: "Approved",
  rejected: "Rejected",
  built: "Built",
  deployed: "Deployed",
  monitored: "Monitored",
  archived: "Archived",
};

export function AiCouncilQueue({ requests, onUpdateRequest, priorityColor }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  const handleApprove = (req: AiCouncilRequest) => {
    const approver = prompt("Approver email:");
    if (!approver) return;
    const { request: updated } = approveRequest(req, approver);
    onUpdateRequest?.(req.id, updated);
    setExpandedId(null);
  };

  const handleReject = (req: AiCouncilRequest) => {
    if (!rejectionReason.trim()) return;
    const updated = rejectRequest(req, "reviewer", rejectionReason.trim());
    onUpdateRequest?.(req.id, updated);
    setRejectionReason("");
    setShowRejectInput(null);
    setExpandedId(null);
  };

  const handleRequestInfo = (req: AiCouncilRequest) => {
    const updated = requestMoreInfo(req);
    onUpdateRequest?.(req.id, updated);
  };

  // Group requests by status sections
  const sectionOrder = ["submitted", "under_review", "needs_more_info", "approved", "rejected", "draft"];
  const grouped = sectionOrder
    .map((status) => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      items: requests.filter((r) => r.status === status),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="council-queue">
      {grouped.map((section) => (
        <div key={section.status} className="council-section">
          <div className="council-section-header">
            <span className="council-section-label">{section.label}</span>
            <span className="count">{section.items.length}</span>
          </div>
          {section.items.map((req) => (
            <div
              key={req.id}
              className={`council-card ${expandedId === req.id ? "expanded" : ""}`}
              onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
            >
              <div className="council-card-header">
                <div className="council-card-title-row">
                  <span className="council-priority" style={{ color: priorityColor(req.priority) }}>
                    {req.priority}
                  </span>
                  <span className="council-dept">{req.department}</span>
                  {req.soxRelevant && <span className="badge badge-sox">SOX</span>}
                </div>
                <div className="council-card-id mono">{req.id}</div>
              </div>
              <div className="council-card-body">
                <div className="council-problem">
                  <span className="council-label">Problem:</span> {req.businessProblem}
                </div>
                <div className="council-task">
                  <span className="council-label">Task:</span> {req.proposedTask}
                </div>
                {req.systemsTouched.length > 0 && (
                  <div className="council-systems">
                    <span className="council-label">Systems:</span> {req.systemsTouched.join(", ")}
                  </div>
                )}
                {req.dataSensitivity && (
                  <div className="council-sensitivity">
                    <span className="council-label">Sensitivity:</span> {req.dataSensitivity}
                  </div>
                )}
                {req.expectedBenefit && (
                  <div className="council-benefit">
                    <span className="council-label">Benefit:</span> {req.expectedBenefit}
                  </div>
                )}
              </div>

              {/* Expanded actions for reviewable statuses */}
              {expandedId === req.id && (req.status === "submitted" || req.status === "under_review") && (
                <div className="council-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleApprove(req)}
                  >
                    <Icon name="checkmark" size={11} /> Approve
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setShowRejectInput(showRejectInput === req.id ? null : req.id)}
                  >
                    <Icon name="close" size={11} /> Reject
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleRequestInfo(req)}
                  >
                    <Icon name="warning" size={11} /> Request Info
                  </button>

                  {showRejectInput === req.id && (
                    <div className="reject-input-group" style={{ width: "100%", marginTop: 8 }}>
                      <input
                        type="text"
                        placeholder="Reason for rejection..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="btn btn-sm"
                        onClick={() => handleReject(req)}
                        disabled={!rejectionReason.trim()}
                      >
                        Confirm Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {expandedId === req.id && req.status === "needs_more_info" && (
                <div className="council-info-message">
                  <Icon name="warning" size={12} /> Waiting for requester to provide more information.
                </div>
              )}

              {expandedId === req.id && req.status === "approved" && req.decision && (
                <div className="council-decision-summary">
                  <Icon name="checkmark" size={12} stroke="var(--green, #48bb78)" />
                  Approved by {req.decision.by} on {new Date(req.decision.at).toLocaleDateString()}
                </div>
              )}

              {expandedId === req.id && req.status === "rejected" && req.decision && (
                <div className="council-decision-summary rejected">
                  <Icon name="close" size={12} stroke="var(--red, #e53e3e)" />
                  Rejected{req.decision.reason ? `: ${req.decision.reason}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
