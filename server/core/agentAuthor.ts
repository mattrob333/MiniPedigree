import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";

const SYSTEM_PROMPT = `You are Pedigree's Governed Agent Construction Architect.

You do not merely write prompt prose. You design a bounded, executable agent package from one human-owned responsibility and one delegated task.

Pedigree owns governance. Hermes owns execution. Your job is to produce the bridge between them.

Use the company profile, human owner, responsibility, task, policy tier, risk tier, seed task classification, known tools, and recommended MCP servers to design an agent that can be safely executed by a runtime such as Hermes.

You must define:
1. Agent identity and purpose.
2. Goal the agent optimizes for.
3. Operating mode: on_demand, scheduled, event_driven, or one_shot.
4. Recommended schedule if applicable.
5. Concrete workflow steps.
6. Required inputs and data sources.
7. Output artifacts.
8. Tool permissions and blocked tools.
9. Skills to load if the runtime supports skills.
10. Human approval gates.
11. Blocked actions.
12. Escalation rules.
13. Delivery recommendations.
14. Memory policy.
15. Audit events.
16. Failure modes.
17. Test prompts.
18. Portable system-prompt sections.

Rules:
- Never allow the agent to exceed the human owner's authority.
- Never weaken seed approval_required or blocked tasks. You may add stricter gates.
- External communication, writes to systems of record, customer commitments, pricing, legal, financial, HR, security, access control, and production changes require approval or are blocked.
- Prefer read_only and draft_only tools by default.
- Only recommend full tool access when explicitly justified by task scope and policy. Full access will be downgraded by Pedigree unless a later runtime setup explicitly approves it.
- If a task is too vague to execute, require clarification in input_requirements or failure_modes instead of inventing workflow.
- Keep the output executable, specific, and runtime-portable.
- Return only structured JSON matching the schema.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    role: { type: "string", description: "1-2 sentences: who the agent is and who it works for." },
    authority_ceiling: { type: "string", description: "How the agent is bounded by the owner's authority." },
    purpose: { type: "string", description: "One sentence purpose for the manifest." },
    goal: { type: "string", description: "What the agent is trying to achieve, grounded in the task and business goals." },
    operating_mode: { type: "string", enum: ["on_demand", "scheduled", "event_driven", "one_shot"] },
    recommended_schedule: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["cron", "one-shot", "on-demand", "event-driven"] },
        cron: { type: "string", description: "Cron expression if known; otherwise empty string." },
        timezone: { type: "string", description: "Timezone if known; otherwise empty string." },
        reason: { type: "string" },
      },
      required: ["type", "cron", "timezone", "reason"],
    },
    workflow_steps: { type: "array", items: { type: "string" } },
    input_requirements: { type: "array", items: { type: "string" } },
    output_artifacts: { type: "array", items: { type: "string" } },
    allowed_tasks: { type: "array", items: { type: "string" } },
    approval_required: { type: "array", items: { type: "string" } },
    blocked_tasks: { type: "array", items: { type: "string" } },
    escalation_rules: { type: "array", items: { type: "string" } },
    tool_permissions: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "array", items: { type: "string" } },
        blocked: { type: "array", items: { type: "string" } },
        mcp_servers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              scope: { type: "string", enum: ["read_only", "draft_only", "full"] },
              reason: { type: "string" },
            },
            required: ["name", "scope", "reason"],
          },
        },
      },
      required: ["enabled", "blocked", "mcp_servers"],
    },
    delivery_recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          platform: { type: "string", enum: ["telegram", "discord", "email", "slack", "webhook"] },
          recipient: { type: "string", description: "Recipient, channel id, email, or placeholder if unknown." },
          channel: { type: "string", description: "Optional channel name/id; empty if not applicable." },
          format: { type: "string", enum: ["brief", "full", "rich"] },
        },
        required: ["platform", "recipient", "channel", "format"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
    memory_policy: { type: "string" },
    audit_events: { type: "array", items: { type: "string" } },
    failure_modes: { type: "array", items: { type: "string" } },
    test_prompts: { type: "array", items: { type: "string" } },
    output_style: { type: "string" },
  },
  required: [
    "role",
    "authority_ceiling",
    "purpose",
    "goal",
    "operating_mode",
    "recommended_schedule",
    "workflow_steps",
    "input_requirements",
    "output_artifacts",
    "allowed_tasks",
    "approval_required",
    "blocked_tasks",
    "escalation_rules",
    "tool_permissions",
    "delivery_recommendations",
    "skills",
    "memory_policy",
    "audit_events",
    "failure_modes",
    "test_prompts",
    "output_style",
  ],
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
    const user = `Company profile:
${JSON.stringify(input.company_context ?? {}, null, 2)}

Human owner:
${JSON.stringify(input.person ?? {}, null, 2)}

Parent responsibility: ${JSON.stringify(input.responsibility ?? {})}
Anchored task: ${JSON.stringify(input.task ?? {})}
Proposed agent name: ${String(input.agentName ?? "")}
Policy tier: ${String(input.policy ?? "")} - Risk: ${String(input.riskLevel ?? "")}

Seed task classification from discovery. Refine and expand only when safer, but never weaken approval_required or blocked:
- delegatable allowed seeds: ${JSON.stringify(input.allowed ?? [])}
- approval_required seeds: ${JSON.stringify(input.approval ?? [])}
- blocked seeds: ${JSON.stringify(input.blocked ?? [])}

Recommended MCP servers. Keep read_only or draft_only unless there is an explicit, unavoidable reason:
${JSON.stringify(input.mcp ?? [])}

Author the governed agent construction spec.`;

    const authored = await callStructured<Record<string, unknown>>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: "agent_construction_spec",
      schema: schema as unknown as Record<string, unknown>,
    });
    return { mode: "ai", authored };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("agent author failed:", msg);
    return { mode: "demo", reason: "ai_error: " + msg.slice(0, 200) };
  }
}
