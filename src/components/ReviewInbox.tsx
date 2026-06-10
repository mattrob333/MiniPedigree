import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ProvenanceBadge, RiskBadge } from "./ProvenanceBadge";
import { buildReviewQueue, isBulkConfirmable, provenanceLabel, type ReviewQueueItem } from "@/lib/provenance";
import type { PedigreeState, Person, ProvenanceState, UserRole } from "@/types";

// ── Org-wide review inbox (UX backlog P0-3 / P1.1) ─────────────────────
// The buyer persona's screen: one queue of everything pending review across
// the workspace. Bulk actions are limited to safe operations — evidenced,
// delegatable items only. Approval-required and blocked classifications are
// always reviewed individually.

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  role: UserRole;
  onConfirm: (items: ReviewQueueItem[]) => void;
}

const CLASS_LABEL: Record<string, string> = {
  delegatable: "delegatable",
  approval: "approval required",
  not_delegatable: "not delegatable",
};

export function ReviewInbox({ people, pedigree, role, onConfirm }: Props) {
  const [department, setDepartment] = useState("all");
  const [risk, setRisk] = useState("all");
  const [provenance, setProvenance] = useState("all");
  const [cls, setCls] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queue = useMemo(() => buildReviewQueue(people, pedigree), [people, pedigree]);
  const departments = useMemo(() => Array.from(new Set(people.map((p) => p.department))).sort(), [people]);

  const filtered = queue.filter((item) =>
    (department === "all" || item.department === department) &&
    (risk === "all" || (item.riskLevel ?? "low") === risk) &&
    (provenance === "all" || item.provenance.state === (provenance as ProvenanceState)) &&
    (cls === "all" || item.cls === cls || (cls === "responsibility" && item.kind === "responsibility")),
  );

  const bulkable = filtered.filter(isBulkConfirmable);
  const selectedItems = filtered.filter((i) => selected.has(i.key));
  const canReview = role === "reviewer";

  const toggleSelect = (item: ReviewQueueItem) => {
    if (!isBulkConfirmable(item)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(item.key) ? next.delete(item.key) : next.add(item.key);
      return next;
    });
  };

  const confirmSelected = () => {
    const safe = selectedItems.filter(isBulkConfirmable);
    if (!safe.length) return;
    onConfirm(safe);
    setSelected(new Set());
  };

  return (
    <div style={{ padding: "14px 18px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Icon name="shield" size={14} stroke="var(--cyan)" />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Review inbox</div>
        <span className="tag cyan">{queue.length} pending</span>
        <span style={{ flex: 1 }} />
        <select className="select" style={{ width: 150 }} value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="select" style={{ width: 120 }} value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">All risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="select" style={{ width: 150 }} value={provenance} onChange={(e) => setProvenance(e.target.value)}>
          <option value="all">All provenance</option>
          <option value="evidenced">Evidenced</option>
          <option value="ai_inferred">AI-inferred only</option>
        </select>
        <select className="select" style={{ width: 160 }} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classifications</option>
          <option value="delegatable">Delegatable</option>
          <option value="approval">Approval required</option>
          <option value="not_delegatable">Not delegatable</option>
          <option value="responsibility">Responsibilities</option>
        </select>
      </div>

      {!canReview && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 10, border: "1px solid var(--border-2)", borderRadius: 8, fontSize: 12, color: "var(--text-3)" }}>
          <Icon name="lock" size={12} stroke="var(--yellow)" />
          You are signed in as an Editor. Confirming provenance requires the Reviewer role (Account menu → role).
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "var(--text-3)" }}>
        <span>Sorted highest-risk, lowest-confidence first.</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn-sm btn-ghost"
          disabled={!canReview || !bulkable.length}
          onClick={() => setSelected(new Set(bulkable.map((i) => i.key)))}
          title="Select every evidenced, delegatable item (safe bulk operation)"
        >
          Select all bulk-confirmable ({bulkable.length})
        </button>
        <button className="btn btn-sm btn-primary" disabled={!canReview || !selectedItems.length} onClick={confirmSelected}>
          <Icon name="checkmark" size={11} /> Bulk-confirm {selectedItems.length || ""} evidenced
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="drawer-empty">Nothing pending review with these filters. {queue.length === 0 ? "The whole workspace is human-confirmed." : ""}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((item) => {
            const bulkOk = isBulkConfirmable(item);
            return (
              <div key={item.key} className="manifest-card" style={{ marginBottom: 0 }}>
                <div className="manifest-card-body" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    disabled={!canReview || !bulkOk}
                    title={bulkOk ? "Eligible for bulk confirm" : "Must be reviewed individually (AI-inferred, approval-required, or blocked)"}
                    onChange={() => toggleSelect(item)}
                  />
                  <span className="tag" style={{ width: 92, textAlign: "center" }}>{item.kind === "responsibility" ? "responsibility" : CLASS_LABEL[item.cls ?? "delegatable"]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: "var(--text-1)" }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-4)" }}>{item.personName} · {item.department}</div>
                  </div>
                  {item.kind === "task" && <RiskBadge level={item.riskLevel} />}
                  <ProvenanceBadge provenance={item.provenance} />
                  <button
                    className="btn btn-sm btn-outline-cyan"
                    disabled={!canReview}
                    title={canReview ? `Confirm this ${item.kind} (${provenanceLabel(item.provenance.state)})` : "Requires Reviewer role"}
                    onClick={() => onConfirm([item])}
                  >
                    <Icon name="checkmark" size={11} /> Confirm
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
