import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  AgentRegistryEntry,
  AuthorityGrantScope,
  PedigreeState,
  Person,
  QuestionBacklogItem,
  StackSignal,
  WorkspaceAuditEvent,
} from "@/types";
import { taskFreshness, applyConfirmations, collectStaleItems, DEFAULT_FRESHNESS_CONFIG } from "@/lib/freshness";
import type { FreshnessState, TaskItem } from "@/types";
import { ingestSignals } from "@/lib/signalLedger";
import {
  memberAgentFeedback,
  memberAgentRequest,
  memberConfirmTask,
  memberCorrectTask,
  memberRetireTask,
  requestStatusLabel,
  type AgentRequest,
} from "@/lib/memberSignals";
import { applyAssertion } from "@/lib/authority";
import { buildPlainAgentCard } from "@/lib/manifestPlain";
import { serializeBacklogAnswer, resolveBacklogItem } from "@/lib/questionBacklog";
import { initials } from "@/lib/util";
import { getDepartmentColor } from "@/lib/departments";

// ── Living Stack Part B: "My Pedigree" — the member workspace ──────────
// Every person sees their own slice: their tasks (with freshness), their
// agents in plain language, questions waiting for them, and self-service
// actions. Member actions never write authority directly — everything
// routes through the signal ledger and digest review. The one exception:
// confirming your own task, which only updates its freshness timestamp.

export interface MemberStatePatch {
  ledger?: StackSignal[];
  pedigree?: PedigreeState;
  registry?: AgentRegistryEntry[];
  backlog?: QuestionBacklogItem[];
  people?: Person[];
  events?: WorkspaceAuditEvent[];
}

interface Props {
  person: Person;
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  ledger: StackSignal[];
  backlog: QuestionBacklogItem[];
  onChange: (patch: MemberStatePatch) => void;
  onBack: () => void;
  onToast: (t1: string, t2?: string, green?: boolean) => void;
}

const FRESHNESS_META: Record<FreshnessState, { label: string; color: string }> = {
  fresh: { label: "fresh", color: "var(--green)" },
  aging: { label: "aging", color: "var(--yellow)" },
  stale: { label: "needs a look", color: "var(--red)" },
};

