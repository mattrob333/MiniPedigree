import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  ContextReadiness,
  DiscoveryPlan,
  PedigreeState,
  Person,
  PlannedSession,
  QuestionBacklogItem,
} from "@/types";
import { SESSION_LABEL, isMapped } from "@/lib/sessions";
import { discoveryCompletion, sessionDisplayStatus } from "@/lib/discoveryPlan";
import { backlogByPerson } from "@/lib/questionBacklog";
import { READINESS_MAX, readinessTier } from "@/lib/readiness";
import { getDepartmentColor } from "@/lib/departments";
import { initials } from "@/lib/util";
import { OrgMapMini } from "./OrgMapMini";

// ── Guided Discovery: the plan as a visible campaign ───────────────────
// The cascade over the org chart with per-session status, a coverage strip,
// and the question backlog. This is what makes a paid Discovery Sprint
// legible: the client sees the campaign, its sequence, and its progress.

const SESSION_PURPOSE: Record<PlannedSession["type"], { purpose: string; output: string }> = {
  leadership_session: {
    purpose: "Capture company goals, bottlenecks, decision rights, and executive KPIs; map what each direct report owns and what stays human.",
    output: "Company-level ownership map · 5–10 responsibilities · initial agent opportunity themes",
  },
  department_session: {
    purpose: "Map the department end to end: the head's responsibilities, each report's recurring work, and where approval boundaries sit.",
    output: "Evidence-backed responsibilities and tasks per participant · classification seeds",
  },
  individual_role_session: {
    purpose: "Deep-dive one role: deliverables, cadence, systems, approval ceiling — and resolve this person's open questions.",
    output: "Concrete tasks with completion context · resolved open questions",
  },
  clarification_session: {
    purpose: "Resolve ambiguous signals from earlier sessions: confirm what this person is actually accountable for.",
    output: "Cleared needs-review status · confirmed ownership",
  },
};

const STATUS_META: Record<PlannedSession["status"], { label: string; color: string }> = {
  planned: { label: "Planned", color: "var(--text-4)" },
  briefed: { label: "Briefed", color: "var(--cyan)" },
  captured: { label: "Captured", color: "var(--cyan)" },
  parsed: { label: "Parsed", color: "var(--yellow)" },
  applied: { label: "Applied", color: "var(--green)" },
  rerun_suggested: { label: "Re-run suggested", color: "var(--red)" },
};

interface Props {
  plan: DiscoveryPlan | null;
  people: Person[];
  pedigree: PedigreeState;
  backlog: QuestionBacklogItem[];
  readiness: ContextReadiness;
  reviewQueueCount: number;
  onStartSession: (personId: string, plannedSessionId: string) => void;
  onGoToReview: () => void;
  onOpenCompanyProfile: () => void;
  onResolveBacklogItem: (itemId: string) => void;
  onSelectPerson: (personId: string) => void;
}

