import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  AgentRegistryEntry,
  Person,
  EvidenceRecord,
} from "@/types";
import {
  compareTransferAuthority,
  executeTransfer,
  findReassignmentCandidates,
  type TransferComparisonResult,
} from "@/lib/agentTransfer";
import { createEvidenceRecord } from "@/lib/evidence";

interface Props {
  agent: AgentRegistryEntry;
  people: Person[];
  currentOwner: Person;
  evidenceRecords: EvidenceRecord[];
  onClose: () => void;
  onTransfer: (updatedEntry: AgentRegistryEntry, evidence: EvidenceRecord) => void;
}

export function AgentTransferDrawer({
  agent,
  people,
  currentOwner,
  evidenceRecords,
  onClose,
  onTransfer,
}: Props) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [transferResult, setTransferResult] = useState<TransferComparisonResult | null>(null);

  const candidates = useMemo(
    () => findReassignmentCandidates(agent, people),
    [agent, people],
  );

  const selectedCandidate = useMemo(
    () => people.find((p) => p.id === selectedCandidateId) ?? null,
    [selectedCandidateId, people],
  );

  const comparison = useMemo(() => {
    if (!selectedCandidate) return null;
    return compareTransferAuthority(agent, currentOwner, selectedCandidate);
  }, [agent, currentOwner, selectedCandidate]);

  const existingEvidence = useMemo(
    () =>
      evidenceRecords.filter(
        (r) =>
          r.subjectId === agent.agent_id &&
          r.subjectType === "agent" &&
          r.type === "transfer",
      ),
    [evidenceRecords, agent.agent_id],
  );

  const handleTransfer = () => {
    if (!selectedCandidate) return;
    const { updatedEntry, evidence } = executeTransfer({
      agentRegistryEntry: agent,
      newOwner: selectedCandidate,
      actor: currentOwner.name,
      approved: !comparison?.requiresApproval,
    });
    onTransfer(updatedEntry, evidence);
    setTransferComplete(true);
    if (comparison) {
      setTransferResult({
        agentId: agent.agent_id,
        oldOwnerId: currentOwner.id,
        newOwnerId: selectedCandidate.id,
        systemMismatches: comparison.systemMismatches,
        authorityChange: comparison.authorityChange,
        requiresApproval: comparison.requiresApproval,
        evidenceId: evidence.id,
      });
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer agent-transfer-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <h3>
            <Icon name="transfer" size={14} /> Transfer Agent Ownership
          </h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          {/* Current owner info */}
          <div className="transfer-section">
            <h4>Current Owner</h4>
            <div className="transfer-owner-card">
              <div className="transfer-owner-name">{currentOwner.name}</div>
              <div className="transfer-owner-detail">
                {currentOwner.title} · {currentOwner.department}
              </div>
              <div className="transfer-owner-detail">{currentOwner.email}</div>
            </div>
          </div>

          <div className="transfer-arrow">
            <Icon name="arrow-down" size={20} />
          </div>

          {/* Transfer status display */}
          {transferComplete && transferResult ? (
            <div className="transfer-section">
              <h4>Transfer Result</h4>
              <div
                className={`transfer-status-badge ${
                  transferResult.authorityChange === "expanded"
                    ? "status-warning"
                    : transferResult.authorityChange === "reduced"
                      ? "status-info"
                      : "status-success"
                }`}
              >
                {transferResult.authorityChange === "expanded"
                  ? "⚠️ Authority Expansion — Approval Required"
                  : transferResult.authorityChange === "reduced"
                    ? "ℹ️ Authority Reduced"
                    : "✅ Authority Unchanged"}
              </div>
              {transferResult.systemMismatches.length > 0 && (
                <div className="transfer-mismatches">
                  <h5>System Access Changes</h5>
                  <table className="transfer-mismatch-table">
                    <thead>
                      <tr>
                        <th>System</th>
                        <th>Old Scope</th>
                        <th>New Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferResult.systemMismatches.map((m, i) => (
                        <tr key={i}>
                          <td>{m.system}</td>
                          <td className="scope-old">{m.oldScope}</td>
                          <td className="scope-new">{m.newScope}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="transfer-evidence-id">
                Evidence: <span className="mono">{transferResult.evidenceId}</span>
              </div>
              <p className="transfer-success-msg">
                {transferResult.requiresApproval
                  ? "Transfer executed pending approval. The agent is marked as stale until the approval gate is met."
                  : "Transfer complete. The agent will be recompiled under the new owner's authority ceiling."}
              </p>
            </div>
          ) : (
            <>
              {/* Candidate selection */}
              <div className="transfer-section">
                <h4>Select New Owner</h4>
                {candidates.length === 0 && (
                  <div className="empty-state compact">
                    <Icon name="user" size={24} stroke="var(--muted, #a0aec0)" />
                    <p>No reassignment candidates found in {currentOwner.department}.</p>
                    <p className="empty-hint">
                      Candidates must be in the same department and have active lifecycle status. Add people to this department or update lifecycle statuses.
                    </p>
                  </div>
                )}
                {candidates.length > 0 && (
                  <div className="candidate-list">
                    {candidates.map(({ person, coversGrants }) => (
                      <div
                        key={person.id}
                        className={`candidate-item ${
                          selectedCandidateId === person.id ? "selected" : ""
                        }`}
                        onClick={() => setSelectedCandidateId(person.id)}
                      >
                        <div className="candidate-info">
                          <div className="candidate-name">{person.name}</div>
                          <div className="candidate-detail">
                            {person.title} · {person.department}
                          </div>
                        </div>
                        <div className="candidate-badges">
                          {coversGrants ? (
                            <span className="badge badge-success">Covers grants</span>
                          ) : (
                            <span className="badge badge-warning">Partial coverage</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Authority comparison */}
              {comparison && (
                <div className="transfer-section">
                  <h4>Authority Comparison</h4>
                  <div
                    className={`comparison-badge ${
                      comparison.authorityChange === "expanded"
                        ? "status-warning"
                        : comparison.authorityChange === "reduced"
                          ? "status-info"
                          : "status-success"
                    }`}
                  >
                    {comparison.authorityChange === "expanded"
                      ? `⚠️ Authority will EXPAND — approval required`
                      : comparison.authorityChange === "reduced"
                        ? `ℹ️ Authority will be REDUCED`
                        : `✅ Authority unchanged`}
                  </div>
                  {comparison.systemMismatches.length > 0 && (
                    <table className="transfer-mismatch-table">
                      <thead>
                        <tr>
                          <th>System</th>
                          <th>Current Scope</th>
                          <th>New Scope</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.systemMismatches.map((m, i) => (
                          <tr key={i}>
                            <td>{m.system}</td>
                            <td className="scope-old">{m.oldScope}</td>
                            <td className="scope-new">{m.newScope}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Existing transfer evidence */}
              {existingEvidence.length > 0 && (
                <div className="transfer-section">
                  <h4>Transfer History</h4>
                  {existingEvidence.map((ev) => (
                    <div key={ev.id} className="evidence-item compact">
                      <span className="evidence-summary">{ev.summary}</span>
                      <span className="evidence-date">
                        {new Date(ev.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="transfer-actions">
                <button className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!selectedCandidate || transferComplete}
                  onClick={handleTransfer}
                >
                  <Icon name="transfer" size={12} /> Transfer to{" "}
                  {selectedCandidate?.name ?? "..."}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
