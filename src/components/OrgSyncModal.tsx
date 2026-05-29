import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { Changeset } from "@/lib/orgSync";
import { computeChangeset } from "@/lib/orgSync";
import { parseDiscovery } from "@/lib/api";
import type { CompanyContext, ParsedMap, PedigreeState, Person } from "@/types";

interface Props {
  open: boolean;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  onClose: () => void;
  onApply: (parsed: ParsedMap, changeset: Changeset, approvedIds: string[]) => void;
}

export function OrgSyncModal({ open, people, pedigree, companyContext, onClose, onApply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMap | null>(null);
  const [changeset, setChangeset] = useState<Changeset | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) { setText(""); setParsed(null); setChangeset(null); setErr(null); setApproved(new Set()); }
  }, [open]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  if (!open) return null;

  const compute = async () => {
    setBusy("Analyzing transcript…");
    setErr(null);
    try {
      const r = await parseDiscovery(people, text, undefined, companyContext);
      const cs = computeChangeset(people, pedigree, r.parsed);
      setParsed(r.parsed);
      setChangeset(cs);
      setApproved(new Set(cs.deltas.map((d) => d.personId))); // default: approve all
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) => setApproved((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h">
            <h3><Icon name="history" size={16} stroke="var(--cyan)" /> Org Sync — Discovery Refresh</h3>
            <div className="sub">Paste a recent Fireflies transcript or meeting notes. Pedigree proposes a changeset — nothing is applied until you approve it. Reconciles; never overwrites existing mappings.</div>
          </div>
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          {!changeset ? (
            <div className="form-field">
              <div className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Transcript / meeting notes{busy && <span style={{ color: "var(--cyan)" }}> · {busy}</span>}</span>
                <span style={{ color: "var(--text-4)", fontSize: 10 }}>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
              <textarea className="textarea" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a Fireflies transcript here. Pedigree will detect new responsibilities, new tasks, and ownership shifts since the last sync…" style={{ minHeight: 220 }} />
              {err && <div className="hint" style={{ color: "var(--red)" }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}
              <div className="hint"><Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Roles and missions are stable; this surfaces what changed — new initiatives and ownership shifts.</div>
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--border-1)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                {([["New responsibilities", changeset.summary.newResponsibilities, "cyan"], ["New tasks", changeset.summary.newTasks, "cyan"], ["Reassignments", changeset.summary.reassignments, "yellow"], ["People affected", changeset.summary.peopleAffected, ""]] as [string, number, string][]).map(([l, v, c], i) => (
                  <div key={i} style={{ background: "var(--bg-2)", padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: c === "cyan" ? "var(--cyan)" : c === "yellow" ? "var(--yellow)" : "var(--text-1)" }}>{v}</div>
                  </div>
                ))}
              </div>

              {changeset.deltas.length === 0 ? (
                <div className="drawer-empty">No changes detected since the last sync. Roles and ownership look stable.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 2 }}>Review each person's proposed changes, then apply the approved ones.</div>
                  {changeset.deltas.map((d) => {
                    const p = byId.get(d.personId);
                    if (!p) return null;
                    const on = approved.has(d.personId);
                    return (
                      <div key={d.personId} className="manifest-card" style={{ marginBottom: 0, opacity: on ? 1 : 0.55 }}>
                        <div className="manifest-card-head" style={{ cursor: "pointer" }} onClick={() => toggle(d.personId)}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontWeight: 600, color: "var(--text-1)", fontSize: 12.5 }}>
                            <span className="tgl" data-on={on} style={{ pointerEvents: "none" }} />
                            {p.name} <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>{p.title}</span>
                          </span>
                          <span className="right" style={{ display: "flex", gap: 5 }}>
                            {d.addedResponsibilities.length > 0 && <span className="tag cyan">+{d.addedResponsibilities.length} resp</span>}
                            {d.addedTasks.length > 0 && <span className="tag">+{d.addedTasks.length} tasks</span>}
                            {d.reassignedFrom.length > 0 && <span className="tag yellow">{d.reassignedFrom.length} reassigned</span>}
                          </span>
                        </div>
                        <div className="manifest-card-body">
                          {d.addedResponsibilities.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div className="rc-label cy" style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--cyan)", marginBottom: 4 }}>New responsibilities</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{d.addedResponsibilities.map((t) => <span key={t} className="tag cyan">{t}</span>)}</div>
                            </div>
                          )}
                          {d.addedTasks.length > 0 && (
                            <div style={{ marginBottom: d.reassignedFrom.length ? 8 : 0 }}>
                              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 4 }}>New tasks</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{d.addedTasks.map((t, i) => <span key={i} className={"tag " + (t.cls === "delegatable" ? "cyan" : t.cls === "approval" ? "yellow" : "")}>{t.label}</span>)}</div>
                            </div>
                          )}
                          {d.reassignedFrom.length > 0 && (
                            <div>
                              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--yellow)", marginBottom: 4 }}>Ownership shifts</div>
                              {d.reassignedFrom.map((r, i) => (
                                <div key={i} className="lineage" style={{ marginTop: 2 }}>
                                  <span className="chip">{byId.get(r.fromPersonId)?.name ?? "someone"}</span><span className="arrow">→</span><span className="chip" style={{ color: "var(--cyan)" }}>{p.name}</span>
                                  <span className="resp-source" style={{ marginLeft: 8 }}>{r.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Human-approved org deltas · nothing applied without your sign-off.</span>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            {!changeset ? (
              <button className="btn btn-primary" disabled={!text.trim() || !!busy} onClick={compute}><Icon name="sparkles" size={12} /> Compute Changes</button>
            ) : (
              <button className="btn btn-primary" disabled={approved.size === 0 || changeset.deltas.length === 0} onClick={() => parsed && onApply(parsed, changeset, [...approved])}>
                <Icon name="checkmark" size={12} /> Apply {approved.size} approved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
