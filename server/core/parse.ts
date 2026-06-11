import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import { parsedDiscoverySchema } from "../../src/lib/schemas.js";

const SYSTEM_PROMPT = `You are Pedigree's Responsibility Parser and Task Decomposition engine.

Transform raw discovery text into structured responsibility records for the provided people.

Classification rules (these come first and are never influenced by completion-context extraction):
1. Match people by name, email, title, and contextual clues. Use their exact email as person_email.
2. Do not invent responsibilities unsupported by the transcript. If inferring, set confidence below 0.75.
3. A responsibility is an area of accountability; a task is a specific repeated action.
4. Break each responsibility into concrete tasks and classify each task's delegation_class as one of:
   - delegatable (reading, cleaning, comparing, drafting, monitoring, summarizing, flagging)
   - human_approval_required (sending, changing records, exporting, escalating, recommending business action)
   - not_delegatable (final approvals, hiring/firing, legal/financial commitments, pricing, contracts, access grants)
   - unclear
   When uncertain, prefer human_approval_required over delegatable. Be governance-first.
5. If the company profile includes approvalRules or segregationOfDuties, apply them to classification:
   a task matching an approval rule is at least human_approval_required; a task creating a
   segregation-of-duties conflict is not_delegatable or human_approval_required. Cite the
   applied rule text in the task's reason field.
6. Assign risk_level: low | medium | high | critical.
7. Preserve short evidence_quote snippets from the transcript.
8. Recommend MCP servers only as read_only or draft_only suggestions; never write access.

Completion-context extraction (second, and it must NOT influence delegation_class — classify
first using the rules above, then extract completion context independently). For each task,
also extract, using null whenever the transcript does not state it (never invent):
- trigger: what kicks the task off (cadence, event, or request), e.g. "every Friday", "when a deal closes".
- inputs: named source data, documents, or systems the task reads from.
- outputs: named artifacts, records, or messages the task produces.
- tools_mentioned: tool/system names mentioned for this task.
- definition_of_done: how the speaker knows the task is complete.
- readiness: "ready" when trigger, inputs, outputs, and definition_of_done are all stated;
  otherwise "needs_clarification".
- open_questions: what you would need to ask to make this task executable.
- candidate_pattern: a short slug for the workflow pattern, e.g. "weekly-report", "record-hygiene",
  "draft-followups", "monitor-and-flag". Null if no pattern is evident.

Guided-capture input: the transcript may contain structured note blocks of the form
[Q12 | target: jane@x.co | intent: cadence] followed by the facilitator's note in quotes,
optionally followed by a raw transcript section. Treat the block's target attribution as
AUTHORITATIVE — assign the note's content to that person even if the prose is ambiguous —
and use the block's intent tag as a strong hint for what the note evidences. Blocks tagged
[backlog:<id> | target: self] are a member's direct written answer to an open question;
attribute them to that member verbatim.

Authority assertions: when a participant states what they can approve, sign off, or access
("I can approve refunds up to $2k", "only I have admin in NetSuite", "I prepare payments but
Dana releases them"), record it in authority_assertions for that person with the verbatim
evidence quote. These are review-gated proposals — extract them faithfully, never infer them.

Return only structured JSON matching the schema.`;

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
                        trigger: { type: ["string", "null"] },
                        inputs: { type: ["array", "null"], items: { type: "string" } },
                        outputs: { type: ["array", "null"], items: { type: "string" } },
                        tools_mentioned: { type: ["array", "null"], items: { type: "string" } },
                        definition_of_done: { type: ["string", "null"] },
                        readiness: { type: ["string", "null"], enum: ["ready", "needs_clarification", null] },
                        open_questions: { type: ["array", "null"], items: { type: "string" } },
                        candidate_pattern: { type: ["string", "null"] },
                      },
                      required: ["name", "delegation_class", "risk_level", "requires_human_approval", "reason", "evidence_quote", "trigger", "inputs", "outputs", "tools_mentioned", "definition_of_done", "readiness", "open_questions", "candidate_pattern"],
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
            authority_assertions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["system_access", "approval", "sod_role"] },
                  system: { type: ["string", "null"] },
                  scope: { type: ["string", "null"], enum: ["none", "read_only", "draft_only", "read_write", "admin", null] },
                  domain: { type: ["string", "null"] },
                  limit_description: { type: ["string", "null"] },
                  flow: { type: ["string", "null"] },
                  role: { type: ["string", "null"], enum: ["preparer", "approver", null] },
                  evidence_quote: { type: "string" },
                },
                required: ["kind", "system", "scope", "domain", "limit_description", "flow", "role", "evidence_quote"],
              },
            },
          },
          required: ["person_email", "matched_name", "match_confidence", "summary", "responsibilities", "recommended_mcp_servers", "authority_assertions"],
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
    const msg = (e as Error).message || String(e);
    console.error("discovery parse failed:", msg);
    return { mode: "demo", reason: "ai_error: " + msg.slice(0, 200) };
  }
}
