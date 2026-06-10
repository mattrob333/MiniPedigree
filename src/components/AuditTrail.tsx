import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { downloadFile } from "@/lib/state";
import type { StackAuditRecord, WorkspaceAuditEvent } from "@/types";

// ── In-app audit trail (UX backlog P1-3) ───────────────────────────────
// Append-only timeline: who generated, confirmed, approved, exported — when,
// and based on which evidence. Local-first; the schema mirrors the planned
// production audit pipeline. Exportable as CSV/JSON for evidence requests.

interface Props {
  events: WorkspaceAuditEvent[];
  stackAuditLog: StackAuditRecord[];
  workspaceName: string;
}

interface TimelineRow {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  summary: string;
  subject: string;
  evidence: string;
}

const TYPE_COLOR: Record<string, string> = {
  agent_generated: "var(--cyan)",
  provenance_confirmed: "var(--green)",
  manifest_approved: "var(--green)",
  export_validated: "var(--cyan)",
  package_exported: "var(--cyan)",
  stack_change_applied: "var(--yellow)",
  agent_retired: "var(--red)",
};

export function AuditTrail({ events, stackAuditLog, workspaceName }: Props) {
  const [subjectFilter, setSubjectFilter] = useState("");

  const rows = useMemo<TimelineRow[]>(() => {
    const fromEvents: TimelineRow[] = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      type: e.type,
      actor: e.actor,
      summary: e.summary,
      subject: e.subject_id ?? "",
      evidence: e.evidence ?? "",
    }));
    const fromStack: TimelineRow[] = stackAuditLog.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      type: "stack_change_applied",
      actor: r.approver,
      summary: `${r.proposal_type}: ${r.summary}`,
      subject: r.proposal_id,
      evidence: r.evidence_quote,
    }));
    return [...fromEvents, ...fromStack].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [events, stackAuditLog]);

  const filtered = subjectFilter.trim()
    ? rows.filter((r) => `${r.subject} ${r.summary} ${r.actor}`.toLowerCase().includes(subjectFilter.trim().toLowerCase()))
    : rows;

  const slug = workspaceName.toLowerCase().replace(/\s+/g, "-");

  const exportJson = () => downloadFile(`${slug}-audit-log.json`, JSON.stringify(filtered, null, 2), "application/json");
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["timestamp,type,actor,subject,summary,evidence", ...filtered.map((r) => [r.timestamp, r.type, r.actor, r.subject, r.summary, r.evidence].map(esc).join(","))];
    downloadFile(`${slug}-audit-log.csv`, lines.join("\n"), "text/csv");
  };

  return (
    <div style={{ padding: "14px 18px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="history" size={14} stroke="var(--cyan)" />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Audit trail</div>
        <span className="tag">{rows.length} events · append-only</span>
        <span style={{ flex: 1 }} />
        <input className="input" style={{ width: 240 }} placeholder="Filter by agent, actor, or text…" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} />
        <button className="btn btn-sm btn-ghost" disabled={!filtered.length} onClick={exportCsv}><Icon name="download" size={11} /> CSV</button>
        <button className="btn btn-sm btn-ghost" disabled={!filtered.length} onClick={exportJson}><Icon name="download" size={11} /> JSON</button>
      </div>

      {filtered.length === 0 ? (
        <div className="drawer-empty">No audit events yet. Generating, confirming, approving, exporting, and applying stack changes all write here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((r) => (
            <div key={r.id} className="manifest-card" style={{ marginBottom: 0 }}>
              <div className="manifest-card-body" style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 12px" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-4)", whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</span>
                <span className="tag" style={{ color: TYPE_COLOR[r.type] ?? "var(--text-3)", borderColor: TYPE_COLOR[r.type] ?? "var(--border-2)" }}>{r.type.replace(/_/g, " ")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{r.summary}</div>
                  {r.evidence && <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic", marginTop: 2 }}>"{r.evidence}"</div>}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{r.actor}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
