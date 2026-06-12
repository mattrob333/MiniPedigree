import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, mailtoUrl, outlookCalendarUrl, teamsInstantUrl, type MeetingRequest } from "../src/lib/meetingLinks";

const req: MeetingRequest = {
  title: "Department Session - R&D + Sales & Ops",
  startsAt: new Date("2026-06-16T14:00:00-04:00"),
  durationMinutes: 45,
  attendeeEmails: ["ada+lead@example.com", "sam&ops@example.com"],
  agendaMarkdown: [
    "# Prep: Department Session",
    "",
    "## What this session is for",
    "Map ownership for R&D + Sales & Ops.",
    "",
    "## Come ready to discuss",
    "- Who owns the forecast & handoff?",
    "- What changes before launch?",
  ].join("\n"),
  sessionId: "PS-department-P1",
  meetingLink: "https://zoom.us/j/123?pwd=a,b;c",
};

describe("meetingLinks", () => {
  it("encodes Google Calendar titles, UTC dates, unicode-safe attendees, and repeated add params", () => {
    const url = googleCalendarUrl(req);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("text")).toBe(req.title);
    expect(parsed.searchParams.get("dates")).toBe("20260616T180000Z/20260616T184500Z");
    expect(parsed.searchParams.getAll("add")).toEqual(req.attendeeEmails);
    expect(parsed.searchParams.get("details")).toContain("Objective:");
    expect(url).toContain("R%26D+%2B+Sales");
  });

  it("builds Outlook and Teams compose URLs with attendee context", () => {
    expect(new URL(outlookCalendarUrl(req)).searchParams.get("to")).toBe(req.attendeeEmails.join(","));
    expect(new URL(teamsInstantUrl(req)).searchParams.get("attendees")).toBe(req.attendeeEmails.join(","));
  });

  it("escapes and folds ICS lines", () => {
    const ics = buildIcs({ ...req, agendaMarkdown: `${req.agendaMarkdown}\n${"long line ".repeat(20)}` });
    expect(ics).toContain("DTSTART:20260616T180000Z");
    expect(ics).toContain("ATTENDEE;RSVP=TRUE:mailto:ada+lead@example.com");
    expect(ics).toContain("LOCATION:https://zoom.us/j/123?pwd=a\\,b\\;c");
    expect(ics).toContain("\\n");
    expect(ics.split("\r\n").some((line) => line.startsWith(" "))).toBe(true);
    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("caps mailto bodies", () => {
    const url = mailtoUrl({ ...req, agendaMarkdown: `${req.agendaMarkdown}\n${"x".repeat(4000)}` });
    const body = new URL(url.replace(/^mailto:[^?]+/, "mailto://x")).searchParams.get("body") ?? "";
    expect(body.length).toBeLessThanOrEqual(1500);
    expect(body).toContain("Full agenda attached");
  });
});
