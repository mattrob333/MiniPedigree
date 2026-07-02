import type { ParsedDiscovery } from "./schemas";

// ── Transcript normalization ───────────────────────────────────────────
// Real meeting transcripts (Teams .vtt, Teams "download transcript", Google
// Meet, Zoom, SRT) are 2–4× larger than their spoken content: cue numbers,
// timestamp ranges, voice tags, and one speaker line per caption. Normalizing
// before parsing keeps 30–60 minute meetings well inside request and model
// limits, and gives the deterministic parser clean sentences to work with.

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;
const TS_RANGE_RE = new RegExp(String.raw`^\s*${TS}\s*-->\s*${TS}.*$`);
const TS_ONLY_RE = new RegExp(String.raw`^\s*\(?\[?${TS}\]?\)?\s*(AM|PM)?\s*$`, "i");
// "Matt Roberson   0:03" / "Matt Roberson 10:03 AM" (Teams download format)
const SPEAKER_TS_RE = new RegExp(String.raw`^\s*(.{1,60}?)\s+\(?\[?${TS}\]?\)?\s*(AM|PM)?\s*$`, "i");
// "10:03:22 From Matt Roberson : text" (Zoom chat/transcript)
const ZOOM_RE = new RegExp(String.raw`^\s*${TS}\s+From\s+(.{1,60}?)\s*:\s*(.*)$`, "i");
// Leading inline timestamp on a content line: "[10:03] text" / "(0:03) text"
const LEADING_TS_RE = new RegExp(String.raw`^\s*\(?\[?${TS}\]?\)?\s*(AM|PM)?\s*[-–—]?\s*`, "i");

function stripVoiceTags(line: string): string {
  // <v Matt Roberson>text</v>  →  Matt Roberson: text
  const withSpeakers = line.replace(/<v\s+([^>]+)>/gi, (_m, name: string) => `${name.trim()}: `);
  return withSpeakers.replace(/<\/?[a-z][^>]*>/gi, "");
}

