import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import { parsedDiscoverySchema, type ParsedDiscovery } from "../../src/lib/schemas.js";
import { chunkTranscript, mergeParsedDiscoveries, normalizeTranscript, DEFAULT_CHUNK_CHARS } from "../../src/lib/transcript.js";

const SYSTEM_PROMPT = `You are Pedigree's Responsibility Parser and Task Decomposition engine.

Transform raw discovery text into structured responsibility records for the provided people.

Rules:
1. Match people by name, email, title, and contextual clues. Use their exact email as person_email.
2. Do not invent responsibilities unsupported by the transcript. If inferring, set confidence below 0.75.
3. A responsibility is an area of accountability; a task is a specific repeated action.
4. Break each responsibility into concrete tasks and classify each task's delegation_class as one of:
   - delegatable (reading, cleaning, comparing, drafting, monitoring, summarizing, flagging)
   - human_approval_required (sending, changing records, exporting, escalating, recommending business action)
   - not_delegatable (final approvals, hiring/firing, legal/financial commitments, pricing, contracts, access grants)
   - unclear
   When uncertain, prefer human_approval_required over delegatable. Be governance-first.
5. Assign risk_level: low | medium | high | critical.
6. Preserve short evidence_quote snippets from the transcript.
7. Recommend MCP servers only as read_only or draft_only suggestions; never write access.
8. Return only structured JSON matching the schema.`;

const responseSchema = {
  name: "parsed_discovery",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      people_updates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            person_email: { type: "string" },
            matched_name: { type: "string" },
            match_confidence: { type: "number" },
            summary: { type: "string" },
            responsibilities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  confidence: { type: "number" },
                  evidence_quote: { type: "string" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        delegation_class: { type: "string", enum: ["delegatable", "human_approval_required", "not_delegatable", "unclear"] },
                        risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        requires_human_approval: { type: "boolean" },
                        reason: { type: "string" },
                        evidence_quote: { type: "string" },
                      },
                      required: ["name", "delegation_class", "risk_level", "requires_human_approval", "reason", "evidence_quote"],
                    },
                  },
                },
                required: ["name", "description", "confidence", "evidence_quote", "tasks"],
              },
            },
            recommended_mcp_servers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  reason: { type: "string" },
                  recommended_scope: { type: "string", enum: ["read_only", "draft_only", "none"] },
                  risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
                },
                required: ["name", "reason", "recommended_scope", "risk_level"],
              },
            },
          },
          required: ["person_email", "matched_name", "match_confidence", "summary", "responsibilities", "recommended_mcp_servers"],
        },
      },
      unmatched_mentions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { spoken_name: { type: "string" }, raw_context: { type: "string" } },
          required: ["spoken_name", "raw_context"],
        },
      },
      global_notes: { type: "array", items: { type: "string" } },
    },
    required: ["people_updates", "unmatched_mentions", "global_notes"],
  },
} as const;

export interface ParseInput {
  transcript?: unknown;
  people?: unknown;
  company_context?: unknown;
}

export type ParseResult =
  | { mode: "ai"; discovery: unknown }
  | { mode: "demo"; reason: string };

// Keep uploaded document text in the prompt bounded — the transcript itself is
// never truncated (it gets chunked instead), but a company profile carrying
// full policy PDFs pasted as text can dwarf the transcript.
function contextForPrompt(companyContext: unknown): unknown {
  if (!companyContext || typeof companyContext !== "object") return companyContext;
  const ctx = companyContext as Record<string, unknown>;
  const docs = ctx.contextDocuments;
  if (!Array.isArray(docs)) return companyContext;
  return {
    ...ctx,
    contextDocuments: docs.map((doc) => {
      if (!doc || typeof doc !== "object") return doc;
      const d = doc as Record<string, unknown>;
      const text = typeof d.text === "string" ? d.text : "";
      return text.length > 8_000 ? { ...d, text: `${text.slice(0, 8_000)}\n…[truncated for parsing]` } : d;
    }),
  };
}

/**
 * Framework-agnostic discovery parse — used by both the Express dev server and
 * Vercel functions. Long transcripts (30–60+ minute Teams / Google Meet
 * meetings) are normalized, split into speaker-boundary chunks, parsed in
 * parallel, and merged — never rejected for size.
 */
export async function runDiscoveryParse({ transcript, people, company_context }: ParseInput): Promise<ParseResult> {
  if (!openaiEnabled) {
    return { mode: "demo", reason: "OPENAI_API_KEY not configured" };
  }
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return { mode: "demo", reason: "empty transcript" };
  }

  try {
    const normalized = normalizeTranscript(transcript) || transcript.trim();
    const chunks = chunkTranscript(normalized, DEFAULT_CHUNK_CHARS);
    const ctxBlock = company_context && typeof company_context === "object"
      ? `Company profile (the single source of truth for this business — ground every responsibility, task, and recommendation in it, and prefer the company's own terminology):\n${JSON.stringify(contextForPrompt(company_context), null, 2)}\n\n`
      : "";
    const peopleBlock = `People (JSON):\n${JSON.stringify(people, null, 2)}`;

    const parseChunk = async (chunk: string, i: number): Promise<ParsedDiscovery> => {
      const partLabel = chunks.length > 1
        ? `\n\nThis is part ${i + 1} of ${chunks.length} of one meeting; other parts are parsed separately, so extract only what THIS part supports.`
        : "";
      const userMsg = `${ctxBlock}${peopleBlock}${partLabel}\n\nDiscovery transcript:\n"""\n${chunk}\n"""`;
      const parsed = await callStructured({
        system: SYSTEM_PROMPT,
        user: userMsg,
        schemaName: responseSchema.name,
        schema: responseSchema.schema as Record<string, unknown>,
      });
      return parsedDiscoverySchema.parse(parsed);
    };

    if (chunks.length > 1) console.log(`[pedigree] long transcript: ${normalized.length} chars → ${chunks.length} chunks`);
    const parts = await Promise.all(chunks.map((chunk, i) => parseChunk(chunk, i)));
    const discovery = mergeParsedDiscoveries(parts);
    return { mode: "ai", discovery };
  } catch (e) {
    // Log the full error server-side only — provider messages can contain key
    // fragments, org ids, and internal detail that must not reach clients.
    console.error("discovery parse failed:", e);
    return { mode: "demo", reason: "ai_error" };
  }
}
