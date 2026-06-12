import { z } from "zod";

// ── Shared structured-output schemas (client + server) ────────────────
export const delegationClass = z.enum([
  "delegatable",
  "human_approval_required",
  "not_delegatable",
  "unclear",
]);

export const riskLevel = z.enum(["low", "medium", "high", "critical"]);

// Completion context — every field nullable; null means "not stated in transcript".
export const taskReadiness = z.enum(["ready", "needs_clarification"]);

export const parsedTaskSchema = z.object({
  name: z.string(),
  delegation_class: delegationClass,
  risk_level: riskLevel,
  requires_human_approval: z.boolean().default(false),
  reason: z.string().optional().default(""),
  evidence_quote: z.string().optional().default(""),
  plain_language_description: z.string().optional().default(""),
  trigger: z.string().nullable().optional().default(null),
  cadence: z.string().nullable().optional().default(null),
  inputs: z.array(z.string()).nullable().optional().default(null),
  outputs: z.array(z.string()).nullable().optional().default(null),
  dependencies: z.object({
    upstream: z.array(z.string()).default([]),
    downstream: z.array(z.string()).default([]),
  }).nullable().optional().default(null),
  tools_mentioned: z.array(z.string()).nullable().optional().default(null),
  definition_of_done: z.string().nullable().optional().default(null),
  approval_boundary: z.string().nullable().optional().default(null),
  evidence_quotes: z.array(z.object({ quote: z.string(), speaker: z.string().optional().default("") })).nullable().optional().default(null),
  enrichment_confidence: z.number().min(0).max(1).nullable().optional().default(null),
  readiness: taskReadiness.nullable().optional().default(null),
  open_questions: z.array(z.string()).nullable().optional().default(null),
  candidate_pattern: z.string().nullable().optional().default(null),
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

// Authority assertions — claims about access/approval ceilings made in the
// session. Review-gated proposals, never direct writes to the person record.
export const authorityAssertionSchema = z.object({
  kind: z.enum(["system_access", "approval", "sod_role"]),
  system: z.string().nullable().optional().default(null),
  scope: z.enum(["none", "read_only", "draft_only", "read_write", "admin"]).nullable().optional().default(null),
  domain: z.string().nullable().optional().default(null),
  limit_description: z.string().nullable().optional().default(null),
  flow: z.string().nullable().optional().default(null),
  role: z.enum(["preparer", "approver"]).nullable().optional().default(null),
  evidence_quote: z.string().default(""),
});

export const peopleUpdateSchema = z.object({
  person_email: z.string(),
  matched_name: z.string().optional().default(""),
  match_confidence: z.number().min(0).max(1).optional().default(0.8),
  summary: z.string().optional().default(""),
  responsibilities: z.array(parsedResponsibilitySchema).default([]),
  recommended_mcp_servers: z.array(mcpRecommendationSchema).default([]),
  authority_assertions: z.array(authorityAssertionSchema).default([]),
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

export const companyResearchSourceSchema = z.object({
  url: z.string().optional().default(""),
  title: z.string().optional().default(""),
  snippet: z.string().optional().default(""),
  source_type: z.enum(["company_site", "user_text", "manual", "other"]).optional().default("other"),
});

export const companyContextDocumentSchema = z.object({
  id: z.string(),
  bucket: z.enum(["segregation_of_duties", "policy", "knowledge"]),
  fileName: z.string(),
  title: z.string().optional().default(""),
  mimeType: z.string().optional().default(""),
  sizeBytes: z.number().optional().default(0),
  text: z.string().default(""),
  uploadedAt: z.string(),
  sourceId: z.string().optional().default(""),
  classification: z.enum(["public", "internal", "confidential", "regulated"]).optional().default("internal"),
});

export const companyKpiSchema = z.object({
  department: z.string(),
  metric: z.string(),
  cadence: z.string().optional().default(""),
  owner_hint: z.string().optional().default(""),
});

export const companyContextSchema = z.object({
  companyId: z.string().optional().default(""),
  company: z.string().default(""),
  url: z.string().optional().default(""),
  rawNotes: z.string().optional().default(""),
  whatWeDo: z.string().default(""),
  industry: z.string().optional().default(""),
  market: z.string().optional().default(""),
  businessModel: z.string().optional().default(""),
  mission: z.string().optional().default(""),
  strategicGoals: z.string().optional().default(""),
  products: z.string().optional().default(""),
  competitors: z.string().optional().default(""),
  initiatives: z.string().optional().default(""),
  terminology: z.string().optional().default(""),
  currentState: z.string().optional().default(""),
  bottlenecks: z.string().optional().default(""),
  systems: z.array(z.string()).optional().default([]),
  sops: z.array(z.string()).optional().default([]),
  approvalRules: z.array(z.string()).optional().default([]),
  segregationOfDuties: z.array(z.string()).optional().default([]),
  complianceNotes: z.array(z.string()).optional().default([]),
  governanceRisks: z.array(z.string()).optional().default([]),
  departments: z.array(z.string()).optional().default([]),
  unknowns: z.array(z.string()).optional().default([]),
  kpis: z.array(companyKpiSchema).optional().default([]),
  researchSources: z.array(companyResearchSourceSchema).optional().default([]),
  contextDocuments: z.array(companyContextDocumentSchema).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0.35),
  researchedAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export type CompanyContextSchema = z.infer<typeof companyContextSchema>;

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
