import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { Changeset } from "@/lib/orgSync";
import { computeChangeset } from "@/lib/orgSync";
import { parseDiscovery } from "@/lib/api";
import { getGovernanceRules } from "@/lib/governance";
import { runStackDiffDeterministic } from "@/lib/stackSync";
import type { AgentRegistryEntry, CompanyContext, ParsedMap, PedigreeState, Person, StackChangeProposal } from "@/types";

interface Props {
  open: boolean;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  registry?: AgentRegistryEntry[];
  onClose: () => void;
  onApply: (parsed: ParsedMap, changeset: Changeset, approvedIds: string[], stackProposals: StackChangeProposal[]) => void;
}

const PROPOSAL_TAGS: Record<StackChangeProposal["type"], { label: string; cls: string }> = {
  new_task: { label: "new task", cls: "cyan" },
  task_changed: { label: "task changed", cls: "" },
  ownership_transfer: { label: "ownership transfer", cls: "yellow" },
  rule_changed: { label: "rule changed", cls: "yellow" },
  authority_change: { label: "authority change", cls: "yellow" },
  agent_feedback: { label: "agent feedback", cls: "" },
  retire_candidate: { label: "retire candidate", cls: "" },
};

export function OrgSyncModal({ open, people, pedigree, companyContext, registry, onClose, onApply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMap | null>(null);
  const [changeset, setChangeset] = useState<Changeset | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [proposals, setProposals] = useState<StackChangeProposal[]>([]);
  const [approvedProposals, setApprovedProposals] = useState<Set<string>>(new Set());
  const [confirmedExpansions, setConfirmedExpansions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setText(""); setParsed(null); setChangeset(null); setErr(null); setApproved(new Set());
      setProposals([]); setApprovedProposals(new Set()); setConfirmedExpansions(new Set());
    }
  }, [open]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  if (!open) return null;

  const compute = async () => {
    setBusy("Analyzing transcript…");
    setErr(null);
    try {
      const r = await parseDiscovery(people, text, undefined, companyContext);
      const cs = computeChangeset(people, pedigree, r.parsed);
      const stack = runStackDiffDeterministic({
        parsed: r.parsed,
        transcript: text,
        people,
        pedigree,
        registry: registry ?? [],
        rules: getGovernanceRules(companyContext),
      });
      setParsed(r.parsed);
      setChangeset(cs);
      setProposals(stack);
      setApproved(new Set(cs.deltas.map((d) => d.personId))); // default: approve all person deltas
      // Authority-expanding proposals are NEVER pre-approved.
      setApprovedProposals(new Set(stack.filter((p) => !p.authority_expanding).map((p) => p.id)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) => setApproved((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleProposal = (p: StackChangeProposal) => {
    if (p.authority_expanding && !approvedProposals.has(p.id) && !confirmedExpansions.has(p.id)) return; // must confirm first
    setApprovedProposals((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; });
  };
  const toggleConfirm = (p: StackChangeProposal) => {
    setConfirmedExpansions((prev) => {
      const n = new Set(prev);
      if (n.has(p.id)) {
        n.delete(p.id);
        setApprovedProposals((ap) => { const m = new Set(ap); m.delete(p.id); return m; });
      } else {
        n.add(p.id);
      }
      return n;
    });
  };

  const apply = () => {
    if (!parsed || !changeset) return;
    const decided = proposals
      .filter((p) => approvedProposals.has(p.id))
      .filter((p) => !p.authority_expanding || confirmedExpansions.has(p.id))
      .map((p) => ({ ...p, decision: { by: "", at: new Date().toISOString(), action: "applied" as const } }));
    onApply(parsed, changeset, [...approved], decided);
  };

  const hasAnything = (changeset?.deltas.length ?? 0) > 0 || proposals.length > 0;
  const applyCount = approved.size + proposals.filter((p) => approvedProposals.has(p.id) && (!p.authority_expanding || confirmedExpansions.has(p.id))).length;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h">
            <h3><Icon name="history" size={16} stroke="var(--cyan)" /> Org Sync — Stack Refresh</h3>
            <div className="sub">Paste a recent transcript. Pedigree diffs it against the responsibility map, the agent registry, and the governance rules — nothing is applied until you approve it, and authority-expanding proposals require explicit confirmation.</div>
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
              <textarea className="textarea" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a Fireflies transcript here. Pedigree will detect new tasks, changed tasks, ownership shifts, governance rule changes, agent feedback, and retire candidates…" style={{ minHeight: 220 }} />
              {err && <div className="hint" style={{ color: "var(--red)" }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}
              <div className="hint"><Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Roles and missions are stable; this surfaces what changed — and flags anything that would expand an agent's authority.</div>
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border-1)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                {([["New responsibilities", changeset.summary.newResponsibilities, "cyan"], ["New tasks", changeset.summary.newTasks, "cyan"], ["Reassignments", changeset.summary.reassignments, "yellow"], ["Stack proposals", proposals.length, "cyan"], ["Authority-expanding", proposals.filter((p) => p.authority_expanding).length, "red"]] as [string, number, string][]).map(([l, v, c], i) => (
                  <div key={i} style={{ background: "var(--bg-2)", padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: c === "cyan" ? "var(--cyan)" : c === "yellow" ? "var(--yellow)" : c === "red" ? "var(--red)" : "var(--text-1)" }}>{v}</div>
                  </div>
                ))}
              </div>

              {!hasAnything ? (
                <div className="drawer-empty">No changes detected since the last sync. Roles, ownership, and governance look stable.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {proposals.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 2 }}>Stack changeset — typed proposals with transcript evidence. Applied changes mark affected agents stale; recompiling is a separate explicit step per agent.</div>
                      {proposals.map((p) => {
                        const on = approvedProposals.has(p.id);
                        const tag = PROPOSAL_TAGS[p.type];
                        return (
                          <div key={p.id} className="manifest-card" style={{ marginBottom: 0, opacity: on ? 1 : 0.6, border: p.authority_expanding ? "1px solid var(--red)" : undefined }}>
                            <div className="manifest-card-head" style={{ cursor: "pointer" }} onClick={() => toggleProposal(p)}>
                              <span style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontWeight: 600, color: "var(--text-1)", fontSize: 12.5 }}>
                                <span className="tgl" data-on={on} style={{ pointerEvents: "none" }} />
                                <span className={`tag ${tag.cls}`}>{tag.label}</span>
                                {p.authority_expanding && <span className="tag" style={{ color: "var(--red)", borderColor: "var(--red)" }}><Icon name="warning" size={10} stroke="var(--red)" /> expands authority</span>}
                              </span>
                              <span className="right"><span className="tag">{Math.round(p.confidence * 100)}%</span></span>
                            </div>
                            <div className="manifest-card-body">
                              <div style={{ fontSize: 12.5 }}>{p.summary}</div>
                              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>"{p.evidence_quote}"</div>
                              {(p.affected.agent_ids.length > 0) && (
                                <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>Affected agents: {p.affected.agent_ids.join(", ")} — will be marked <span className="tag yellow">stale</span></div>
                              )}
                              {p.authority_expanding && (
                                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11.5, color: "var(--red)", cursor: "pointer" }}>
                                  <input type="checkbox" checked={confirmedExpansions.has(p.id)} onChange={() => toggleConfirm(p)} />
                                  I explicitly approve this authority-expanding change and accept responsibility for the widened scope.
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {changeset.deltas.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--text-4)", margin: "6px 0 2px" }}>Per-person responsibility deltas (merged; never overwrites existing mappings).</div>
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
                                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--cyan)", marginBottom: 4 }}>New responsibilities</div>
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
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Human-approved changes only · every application writes an audit record with evidence.</span>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            {!changeset ? (
              <button className="btn btn-primary" disabled={!text.trim() || !!busy} onClick={compute}><Icon name="sparkles" size={12} /> Compute Changes</button>
            ) : (
              <button className="btn btn-primary" disabled={applyCount === 0 || !hasAnything} onClick={apply}>
                <Icon name="checkmark" size={12} /> Apply {applyCount} approved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
