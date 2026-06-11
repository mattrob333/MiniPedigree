import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  AgentRegistryEntry,
  CompanyContext,
  PedigreeState,
  Person,
  QuestionBacklogItem,
  RegisteredMeeting,
  StackAuditRecord,
  StackSignal,
  UserRole,
  WorkspaceAuditEvent,
} from "@/types";
import { addMeeting, buildCompactStackState, type MeetingDraft } from "@/lib/meetings";
import { runMaintenanceParseDeterministic, serverSignalsToStackSignals } from "@/lib/maintenance";
import { requestMaintenanceParse } from "@/lib/api";
import { ingestSignals, sweepExpired } from "@/lib/signalLedger";
import { applyConfirmations, collectStaleItems, DEFAULT_FRESHNESS_CONFIG } from "@/lib/freshness";
import { resolveBacklogItem } from "@/lib/questionBacklog";
import { applyDigestSelections, buildDigest, withOwner, type DigestEntry } from "@/lib/digest";
import { setSignalStatus } from "@/lib/signalLedger";
import { getGovernanceRules } from "@/lib/governance";
import { canApplyAuthority, canApplyNonAuthority } from "@/lib/rbac";
import { initials } from "@/lib/util";

// ── Living Stack: meetings in, signals ledgered, digest reviewed ───────
// After initial discovery the stack is maintained by signals, not sessions.
// Paste (or route) recurring meeting transcripts; confirmations apply
// silently, durable changes accumulate into this digest. Rule changes and
// authority-expanding items sit at the top and require explicit
// confirmation. Nothing touching authority auto-applies.

export interface DigestStatePatch {
  meetings?: RegisteredMeeting[];
  ledger?: StackSignal[];
  pedigree?: PedigreeState;
  registry?: AgentRegistryEntry[];
  backlog?: QuestionBacklogItem[];
  companyContext?: CompanyContext;
  auditLog?: StackAuditRecord[];
  events?: WorkspaceAuditEvent[];
  people?: Person[];
}

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  meetings: RegisteredMeeting[];
  ledger: StackSignal[];
  backlog: QuestionBacklogItem[];
  auditLog: StackAuditRecord[];
  companyContext?: CompanyContext;
  role: UserRole;
  approverEmail: string;
  onChange: (patch: DigestStatePatch) => void;
  onToast: (t1: string, t2?: string, green?: boolean) => void;
  /** Full discovery refresh (Org Sync changeset) — the other transcript mode. */
  onOpenOrgSync?: () => void;
}

