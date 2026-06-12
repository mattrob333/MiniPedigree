// Phase 1 uses no-auth deep links and ICS files. Phase 3 can replace these
// builders with authenticated provider calls behind this MeetingRequest shape
// (Google Calendar API, MS Graph, Zoom API) while keeping the UI stable.

export interface MeetingRequest {
  title: string;
  startsAt?: Date;
  durationMinutes: number;
  attendeeEmails: string[];
  agendaMarkdown: string;
  sessionId?: string;
  meetingLink?: string;
}

const TRIMMED_AGENDA_LIMIT = 1800;
const MAILTO_BODY_LIMIT = 1500;

export function googleCalendarUrl(req: MeetingRequest): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: req.title, details: trimmedAgenda(req.agendaMarkdown) });
  const dates = datesParam(req);
  if (dates) params.set("dates", dates);
  for (const email of req.attendeeEmails) params.append("add", email);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(req: MeetingRequest): string {
  const params = new URLSearchParams({
    subject: req.title,
    body: trimmedAgenda(req.agendaMarkdown),
    to: req.attendeeEmails.join(","),
  });
  const { start, end } = eventDates(req);
  if (start && end) {
    params.set("startdt", start.toISOString());
    params.set("enddt", end.toISOString());
  }
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function teamsInstantUrl(req: MeetingRequest): string {
  const params = new URLSearchParams({ subject: req.title, attendees: req.attendeeEmails.join(",") });
  return `https://teams.microsoft.com/l/meeting/new?${params.toString()}`;
}

export function googleMeetInstantUrl(): string {
  return "https://meet.google.com/new";
}

export function mailtoUrl(req: MeetingRequest): string {
  const body = cap(
    [
      req.startsAt ? `Time: ${formatLocal(req.startsAt)} (${req.durationMinutes} min)` : `Time: Starting now (${req.durationMinutes} min)`,
      req.meetingLink ? `Meeting link: ${req.meetingLink}` : "",
      objectiveFrom(req.agendaMarkdown),
      "Full agenda attached / in the calendar invite.",
    ].filter(Boolean).join("\n\n"),
    MAILTO_BODY_LIMIT,
    "\n\n...your facilitator will guide the rest.",
  );
  const params = new URLSearchParams({ subject: req.title, body });
  return `mailto:${req.attendeeEmails.map(encodeURIComponent).join(",")}?${params.toString()}`;
}

export function buildIcs(req: MeetingRequest): string {
  const { start, end } = eventDates(req);
  const startsAt = start ?? new Date();
  const endsAt = end ?? new Date(startsAt.getTime() + req.durationMinutes * 60_000);
  const uid = `${sanitizeUid(req.sessionId || req.title)}@pedigree`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pedigree//Discovery Invite//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${escapeIcsText(req.title)}`,
    ...(req.meetingLink ? [`LOCATION:${escapeIcsText(req.meetingLink)}`] : []),
    `DESCRIPTION:${escapeIcsText(req.agendaMarkdown)}`,
    ...req.attendeeEmails.map((email) => `ATTENDEE;RSVP=TRUE:mailto:${email}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function trimmedAgenda(markdown: string): string {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*]\s*/, "- ").trim())
    .filter(Boolean)
    .filter((line) => !/^systems you may/i.test(line) && !/^takes 30 seconds/i.test(line));
  const objectiveIdx = lines.findIndex((line) => /^what this session is for$/i.test(line));
  const discussIdx = lines.findIndex((line) => /^come ready to discuss$/i.test(line));
  const picked = [
    objectiveIdx >= 0 && lines[objectiveIdx + 1] ? `Objective: ${lines[objectiveIdx + 1]}` : "",
    discussIdx >= 0 ? lines.slice(discussIdx + 1).filter((line) => line.startsWith("- ")).join("\n") : "",
  ].filter(Boolean).join("\n\n");
  return cap(picked || markdown.trim(), TRIMMED_AGENDA_LIMIT, "\n\n...your facilitator will guide the rest.");
}

function eventDates(req: MeetingRequest) {
  const start = req.startsAt;
  const end = start ? new Date(start.getTime() + req.durationMinutes * 60_000) : undefined;
  return { start, end };
}

function datesParam(req: MeetingRequest): string | undefined {
  const { start, end } = eventDates(req);
  return start && end ? `${formatIcsDate(start)}/${formatIcsDate(end)}` : undefined;
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const len = new TextEncoder().encode(char).length;
    if (currentBytes + len > 75) {
      chunks.push(current);
      current = ` ${char}`;
      currentBytes = 1 + len;
    } else {
      current += char;
      currentBytes += len;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function objectiveFrom(markdown: string): string {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const idx = lines.findIndex((line) => /^##\s+what this session is for$/i.test(line) || /^what this session is for$/i.test(line));
  const objective = idx >= 0 ? lines[idx + 1] : "";
  return objective ? `Objective: ${objective}` : "";
}

function cap(value: string, limit: number, tail: string): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - tail.length)).trimEnd()}${tail}`;
}

function formatLocal(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function sanitizeUid(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}
