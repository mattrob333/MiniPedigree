import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";

// ── Living Stack Part A: the maintenance parse ─────────────────────────
// Team meetings are operational, not interrogative: perhaps 5% of content is
// governance-relevant, and a one-off assignment is not an ownership transfer.
// This parse therefore NEVER creates records directly — it emits classified
// signals against existing stack state. Durability/corroboration rules live
// client-side in src/lib/signalLedger.ts; the deterministic fallback lives in
// src/lib/maintenance.ts (confirmations and obvious retirements only).

const SYSTEM_PROMPT = `You are Pedigree's Maintenance Parser. You read an operational team-meeting transcript and emit signals against the company's EXISTING stack state. You never create responsibility records.

Rules (non-negotiable):
1. Emit NOTHING for one-off assignments without recurrence language. "Jake, take the Henderson account this week" is not an ownership transfer.
2. Prefer "confirmation" over "drift" when the described work matches the current record. A confirmation changes no authority — it only attests the work still happens.
3. "drift" = cadence, owner, tool, input, or output of a KNOWN task changed ("we moved that report to Looker", "Sam's picking that up now").
4. "new_candidate" = recurring work not in the map. Only when the mention contains recurrence or ownership language ("every week", "from now on", "X will own"). Single vague mentions: emit with low confidence; the ledger applies durability rules.
5. "retirement" = work explicitly no longer performed ("we killed the weekly export").
6. "rule_signal" = a policy/approval statement changing the governance overlay ("from now on Finance signs off on all refunds"). Always emit these; they are reviewed at top priority.
7. "agent_feedback" = a human references a deployed agent's output by name.
8. "backlog_resolution" = the meeting incidentally answers one of the open questions provided.
9. Quote evidence VERBATIM from the transcript for every signal.
10. Never propose authority expansion as anything but a flagged signal: if a signal would widen what an agent may do (wider scope, new tool, fewer constraints), set authority_expanding true.
11. Reference only the task_ids, agent_ids, person_ids, rule_ids, and backlog_ids provided in the stack state. Use empty arrays when nothing matches.`;

const responseSchema = {
  name: "maintenance_signals",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["confirmation", "drift", "new_candidate", "retirement", "rule_signal", "agent_feedback", "backlog_resolution"] },
            evidence_quote: { type: "string" },
            confidence: { type: "number" },
            person_ids: { type: "array", items: { type: "string" } },
            task_ids: { type: "array", items: { type: "string" } },
            agent_ids: { type: "array", items: { type: "string" } },
            rule_ids: { type: "array", items: { type: "string" } },
            backlog_ids: { type: "array", items: { type: "string" } },
            authority_expanding: { type: "boolean" },
            patch_summary: { type: ["string", "null"] },
            proposed_label: { type: ["string", "null"] },
            proposed_cadence: { type: ["string", "null"] },
            proposed_owner_person_id: { type: ["string", "null"] },
            recurrence_language: { type: "boolean" },
          },
          required: ["type", "evidence_quote", "confidence", "person_ids", "task_ids", "agent_ids", "rule_ids", "backlog_ids", "authority_expanding", "patch_summary", "proposed_label", "proposed_cadence", "proposed_owner_person_id", "recurrence_language"],
        },
      },
    },
    required: ["signals"],
  },
} as const;

export interface MaintenanceParseInput {
  transcript?: unknown;
  meeting?: unknown;       // RegisteredMeeting (or null for unregistered)
  participants?: unknown;  // compact person records
  stack_state?: unknown;   // compact: task labels+ids, cadences, agent names+ids, open backlog questions
}

export type MaintenanceParseResult =
  | { mode: "ai"; signals: unknown }
  | { mode: "demo"; reason: string };

export async function runMaintenanceParse({ transcript, meeting, participants, stack_state }: MaintenanceParseInput): Promise<MaintenanceParseResult> {
  if (!openaiEnabled) {
    return { mode: "demo", reason: "OPENAI_API_KEY not configured" };
  }
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return { mode: "demo", reason: "empty transcript" };
  }
  try {
    const userMsg = [
      meeting ? `Registered meeting:\n${JSON.stringify(meeting, null, 2)}` : "Unregistered transcript (no meeting series yet).",
      `Participants:\n${JSON.stringify(participants ?? [], null, 2)}`,
      `Current stack state for these participants (the ONLY records you may reference):\n${JSON.stringify(stack_state ?? {}, null, 2)}`,
      `Meeting transcript:\n"""\n${transcript}\n"""`,
    ].join("\n\n");
    const parsed = await callStructured({
      system: SYSTEM_PROMPT,
      user: userMsg,
      schemaName: responseSchema.name,
      schema: responseSchema.schema as Record<string, unknown>,
    });
    return { mode: "ai", signals: (parsed as { signals: unknown[] }).signals ?? [] };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("maintenance parse failed:", msg);
    return { mode: "demo", reason: "ai_error: " + msg.slice(0, 200) };
  }
}