export function DigestScreen({ people, pedigree, registry, meetings, ledger, backlog, auditLog, companyContext, role, approverEmail, onChange, onToast, onOpenOrgSync }: Props) {
  const [transcript, setTranscript] = useState("");
  const [meetingId, setMeetingId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [authorityConfirmed, setAuthorityConfirmed] = useState<Set<string>>(new Set());
  const [registerOpen, setRegisterOpen] = useState(false);
  const [ownerPick, setOwnerPick] = useState<Record<string, string>>({});

  const digest = useMemo(
    () => buildDigest({ ledger, people, pedigree, registry }),
    [ledger, people, pedigree, registry],
  );
  const staleItems = useMemo(
    () => collectStaleItems(people, pedigree, registry, DEFAULT_FRESHNESS_CONFIG).filter((i) => i.state === "stale"),
    [people, pedigree, registry],
  );

  const activeMeeting = meetings.find((m) => m.id === meetingId);

  const processTranscript = async () => {
    if (!transcript.trim()) return;
    setBusy(true);
    try {
      const participants = activeMeeting
        ? people.filter((p) => activeMeeting.usual_participant_ids.includes(p.id))
        : people;
      const rules = getGovernanceRules(companyContext);
      const stackState = buildCompactStackState(participants, pedigree, registry, backlog, rules.map((r) => ({ rule_id: r.rule_id, condition: r.condition })));
      const transcriptId = `T-${Date.now().toString(36)}`;

      // AI pass first; deterministic fallback always works with no API key.
      const serverSignals = await requestMaintenanceParse({
        transcript,
        meeting: activeMeeting,
        participants: participants.map((p) => ({ id: p.id, name: p.name, email: p.email, title: p.title, department: p.department })),
        stackState,
      });
      const signals = serverSignals?.length
        ? serverSignalsToStackSignals(serverSignals, { transcriptId, meetingId: activeMeeting?.id })
        : runMaintenanceParseDeterministic({ transcript, transcriptId, meetingId: activeMeeting?.id, participantIds: participants.map((p) => p.id), stackState });

      const result = ingestSignals(sweepExpired(ledger), signals);

      // Confirmations: silent, timestamps only.
      const freshened = applyConfirmations(pedigree, registry, result.confirmations.map((s) => s.refs));
      // Backlog resolutions: auto-link.
      let nextBacklog = backlog;
      for (const resolution of result.resolutions) {
        for (const id of resolution.refs.backlog_ids) nextBacklog = resolveBacklogItem(nextBacklog, id, `signal:${resolution.id}`);
      }

      onChange({
        ledger: result.ledger,
        pedigree: freshened.pedigree,
        registry: freshened.registry,
        backlog: nextBacklog,
      });
      setTranscript("");
      onToast(
        "Transcript processed",
        `${result.confirmations.length} confirmation${result.confirmations.length === 1 ? "" : "s"} applied silently · ${result.promoted.length} item${result.promoted.length === 1 ? "" : "s"} added to the digest · ${result.resolutions.length} backlog question${result.resolutions.length === 1 ? "" : "s"} answered for free`,
        true,
      );
      if (!activeMeeting && signals.length) setRegisterOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySelected = () => {
    // Authority-EXPANDING items need explicit per-item confirmation (the red
    // checkbox) AND the role to apply them. Restricting rule changes review
    // normally — they only ever tighten the overlay.
    const expandingIds = new Set(digest.rule_and_authority.filter((e) => e.signal.authority_expanding).map((e) => e.signal.id));
    const ids = [...selected].filter((id) => !expandingIds.has(id) || authorityConfirmed.has(id));
    const skippedAuthority = [...selected].filter((id) => expandingIds.has(id) && !authorityConfirmed.has(id));
    if (skippedAuthority.length) {
      onToast("Authority items need explicit confirmation", "Tick the red confirmation box on each authority-affecting item first");
      if (!ids.length) return;
    }

    // Owner-less candidates: attach the picked owner before conversion.
    let workingLedger = ledger;
    for (const id of ids) {
      const pick = ownerPick[id];
      if (pick) workingLedger = workingLedger.map((s) => (s.id === id ? withOwner(s, pick) : s));
    }

    const result = applyDigestSelections({
      signalIds: ids,
      ledger: workingLedger,
      approver: approverEmail,
      people,
      pedigree,
      companyContext,
      registry,
      auditLog,
      backlog,
    });
    const events: WorkspaceAuditEvent[] = ids.filter((id) => !result.skipped.includes(id)).map((id) => {
      const signal = workingLedger.find((s) => s.id === id)!;
      return {
        id: `EVT-${Date.now().toString(36)}-${id}`,
        type: "signal_applied",
        actor: approverEmail,
        timestamp: new Date().toISOString(),
        summary: `Applied ${signal.type} signal from ${signal.source.kind === "meeting" ? "meeting" : "member"}: ${signal.evidence_quote.slice(0, 120)}`,
        subject_id: id,
        evidence: signal.evidence_quote,
      };
    });
    onChange({
      ledger: result.ledger,
      pedigree: result.pedigree,
      registry: result.registry,
      backlog: result.backlog,
      companyContext: result.companyContext,
      auditLog: result.auditLog,
      ...(result.people ? { people: result.people } : {}),
      events,
    });
    setSelected(new Set());
    setAuthorityConfirmed(new Set());
    onToast("Digest applied", `${result.applied} change${result.applied === 1 ? "" : "s"} applied · affected agents marked stale · recompile is a separate explicit step${result.skipped.length ? ` · ${result.skipped.length} skipped (pick an owner first)` : ""}`, true);
  };

  const reject = (id: string) => {
    onChange({ ledger: setSignalStatus(ledger, id, "rejected", approverEmail) });
  };

  const registerMeeting = (draft: MeetingDraft) => {
    const next = addMeeting(meetings, draft);
    onChange({ meetings: next });
    setMeetingId(next[next.length - 1].id);
    setRegisterOpen(false);
    onToast("Meeting registered", `${draft.name} — future transcripts auto-route to this series`, true);
  };

  const pendingCount = digest.rule_and_authority.length + digest.drift.length + digest.candidates.length + digest.retirements.length + digest.agent_feedback.length;
  const mayApplyAuthority = canApplyAuthority(role);
  const mayApply = canApplyNonAuthority(role) || mayApplyAuthority;

  return (
    <div className="sheet-wrap digest-screen" style={{ padding: 20 }}>
      {/* Transcript intake */}
      <section className="digest-intake">
        <div className="sh" style={{ marginBottom: 8 }}>
          Meeting intake
          <span className="dim" style={{ marginLeft: 8, fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
            after discovery, the stack is maintained by signals, not sessions — paste recurring meeting transcripts here
          </span>
        </div>
        <div className="digest-intake-row">
          <select className="select" style={{ maxWidth: 260 }} value={meetingId} onChange={(e) => setMeetingId(e.target.value)} aria-label="Meeting series">
            <option value="">Unregistered transcript…</option>
            {meetings.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.cadence})</option>)}
          </select>
          <button className="btn btn-sm btn-ghost" onClick={() => setRegisterOpen((v) => !v)}><Icon name="plus" size={11} /> Register series</button>
          {onOpenOrgSync && (
            <button className="btn btn-sm btn-ghost" onClick={onOpenOrgSync} title="Full discovery refresh: re-parse a rich transcript into a reviewed changeset (new responsibilities, ownership shifts)">
              <Icon name="history" size={11} /> Full discovery refresh
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span className="dim" style={{ fontSize: 11 }}>{meetings.length} registered meeting{meetings.length === 1 ? "" : "s"}</span>
        </div>
        {registerOpen && <RegisterMeetingForm people={people} onRegister={registerMeeting} onCancel={() => setRegisterOpen(false)} />}
        <textarea
          className="textarea"
          rows={4}
          placeholder='Paste the standup/planning transcript (Fireflies, Meet, Zoom…). One-off assignments are ignored; only durable signals reach review. Try: "From now on Finance signs off on all refunds."'
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
        <div style={{ display: "flex", marginTop: 8, gap: 8, alignItems: "center" }}>
          <span className="dim" style={{ fontSize: 11 }}>
            <Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            Confirmations apply silently (timestamps only). Everything else lands below for review.
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={processTranscript} disabled={busy || !transcript.trim()}>
            <Icon name="sparkles" size={11} /> {busy ? "Processing…" : "Process transcript"}
          </button>
        </div>
      </section>

      {/* Free wins */}
      <div className="digest-freewins">
        <span><Icon name="check-circle" size={12} stroke="var(--green)" /> {digest.free_wins.confirmations} task{digest.free_wins.confirmations === 1 ? "" : "s"} confirmed fresh this week</span>
        <span><Icon name="target" size={12} stroke="var(--green)" /> {digest.free_wins.backlog_resolutions.length} backlog question{digest.free_wins.backlog_resolutions.length === 1 ? "" : "s"} answered for free</span>
        <span><Icon name="warning" size={12} stroke={staleItems.length ? "var(--yellow)" : "var(--text-4)"} /> {staleItems.length} stale item{staleItems.length === 1 ? "" : "s"} (injected into upcoming briefs and My Pedigree)</span>
      </div>

      {/* Digest sections */}
      {pendingCount === 0 ? (
        <div className="drawer-empty" style={{ marginTop: 14 }}>The review queue is clear. Durable signals from processed meetings and member submissions will accumulate here.</div>
      ) : (
        <>
          <DigestSection
            title="Rule changes & authority-expanding items"
            hint="distinct treatment — these change what agents may do; explicit confirmation required"
            entries={digest.rule_and_authority}
            tone="danger"
            selected={selected}
            onToggle={toggle}
            onReject={reject}
            people={people}
            ownerPick={ownerPick}
            onOwnerPick={(id, p) => setOwnerPick((prev) => ({ ...prev, [id]: p }))}
            authorityConfirmed={authorityConfirmed}
            onAuthorityConfirm={(id) => setAuthorityConfirmed((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
            disabled={!mayApplyAuthority}
            disabledHint="Operator or Governance Reviewer role required for authority items"
          />
          <DigestSection title="Drift" hint="cadence/owner/tool changes to known work — one-click accept with the diff shown" entries={digest.drift} selected={selected} onToggle={toggle} onReject={reject} people={people} ownerPick={ownerPick} onOwnerPick={(id, p) => setOwnerPick((prev) => ({ ...prev, [id]: p }))} disabled={!mayApply} />
          <DigestSection title="Durable new candidates" hint="corroborated in multiple meetings, explicit recurrence language, or member-asserted" entries={digest.candidates} selected={selected} onToggle={toggle} onReject={reject} people={people} ownerPick={ownerPick} onOwnerPick={(id, p) => setOwnerPick((prev) => ({ ...prev, [id]: p }))} disabled={!mayApply} />
          <DigestSection title="Retirements" hint="work reported as no longer performed — confirm-retire or reject to keep" entries={digest.retirements} selected={selected} onToggle={toggle} onReject={reject} people={people} ownerPick={ownerPick} onOwnerPick={(id, p) => setOwnerPick((prev) => ({ ...prev, [id]: p }))} disabled={!mayApply} />
          <DigestSection title="Agent feedback" hint="attached to agent records as review notes; repeated patterns escalate to scope tunes" entries={digest.agent_feedback} selected={selected} onToggle={toggle} onReject={reject} people={people} ownerPick={ownerPick} onOwnerPick={(id, p) => setOwnerPick((prev) => ({ ...prev, [id]: p }))} disabled={!mayApply} />

          <div className="digest-applybar">
            <span className="dim" style={{ fontSize: 11.5 }}>
              {selected.size} selected · every applied change writes an audit record and marks affected agents stale; recompiling is a separate explicit action per agent
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={!selected.size || !mayApply} onClick={applySelected} title={mayApply ? undefined : "Your role cannot apply digest items"}>
              <Icon name="checkmark" size={12} /> Apply selected ({selected.size})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DigestSection({ title, hint, entries, tone, selected, onToggle, onReject, people, ownerPick, onOwnerPick, authorityConfirmed, onAuthorityConfirm, disabled, disabledHint }: {
  title: string;
  hint: string;
  entries: DigestEntry[];
  tone?: "danger";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReject: (id: string) => void;
  people: Person[];
  ownerPick: Record<string, string>;
  onOwnerPick: (id: string, personId: string) => void;
  authorityConfirmed?: Set<string>;
  onAuthorityConfirm?: (id: string) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  if (!entries.length) return null;
  return (
    <section className={"digest-section" + (tone === "danger" ? " danger" : "")}>
      <div className="sh">
        {tone === "danger" && <Icon name="warning" size={12} stroke="var(--red)" />}
        {title} <span className="count">{entries.length}</span>
        <span className="dim" style={{ marginLeft: 8, fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>{hint}</span>
        {disabled && disabledHint && <span className="tag" style={{ marginLeft: "auto", color: "var(--yellow)" }}>{disabledHint}</span>}
      </div>
      {entries.map((entry) => {
        const { signal } = entry;
        const sourceLabel = signal.source.kind === "member"
          ? `member · ${people.find((p) => p.id === (signal.source as { person_id: string }).person_id)?.name ?? "unknown"}`
          : "meeting";
        return (
          <div className={"digest-item" + (selected.has(signal.id) ? " selected" : "")} key={signal.id}>
            <input
              type="checkbox"
              checked={selected.has(signal.id)}
              disabled={disabled || (entry.needs_owner && !ownerPick[signal.id])}
              onChange={() => onToggle(signal.id)}
              aria-label={`Select: ${entry.proposal?.summary ?? signal.evidence_quote}`}
            />
            <div className="digest-item-body">
              <div className="digest-item-summary">
                {entry.proposal?.summary ?? signal.evidence_quote}
                {signal.authority_expanding && <span className="tag" style={{ color: "var(--red)", borderColor: "var(--red)", marginLeft: 6 }}>authority-expanding</span>}
              </div>
              <blockquote className="digest-evidence">“{signal.evidence_quote}”</blockquote>
              {entry.corroborations.map((c) => (
                <blockquote className="digest-evidence corroborating" key={c.id}>“{c.evidence_quote}”</blockquote>
              ))}
              <div className="digest-item-meta">
                <span className="tag">{signal.type.replace(/_/g, " ")}</span>
                <span className="dim">{sourceLabel} · {Math.round(signal.confidence * 100)}% confidence</span>
                {entry.needs_owner && (
                  <select className="select capture-target-select" value={ownerPick[signal.id] ?? ""} onChange={(e) => onOwnerPick(signal.id, e.target.value)} aria-label="Assign an owner">
                    <option value="">Pick an owner to apply…</option>
                    {people.filter((p) => p.lifecycle !== "offboarded").map((p) => <option key={p.id} value={p.id}>{initials(p.name)} {p.name}</option>)}
                  </select>
                )}
                {signal.authority_expanding && onAuthorityConfirm && (
                  <label className="digest-authority-confirm">
                    <input type="checkbox" checked={authorityConfirmed?.has(signal.id) ?? false} disabled={disabled} onChange={() => onAuthorityConfirm(signal.id)} />
                    I confirm this change expands authority
                  </label>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost" onClick={() => onReject(signal.id)} disabled={disabled}>Reject</button>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function RegisterMeetingForm({ people, onRegister, onCancel }: { people: Person[]; onRegister: (draft: MeetingDraft) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<RegisteredMeeting["cadence"]>("weekly");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  return (
    <div className="meeting-register">
      <input className="input" placeholder='Series name, e.g. "RevOps Monday Standup"' value={name} onChange={(e) => setName(e.target.value)} />
      <select className="select" value={cadence} onChange={(e) => setCadence(e.target.value as RegisteredMeeting["cadence"])} aria-label="Cadence">
        {(["daily", "weekly", "biweekly", "monthly", "ad_hoc"] as const).map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
      </select>
      <select
        className="select"
        multiple
        size={Math.min(5, people.length)}
        value={participantIds}
        onChange={(e) => setParticipantIds([...e.target.selectedOptions].map((o) => o.value))}
        aria-label="Usual participants"
      >
        {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-outline-cyan" disabled={!name.trim() || !participantIds.length} onClick={() => onRegister({ name, cadence, usual_participant_ids: participantIds, source: "manual_paste" })}>Register</button>
      </div>
    </div>
  );
}
