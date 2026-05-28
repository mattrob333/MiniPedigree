import { z } from "zod";

// ── Shared structured-output schemas (client + server) ────────────────
export const delegationClass = z.enum([
  "delegatable",
  "human_approval_required",
  "not_delegatable",
  "unclear",
]);

export const riskLevel = z.enum(["low", "medium", "high", "critical"]);

export const parsedTaskSchema = z.object({
  name: z.string(),
  delegation_class: delegationClass,
  risk_level: riskLevel,
  requires_human_approval: z.boolean().default(false),
  reason: z.string().optional().default(""),
  evidence_quote: z.string().optional().default(""),
});

export const parsedResponsibilitySchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.7),
  evidence_quote: z.string().optional().default(""),
  tasks: z.array(parsedTaskSchema).default([]),
});

export const mcpRecommendationSchema = z.object({
  name: z.string(),
  reason: z.string(),
  recommended_scope: z.enum(["read_only", "draft_only", "none"]),
  risk_level: riskLevel,
});

export const peopleUpdateSchema = z.object({
  person_email: z.string(),
  matched_name: z.string().optional().default(""),
  match_confidence: z.number().min(0).max(1).optional().default(0.8),
  summary: z.string().optional().default(""),
  responsibilities: z.array(parsedResponsibilitySchema).default([]),
  recommended_mcp_servers: z.array(mcpRecommendationSchema).default([]),
});

export const parsedDiscoverySchema = z.object({
  people_updates: z.array(peopleUpdateSchema).default([]),
  unmatched_mentions: z
    .array(
      z.object({
        spoken_name: z.string(),
        raw_context: z.string().optional().default(""),
      }),
    )
    .default([]),
  global_notes: z.array(z.string()).default([]),
});

export type ParsedDiscovery = z.infer<typeof parsedDiscoverySchema>;

export const agentManifestSchema = z.object({
  manifest_version: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: z.string(),
  human_owner: z.object({
    name: z.string(),
    email: z.string(),
    title: z.string(),
    department: z.string().optional().default(""),
  }),
  parent_responsibility: z.object({
    name: z.string(),
    description: z.string().optional().default(""),
  }),
  purpose: z.string(),
  allowed_tasks: z.array(z.string()).default([]),
  human_approval_required: z.array(z.string()).default([]),
  blocked_tasks: z.array(z.string()).default([]),
  recommended_mcp_servers: z
    .array(z.object({ name: z.string(), scope: z.string(), reason: z.string() }))
    .default([]),
});
