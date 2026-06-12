import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import type { MeetingPlatform, SessionSchedule } from "@/types";
import { buildIcs, googleCalendarUrl, googleMeetInstantUrl, mailtoUrl, outlookCalendarUrl, teamsInstantUrl, type MeetingRequest } from "@/lib/meetingLinks";
import { downloadFile } from "@/lib/state";

interface Attendee {
  id: string;
  name: string;
  email: string;
  title?: string;
}

interface Props {
  sessionId: string;
  title: string;
  attendees: Attendee[];
  agendaMarkdown: string;
  defaultDuration?: number;
  existingSchedule?: SessionSchedule;
  initialPlatform?: MeetingPlatform;
  onClose: () => void;
  onScheduled: (schedule: SessionSchedule) => void;
  onToast?: (t1: string, t2?: string, green?: boolean) => void;
}

const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  google_meet: "Google Meet",
  ms_teams: "Microsoft Teams",
  zoom: "Zoom",
};

export function ScheduleSessionModal({ sessionId, title, attendees, agendaMarkdown, defaultDuration = 45, existingSchedule, initialPlatform, onClose, onScheduled, onToast }: Props) {
  const [platform, setPlatform] = useState<MeetingPlatform>(initialPlatform ?? existingSchedule?.platform ?? "google_meet");
  const [mode, setMode] = useState<"instant" | "scheduled">(existingSchedule?.mode ?? "scheduled");
  const [scheduledFor, setScheduledFor] = useState(() => toDatetimeLocal(existingSchedule?.scheduledFor ? new Date(existingSchedule.scheduledFor) : nextBusinessDayAt10()));
  const [durationMinutes, setDurationMinutes] = useState(existingSchedule?.durationMinutes ?? defaultDuration);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(existingSchedule?.invitedPersonIds?.length ? existingSchedule.invitedPersonIds : attendees.map((a) => a.id)));
  const [meetingLink, setMeetingLink] = useState(existingSchedule?.meetingLink ?? "");
  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setEmailEnabled(Boolean(data.email)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const invitees = attendees.filter((a) => selectedIds.has(a.id));
  const startsAt = mode === "scheduled" ? new Date(scheduledFor) : undefined;
  const request: MeetingRequest = useMemo(() => ({
    title,
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
    durationMinutes,
    attendeeEmails: invitees.map((a) => a.email),
    agendaMarkdown,
    sessionId,
    meetingLink: meetingLink.trim() || undefined,
  }), [agendaMarkdown, durationMinutes, invitees, meetingLink, sessionId, startsAt, title]);

  const primaryLabel = emailEnabled
    ? "Send invites"
    : platform === "zoom"
      ? "Download calendar invite (.ics)"
      : mode === "instant" && platform === "google_meet"
        ? "Start Meet now"
        : mode === "instant" && platform === "ms_teams"
          ? "Start Teams meeting"
          : platform === "google_meet"
            ? "Open Google Calendar invite"
            : "Open Outlook invite";

  const prepareSchedule = (sent = false): SessionSchedule => ({
    platform,
    mode,
    ...(mode === "scheduled" && request.startsAt ? { scheduledFor: request.startsAt.toISOString() } : {}),
    durationMinutes,
    ...(meetingLink.trim() ? { meetingLink: meetingLink.trim() } : {}),
    invitedPersonIds: invitees.map((a) => a.id),
    invitesPreparedAt: new Date().toISOString(),
    ...(sent ? { invitesSentAt: new Date().toISOString() } : {}),
  });

  const afterPrepared = (sent = false) => {
    onScheduled(prepareSchedule(sent));
    onToast?.(sent ? "Invites sent" : "Invite prepared", sent ? "Pedigree sent the emails through the configured provider." : "Your calendar/email sends it.", true);
    onClose();
  };

  const onPrimary = async () => {
    if (!invitees.length) {
      onToast?.("No invitees selected", "Choose at least one participant.", false);
      return;
    }
    if (emailEnabled) {
      try {
        const res = await fetch("/api/sessions/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: invitees.map((a) => ({ name: a.name, email: a.email, prepSheetMarkdown: agendaMarkdown })),
            subject: title,
            icsContent: buildIcs(request),
          }),
        });
        if (res.ok) afterPrepared(true);
        else throw new Error("send failed");
      } catch {
        onToast?.("Email not configured", "Opening your calendar/email instead.", false);
        openPhaseOneAction();
      }
      return;
    }
    openPhaseOneAction();
  };

  const openPhaseOneAction = () => {
    if (platform === "zoom") {
      downloadIcs();
      afterPrepared(false);
      return;
    }
    if (platform === "google_meet" && mode === "instant") {
      window.open(googleMeetInstantUrl(), "_blank", "noopener,noreferrer");
      window.open(mailtoUrl(request), "_blank", "noopener,noreferrer");
    } else if (platform === "ms_teams" && mode === "instant") {
      window.open(teamsInstantUrl(request), "_blank", "noopener,noreferrer");
    } else if (platform === "google_meet") {
      window.open(googleCalendarUrl(request), "_blank", "noopener,noreferrer");
    } else {
      window.open(outlookCalendarUrl(request), "_blank", "noopener,noreferrer");
    }
    afterPrepared(false);
  };

  const downloadIcs = () => downloadFile("session-invite.ics", buildIcs(request), "text/calendar");

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal schedule-modal" style={{ width: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h"><Icon name="history" size={16} stroke="var(--cyan)" /><h3>Schedule & invite</h3></div>
          <div className="sub">{title}</div>
          <button className="close" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
        <div className="modal-body schedule-modal-body">
          <section>
            <div className="lbl">Platform</div>
            <div className="schedule-platform-grid">
              {(["google_meet", "ms_teams", "zoom"] as MeetingPlatform[]).map((id) => (
                <button key={id} className="schedule-radio-card" data-active={platform === id} onClick={() => setPlatform(id)}>
                  <img src={id === "google_meet" ? "/brand-logos/google-meet.svg" : id === "ms_teams" ? "/brand-logos/microsoft-teams.svg" : "/brand-logos/zoom.svg"} alt={`${PLATFORM_LABEL[id]} logo`} />
                  <span>{PLATFORM_LABEL[id]}</span>
                </button>
              ))}
            </div>
            <div className="dim schedule-help">Pedigree pre-fills your calendar - no account connection needed. Direct sending and auto-created meeting links come with calendar integration (roadmap).</div>
          </section>

          <section>
            <div className="lbl">When</div>
            <div className="schedule-when">
              <button className="schedule-radio-card compact" data-active={mode === "instant"} onClick={() => setMode("instant")}>Now</button>
              <button className="schedule-radio-card compact" data-active={mode === "scheduled"} onClick={() => setMode("scheduled")}>Pick a time</button>
              <input className="input" type="datetime-local" value={scheduledFor} disabled={mode === "instant"} onChange={(e) => setScheduledFor(e.target.value)} />
              <select className="select" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            {platform === "ms_teams" && mode === "scheduled" && <div className="dim schedule-help">Outlook opens prefilled; toggle "Teams meeting" in compose before sending.</div>}
            {platform === "google_meet" && mode === "scheduled" && <div className="dim schedule-help">Google Calendar opens prefilled; add Meet conferencing before sending if your Workspace does not do it automatically.</div>}
          </section>

          <section>
            <div className="schedule-section-head">
              <div className="lbl">Invitees</div>
              <span className="tag cyan">{invitees.length} invitee{invitees.length === 1 ? "" : "s"}</span>
            </div>
            <div className="schedule-invitees">
              {attendees.map((a) => (
                <label key={a.id} className="schedule-invitee">
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={(e) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(a.id) : next.delete(a.id);
                      return next;
                    });
                  }} />
                  <span>
                    <strong>{a.name}</strong>
                    <small>{a.email}{a.title ? ` - ${a.title}` : ""}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {platform === "zoom" && (
            <section>
              <div className="lbl">Paste meeting link (optional)</div>
              <input className="input" placeholder="https://zoom.us/j/..." value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
              <div className="dim schedule-help">Zoom does not provide a public no-auth compose link. Add your Zoom link here or add it later in your calendar.</div>
            </section>
          )}

          <div>
            <div className="dim schedule-help">Participants get the prep questions only - facilitator notes stay with you.</div>
            <details className="schedule-preview">
              <summary>What they'll receive</summary>
            <pre>{agendaMarkdown}</pre>
            </details>
          </div>
        </div>
        <div className="modal-foot">
          <div className="left">Phase 1 prepares the invite; your own calendar/email sends it.</div>
          <div className="right">
            <button className="btn btn-sm btn-ghost" onClick={downloadIcs}>Download .ics</button>
            <button className="btn btn-sm btn-ghost" onClick={() => window.open(mailtoUrl(request), "_blank", "noopener,noreferrer")}>Email agenda</button>
            <button className="btn btn-sm btn-primary" onClick={onPrimary}>{primaryLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function nextBusinessDayAt10() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

function toDatetimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