export function MemberWorkspace({ person, people, pedigree, registry, ledger, backlog, onChange, onBack, onToast }: Props) {
  const row = pedigree[person.id];
  const dept = getDepartmentColor(person.department);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const myTasks = useMemo(() => {
    if (!row) return [] as { task: TaskItem; cls: string }[];
    return [
      ...row.tasks.delegatable.map((task) => ({ task, cls: "delegatable" })),
      ...row.tasks.approval.map((task) => ({ task, cls: "needs approval" })),
      ...row.tasks.not_delegatable.map((task) => ({ task, cls: "human-only" })),
    ];
  }, [row]);

  const myAgents = row?.agents ?? [];
  const registryById = useMemo(() => new Map(registry.map((e) => [e.agent_id, e])), [registry]);
  const myQuestions = backlog.filter((b) => b.person_id === person.id && !b.resolved_by_session_id);
  const myRequests = ledger.filter((s) => s.type === "new_candidate" && s.source.kind === "member" && s.source.person_id === person.id);
  const agentIdsForTask = (taskId: string) =>
    registry.filter((e) => e.task_id === taskId && e.status !== "retired").map((e) => e.agent_id);

  const ingestAndPatch = (signal: StackSignal, extra?: Partial<MemberStatePatch>) => {
    const result = ingestSignals(ledger, [signal]);
    const patch: MemberStatePatch = { ledger: result.ledger, ...extra };
    if (result.confirmations.length) {
      const freshened = applyConfirmations(pedigree, registry, result.confirmations.map((s) => s.refs));
      patch.pedigree = freshened.pedigree;
      patch.registry = freshened.registry;
    }
    patch.events = [{
      id: `EVT-${Date.now().toString(36)}-member`,
      type: "member_confirmation",
      actor: person.email,
      timestamp: new Date().toISOString(),
      summary: signal.evidence_quote,
      subject_id: signal.id,
    }];
    onChange(patch);
  };

  const confirmTask = (task: TaskItem) => {
    ingestAndPatch(memberConfirmTask(person, task, agentIdsForTask(task.id)));
    onToast("Confirmed", `"${task.label}" marked fresh — nothing else changed`, true);
  };

  const retireTask = (task: TaskItem) => {
    ingestAndPatch(memberRetireTask(person, task, agentIdsForTask(task.id)));
    onToast("Logged for review", "The retirement goes into this week's digest — nothing is removed until it's reviewed", true);
  };

  const submitCorrection = (task: TaskItem, cadence: string, tools: string, note: string) => {
    const signal = memberCorrectTask(person, task, {
      ...(cadence.trim() ? { cadence: cadence.trim() } : {}),
      ...(tools.trim() ? { tools: tools.split(",").map((t) => t.trim()).filter(Boolean) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }, agentIdsForTask(task.id));
    ingestAndPatch(signal);
    setCorrectingId(null);
    onToast(
      "Correction submitted",
      signal.authority_expanding
        ? "Adding tools expands authority — this goes to governance review, not straight to the map"
        : "It will appear in this week's digest for review",
      true,
    );
  };

  const submitAnswer = (item: QuestionBacklogItem, answer: string) => {
    if (!answer.trim()) return;
    const block = serializeBacklogAnswer(item, answer, person.email);
    const signal: StackSignal = {
      id: `SIG-ANS-${Date.now().toString(36)}`,
      type: "backlog_resolution",
      source: { kind: "member", person_id: person.id },
      evidence_quote: block,
      confidence: 0.95,
      refs: { person_ids: [person.id], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [item.id] },
      authority_expanding: false,
      captured_at: new Date().toISOString(),
      status: "ledgered",
    };
    const result = ingestSignals(ledger, [signal]);
    onChange({
      ledger: result.ledger,
      backlog: resolveBacklogItem(backlog, item.id, `member:${person.id}`),
      events: [{
        id: `EVT-${Date.now().toString(36)}-answer`,
        type: "member_confirmation",
        actor: person.email,
        timestamp: new Date().toISOString(),
        summary: `Answered open question: ${item.question}`,
        subject_id: item.id,
        evidence: block,
      }],
    });
    setAnsweringId(null);
    onToast("Answer recorded", "Saved as evidence with your attribution — discovery without a meeting", true);
  };

  const submitRequest = (request: AgentRequest) => {
    ingestAndPatch(memberAgentRequest(person, request));
    setRequestOpen(false);
    onToast("Request submitted", "Member requests count as corroboration — one meeting mention promotes it to review", true);
  };

  const selfAttestAccess = (system: string, scope: AuthorityGrantScope) => {
    const profile = person.authority ?? { system_grants: [], approval_authority: [], sod_roles: [], updated_at: new Date().toISOString() };
    const res = applyAssertion(profile, person.id, { kind: "system_access", system, scope, evidence_quote: `Self-attested in My Pedigree by ${person.email}` }, { source: "self_attested", person_id: person.id });
    if (res.discrepancies.length) {
      onToast("Recorded as a discrepancy", "A higher-trust source says otherwise — your claim was flagged for review, not applied");
    } else {
      onToast("Access attested", "Recorded as asserted — an operator review is needed before any agent compiles against it", true);
    }
    onChange({
      people: people.map((p) => (p.id === person.id ? { ...p, authority: res.profile } : p)),
      events: [{
        id: `EVT-${Date.now().toString(36)}-attest`,
        type: "authority_changed",
        actor: person.email,
        timestamp: new Date().toISOString(),
        summary: `${person.name} self-attested ${system}:${scope}${res.discrepancies.length ? " (discrepancy flagged)" : " (asserted, review-gated)"}`,
        subject_id: person.id,
      }],
    });
  };

  const staleCount = collectStaleItems([person], pedigree, registry).filter((i) => i.state === "stale" && i.kind === "task").length;
  const reports = people.filter((p) => p.managerId === person.id);

  return (
    <div className="profile-screen member-workspace">
      <div className="profile-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={12} /> Back</button>
        <div className="profile-id"><span className="cur">My Pedigree</span></div>
      </div>

      <div className="profile-body">
        <div className="profile-hero" style={{ marginBottom: 16 }}>
          <div className="avatar-lg" style={{ borderColor: dept.border }}>{initials(person.name)}</div>
          <div className="who">
            <h1>{person.name}</h1>
            <div className="meta">{person.title} · {person.department} · your slice of the stack — confirm, correct, answer, request</div>
            {staleCount > 0 && (
              <div className="member-nudge"><Icon name="warning" size={12} stroke="var(--yellow)" /> {staleCount} item{staleCount === 1 ? "" : "s"} need{staleCount === 1 ? "s" : ""} a quick confirm — has anything changed?</div>
            )}
          </div>
        </div>

        <div className="member-grid">
          {/* My Work */}
          <section className="profile-section">
            <div className="ps-head"><Icon name="spreadsheet" size={13} stroke="var(--cyan)" /> My Work <span className="tag">{myTasks.length}</span></div>
            {myTasks.length === 0 && <div className="drawer-empty">Nothing mapped yet — your responsibilities appear after a discovery session covers you.</div>}
            {myTasks.map(({ task, cls }) => {
              const freshness = taskFreshness(task, DEFAULT_FRESHNESS_CONFIG);
              const meta = FRESHNESS_META[freshness];
              return (
                <div className="member-task" key={task.id}>
                  <div className="member-task-main">
                    <div className="member-task-label">{task.label}</div>
                    <div className="member-task-meta">
                      <span className="tag">{cls}</span>
                      <span className="member-freshness" style={{ color: meta.color }}><span className="dot" style={{ background: meta.color }} /> {meta.label}</span>
                      {task.completion?.trigger && <span className="dim">{task.completion.trigger}</span>}
                    </div>
                  </div>
                  <div className="member-task-actions">
                    <button className="btn btn-sm btn-outline-cyan" onClick={() => confirmTask(task)} title="Still accurate — updates the freshness timestamp only">✓ Confirm</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setCorrectingId(correctingId === task.id ? null : task.id)}>Correct</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => retireTask(task)} title="No longer performed — goes to review, nothing is deleted silently">Gone</button>
                  </div>
                  {correctingId === task.id && <CorrectForm onSubmit={(cadence, tools, note) => submitCorrection(task, cadence, tools, note)} onCancel={() => setCorrectingId(null)} />}
                </div>
              );
            })}
          </section>

          {/* My Agents */}
          <section className="profile-section">
            <div className="ps-head"><Icon name="robot" size={13} stroke="var(--cyan)" /> My Agents <span className="tag">{myAgents.length}</span></div>
            {myAgents.length === 0 && <div className="drawer-empty">No agents yet. When a delegatable task of yours becomes an agent, its plain-language card appears here.</div>}
            {myAgents.map((agent) => {
              const manifestId = String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id);
              const card = buildPlainAgentCard(agent, registryById.get(manifestId));
              return (
                <div className="member-agent-card" key={agent.id}>
                  <div className="member-agent-head">
                    <strong>{card.name}</strong>
                    <span className="tag">v{card.version}</span>
                    <span className="tag cyan">{card.status}</span>
                    <span className="member-freshness" style={{ color: FRESHNESS_META[card.freshness].color }}>{FRESHNESS_META[card.freshness].label}</span>
                  </div>
                  <p className="member-agent-purpose">{card.what_it_does}</p>
                  <PlainList label="Can do on its own" items={card.may_do_alone} icon="checkmark" />
                  <PlainList label="Needs my approval first" items={card.needs_my_approval.map((a) => a.action)} icon="warning" />
                  <PlainList label="Blocked from" items={card.blocked_from} icon="lock" />
                  {card.tools.length > 0 && (
                    <div className="member-agent-tools">
                      {card.tools.map((t) => <span className="tag" key={t.name} title={t.scope_plain}>{t.name}: {t.scope_plain}</span>)}
                    </div>
                  )}
                  <ReportIssue onSubmit={(note) => { ingestAndPatch(memberAgentFeedback(person, manifestId, note)); onToast("Issue reported", "Attached to the agent's record — repeated patterns escalate to a scope review", true); }} />
                </div>
              );
            })}
          </section>

          {/* My Questions */}
          <section className="profile-section">
            <div className="ps-head"><Icon name="info" size={13} stroke="var(--cyan)" /> My Questions <span className="tag">{myQuestions.length}</span>
              <span className="dim" style={{ fontSize: 10.5, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>answering here is discovery without a meeting</span>
            </div>
            {myQuestions.length === 0 && <div className="drawer-empty">Nothing waiting on you.</div>}
            {myQuestions.map((item) => (
              <div className="member-question" key={item.id}>
                <div className="member-q-text">{item.question}</div>
                {answeringId === item.id ? (
                  <AnswerForm onSubmit={(answer) => submitAnswer(item, answer)} onCancel={() => setAnsweringId(null)} />
                ) : (
                  <button className="btn btn-sm btn-outline-cyan" onClick={() => setAnsweringId(item.id)}>Answer</button>
                )}
              </div>
            ))}
          </section>

          {/* Request an Agent + My Access */}
          <section className="profile-section">
            <div className="ps-head"><Icon name="sparkles" size={13} stroke="var(--cyan)" /> Request an Agent <span className="tag">{myRequests.length}</span></div>
            {myRequests.map((request) => (
              <div className="member-request" key={request.id}>
                <span className="member-request-label">{String((request.proposed_patch as { label?: string } | undefined)?.label ?? request.evidence_quote.slice(0, 60))}</span>
                <span className="tag cyan">{requestStatusLabel(request.status)}</span>
              </div>
            ))}
            {requestOpen ? (
              <RequestAgentForm onSubmit={submitRequest} onCancel={() => setRequestOpen(false)} />
            ) : (
              <button className="btn btn-sm btn-outline-cyan" onClick={() => setRequestOpen(true)}><Icon name="plus" size={11} /> Describe recurring work you'd hand off</button>
            )}

            <div className="ps-head" style={{ marginTop: 18 }}><Icon name="lock" size={13} stroke="var(--cyan)" /> My Access</div>
            <p className="dim" style={{ fontSize: 11.5, margin: "0 0 8px" }}>
              Attest the systems you can actually use. Claims are recorded as <em>asserted</em> and review-gated — they describe your access, they never activate it.
            </p>
            <SelfAttestForm knownTools={person.tools} grants={person.authority?.system_grants ?? []} onAttest={selfAttestAccess} />

            {reports.length > 0 && (
              <>
                <div className="ps-head" style={{ marginTop: 18 }}><Icon name="users" size={13} stroke="var(--cyan)" /> My Team</div>
                {reports.map((r) => {
                  const stale = collectStaleItems([r], pedigree, registry).filter((i) => i.state === "stale" && i.kind === "task").length;
                  return (
                    <div className="member-request" key={r.id}>
                      <span className="member-request-label">{r.name} — {r.title}</span>
                      {stale > 0 ? <span className="tag yellow">{stale} stale item{stale === 1 ? "" : "s"}</span> : <span className="tag">fresh</span>}
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PlainList({ label, items, icon }: { label: string; items: string[]; icon: string }) {
  if (!items.length) return null;
  return (
    <div className="member-plain-list">
      <div className="lbl">{label}</div>
      {items.map((item) => (
        <div className="member-plain-item" key={item}><Icon name={icon} size={11} /> {item}</div>
      ))}
    </div>
  );
}

function ReportIssue({ onSubmit }: { onSubmit: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) {
    return <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}><Icon name="warning" size={11} /> Report issue</button>;
  }
  return (
    <div className="member-correct-form">
      <input
        className="input"
        placeholder='What went wrong? e.g. "the summary missed the renewals"'
        value={note}
        autoFocus
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { onSubmit(note); setNote(""); setOpen(false); } }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-sm btn-outline-cyan" disabled={!note.trim()} onClick={() => { onSubmit(note); setNote(""); setOpen(false); }}>Send</button>
      </div>
    </div>
  );
}

function CorrectForm({ onSubmit, onCancel }: { onSubmit: (cadence: string, tools: string, note: string) => void; onCancel: () => void }) {
  const [cadence, setCadence] = useState("");
  const [tools, setTools] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="member-correct-form">
      <input className="input" placeholder='New cadence, e.g. "every Tuesday" (optional)' value={cadence} onChange={(e) => setCadence(e.target.value)} />
      <input className="input" placeholder="Tools now involved, comma-separated (flags governance review)" value={tools} onChange={(e) => setTools(e.target.value)} />
      <input className="input" placeholder="What changed?" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-outline-cyan" disabled={!cadence.trim() && !tools.trim() && !note.trim()} onClick={() => onSubmit(cadence, tools, note)}>Submit for review</button>
      </div>
    </div>
  );
}

function AnswerForm({ onSubmit, onCancel }: { onSubmit: (answer: string) => void; onCancel: () => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="member-correct-form">
      <textarea className="textarea" rows={2} placeholder="Your answer, in your own words — it becomes evidence with your name on it." value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-outline-cyan" disabled={!answer.trim()} onClick={() => onSubmit(answer)}>Save answer</button>
      </div>
    </div>
  );
}

function RequestAgentForm({ onSubmit, onCancel }: { onSubmit: (request: AgentRequest) => void; onCancel: () => void }) {
  const [form, setForm] = useState<AgentRequest>({ work: "", last_time: "", cadence: "", inputs: "", output: "", tedious: "" });
  const set = (key: keyof AgentRequest) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div className="member-correct-form">
      <input className="input" placeholder="What's the recurring work?" value={form.work} onChange={set("work")} />
      <div style={{ display: "flex", gap: 6 }}>
        <input className="input" placeholder="Last time you did it?" value={form.last_time} onChange={set("last_time")} />
        <input className="input" placeholder="How often?" value={form.cadence} onChange={set("cadence")} />
      </div>
      <input className="input" placeholder="Which systems does it read from?" value={form.inputs} onChange={set("inputs")} />
      <input className="input" placeholder="What comes out, and who receives it?" value={form.output} onChange={set("output")} />
      <input className="input" placeholder="What makes it tedious?" value={form.tedious} onChange={set("tedious")} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-outline-cyan" disabled={!form.work.trim()} onClick={() => onSubmit(form)}>Submit request</button>
      </div>
    </div>
  );
}

function SelfAttestForm({ knownTools, grants, onAttest }: { knownTools: string[]; grants: { system: string; scope: string; status: string }[]; onAttest: (system: string, scope: AuthorityGrantScope) => void }) {
  const [system, setSystem] = useState(knownTools[0] ?? "");
  const [scope, setScope] = useState<AuthorityGrantScope>("read_only");
  return (
    <div>
      {grants.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {grants.map((g) => <span className="tag" key={g.system} title={`status: ${g.status}`}>{g.system}: {g.scope}{g.status === "asserted" ? " (unreviewed)" : ""}</span>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input className="input" placeholder="System" value={system} onChange={(e) => setSystem(e.target.value)} list="member-known-tools" />
        <datalist id="member-known-tools">{knownTools.map((t) => <option key={t} value={t} />)}</datalist>
        <select className="select" style={{ maxWidth: 130 }} value={scope} onChange={(e) => setScope(e.target.value as AuthorityGrantScope)} aria-label="Access level">
          {(["read_only", "draft_only", "read_write", "admin"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-sm btn-outline-cyan" disabled={!system.trim()} onClick={() => onAttest(system.trim(), scope)}>Attest</button>
      </div>
    </div>
  );
}
