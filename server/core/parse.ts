import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import { parsedDiscoverySchema } from "../../src/lib/schemas.js";

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

/** Framework-agnostic discovery parse — used by both the Express dev server and Vercel functions. */
export async function runDiscoveryParse({ transcript, people, company_context }: ParseInput): Promise<ParseResult> {
  if (!openaiEnabled) {
    return { mode: "demo", reason: "OPENAI_API_KEY not configured" };
  }
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return { mode: "demo", reason: "empty transcript" };
  }

  try {
    const ctxBlock = company_context && typeof company_context === "object"
      ? `Company profile (the single source of truth for this business — ground every responsibility, task, and recommendation in it, and prefer the company's own terminology):\n${JSON.stringify(company_context, null, 2)}\n\n`
      : "";
    const userMsg = `${ctxBlock}People (JSON):\n${JSON.stringify(people, null, 2)}\n\nDiscovery transcript:\n"""\n${transcript}\n"""`;
    const parsed = await callStructured({
      system: SYSTEM_PROMPT,
      user: userMsg,
      schemaName: responseSchema.name,
      schema: responseSchema.schema as Record<string, unknown>,
    });
    const discovery = parsedDiscoverySchema.parse(parsed);
    return { mode: "ai", discovery };
  } catch (e) {
    console.error("discovery parse failed:", (e as Error).message);
    return { mode: "demo", reason: "ai_error" };
  }
}
