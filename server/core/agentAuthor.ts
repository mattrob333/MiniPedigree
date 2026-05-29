import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";

const SYSTEM_PROMPT = `You are Pedigree's Agent Manifest Author.

You write the sections of a governed AI-agent system prompt — grounded in the company
profile, the human owner, their parent responsibility, and one specific delegated task.

Rules:
1. The agent has a single human owner and must never exceed that owner's authority.
2. Ground everything in the company profile (industry, market, goals, terminology). Use the
   company's own language. Do not invent facts about the company.
3. Author crisp, operational content for each section — not generic boilerplate. Be specific to
   this person, this responsibility, and this task.
4. Governance is paramount and conservative:
   - allowed_tasks: only safe, delegatable work (read, clean, compare, summarize, draft, monitor, flag).
   - approval_required: actions that need the owner's sign-off before completion.
   - blocked_tasks: never-permitted actions (final approvals, financial/legal/pricing/contract
     commitments, hiring/firing, access grants, external/customer commitments). You may ADD to the
     provided blocked list but must never remove or weaken it.
5. escalation_rules: when the agent must stop and escalate to the human owner.
6. Keep it portable: it should work pasted into any agent runtime.
Return only structured JSON matching the schema.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    role: { type: "string", description: "1-2 sentences: who the agent is and who it works for." },
    authority_ceiling: { type: "string", description: "How the agent is bounded by the owner's authority." },
    purpose: { type: "string", description: "One sentence purpose for the manifest." },
    goal: { type: "string", description: "What the agent is trying to achieve, grounded in the task + business goals." },
    allowed_tasks: { type: "array", items: { type: "string" } },
    approval_required: { type: "array", items: { type: "string" } },
    blocked_tasks: { type: "array", items: { type: "string" } },
    escalation_rules: { type: "array", items: { type: "string" } },
    output_style: { type: "string" },
  },
  required: ["role", "authority_ceiling", "purpose", "goal", "allowed_tasks", "approval_required", "blocked_tasks", "escalation_rules", "output_style"],
} as const;

export interface AuthorInput {
  agentName?: unknown;
  person?: unknown;
  responsibility?: unknown;
  task?: unknown;
  allowed?: unknown;
  approval?: unknown;
  blocked?: unknown;
  mcp?: unknown;
  company_context?: unknown;
  policy?: unknown;
  riskLevel?: unknown;
}

export type AuthorResult =
  | { mode: "ai"; authored: Record<string, unknown> }
  | { mode: "demo"; reason: string };

export async function runAgentAuthor(input: AuthorInput): Promise<AuthorResult> {
  if (!openaiEnabled) return { mode: "demo", reason: "OPENAI_API_KEY not configured" };

  try {
    const user = `Company profile:\n${JSON.stringify(input.company_context ?? {}, null, 2)}

Human owner:
${JSON.stringify(input.person ?? {}, null, 2)}

Parent responsibility: ${JSON.stringify(input.responsibility ?? {})}
Anchored task: ${JSON.stringify(input.task ?? {})}
Proposed agent name: ${String(input.agentName ?? "")}
Policy tier: ${String(input.policy ?? "")} · Risk: ${String(input.riskLevel ?? "")}

Seed task classification from discovery (refine/expand, but never weaken blocked/approval):
- delegatable (allowed): ${JSON.stringify(input.allowed ?? [])}
- approval_required: ${JSON.stringify(input.approval ?? [])}
- blocked: ${JSON.stringify(input.blocked ?? [])}

Recommended MCP servers (read/draft only): ${JSON.stringify(input.mcp ?? [])}

Author the governed system-prompt sections for this agent.`;

    const authored = await callStructured<Record<string, unknown>>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: "authored_agent",
      schema: schema as unknown as Record<string, unknown>,
    });
    return { mode: "ai", authored };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("agent author failed:", msg);
    return { mode: "demo", reason: "ai_error: " + msg.slice(0, 200) };
  }
}
