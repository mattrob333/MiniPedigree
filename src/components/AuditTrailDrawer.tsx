import { Icon } from "./Icon";
import type { AgentRecord, ItemProvenance, Person, WorkspaceAuditEvent } from "@/types";
import { downloadFile } from "@/lib/state";

interface AuditTrailDrawerProps {
  open: boolean;
  title: string;
  owner?: Person;
  responsibility?: string;
  task?: string;
  provenance?: ItemProvenance;
  events: WorkspaceAuditEvent[];
  agent?: AgentRecord;
  onClose: () => void;
}

function dash(value?: string | null) {
  return value?.trim() || "-";
}

export function AuditTrailDrawer({ open, title, owner, responsibility, task, provenance, events, agent, onClose }: AuditTrailDrawerProps) {
  if (!open) return null;
  const md = [
    `# Audit trail: ${title}`,
    "",
    `Human owner: ${owner ? `${owner.name} · ${owner.title}` : "-"}`,
    `Responsibility: ${dash(responsibility)}`,
    `Task: ${dash(task)}`,
    `Evidence: ${dash(provenance?.evidence_quote)}${provenance?.source ? ` — ${provenance.source}` : ""}${provenance?.confidence !== undefined ? ` · confidence ${Math.round(provenance.confidence * 100)}%` : ""}`,
    `Confirmed: ${provenance?.confirmed_by ? `${provenance.confirmed_by}${provenance.confirmed_at ? ` · ${provenance.confirmed_at}` : ""}` : "-"}`,
    `Agent: ${agent ? `${agent.name} · ${agent.lifecycle ?? "standing"}` : "No agent yet"}`,
    "",
    "## Audit events",
    ...(events.length ? events.map((event) => `- ${event.timestamp} · ${event.actor} · ${event.summary}`) : ["- -"]),
    "",
  ].join("\n");

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open audit-trail-drawer">
        <div className="drawer-head">
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
          <div className="id-line">Audit trail</div>
          <h2>{title}</h2>
        </div>
        <div className="drawer-body">
          <section className="drawer-section">
            <div className="review-detail-kv">
              <span>Human owner</span><strong>{owner ? `${owner.name} · ${owner.title}` : "-"}</strong>
              <span>Responsibility</span><strong>{dash(responsibility)}</strong>
              <span>Task</span><strong>{dash(task)}</strong>
              <span>Evidence</span><strong>{dash(provenance?.evidence_quote)}{provenance?.confidence !== undefined ? ` · ${Math.round(provenance.confidence * 100)}%` : ""}</strong>
              <span>Confirmed</span><strong>{provenance?.confirmed_by ? `${provenance.confirmed_by}${provenance.confirmed_at ? ` · ${new Date(provenance.confirmed_at).toLocaleString()}` : ""}` : "-"}</strong>
              <span>Agent</span><strong>{agent ? `${agent.name} · ${agent.lifecycle ?? "standing"}` : "No agent yet"}</strong>
            </div>
          </section>
          <section className="drawer-section">
            <div className="sh">Audit events</div>
            {events.length ? events.map((event) => (
              <div className="list-item-line" key={event.id}>
                <span className="mono">{new Date(event.timestamp).toLocaleString()}</span>
                <span style={{ flex: 1 }}>{event.summary}</span>
              </div>
            )) : <div className="drawer-empty">-</div>}
          </section>
          <button className="btn btn-primary" onClick={() => downloadFile(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-audit-trail.md`, md, "text/markdown")}>
            <Icon name="download" size={12} /> Export trail (.md)
          </button>
        </div>
      </aside>
    </>
  );
}