function speakerOf(line: string): { speaker: string; text: string } | null {
  const m = line.match(/^\s*([A-Za-zÀ-ÿ' .-]{2,60}?)\s*:\s+(.*)$/);
  if (!m) return null;
  return { speaker: m[1].trim(), text: m[2].trim() };
}

/**
 * Normalize any common meeting-transcript format into plain
 * "Speaker: sentence..." paragraphs. Idempotent on already-plain text.
 */
export function normalizeTranscript(raw: string): string {
  if (!raw) return "";
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let pendingSpeaker: string | null = null;

  const push = (speaker: string | null, text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const prev = out.length ? out[out.length - 1] : null;
    if (speaker) {
      // merge consecutive captions from the same speaker into one paragraph
      if (prev && prev.startsWith(`${speaker}: `)) {
        out[out.length - 1] = `${prev} ${clean}`;
      } else {
        out.push(`${speaker}: ${clean}`);
      }
    } else if (prev && !prev.includes(": ")) {
      out[out.length - 1] = `${prev} ${clean}`;
    } else if (prev && pendingContinues(prev)) {
      out[out.length - 1] = `${prev} ${clean}`;
    } else {
      out.push(clean);
    }
  };

  // continuation lines of a speaker paragraph (VTT captions wrap mid-sentence)
  const pendingContinues = (prev: string) => !/[.!?…]"?\s*$/.test(prev);

  for (const rawLine of lines) {
    let line = stripVoiceTags(rawLine).trim();
    if (!line) {
      pendingSpeaker = null;
      continue;
    }
    if (/^WEBVTT\b/i.test(line) || /^NOTE\b/.test(line) || /^STYLE\b/.test(line)) continue;
    if (/^\d+$/.test(line)) continue; // SRT/VTT cue number
    if (TS_RANGE_RE.test(line)) continue; // 00:00:03.500 --> 00:00:07.000
    if (TS_ONLY_RE.test(line)) continue; // bare timestamp line

    const zoom = line.match(ZOOM_RE);
    if (zoom) {
      pendingSpeaker = zoom[1].trim();
      push(pendingSpeaker, zoom[2]);
      continue;
    }

    // "Name   0:03" header line → following lines belong to Name
    const header = line.match(SPEAKER_TS_RE);
    if (header && !speakerOf(line)) {
      const name = header[1].trim();
      // require a plausible name (letters, not a sentence)
      if (/^[A-Za-zÀ-ÿ' .-]{2,60}$/.test(name) && !/[.!?]$/.test(name)) {
        pendingSpeaker = name;
        continue;
      }
    }

    line = line.replace(LEADING_TS_RE, "");
    if (!line) continue;

    const spoken = speakerOf(line);
    if (spoken) {
      pendingSpeaker = spoken.speaker;
      push(spoken.speaker, spoken.text);
    } else {
      push(pendingSpeaker, line);
    }
  }

  return out.join("\n").trim();
}

// ── Chunking ───────────────────────────────────────────────────────────
// A normalized 60-minute meeting is roughly 50–120 KB. Models handle that in
// one call; chunking only kicks in for genuinely long content, splitting on
// paragraph (speaker-turn) boundaries so no utterance is cut mid-sentence.

export const DEFAULT_CHUNK_CHARS = 60_000;

export function chunkTranscript(normalized: string, maxChars = DEFAULT_CHUNK_CHARS): string[] {
  if (normalized.length <= maxChars) return normalized ? [normalized] : [];
  const paragraphs = normalized.split("\n");
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // pathological single paragraph — hard-split on sentence boundaries
      flush();
      let rest = p;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(". ", maxChars);
        if (cut < maxChars * 0.5) cut = maxChars;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      current = rest;
      continue;
    }
    if (current.length + p.length + 1 > maxChars) flush();
    current = current ? `${current}\n${p}` : p;
  }
  flush();
  return chunks;
}

// ── Merging chunked parse results ──────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type PeopleUpdate = ParsedDiscovery["people_updates"][number];

/**
 * Merge per-chunk discovery results into one. People are merged by email;
 * responsibilities by name (their tasks unioned); mentions/notes deduped.
 */
export function mergeParsedDiscoveries(parts: ParsedDiscovery[]): ParsedDiscovery {
  if (parts.length === 1) return parts[0];
  const byEmail = new Map<string, PeopleUpdate>();
  const mentions = new Map<string, ParsedDiscovery["unmatched_mentions"][number]>();
  const notes = new Map<string, string>();

  for (const part of parts) {
    for (const upd of part.people_updates) {
      const key = norm(upd.person_email);
      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, {
          ...upd,
          responsibilities: [...upd.responsibilities],
          recommended_mcp_servers: [...upd.recommended_mcp_servers],
        });
        continue;
      }
      existing.match_confidence = Math.max(existing.match_confidence, upd.match_confidence);
      if (upd.summary.length > existing.summary.length) existing.summary = upd.summary;
      for (const resp of upd.responsibilities) {
        const found = existing.responsibilities.find((r) => norm(r.name) === norm(resp.name));
        if (!found) {
          existing.responsibilities.push(resp);
          continue;
        }
        found.confidence = Math.max(found.confidence, resp.confidence);
        if (resp.description.length > found.description.length) found.description = resp.description;
        for (const task of resp.tasks) {
          if (!found.tasks.some((t) => norm(t.name) === norm(task.name))) found.tasks.push(task);
        }
      }
      for (const mcp of upd.recommended_mcp_servers) {
        if (!existing.recommended_mcp_servers.some((m) => norm(m.name) === norm(mcp.name))) {
          existing.recommended_mcp_servers.push(mcp);
        }
      }
    }
    for (const mention of part.unmatched_mentions) {
      if (!mentions.has(norm(mention.spoken_name))) mentions.set(norm(mention.spoken_name), mention);
    }
    for (const note of part.global_notes) {
      if (!notes.has(norm(note))) notes.set(norm(note), note);
    }
  }

  return {
    people_updates: [...byEmail.values()],
    unmatched_mentions: [...mentions.values()],
    global_notes: [...notes.values()],
  };
}
