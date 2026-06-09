import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import { runStackDiffDeterministic, type StackDiffInput } from "../../src/lib/stackSync.js";
import type { StackChangeProposal } from "../../src/types.js";

const SYSTEM_PROMPT = `You are Pedigree's Stack Diff reviewer.

You receive typed change proposals that were produced deterministically by
diffing a meeting transcript against the company's responsibility map, agent
registry, and governance rules. Your only job is to refine each proposal's
confidence and pick the single best supporting evidence quote from the
transcript.

Rules:
1. Return one entry per proposal id you were given. Do not add, remove, merge,
   or retype proposals.
2. confidence is 0..1: how strongly the transcript supports the proposal.
3. evidence_quote must be copied verbatim from the transcript.
4. You must not alter what a proposal does — never widen authority, change
   owners, or edit patches.
5. Return only structured JSON matching the schema.`;

const responseSchema = {
  name: "stack_diff_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            confidence: { type: "number" },
            evidence_quote: { type: "string" },
          },
          required: ["id", "confidence", "evidence_quote"],
        },
      },
    },
    required: ["reviews"],
  },
} as const;

export interface StackDiffResult {
  mode: "ai" | "deterministic";
  proposals: StackChangeProposal[];
  reason?: string;
}

/**
 * Stack diff: deterministic matching first; the optional AI pass only refines
 * confidence and evidence selection. It can never add proposals, change types,
 * or touch proposed patches.
 */
export async function runStackDiff(input: StackDiffInput): Promise<StackDiffResult> {
  const proposals = runStackDiffDeterministic(input);

  if (!openaiEnabled || !proposals.length) {
    return { mode: "deterministic", proposals, reason: openaiEnabled ? undefined : "OPENAI_API_KEY not configured" };
  }

  try {
    const user = `Transcript:\n"""\n${input.transcript}\n"""\n\nProposals:\n${JSON.stringify(
      proposals.map((p) => ({ id: p.id, type: p.type, summary: p.summary, evidence_quote: p.evidence_quote })),
      null,
      2,
    )}`;
    const parsed = await callStructured<{ reviews: { id: string; confidence: number; evidence_quote: string }[] }>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: responseSchema.name,
      schema: responseSchema.schema as unknown as Record<string, unknown>,
    });
    const byId = new Map((parsed.reviews ?? []).map((r) => [r.id, r]));
    const refined = proposals.map((p) => {
      const review = byId.get(p.id);
      if (!review) return p;
      return {
        ...p,
        confidence: Math.min(Math.max(review.confidence, 0), 1),
        // Only accept quotes that actually appear in the transcript.
        evidence_quote: review.evidence_quote && input.transcript.includes(review.evidence_quote)
          ? review.evidence_quote
          : p.evidence_quote,
      };
    });
    return { mode: "ai", proposals: refined };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("stack diff AI pass failed:", msg);
    return { mode: "deterministic", proposals, reason: "ai_error: " + msg.slice(0, 200) };
  }
}
