import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";

// ── Guided Discovery: AI session-brief generation ──────────────────────
// Input: the planned session, participants, company context, and everything
// learned so far (claimed responsibilities for overlap probes, the question
// backlog for these participants). Output mirrors the SessionBrief shape.
// The deterministic template fallback lives client-side in
// src/lib/sessionBrief.ts — this endpoint returns { mode: "demo" } when no
// API key is configured and the client falls back.

const SYSTEM_PROMPT = `You are Pedigree's Discovery Session planner. Generate the question script an interviewer will use to map who owns what work.

Question-quality rules (non-negotiable):
1. Ask about what people actually did last week/month, never what they would do. Prefer "walk me through the last time you..." over "do you ever...".
2. NEVER pitch automation to the interviewee. Questions must not contain "AI", "agent", "bot", or "automate" aimed at the participant. To find delegation candidates ask: "what would you hand to a competent new hire on day one?" Delegation framing stays interviewer-side, in the "why" field only.
3. One question per question — no compound questions.
4. 10–18 questions total. Order: warm-up ownership questions first, then cadence/system walk-throughs, then approval boundaries, then delegation candidates, then every carried-over open question VERBATIM and LAST (they need the rapport built earlier).
5. Tag every question with a target (a specific participant person_id, or "group"), an intent, and a one-line "why" that keeps the interviewer credible.
6. Ground questions in the company's own vocabulary: its goals, KPIs, bottlenecks, named systems, and terminology. KPI-ownership questions ask how the number got produced, step by step.
7. Include every carried-over backlog question exactly as provided. Never drop one.
8. Probe areas: for systems shared across participants, write a system-by-system walk-through prompt.
9. coverage_targets: the person_ids of participants who are not yet mapped and must not leave the session unmapped.`;

const responseSchema = {
  name: "session_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      objectives: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            target_person_id: { type: "string" },
            intent: { type: "string", enum: ["responsibility", "cadence", "system", "approval_boundary", "kpi_ownership", "overlap", "clarification"] },
            why: { type: "string" },
          },
          required: ["text", "target_person_id", "intent", "why"],
        },
      },
      probe_areas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { system: { type: "string" }, prompt: { type: "string" } },
          required: ["system", "prompt"],
        },
      },
      coverage_targets: { type: "array", items: { type: "string" } },
    },
    required: ["objectives", "questions", "probe_areas", "coverage_targets"],
  },
} as const;

export interface BriefInput {
  session?: unknown;        // { id, type, anchor_person_id, scope_ids }
  participants?: unknown;   // person records (id, name, title, department, tools, mapped)
  company_context?: unknown;
  learned_state?: unknown;  // { claimed_responsibilities, unmatched_mentions, backlog }
}

export type BriefResult =
  | { mode: "ai"; brief: unknown }
  | { mode: "demo"; reason: string };

export async function runSessionBrief({ session, participants, company_context, learned_state }: BriefInput): Promise<BriefResult> {
  if (!openaiEnabled) {
    return { mode: "demo", reason: "OPENAI_API_KEY not configured" };
  }
  if (!session || !Array.isArray(participants) || participants.length === 0) {
    return { mode: "demo", reason: "missing session or participants" };
  }
  try {
    const userMsg = [
      `Planned session:\n${JSON.stringify(session, null, 2)}`,
      `Participants:\n${JSON.stringify(participants, null, 2)}`,
      company_context ? `Company context:\n${JSON.stringify(company_context, null, 2)}` : "",
      learned_state ? `Learned so far (claimed responsibilities for overlap probes, unmatched mentions, carried-over backlog questions that MUST appear verbatim and last):\n${JSON.stringify(learned_state, null, 2)}` : "",
    ].filter(Boolean).join("\n\n");
    const brief = await callStructured({
      system: SYSTEM_PROMPT,
      user: userMsg,
      schemaName: responseSchema.name,
      schema: responseSchema.schema as Record<string, unknown>,
    });
    return { mode: "ai", brief };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("session brief failed:", msg);
    return { mode: "demo", reason: "ai_error: " + msg.slice(0, 200) };
  }
}
