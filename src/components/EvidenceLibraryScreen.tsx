import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { EvidenceRecord } from "@/types";
import {
  filterEvidenceBySubjectType,
  filterEvidenceByType,
  filterEvidenceByActor,
  exportEvidenceJson,
  exportEvidenceCsv,
} from "@/lib/evidence";
import { demoWescoEvidenceRecords } from "@/lib/wescoDemoData";

interface Props {
  evidenceRecords?: EvidenceRecord[];
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  approval: "Approval",
  birth_certificate: "Birth Certificate",
  transfer: "Transfer",
  agent_request: "Agent Request",
  system_change: "System Change",
  control_update: "Control Update",
  review: "Review",
  export: "Export",
};

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  control: "Control",
  system: "System",
  request: "Request",
  person: "Person",
};

export function EvidenceLibraryScreen({ evidenceRecords }: Props) {
  const actualRecords = evidenceRecords ?? demoWescoEvidenceRecords();
  const [typeFilter, setTypeFilter] = useState("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  // Get unique types for filter dropdowns
  const uniqueTypes = useMemo(() => {
    const types = new Set(actualRecords.map((r) => r.type));
    return Array.from(types).sort();
  }, [actualRecords]);

  const uniqueSubjectTypes = useMemo(() => {
    const types = new Set(actualRecords.map((r) => r.subjectType));
    return Array.from(types).sort();
  }, [actualRecords]);

  const filtered = useMemo(() => {
    let result = actualRecords;
    if (typeFilter) {
      result = filterEvidenceByType(result, typeFilter as any);
    }
    if (subjectTypeFilter) {
      result = filterEvidenceBySubjectType(result, subjectTypeFilter as any);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.summary.toLowerCase().includes(q) ||
          r.actor.toLowerCase().includes(q) ||
          r.subjectId.toLowerCase().includes(q),
      );
    }
    // Sort newest first
    return [...result].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [actualRecords, typeFilter, subjectTypeFilter, search]);

  const handleExportJson = () => {
    const json = exportEvidenceJson(filtered);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-records-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = exportEvidenceCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-records-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen-panel evidence-library">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="doc" size={16} /> Evidence Library
          </h2>
          <span className="count">{filtered.length} records</span>
          <div className="panel-actions">
            <button className="btn btn-sm" onClick={handleExportJson} title="Export as JSON">
              <Icon name="download" size={12} /> JSON
            </button>
            <button className="btn btn-sm" onClick={handleExportCsv} title="Export as CSV">
              <Icon name="csv" size={12} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Summary, actor, subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>{EVIDENCE_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Subject Type</label>
            <select value={subjectTypeFilter} onChange={(e) => setSubjectTypeFilter(e.target.value)}>
              <option value="">All subjects</option>
              {uniqueSubjectTypes.map((t) => (
                <option key={t} value={t}>{SUBJECT_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <Icon name="doc" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No evidence records found</h3>
          {actualRecords.length === 0 ? (
            <>
              <p>Evidence records are created automatically by governance actions — approvals, birth certificates, transfers, reviews, and system changes.</p>
              <p className="empty-hint">Why this matters: Evidence is the backbone of audit readiness. Every governance action creates a tamper-evident trail.</p>
              <p className="empty-hint">What to do: Complete agent creation, approval, and transfer workflows so evidence records start accumulating.</p>
            </>
          ) : (
            <>
              <p>No records match the current filter criteria.</p>
              <button className="link-btn" onClick={() => { setSearch(""); setTypeFilter(""); setSubjectTypeFilter(""); }}>
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Evidence timeline */}
      {filtered.length > 0 && (
        <div className="evidence-timeline">
          {filtered.map((record) => (
            <div key={record.id} className="evidence-item">
              <div className="evidence-marker">
                <span className={`evidence-type-dot type-${record.type}`} title={EVIDENCE_TYPE_LABELS[record.type] ?? record.type} />
                <span className="evidence-line" />
              </div>
              <div className="evidence-content">
                <div className="evidence-header">
                  <span className="evidence-type-badge">
                    {EVIDENCE_TYPE_LABELS[record.type] ?? record.type}
                  </span>
                  <span className="evidence-subject-type">
                    {SUBJECT_TYPE_LABELS[record.subjectType] ?? record.subjectType}
                  </span>
                  <span className="evidence-subject-id mono">{record.subjectId}</span>
                </div>
                <p className="evidence-summary">{record.summary}</p>
                <div className="evidence-footer">
                  <span className="evidence-actor">
                    <Icon name="user" size={10} /> {record.actor}
                  </span>
                  <span className="evidence-timestamp">
                    {new Date(record.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
