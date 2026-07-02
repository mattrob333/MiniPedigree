import { describe, it, expect } from "vitest";
import { chunkTranscript, mergeParsedDiscoveries, normalizeTranscript } from "../src/lib/transcript";
import type { ParsedDiscovery } from "../src/lib/schemas";

describe("normalizeTranscript", () => {
  it("normalizes a Teams WebVTT export (voice tags, cues, timestamp ranges)", () => {
    const vtt = `WEBVTT

1
00:00:03.500 --> 00:00:07.000
<v Jane Smith>Good morning everyone, let's get started.</v>

2
00:00:07.200 --> 00:00:11.000
<v Jane Smith>I review CRM changes and clean stale forecast records</v>

3
00:00:11.100 --> 00:00:13.900
<v Jane Smith>every single week.</v>

4
00:00:14.000 --> 00:00:16.000
<v Mark Lopez>And I draft the follow-up emails.</v>`;
    const out = normalizeTranscript(vtt);
    expect(out).not.toContain("WEBVTT");
    expect(out).not.toContain("-->");
    expect(out).not.toContain("<v");
    // consecutive same-speaker captions merge into one paragraph
    expect(out).toContain("Jane Smith: Good morning everyone, let's get started.");
    expect(out).toContain("I review CRM changes and clean stale forecast records every single week.");
    expect(out).toContain("Mark Lopez: And I draft the follow-up emails.");
    expect(out.split("\n")).toHaveLength(2);
  });

  it("normalizes the Teams download-transcript format (Name + timestamp header lines)", () => {
    const teams = `Jane Smith   0:03
Good morning everyone.
I own the weekly forecast review.

Mark Lopez   0:12
I chase reps for missing close dates.`;
    const out = normalizeTranscript(teams);
    expect(out).toContain("Jane Smith: Good morning everyone. I own the weekly forecast review.");
    expect(out).toContain("Mark Lopez: I chase reps for missing close dates.");
  });

  it("strips bare timestamps and inline leading timestamps (Google Meet style)", () => {
    const meet = `00:05:00
Jane Smith: I reconcile the monthly ledgers.
[00:06:12] Mark Lopez: I compile the aging report.`;
    const out = normalizeTranscript(meet);
    expect(out).toContain("Jane Smith: I reconcile the monthly ledgers.");
    expect(out).toContain("Mark Lopez: I compile the aging report.");
    expect(out).not.toMatch(/00:0\d:\d\d/);
  });

  it("handles Zoom 'From' lines", () => {
    const zoom = `00:10:22 From Jane Smith : I approve the final forecast number.`;
    const out = normalizeTranscript(zoom);
    expect(out).toBe("Jane Smith: I approve the final forecast number.");
  });

  it("is idempotent on plain prose and keeps content intact", () => {
    const plain = "Jane reviews CRM changes weekly. Mark drafts follow-up emails.";
    expect(normalizeTranscript(plain)).toBe(plain);
    expect(normalizeTranscript(normalizeTranscript(plain))).toBe(plain);
  });

  it("shrinks a long synthetic VTT meeting substantially without losing utterances", () => {
    // ~45 minutes of captions: 900 cues, alternating speakers
    const cues: string[] = ["WEBVTT", ""];
    for (let i = 0; i < 900; i++) {
      const speaker = i % 2 ? "Mark Lopez" : "Jane Smith";
      cues.push(String(i + 1));
      cues.push(`00:${String(Math.floor(i / 20)).padStart(2, "0")}:${String((i * 3) % 60).padStart(2, "0")}.000 --> 00:00:00.000`);
      cues.push(`<v ${speaker}>Utterance number ${i} about pipeline hygiene and follow-ups.</v>`);
      cues.push("");
    }
    const raw = cues.join("\n");
    const out = normalizeTranscript(raw);
    expect(out.length).toBeLessThan(raw.length * 0.75);
    expect(out).toContain("Utterance number 0");
    expect(out).toContain("Utterance number 899");
  });
});

describe("chunkTranscript", () => {
  it("returns one chunk for anything under the limit", () => {
    expect(chunkTranscript("short text", 1000)).toEqual(["short text"]);
    expect(chunkTranscript("", 1000)).toEqual([]);
  });

  it("splits on paragraph boundaries and never drops content", () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `Speaker ${i % 3}: paragraph ${i} ${"x".repeat(200)}`);
    const text = paragraphs.join("\n");
    const chunks = chunkTranscript(text, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
    // every paragraph survives, whole, in exactly one chunk
    const rejoined = chunks.join("\n");
    for (const p of paragraphs) expect(rejoined).toContain(p);
  });

  it("hard-splits a pathological single paragraph on sentence boundaries", () => {
    const monster = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkTranscript(monster, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("Sentence number 99");
  });
});

describe("mergeParsedDiscoveries", () => {
  const task = (name: string) => ({
    name,
    delegation_class: "delegatable" as const,
    risk_level: "low" as const,
    requires_human_approval: false,
    reason: "",
    evidence_quote: "",
  });
  const part = (email: string, respName: string, taskNames: string[], confidence = 0.8): ParsedDiscovery => ({
    people_updates: [
      {
        person_email: email,
        matched_name: "",
        match_confidence: confidence,
        summary: `summary ${respName}`,
        responsibilities: [
          { name: respName, description: "", confidence, evidence_quote: "", tasks: taskNames.map(task) },
        ],
        recommended_mcp_servers: [],
      },
    ],
    unmatched_mentions: [],
    global_notes: [`note-${respName}`],
  });

  it("merges the same person across chunks, unioning responsibilities and tasks", () => {
    const merged = mergeParsedDiscoveries([
      part("jane@x.co", "Forecast hygiene", ["Clean stale records", "Compare snapshots"]),
      part("jane@x.co", "Forecast hygiene", ["Compare snapshots", "Summarize exceptions"], 0.9),
      part("jane@x.co", "CRM review", ["Diff field changes"]),
    ]);
    expect(merged.people_updates).toHaveLength(1);
    const jane = merged.people_updates[0];
    expect(jane.match_confidence).toBe(0.9);
    expect(jane.responsibilities).toHaveLength(2);
    const forecast = jane.responsibilities.find((r) => r.name === "Forecast hygiene")!;
    expect(forecast.tasks.map((t) => t.name).sort()).toEqual([
      "Clean stale records",
      "Compare snapshots",
      "Summarize exceptions",
    ]);
    expect(merged.global_notes.sort()).toEqual(["note-CRM review", "note-Forecast hygiene"]);
  });

  it("keeps different people separate", () => {
    const merged = mergeParsedDiscoveries([
      part("jane@x.co", "Forecast hygiene", ["Clean stale records"]),
      part("mark@x.co", "Pipeline ownership", ["Draft follow-ups"]),
    ]);
    expect(merged.people_updates).toHaveLength(2);
  });
});
