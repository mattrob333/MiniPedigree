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
import { discoveryCompletion } from "@/lib/discoveryPlan";
import { backlogByPerson } from "@/lib/questionBacklog";
import { READINESS_MAX, readinessTier } from "@/lib/readiness";
import { getDepartmentColor } from "@/lib/departments";
import { initials } from "@/lib/util";

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
  onStartSession: (personId: string, plannedSessionId: string) => void;
  onOpenCompanyProfile: () => void;
  onResolveBacklogItem: (itemId: string) => void;
  onSelectPerson: (personId: string) => void;
}

export function DiscoveryPlanPanel({ plan, people, pedigree, backlog, readiness, onStartSession, onOpenCompanyProfile, onResolveBacklogItem, onSelectPerson }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const completion = useMemo(() => discoveryCompletion(people, pedigree, backlog), [people, pedigree, backlog]);
  const grouped = useMemo(() => backlogByPerson(backlog), [backlog]);
  const tier = readinessTier(readiness);
  const tierColor = tier === "high" ? "var(--green)" : tier === "medium" ? "var(--yellow)" : "var(--red)";

  if (!plan) {
    return <div className="sheet-wrap" style={{ padding: 24 }}><div className="drawer-empty">Upload a team to generate the discovery plan.</div></div>;
  }

  const pending = plan.sessions.filter((s) => s.status !== "applied");
  const done = plan.sessions.filter((s) => s.status === "applied");
  const personOf = (id: string) => people.find((p) => p.id === id);

  return (
    <div className="sheet-wrap plan-panel" style={{ padding: 20 }}>
      {/* Coverage strip */}
      <div className="plan-coverage-strip">
        <button className="plan-chip" onClick={onOpenCompanyProfile} title="Discovery quality is the ceiling on everything downstream — open the Company Profile to fill gaps">
          <Icon name="check-circle" size={12} stroke={tierColor} />
          Readiness <span className="mono" style={{ color: tierColor }}>{readiness.overall}/{READINESS_MAX}</span>
        </button>
        <span className="plan-chip"><Icon name="users" size={12} /> {plan.coverage.people_mapped}/{plan.coverage.people_total} people mapped</span>
        <span className="plan-chip"><Icon name="network" size={12} /> {plan.coverage.departments_covered}/{plan.coverage.departments_total} departments covered</span>
        <span className="plan-chip"><Icon name="history" size={12} /> {completion.open_backlog} open question{completion.open_backlog === 1 ? "" : "s"}</span>
        {completion.complete ? (
          <span className="plan-chip complete"><Icon name="check-circle" size={12} /> Discovery complete — agent candidates are ready for the compiler</span>
        ) : (
          <span className="plan-chip dim">
            Complete at: all managers + 80% of ICs mapped, backlog ≤ 10
            <span className="mono" style={{ marginLeft: 6 }}>({completion.managers_mapped}/{completion.managers_total} mgrs · {completion.ics_mapped}/{completion.ics_total} ICs)</span>
          </span>
        )}
      </div>

      <div className="plan-layout">
        {/* Session cascade: momentum, not a wall of meetings — top 3 expanded. */}
        <section className="plan-sessions">
          <div className="howto-run" style={{ marginBottom: 12 }}>
            <div className="howto-title"><Icon name="play" size={12} /> Run discovery in Google Meet</div>
            <ol>
              <li>Open the next session brief and <strong>copy the agenda</strong>.</li>
              <li>Run the call naturally with the recording on.</li>
              <li><strong>Upload the transcript</strong> after the call — Pedigree parses responsibilities, tasks, approvals, and agent candidates with evidence.</li>
            </ol>
          </div>
          <div className="sh" style={{ marginBottom: 10 }}>Recommended next sessions <span className="count">{pending.length} planned</span></div>
          {pending.length === 0 && <div className="drawer-empty">Every planned session has been applied. New sessions appear here as the plan adapts.</div>}
          {pending.slice(0, 3).map((session, i) => (
            <PlanSessionCard key={session.id} session={session} person={personOf(session.anchor_person_id)} backlogCount={session.scope_ids.reduce((n, id) => n + (grouped.get(id)?.length ?? 0), 0)} primary={i === 0} onStart={() => onStartSession(session.anchor_person_id, session.id)} />
          ))}
          {pending.length > 3 && (
            <>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 4 }} onClick={() => setShowMore((v) => !v)}>
                <Icon name={showMore ? "chevron-down" : "chevron-right"} size={11} /> {pending.length - 3} more session{pending.length - 3 === 1 ? "" : "s"} planned
              </button>
              {showMore && pending.slice(3).map((session) => (
                <PlanSessionCard key={session.id} session={session} person={personOf(session.anchor_person_id)} backlogCount={session.scope_ids.reduce((n, id) => n + (grouped.get(id)?.length ?? 0), 0)} onStart={() => onStartSession(session.anchor_person_id, session.id)} />
              ))}
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
          <div className="sh" style={{ marginBottom: 10 }}>
            Open questions <span className="count">{completion.open_backlog}</span>
            <span className="dim" style={{ marginLeft: "auto", fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>carried into the next relevant brief — never dropped silently</span>
          </div>
          {grouped.size === 0 && <div className="drawer-empty">No open questions. Parser open-questions and unanswered brief questions land here.</div>}
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
                    <span className="backlog-source">{item.source === "parser_open_question" ? "parser" : item.source === "parked" ? "parked" : "brief"}</span>
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

function PlanSessionCard({ session, person, backlogCount, onStart, primary = false }: { session: PlannedSession; person?: Person; backlogCount: number; onStart: () => void; primary?: boolean }) {
  const meta = STATUS_META[session.status];
  const dept = person ? getDepartmentColor(person.department) : null;
  const applied = session.status === "applied";
  return (
    <div className={"plan-session-card" + (session.status === "rerun_suggested" ? " rerun" : "") + (applied ? " done" : "")} style={dept ? { borderLeft: `3px solid ${dept.accent}` } : undefined}>
      <div className="plan-session-main">
        <div className="plan-session-title">
          <span className="plan-session-n mono">#{session.priority}</span>
          {SESSION_LABEL[session.type]}
          {person && <span className="dim"> — {person.name}</span>}
          <span className="plan-status" style={{ color: meta.color }}><span className="dot" style={{ background: meta.color }} /> {meta.label}</span>
        </div>
        <div className="plan-session-purpose">{SESSION_PURPOSE[session.type].purpose}</div>
        <div className="plan-session-rationale"><Icon name="info" size={10} /> Why now: {session.rationale}</div>
        <div className="plan-session-meta">
          <span>{session.scope_ids.length} participant{session.scope_ids.length === 1 ? "" : "s"}</span>
          <span className="dim">Expected output: {SESSION_PURPOSE[session.type].output}</span>
          {backlogCount > 0 && <span className="tag yellow">{backlogCount} carried-over question{backlogCount === 1 ? "" : "s"}</span>}
          {session.brief_id && <span className="tag cyan">briefed</span>}
        </div>
      </div>
      <button className={"btn btn-sm " + (applied ? "btn-ghost" : primary || session.status === "rerun_suggested" ? "btn-primary" : "")} onClick={onStart} title="Opens the session brief — copy the agenda, run the call, upload the transcript">
        <Icon name="sparkles" size={11} /> {applied ? "Re-run" : session.status === "rerun_suggested" ? "Re-run session" : "Open session brief"}
      </button>
    </div>
  );
}
