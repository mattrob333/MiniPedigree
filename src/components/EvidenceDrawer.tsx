import { Icon } from "./Icon";
import type { ItemProvenance } from "@/types";
import { provenanceLabel } from "@/lib/provenance";

interface EvidenceDrawerProps {
  open: boolean;
  provenance: ItemProvenance | null;
  title?: string;
  onClose: () => void;
}

export function EvidenceDrawer({ open, provenance, title = "Evidence", onClose }: EvidenceDrawerProps) {
  if (!open || !provenance) return null;
  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open evidence-drawer">
        <div className="drawer-head">
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
          <div className="id-line">Evidence</div>
          <h2>{title}</h2>
          <div className="meta">{provenanceLabel(provenance.state)}{provenance.confidence !== undefined ? ` · ${Math.round(provenance.confidence * 100)}% confidence` : ""}</div>
        </div>
        <div className="drawer-body">
          <section className="drawer-section">
            <div className="sh">Quote</div>
            {provenance.evidence_quote ? (
              <blockquote className="digest-evidence evidence-drawer-quote">"{provenance.evidence_quote}"</blockquote>
            ) : (
              <div className="drawer-empty">No transcript quote attached.</div>
            )}
          </section>
          <section className="drawer-section">
            <div className="sh">Source</div>
            <div className="review-detail-kv">
              <span>State</span><strong>{provenanceLabel(provenance.state)}</strong>
              <span>Source/session</span><strong>{provenance.source ?? "-"}</strong>
              <span>Confirmed</span><strong>{provenance.confirmed_by ? `${provenance.confirmed_by}${provenance.confirmed_at ? ` · ${new Date(provenance.confirmed_at).toLocaleString()}` : ""}` : "-"}</strong>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