export function DiscoveryPlanPanel({ plan, people, pedigree, backlog, readiness, reviewQueueCount, onStartSession, onGoToReview, onOpenCompanyProfile, onResolveBacklogItem, onSelectPerson }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const completion = useMemo(() => discoveryCompletion(people, pedigree, backlog), [people, pedigree, backlog]);
  const grouped = useMemo(() => backlogByPerson(backlog), [backlog]);
  const tier = readinessTier(readiness);
  const tierColor = tier === "high" ? "var(--green)" : tier === "medium" ? "var(--yellow)" : "var(--red)";

  if (!plan) {
    return <div className="sheet-wrap" style={{ padding: 24 }}><div className="drawer-empty">Upload a team to generate the discovery plan.</div></div>;
  }

  const pending = plan.sessions.filter((s) => s.status !== "applied");
  const done = plan.sessions.filter((s) => s.status === "applied");
  const activePeople = people.filter((p) => p.lifecycle !== "offboarded");
  const coveredPeople = activePeople.filter((p) => isMapped(pedigree[p.id]?.status)).length;
  const responsibilityCount = people.reduce((sum, p) => sum + (pedigree[p.id]?.responsibilities.length ?? 0), 0);
  const taskCount = people.reduce((sum, p) => {
    const tasks = pedigree[p.id]?.tasks;
    return sum + (tasks ? tasks.delegatable.length + tasks.approval.length + tasks.not_delegatable.length : 0);
  }, 0);
  const personOf = (id: string) => people.find((p) => p.id === id);
  const nextSession = pending[0];
  const nextAnchor = nextSession ? personOf(nextSession.anchor_person_id) : undefined;
  const toggleSession = (id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="sheet-wrap plan-panel" style={{ padding: 20 }}>
      {/* Coverage strip */}
      <div className="plan-coverage-strip">
        <button className="plan-chip" onClick={onOpenCompanyProfile} title="Discovery quality is the ceiling on everything downstream - open the Company Profile to fill gaps">
          <Icon name="check-circle" size={12} stroke={tierColor} />
          Readiness <span className="mono" style={{ color: tierColor }}>{readiness.overall}/{READINESS_MAX}</span>
        </button>
        {completion.complete ? (
          <span className="plan-chip complete"><Icon name="check-circle" size={12} /> Discovery complete - agent candidates are ready for the compiler</span>
        ) : (
          <span className="plan-chip dim" title={`${plan.coverage.departments_covered}/${plan.coverage.departments_total} departments covered`}>
            Complete at: all managers + 80% of ICs mapped, backlog under 10
            <span className="mono" style={{ marginLeft: 6 }}>({completion.managers_mapped}/{completion.managers_total} mgrs · {completion.ics_mapped}/{completion.ics_total} ICs)</span>
          </span>
        )}
      </div>

      <div className="plan-layout">
        {/* Session cascade: momentum, not a wall of meetings — top 3 expanded. */}
        <section className="plan-sessions">
          {completion.complete && pending.length === 0 && (
            <div className="stage-complete-card discovery-complete-card">
              <div className="stage-complete-icon"><Icon name="checkmark" size={16} /></div>
              <div>
                <h3>Discovery complete</h3>
                <p>{done.length} sessions run - {coveredPeople}/{activePeople.length} people covered - {responsibilityCount} responsibilities - {taskCount} tasks classified.</p>
                <p>{reviewQueueCount} follow-up{reviewQueueCount === 1 ? "" : "s"} to resolve.</p>
              </div>
              <button className="btn btn-primary" onClick={onGoToReview}>
                <Icon name="shield" size={13} /> Resolve follow-ups
              </button>
            </div>
          )}
          {false && <details className="howto-run" style={{ marginBottom: 12 }} open={done.length === 0}>
            <summary className="howto-title"><Icon name="play" size={12} /> Run discovery from the brief</summary>
            <ol>
              <li>Open the next session brief and <strong>copy the agenda</strong>.</li>
              <li>Run the call naturally with the recording on.</li>
              <li><strong>Upload the transcript</strong> after the call — Pedigree parses responsibilities, tasks, approvals, and agent candidates with evidence.</li>
            </ol>
          </details>}
          {!(completion.complete && pending.length === 0) && (
            <>
              <div className="sh" style={{ marginBottom: 10 }}>Up next <span className="count">{pending.length} planned</span></div>
              {pending.length === 0 && <div className="drawer-empty">Every planned session has been applied. New sessions appear here as the plan adapts.</div>}
            </>
          )}
          {pending[0] && (
            <PlanSessionCard
              key={pending[0].id}
              session={pending[0]}
              person={personOf(pending[0].anchor_person_id)}
              backlogCount={pending[0].scope_ids.reduce((n, id) => n + (grouped.get(id)?.length ?? 0), 0)}
              primary
              onStart={() => onStartSession(pending[0].anchor_person_id, pending[0].id)}
            />
          )}
          {pending.length > 1 && (
            <>
              <div className="sh queue-sh">Queue <span className="count">{pending.length - 1}</span></div>
              {pending.slice(1, showMore ? undefined : 5).map((session) => (
                <PlanSessionQueueRow
                  key={session.id}
                  session={session}
                  person={personOf(session.anchor_person_id)}
                  backlogCount={session.scope_ids.reduce((n, id) => n + (grouped.get(id)?.length ?? 0), 0)}
                  expanded={expandedSessions.has(session.id)}
                  onToggle={() => toggleSession(session.id)}
                  onStart={() => onStartSession(session.anchor_person_id, session.id)}
                />
              ))}
              {pending.length > 5 && (
                <button className="btn btn-sm btn-ghost" style={{ marginTop: 4 }} onClick={() => setShowMore((v) => !v)}>
                  <Icon name={showMore ? "chevron-down" : "chevron-right"} size={11} /> {showMore ? "Show fewer" : `${pending.length - 5} more session${pending.length - 5 === 1 ? "" : "s"}`}
                </button>
              )}
            </>
          )}
          {done.length > 0 && (
            <>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowDone((v) => !v)}>
                <Icon name={showDone ? "chevron-down" : "chevron-right"} size={11} /> {done.length} applied session{done.length === 1 ? "" : "s"}
              </button>
              {showDone && done.map((session) => (
                <PlanSessionCard key={session.id} session={session} person={personOf(session.anchor_person_id)} backlogCount={0} onStart={() => onStartSession(session.anchor_person_id, session.id)} />
              ))}
            </>
          )}
        </section>

        {/* Question backlog */}
        <aside className="plan-backlog">
          {nextSession && nextAnchor && (
            <section className="plan-howto-card">
              <div className="org-mini-narrator" style={{ marginTop: 0, marginBottom: 8 }}>
                Discovery {done.length === 0 ? "starts at the top" : "continues"}: {SESSION_LABEL[nextSession.type]} with {nextAnchor.name} and {Math.max(0, nextSession.scope_ids.length - 1)} others. Mapped people turn green as sessions apply.
              </div>
              <OrgMapMini people={people} pedigree={pedigree} highlightIds={nextSession.scope_ids} dimOthers height={260} onSelectNode={onSelectPerson} />
            </section>
          )}
          {!completion.complete && <section className="plan-howto-card">
            <div className="ps-head"><Icon name="play" size={13} stroke="var(--cyan)" /> How to run discovery</div>
            <ol className="howto-checklist">
              <li>Open the next session brief and <strong>copy the agenda</strong>.</li>
              <li>Run the call naturally with the recording on.</li>
              <li><strong>Upload the transcript</strong> after the call for evidence-backed parsing.</li>
            </ol>
          </section>}
          <div className="sh">
            Open questions <span className="count">{completion.open_backlog}</span>
          </div>
          {grouped.size === 0 ? (
            <div className="plan-backlog-empty">Open questions appear here after your first parsed session.</div>
          ) : (
            <div className="plan-backlog-caption">Carried into the next relevant brief - never dropped silently.</div>
          )}
          {[...grouped.entries()].map(([personId, items]) => {
            const person = personOf(personId);
            if (!person) return null;
            const dept = getDepartmentColor(person.department);
            return (
              <div className="backlog-person" key={personId}>
                <button className="backlog-person-head" onClick={() => onSelectPerson(personId)}>
                  <span className="avatar" style={{ borderColor: dept.border }}>{initials(person.name)}</span>
                  <span className="backlog-person-name">{person.name}</span>
                  <span className="tag">{items.length}</span>
                  {!isMapped(pedigree[personId]?.status) && <span className="tag yellow">unmapped</span>}
                </button>
                {items.map((item) => (
                  <div className="backlog-item" key={item.id}>
                    <span className="backlog-q">{item.question}</span>
                    <span className="tag">{item.source === "parser_open_question" ? "parser" : item.source === "parked" ? "parked" : "brief"}</span>
                    <button className="icon-btn" title="Mark resolved" aria-label="Mark resolved" onClick={() => onResolveBacklogItem(item.id)}><Icon name="checkmark" size={11} /></button>
                  </div>
                ))}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function scheduleBadge(session: PlannedSession): string {
  const schedule = session.schedule;
  if (!schedule) return "";
  const time = schedule.mode === "instant" ? "Now" : schedule.scheduledFor ? new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(schedule.scheduledFor)) : "Scheduled";
  const platform = schedule.platform === "google_meet" ? "Meet" : schedule.platform === "ms_teams" ? "Teams" : "Zoom";
  return `Invited · ${time} · ${platform}`;
}

function PlanSessionCard({ session, person, backlogCount, onStart, primary = false }: { session: PlannedSession; person?: Person; backlogCount: number; onStart: () => void; primary?: boolean }) {
  const meta = STATUS_META[session.status];
  const dept = person ? getDepartmentColor(person.department) : null;
  const applied = session.status === "applied";
  const displayStatus = sessionDisplayStatus(session);
  const statusColor = displayStatus === "Invited" ? "var(--cyan)" : meta.color;
  return (
    <div className={"plan-session-card" + (primary ? " next" : "") + (session.status === "rerun_suggested" ? " rerun" : "") + (applied ? " done" : "")} style={dept ? { borderLeft: `3px solid ${dept.accent}` } : undefined}>
      <div className="plan-session-main">
        <div className="plan-session-title">
          <span className="plan-session-n mono">#{session.priority}</span>
          {SESSION_LABEL[session.type]}
          {person && <span className="dim"> — {person.name}</span>}
          <span className="plan-status" style={{ color: statusColor }}><span className="dot" style={{ background: statusColor }} /> {displayStatus}</span>
        </div>
        <div className="plan-session-purpose">{SESSION_PURPOSE[session.type].purpose}</div>
        <div className="plan-session-rationale"><Icon name="info" size={10} /> Why now: {session.rationale}</div>
        <div className="plan-session-meta">
          <span>{session.scope_ids.length} participant{session.scope_ids.length === 1 ? "" : "s"}</span>
          {backlogCount > 0 && <span className="tag yellow">{backlogCount} carried-over question{backlogCount === 1 ? "" : "s"}</span>}
          {session.brief_id && <span className="tag cyan">briefed</span>}
          {session.schedule && <span className="tag cyan">{scheduleBadge(session)}</span>}
        </div>
      </div>
      <button className={"btn btn-sm " + (applied ? "btn-ghost" : primary || session.status === "rerun_suggested" ? "btn-primary" : "")} onClick={onStart} title="Opens the session brief — copy the agenda, run the call, upload the transcript">
        <Icon name="sparkles" size={11} /> {applied ? "Re-run" : session.status === "rerun_suggested" ? "Re-run session" : "Open session brief"}
      </button>
    </div>
  );
}

function PlanSessionQueueRow({ session, person, backlogCount, expanded, onToggle, onStart }: { session: PlannedSession; person?: Person; backlogCount: number; expanded: boolean; onToggle: () => void; onStart: () => void }) {
  const meta = STATUS_META[session.status];
  const dept = person ? getDepartmentColor(person.department) : null;
  const displayStatus = sessionDisplayStatus(session);
  const statusColor = displayStatus === "Invited" ? "var(--cyan)" : meta.color;
  return (
    <div className="plan-session-queue-row" style={dept ? { borderLeft: `3px solid ${dept.accent}` } : undefined}>
      <button className="plan-session-queue-main" onClick={onToggle}>
        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={11} />
        <span className="mono">#{session.priority}</span>
        <span>{SESSION_LABEL[session.type]}</span>
        {person && <span className="dim">— {person.name}</span>}
        <span className="dim">{session.scope_ids.length} participant{session.scope_ids.length === 1 ? "" : "s"}</span>
        {backlogCount > 0 && <span className="tag yellow">{backlogCount} carried-over</span>}
        {session.brief_id && <span className="tag cyan">briefed</span>}
        {session.schedule && <span className="tag cyan">{scheduleBadge(session)}</span>}
        <span className="plan-status" style={{ color: statusColor }}><span className="dot" style={{ background: statusColor }} /> {displayStatus}</span>
      </button>
      <button className="btn btn-sm btn-ghost" onClick={onStart}>{session.schedule ? "Open brief" : "Schedule"}</button>
      {expanded && (
        <div className="plan-session-queue-detail">
          <div>{SESSION_PURPOSE[session.type].purpose}</div>
          <div className="dim">Why now: {session.rationale}</div>
        </div>
      )}
    </div>
  );
}
