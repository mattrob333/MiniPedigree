import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { ProvenanceBadge, RiskBadge } from "./ProvenanceBadge";
import { buildReviewQueue, isBulkConfirmable, provenanceLabel, type ReviewEditPatch, type ReviewQueueItem } from "@/lib/provenance";
import { canReview as roleCanReview } from "@/lib/rbac";
import { getDepartmentColor } from "@/lib/departments";
import { initials } from "@/lib/util";
import type { PedigreeState, Person, ProvenanceState, TaskSpec, UserRole } from "@/types";

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  taskSpecs: Record<string, TaskSpec>;
  role: UserRole;
  canRefineWithAi: boolean;
  onConfirm: (items: ReviewQueueItem[]) => void;
  onEdit?: (item: ReviewQueueItem, patch: ReviewEditPatch) => void;
  onPlanAgents: () => void;
  onSwitchToReviewerDemo: () => void;
  onAddFollowUpQuestion: (personId: string, question: string, sourceRef: string) => void;
  onRefineTasks: (items: ReviewQueueItem[]) => Promise<void>;
  onUpdateTaskSpec: (taskId: string, patch: Partial<TaskSpec>) => void;
  onToast?: (t1: string, t2?: string, green?: boolean) => void;
}

const SECTION_DEFS: { title: string; getItems: (items: ReviewQueueItem[]) => ReviewQueueItem[] }[] = [
  { title: "Responsibilities", getItems: (items) => items.filter((i) => i.kind === "responsibility") },
  { title: "Tasks ready for delegation", getItems: (items) => items.filter((i) => i.kind === "task" && i.cls === "delegatable") },
  { title: "Approval-required tasks", getItems: (items) => items.filter((i) => i.kind === "task" && i.cls === "approval") },
  { title: "Not-delegatable tasks", getItems: (items) => items.filter((i) => i.kind === "task" && i.cls === "not_delegatable") },
];

function commonProvenance(item: ReviewQueueItem): boolean {
  if (item.cls === "not_delegatable") return false;
  if (item.provenance.confidence !== undefined && item.provenance.confidence < 0.7) return false;
  return item.provenance.state === "evidenced" || item.provenance.state === "ai_inferred";
}

export function reviewConfirmEligibility(items: ReviewQueueItem[]) {
  const eligible = items.filter(isBulkConfirmable);
  const aiDrafted = items.filter((item) => !isBulkConfirmable(item));
  return { eligible, aiDrafted, eligibleCount: eligible.length, total: items.length };
}

export function confirmGroupLabel(total: number, eligible: number): string {
  if (eligible === 0) return "Confirm evidenced";
  if (eligible === total) return `Confirm all ${total}`;
  return `Confirm ${eligible} evidenced`;
}

function groupByPerson(items: ReviewQueueItem[], people: Person[]): { person: Person; items: ReviewQueueItem[] }[] {
  const byPerson = new Map<string, ReviewQueueItem[]>();
  for (const item of items) byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
  return [...byPerson.entries()].map(([personId, groupItems]) => {
    const person = people.find((p) => p.id === personId) ?? {
      id: personId,
      name: groupItems[0]?.personName ?? personId,
      title: "",
      department: groupItems[0]?.department ?? "",
      email: "",
      managerId: "",
      tools: [],
    } as Person;
    return { person, items: groupItems };
  });
}

function notStated(value: string[] | string | null | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "not stated in transcript";
  return value?.trim() || "not stated in transcript";
}

