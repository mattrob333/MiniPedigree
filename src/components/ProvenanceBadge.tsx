import { useState } from "react";
import { Icon } from "./Icon";
import type { ItemProvenance, RiskLevel } from "@/types";
import { confidenceTier, provenanceLabel } from "@/lib/provenance";

// ── Provenance badge (UX backlog P0-1) ─────────────────────────────────
// Three states: Evidenced / AI-inferred / Human-confirmed. Clicking opens the
// source excerpt so "where did this come from?" is answerable in two clicks.

const STATE_STYLE: Record<ItemProvenance["state"], { color: string; icon: string }> = {
  evidenced: { color: "var(--cyan)", icon: "doc" },
  ai_inferred: { color: "var(--yellow)", icon: "sparkles" },
  human_confirmed: { color: "var(--green)", icon: "checkmark" },
};

export function ProvenanceBadge({ provenance, compact, quiet }: { provenance?: ItemProvenance; compact?: boolean; quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const p = provenance ?? { state: "ai_inferred" as const };
  const isTemplate = p.source === "role_template";
  const style = isTemplate ? { color: "var(--text-4)", icon: "filter" } : STATE_STYLE[p.state];
  const label = isTemplate ? "Template" : provenanceLabel(p.state);
  const tier = p.state === "ai_inferred" && !isTemplate ? confidenceTier(p.confidence) : null;
  const badgeColor = quiet ? "var(--text-4)" : style.color;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        className="tag"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={`${label} — click for source`}
        style={{
          cursor: "pointer",
          color: badgeColor,
          borderColor: quiet ? "var(--border-1)" : style.color,
          background: quiet ? "transparent" : `color-mix(in srgb, ${style.color} 10%, transparent)`,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        aria-expanded={open}
      >
        <Icon name={style.icon} size={10} stroke={badgeColor} />
        {!compact && label}
        {tier && !compact && <span style={{ opacity: 0.8 }}>· {tier}</span>}
      </button>
      {open && (
        <span
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, width: 520, maxWidth: "40vw",
            background: "var(--bg-2)", border: `1px solid var(--border-2)`, borderRadius: 8,
            padding: "10px 12px", fontSize: 12, color: "var(--text-2)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            textAlign: "left", display: "block",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: style.color, marginBottom: 6 }}>
            <Icon name={style.icon} size={11} stroke={style.color} /> {label}
            {p.confidence !== undefined && <span className="tag" style={{ marginLeft: "auto" }}>{Math.round(p.confidence * 100)}%</span>}
          </span>
          {p.evidence_quote ? (
            <span style={{ display: "block", fontStyle: "italic", color: "var(--text-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>"{p.evidence_quote}"</span>
          ) : isTemplate ? (
            <span style={{ display: "block" }}>Role-template fallback. This is boilerplate based on title/department, not extracted from the transcript.</span>
          ) : p.state === "ai_inferred" ? (
            <span style={{ display: "block" }}>No direct transcript evidence — inferred by the parser{p.confidence !== undefined ? ` (${confidenceTier(p.confidence)} confidence)` : ""}. Confirm or correct in review.</span>
          ) : null}
          {p.source && <span style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--text-4)" }}>Source: {p.source}</span>}
          {p.confirmed_by && <span style={{ display: "block", marginTop: 4, fontSize: 11.5, color: "var(--text-4)" }}>Confirmed by {p.confirmed_by}{p.confirmed_at ? ` · ${new Date(p.confirmed_at).toLocaleString()}` : ""}</span>}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Close</button>
        </span>
      )}
    </span>
  );
}

// ── Risk-tier badge (UX backlog P1-5): one visual system everywhere ────

const RISK_STYLE: Record<RiskLevel, { color: string; icon: string }> = {
  low: { color: "var(--green)", icon: "checkmark" },
  medium: { color: "var(--yellow)", icon: "warning" },
  high: { color: "var(--red)", icon: "warning" },
  critical: { color: "var(--red)", icon: "lock" },
};

export function RiskBadge({ level }: { level?: RiskLevel }) {
  const lvl = level ?? "low";
  const style = RISK_STYLE[lvl];
  return (
    <span className="tag" style={{ color: style.color, borderColor: style.color, display: "inline-flex", alignItems: "center", gap: 4 }} title={`Risk tier: ${lvl}`}>
      <Icon name={style.icon} size={10} stroke={style.color} />
      {lvl}
    </span>
  );
}
