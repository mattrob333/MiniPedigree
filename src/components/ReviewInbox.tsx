import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ProvenanceBadge, RiskBadge } from "./ProvenanceBadge";
import { buildReviewQueue, isBulkConfirmable, provenanceLabel, type ReviewQueueItem } from "@/lib/provenance";
import { canReview as roleCanReview } from "@/lib/rbac";
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
  onEdit?: (item: ReviewQueueItem, newLabel: string) => void;
}

const CLASS_LABEL: Record<string, string> = {
  delegatable: "delegatable",
  approval: "approval required",
  not_delegatable: "not delegatable",
};

export function ReviewInbox({ people, pedigree, role, onConfirm, onEdit }: Props) {
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
  const canReview = roleCanReview(role);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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
          You are signed in as an Editor. Confirming provenance requires a Reviewer, Operator, or Governance Reviewer role.
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
        <div className="drawer-empty">
          {queue.length === 0
            ? "The whole workspace is human-confirmed. New findings land here after each session."
            : "Nothing matches these filters — clear one to see the rest of the queue."}
        </div>
      ) : (
        ([
          ["Responsibilities", filtered.filter((i) => i.kind === "responsibility")],
          ["Tasks ready for delegation", filtered.filter((i) => i.kind === "task" && i.cls === "delegatable")],
          ["Approval-required tasks", filtered.filter((i) => i.kind === "task" && i.cls === "approval")],
          ["Not-delegatable tasks", filtered.filter((i) => i.kind === "task" && i.cls === "not_delegatable")],
        ] as [string, ReviewQueueItem[]][]).filter(([, items]) => items.length > 0).map(([groupTitle, items]) => (
        <section key={groupTitle} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 8px" }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{groupTitle}</h3>
            <span className="tag">{items.length}</span>
          </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => {
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
                  {onEdit && (
                    <button
                      className="btn btn-sm btn-ghost"
                      disabled={!canReview}
                      title="Correct the wording — an edit is itself a confirmation"
                      onClick={() => { setEditingKey(item.key); setEditText(item.label); }}
                    >Edit</button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-cyan"
                    disabled={!canReview}
                    title={canReview ? `Confirm this ${item.kind} (${provenanceLabel(item.provenance.state)})` : "Requires a reviewing role"}
                    onClick={() => onConfirm([item])}
                  >
                    <Icon name="checkmark" size={11} /> Confirm
                  </button>
                </div>
                {item.provenance.evidence_quote && (
                  <blockquote className="digest-evidence" style={{ margin: "0 12px 8px 44px" }}>
                    “{item.provenance.evidence_quote}”{item.provenance.source ? <span className="dim"> — {item.provenance.source}</span> : null}
                  </blockquote>
                )}
                {editingKey === item.key && onEdit && (
                  <div style={{ display: "flex", gap: 6, padding: "0 12px 10px 44px" }}>
                    <input className="input" value={editText} autoFocus onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && editText.trim()) { onEdit(item, editText.trim()); setEditingKey(null); } if (e.key === "Escape") setEditingKey(null); }} />
                    <button className="btn btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>
                    <button className="btn btn-sm btn-outline-cyan" disabled={!editText.trim()} onClick={() => { onEdit(item, editText.trim()); setEditingKey(null); }}>Save & confirm</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </section>
        ))
      )}
    </div>
  );
}