export function ReviewInbox({
  people,
  pedigree,
  taskSpecs,
  role,
  canRefineWithAi,
  onConfirm,
  onEdit,
  onPlanAgents,
  onSwitchToReviewerDemo,
  onAddFollowUpQuestion,
  onRefineTasks,
  onUpdateTaskSpec,
  onToast,
}: Props) {
  const [department, setDepartment] = useState("all");
  const [risk, setRisk] = useState("all");
  const [provenance, setProvenance] = useState("all");
  const [cls, setCls] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNote, setEditNote] = useState("");
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [confirmPopover, setConfirmPopover] = useState<{ key: string; person: Person; items: ReviewQueueItem[] } | null>(null);
  const [detailItem, setDetailItem] = useState<ReviewQueueItem | null>(null);
  const [refining, setRefining] = useState(false);
  const initialQueueSize = useRef<number | null>(null);

  const queue = useMemo(() => buildReviewQueue(people, pedigree), [people, pedigree]);
  if (initialQueueSize.current === null || queue.length > initialQueueSize.current) initialQueueSize.current = queue.length;

  const departments = useMemo(() => Array.from(new Set(people.map((p) => p.department))).sort(), [people]);
  const canReview = roleCanReview(role);
  const totalForProgress = initialQueueSize.current ?? queue.length;
  const reviewedCount = Math.max(0, totalForProgress - queue.length);
  const progressPct = totalForProgress ? Math.round((reviewedCount / totalForProgress) * 100) : 100;

  const filtered = queue.filter((item) =>
    (department === "all" || item.department === department) &&
    (risk === "all" || (item.riskLevel ?? "low") === risk) &&
    (provenance === "all" || item.provenance.state === (provenance as ProvenanceState)) &&
    (cls === "all" || item.cls === cls || (cls === "responsibility" && item.kind === "responsibility")),
  );

  const bulkable = filtered.filter(isBulkConfirmable);
  const selectedItems = filtered.filter((i) => selected.has(i.key));
  const confirmedTasksForRefine = useMemo(() => {
    const pendingKeys = new Set(queue.map((item) => item.key));
    const out: ReviewQueueItem[] = [];
    for (const person of people) {
      const row = pedigree[person.id];
      if (!row) continue;
      for (const bucket of [row.tasks.delegatable, row.tasks.approval, row.tasks.not_delegatable]) {
        for (const task of bucket) {
          if (task.provenance?.state !== "human_confirmed") continue;
          const key = `${person.id}:task:${task.id}`;
          if (pendingKeys.has(key) || taskSpecs[task.id]) continue;
          out.push({
            key,
            kind: "task",
            personId: person.id,
            personName: person.name,
            department: person.department,
            label: task.label,
            description: task.description,
            reviewer_note: task.reviewer_note,
            itemId: task.id,
            cls: row.tasks.delegatable.includes(task) ? "delegatable" : row.tasks.approval.includes(task) ? "approval" : "not_delegatable",
            respId: task.respId,
            respTitle: task.respTitle,
            riskLevel: task.riskLevel,
            completion: task.completion,
            provenance: task.provenance,
          });
        }
      }
    }
    return out;
  }, [people, pedigree, queue, taskSpecs]);

  useEffect(() => {
    const liveKeys = new Set(queue.map((item) => item.key));
    setSelected((prev) => new Set([...prev].filter((key) => liveKeys.has(key))));
    if (detailItem && !liveKeys.has(detailItem.key)) setDetailItem(null);
  }, [queue, detailItem]);

  const toastConfirm = (title: string, confirmed: number, remaining = 0) => {
    onToast?.(title, `${confirmed} confirmed${remaining ? ` - ${remaining} AI-drafted still needs review` : ""}`, true);
  };

  const confirmItems = (items: ReviewQueueItem[], title: string, remaining = 0) => {
    if (!items.length) return;
    onConfirm(items);
    setSelected(new Set());
    setConfirmPopover(null);
    toastConfirm(title, items.length, remaining);
  };

  const toggleSelect = (item: ReviewQueueItem) => {
    if (!isBulkConfirmable(item)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(item.key) ? next.delete(item.key) : next.add(item.key);
      return next;
    });
  };

  const beginEdit = (item: ReviewQueueItem) => {
    setEditingKey(item.key);
    setEditText(item.label);
    setEditDescription(item.description ?? taskSpecs[item.itemId]?.plainLanguageDescription ?? "");
    setEditNote(item.reviewer_note ?? "");
  };

  const saveEdit = (item: ReviewQueueItem) => {
    if (!onEdit || !editText.trim()) return;
    onEdit(item, {
      label: editText.trim(),
      description: editDescription.trim() || undefined,
      reviewer_note: editNote.trim() || undefined,
    });
    setEditingKey(null);
    onToast?.("Edited and confirmed", editText.trim(), true);
  };

  const confirmPersonGroup = (person: Person, items: ReviewQueueItem[], key: string) => {
    const { eligible, aiDrafted, eligibleCount, total } = reviewConfirmEligibility(items);
    if (eligibleCount === 0) return;
    if (eligibleCount === total) {
      confirmItems(eligible, `Confirmed all for ${person.name}`);
      return;
    }
    setConfirmPopover({ key, person, items });
  };

  const refine = async (items: ReviewQueueItem[]) => {
    if (!items.length || refining) return;
    setRefining(true);
    try {
      await onRefineTasks(items);
    } finally {
      setRefining(false);
    }
  };

  const renderRow = (item: ReviewQueueItem) => {
    const bulkOk = isBulkConfirmable(item);
    const evidenceOpen = expandedEvidence.has(item.key);
    const spec = taskSpecs[item.itemId];
    const rowDescription = item.description ?? spec?.plainLanguageDescription;
    return (
      <div key={item.key} className="review-card">
        <div className="review-row">
          <input
            type="checkbox"
            checked={selected.has(item.key)}
            disabled={!canReview || !bulkOk}
            title={bulkOk ? "Eligible for evidenced bulk confirm" : "AI-drafted findings need individual review"}
            onChange={() => toggleSelect(item)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${item.label}`}
          />
          <button className="review-row-main" onClick={() => setDetailItem(item)}>
            <div className="review-row-title">{item.label}</div>
            <div className="review-row-meta">
              {rowDescription || (item.kind === "task" ? item.cls?.replace(/_/g, " ") : "responsibility")}
            </div>
          </button>
          <div className="review-row-badges">
            {item.kind === "task" && <RiskBadge level={item.riskLevel} />}
            <ProvenanceBadge provenance={item.provenance} quiet={commonProvenance(item)} />
          </div>
          <div className="review-row-actions">
            {item.provenance.evidence_quote && (
              <button className="btn btn-sm btn-ghost" onClick={() => setExpandedEvidence((prev) => {
                const next = new Set(prev);
                next.has(item.key) ? next.delete(item.key) : next.add(item.key);
                return next;
              })}>
                <Icon name="doc" size={11} /> {evidenceOpen ? "Hide" : "Evidence"}
              </button>
            )}
            {onEdit && <button className="btn btn-sm btn-ghost" disabled={!canReview} onClick={() => beginEdit(item)}>Edit</button>}
            <button
              className="btn btn-sm btn-outline-cyan"
              disabled={!canReview}
              title={canReview ? `Confirm this ${item.kind} (${provenanceLabel(item.provenance.state)})` : "Requires a reviewing role"}
              onClick={() => confirmItems([item], `Confirmed ${item.label}`)}
            >
              <Icon name="checkmark" size={11} /> Confirm
            </button>
          </div>
        </div>
        {evidenceOpen && item.provenance.evidence_quote && (
          <blockquote className="digest-evidence review-evidence">
            "{item.provenance.evidence_quote}"{item.provenance.source ? <span className="dim"> - {item.provenance.source}</span> : null}
          </blockquote>
        )}
        {editingKey === item.key && onEdit && (
          <div className="review-edit-row rich">
            <input className="input" value={editText} autoFocus onChange={(e) => setEditText(e.target.value)} />
            <textarea className="textarea" rows={3} value={editDescription} placeholder="Describe this task in plain language - what happens, with what, for whom" onChange={(e) => setEditDescription(e.target.value)} />
            <input className="input" value={editNote} placeholder="Optional reviewer note for refinement" onChange={(e) => setEditNote(e.target.value)} />
            <div className="review-edit-actions">
              <button className="btn btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>
              <button className="btn btn-sm btn-outline-cyan" disabled={!editText.trim()} onClick={() => saveEdit(item)}>Save & confirm</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDetailDrawer = () => {
    if (!detailItem) return null;
    const person = people.find((p) => p.id === detailItem.personId);
    const spec = taskSpecs[detailItem.itemId];
    const completion = detailItem.completion;
    const missing = [
      !completion?.trigger && "What triggers this work?",
      !completion?.inputs?.length && "What inputs are required?",
      !completion?.outputs?.length && "What output should be produced?",
      !completion?.tools_mentioned?.length && "What systems/tools are used?",
      !completion?.definition_of_done && "What does done look like?",
    ].filter(Boolean) as string[];
    const dod = spec?.definitionOfDone?.length
      ? spec.definitionOfDone
      : completion?.definition_of_done
        ? [completion.definition_of_done]
        : [];

    return (
      <>
        <div className="drawer-scrim open" onClick={() => setDetailItem(null)} />
        <aside className="review-detail-drawer drawer open">
          <div className="drawer-head">
            <button className="close" onClick={() => setDetailItem(null)}><Icon name="close" size={14} /></button>
            <div className="id-line">Review detail - {detailItem.kind}</div>
            <h2>{detailItem.label}</h2>
            <div className="meta">
              {person?.name ?? detailItem.personName} - {detailItem.respTitle ?? "No parent responsibility"}
            </div>
          </div>
          <div className="drawer-body">
            <section className="drawer-section">
              <div className="sh">Classification</div>
              <div className="review-detail-pills">
                <span className="tag">{detailItem.cls ?? "responsibility"}</span>
                {detailItem.kind === "task" && <RiskBadge level={detailItem.riskLevel} />}
                <ProvenanceBadge provenance={detailItem.provenance} quiet={commonProvenance(detailItem)} />
              </div>
            </section>
            <section className="drawer-section">
              <div className="sh">What this task means {spec && <span className="tag yellow">AI-drafted</span>}</div>
              <p className="review-detail-copy">{detailItem.description ?? spec?.plainLanguageDescription ?? "No plain-language description yet."}</p>
            </section>
            <section className="drawer-section">
              <div className="sh">Operating details</div>
              <div className="review-detail-kv">
                <span>Trigger</span><strong>{notStated(completion?.trigger)}</strong>
                <span>Inputs</span><strong>{notStated(completion?.inputs)}</strong>
                <span>Outputs</span><strong>{notStated(completion?.outputs)}</strong>
                <span>Dependencies</span><strong>{completion?.dependencies ? notStated([...completion.dependencies.upstream, ...completion.dependencies.downstream]) : "not stated in transcript"}</strong>
                <span>Tools</span><strong>{notStated(completion?.tools_mentioned)}</strong>
                <span>Approval</span><strong>{notStated(completion?.approval_boundary)}</strong>
              </div>
            </section>
            <section className="drawer-section">
              <div className="sh">Definition of done</div>
              {detailItem.kind === "task" && spec ? (
                <textarea
                  className="textarea"
                  rows={4}
                  value={dod.join("\n")}
                  onChange={(e) => onUpdateTaskSpec(detailItem.itemId, { definitionOfDone: e.target.value.split(/\n+/).map((line) => line.trim()).filter(Boolean) })}
                />
              ) : dod.length ? (
                <ul className="review-detail-list">{dod.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : (
                <div className="drawer-empty">not stated in transcript</div>
              )}
            </section>
            <section className="drawer-section">
              <div className="sh">Evidence</div>
              {detailItem.provenance.evidence_quote ? (
                <blockquote className="digest-evidence">"{detailItem.provenance.evidence_quote}"{detailItem.provenance.source ? <span className="dim"> - {detailItem.provenance.source}</span> : null}</blockquote>
              ) : (
                <div className="drawer-empty">No direct evidence - AI-drafted.</div>
              )}
              {completion?.evidence_quotes?.length ? (
                <ul className="review-detail-list">
                  {completion.evidence_quotes.map((quote, index) => <li key={`${quote.speaker}-${index}`}>{quote.speaker ? `${quote.speaker}: ` : ""}"{quote.quote}"</li>)}
                </ul>
              ) : null}
              {detailItem.provenance.confidence !== undefined && <div className="dim mono">{Math.round(detailItem.provenance.confidence * 100)}% confidence</div>}
            </section>
            <section className="drawer-section">
              <div className="sh">Missing details</div>
              {missing.length ? missing.map((question) => (
                <div className="review-missing-row" key={question}>
                  <span>{question}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => onAddFollowUpQuestion(detailItem.personId, question, detailItem.itemId)}>Add follow-up question</button>
                </div>
              )) : <div className="drawer-empty">No missing transcript details detected.</div>}
            </section>
            <div className="review-detail-actions">
              <button className="btn btn-primary" disabled={!canReview} onClick={() => confirmItems([detailItem], `Confirmed ${detailItem.label}`)}>Confirm</button>
              <button className="btn" disabled={!onEdit || !canReview} onClick={() => beginEdit(detailItem)}>Edit</button>
              {canRefineWithAi && detailItem.kind === "task" && <button className="btn btn-ghost" disabled={refining} onClick={() => refine([detailItem])}>Refine with AI</button>}
            </div>
          </div>
        </aside>
      </>
    );
  };

  return (
    <div className="review-inbox">
      <section className="review-purpose">
        <div>
          <div className="review-purpose-eyebrow"><Icon name="shield" size={13} stroke="var(--cyan)" /> Exception queue</div>
          <h2>Resolve exceptions</h2>
          <p>Session review is the normal human sign-off. This queue only holds findings that were flagged, low-confidence, template-derived, or applied without a reviewer. Resolve, edit, or reject each exception before it can feed an agent.</p>
        </div>
        <div className="review-progress">
          <div className="review-progress-label"><span>{reviewedCount} of {totalForProgress} reviewed</span><span>{queue.length} pending</span></div>
          <div className="review-progress-track"><span style={{ width: `${progressPct}%` }} /></div>
        </div>
      </section>

      {!canReview && (
        <div className="review-lock-banner">
          <Icon name="lock" size={12} stroke="var(--yellow)" />
          <span>Confirming provenance requires a Reviewer, Operator, or Governance Reviewer role.</span>
          <button className="btn btn-sm btn-ghost" onClick={onSwitchToReviewerDemo}>Switch to Reviewer (demo)</button>
        </div>
      )}

      {canRefineWithAi && confirmedTasksForRefine.length > 0 && (
        <div className="review-refine-banner">
          <span>{confirmedTasksForRefine.length} confirmed task{confirmedTasksForRefine.length === 1 ? "" : "s"} can be refined with AI into fuller specs before agent planning.</span>
          <button className="btn btn-sm btn-ghost" disabled={refining} onClick={() => refine(confirmedTasksForRefine)}>Refine {confirmedTasksForRefine.length} confirmed tasks</button>
        </div>
      )}

      <div className="review-toolbar">
        <span>Sorted highest-risk, lowest-confidence first.</span>
        <span style={{ flex: 1 }} />
        <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="select" value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">All risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="select" value={provenance} onChange={(e) => setProvenance(e.target.value)}>
          <option value="all">All provenance</option>
          <option value="evidenced">Evidenced</option>
          <option value="ai_inferred">AI-inferred only</option>
        </select>
        <select className="select" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classifications</option>
          <option value="delegatable">Delegation candidate</option>
          <option value="approval">Approval required</option>
          <option value="not_delegatable">Not delegatable</option>
          <option value="responsibility">Responsibilities</option>
        </select>
      </div>

      {queue.length === 0 ? (
        <div className="stage-complete-card review-complete-card">
          <div className="stage-complete-icon"><Icon name="checkmark" size={16} /></div>
          <div><h3>All findings reviewed</h3><p>The official map is confirmed. Refine confirmed tasks into fuller specs before agent planning, then plan agents.</p></div>
          <div className="stage-complete-actions">
            {canRefineWithAi && confirmedTasksForRefine.length > 0 && <button className="btn btn-ghost" disabled={refining} onClick={() => refine(confirmedTasksForRefine)}>Refine with AI</button>}
            <button className="btn btn-primary" onClick={onPlanAgents}><Icon name="robot" size={13} /> Plan agents</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="drawer-empty">Nothing matches these filters. Clear one to see the rest of the queue.</div>
      ) : (
        <>
          <div className="review-list-actions">
            <button className="btn btn-sm btn-ghost" disabled={!canReview || !bulkable.length} onClick={() => setSelected(new Set(bulkable.map((i) => i.key)))} title="Select every evidenced delegation-candidate item">
              Select evidenced bulk-confirmable ({bulkable.length})
            </button>
          </div>
          {SECTION_DEFS.map(({ title, getItems }) => {
            const sectionItems = getItems(filtered);
            if (!sectionItems.length) return null;
            return (
              <section className="review-section" key={title}>
                <div className="review-section-head"><h3>{title}</h3><span className="tag">{sectionItems.length}</span></div>
                {groupByPerson(sectionItems, people).map(({ person, items }) => {
                  const dept = getDepartmentColor(person.department);
                  const groupKey = `${title}-${person.id}`;
                  const { eligible, aiDrafted, eligibleCount, total } = reviewConfirmEligibility(items);
                  return (
                    <div className="review-person-group" key={groupKey}>
                      <div className="review-person-group-head">
                        <span className="avatar" style={{ boxShadow: `0 0 0 1px ${dept.border}` }}>{initials(person.name)}</span>
                        <div className="review-person-copy"><strong>{person.name}</strong><span>{person.department} ({items.length})</span></div>
                        <div className="review-person-actions">
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={!canReview || eligibleCount === 0}
                            title={eligibleCount === 0 ? `All ${total} findings here are AI-drafted (no transcript quote). Review them individually - or open each and Confirm after reading.` : undefined}
                            onClick={() => confirmPersonGroup(person, items, groupKey)}
                          >
                            <Icon name="checkmark" size={11} /> {confirmGroupLabel(total, eligibleCount)}
                          </button>
                          {confirmPopover?.key === groupKey && (
                            <div className="review-confirm-popover">
                              <strong>{eligibleCount} of {total} findings are evidenced and ready to confirm.</strong>
                              <span>The other {aiDrafted.length} are AI-drafted - no transcript quote backs them.</span>
                              <div>
                                <button className="btn btn-sm btn-primary" onClick={() => confirmItems(eligible, `Confirmed evidenced for ${person.name}`, aiDrafted.length)}>Confirm {eligibleCount} evidenced</button>
                                <button className="btn btn-sm btn-ghost" onClick={() => confirmItems(items, `Confirmed all for ${person.name}`)}>Confirm all {total} - I've reviewed this list</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="review-person-rows">{items.map(renderRow)}</div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}

      {selectedItems.length > 0 && (
        <div className="review-actionbar">
          <strong>{selectedItems.length} selected</strong>
          <button className="btn btn-sm btn-primary" disabled={!canReview} onClick={() => confirmItems(selectedItems.filter(isBulkConfirmable), `Confirmed selected findings`)}>
            <Icon name="checkmark" size={11} /> Confirm {selectedItems.length} selected
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {renderDetailDrawer()}
    </div>
  );
}
