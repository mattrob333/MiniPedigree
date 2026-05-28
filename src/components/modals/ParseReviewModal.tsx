import { Icon } from "../Icon";
import type { ParsedMap, Person } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  people: Person[];
  parsed: ParsedMap | null;
  source: "ai" | "local";
}

export function ParseReviewModal({ open, onClose, onApply, people, parsed, source }: Props) {
  if (!open || !parsed) return null;

  let resp = 0, deleg = 0, appr = 0, notd = 0, review = 0;
  for (const pid of Object.keys(parsed)) {
    const d = parsed[pid];
    if (d.needsReview) review++;
    for (const r of d.responsibilities) {
      resp++;
      deleg += r.tasks.delegatable.length;
      appr += r.tasks.approval.length;
      notd += r.tasks.not_delegatable.length;
    }
  }

  const firstWithData = people.find((p) => (parsed[p.id]?.responsibilities.length ?? 0) > 0)?.id;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h">
            <h3>
              <Icon name="sparkles" size={16} stroke="var(--cyan)" /> Parsed responsibilities
              <span className="tag cyan" style={{ marginLeft: 6 }}>{source === "ai" ? "GPT" : "Preview"}</span>
            </h3>
            <div className="sub">Review the proposed mapping before applying it to the spreadsheet and org map.</div>
          </div>
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border-1)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {([["Responsibilities", resp, ""], ["Delegatable", deleg, "cyan"], ["Approval req.", appr, "yellow"], ["Not delegatable", notd, ""], ["Needs review", review, "yellow"]] as [string, number, string][]).map(([l, v, c], i) => (
              <div key={i} style={{ background: "var(--bg-2)", padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: c === "cyan" ? "var(--cyan)" : c === "yellow" ? "var(--yellow)" : "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {people.map((p) => {
              const d = parsed[p.id];
              if (!d || d.responsibilities.length === 0) return null;
              const totalD = d.responsibilities.reduce((s, r) => s + r.tasks.delegatable.length, 0);
              const totalA = d.responsibilities.reduce((s, r) => s + r.tasks.approval.length, 0);
              const totalN = d.responsibilities.reduce((s, r) => s + r.tasks.not_delegatable.length, 0);
              return (
                <details key={p.id} className="manifest-card" open={p.id === firstWithData} style={{ marginBottom: 0 }}>
                  <summary className="manifest-card-head" style={{ cursor: "pointer", listStyle: "none" }}>
                    <span style={{ color: "var(--text-1)", fontWeight: 600, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name="chevron-right" size={10} />
                      {p.name}
                      <span className="dim" style={{ fontWeight: 400, fontFamily: "var(--font-sans)", fontSize: 11, textTransform: "none", letterSpacing: 0 }}>{p.title}</span>
                    </span>
                    <span className="right" style={{ display: "flex", gap: 6 }}>
                      <span className="tag">{d.responsibilities.length} resp</span>
                      <span className="tag cyan">{totalD} deleg</span>
                      {totalA > 0 && <span className="tag yellow">{totalA} appr</span>}
                      {totalN > 0 && <span className="tag">{totalN} human</span>}
                      {d.needsReview && <span className="badge needs-review"><span className="dot" />Needs review</span>}
                    </span>
                  </summary>
                  <div className="manifest-card-body">
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10, fontStyle: "italic" }}>"{d.summary}"</div>
                    {d.responsibilities.map((r) => (
                      <div key={r.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px dashed var(--border-1)" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="tag cyan">{r.id}</span>
                          {r.title}
                          {r.unclear && <span className="badge needs-review" style={{ marginLeft: "auto" }}><span className="dot" />unclear</span>}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {r.tasks.delegatable.map((t, i) => <span key={"d" + i} className="tag cyan">{t}</span>)}
                          {r.tasks.approval.map((t, i) => <span key={"a" + i} className="tag yellow">{t}</span>)}
                          {r.tasks.not_delegatable.map((t, i) => <span key={"n" + i} className="tag">{t}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Applying will update the Pedigree columns and org map.</span>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onApply}>
              <Icon name="checkmark" size={12} /> Apply to Spreadsheet & Org Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
