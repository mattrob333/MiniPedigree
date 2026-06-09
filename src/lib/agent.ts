import type { AgentLifecycleClass, AgentRecord, CompanyContext, GovernanceResolution, GovernanceRule, McpRecommendation, PedigreeRow, Person, RiskLevel, TaskItem } from "@/types";
import { recommendMcp } from "./mcpCatalog";
import { applyGovernance, getGovernanceRules } from "./governance";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface AuthoredAgent {
  role: string;
  authority_ceiling: string;
  purpose: string;
  goal: string;
  allowed_tasks: string[];
  approval_required: string[];
  blocked_tasks: string[];
  escalation_rules: string[];
  output_style: string;
}

export type AgentOperatingMode = "on_demand" | "scheduled" | "event_driven" | "one_shot";

export interface RecommendedSchedule {
  type: "cron" | "one-shot" | "on-demand" | "event-driven";
  cron?: string;
  timezone?: string;
  reason: string;
}

export interface DeliveryTarget {
  platform: "telegram" | "discord" | "email" | "slack" | "webhook";
  recipient: string;
  channel?: string;
  format?: "brief" | "full" | "rich";
}

export interface AgentConstructionSpec extends AuthoredAgent {
  operating_mode: AgentOperatingMode;
  recommended_schedule?: RecommendedSchedule;
  workflow_steps: string[];
  input_requirements: string[];
  output_artifacts: string[];
  tool_permissions: {
    enabled: string[];
    blocked: string[];
    mcp_servers?: { name: string; scope: "read_only" | "draft_only" | "full"; reason: string }[];
  };
  delivery_recommendations: DeliveryTarget[];
  skills: string[];
  memory_policy: string;
  audit_events: string[];
  failure_modes: string[];
  test_prompts: string[];
  validation_warnings?: string[];
}

export interface AgentBuildCtx {
  person: Person;
  row: PedigreeRow;
  task: TaskItem;
  respTitle: string;
  agentName: string;
  policy: string;
  riskLevel: RiskLevel;
  lifecycleClass?: AgentLifecycleClass;
  companyContext?: CompanyContext;
  /** When present, the AI construction spec is merged into deterministic guardrails. */
  authored?: Partial<AgentConstructionSpec> | null;
  /** Pre-extracted governance rules (e.g. server AI pass); defaults to the cached deterministic extraction. */
  governanceRules?: GovernanceRule[];
}

export interface IoInput {
  name: string;
  type: "human_upload" | "document" | "upstream_agent" | "data_source";
  source: string;
  format: "pdf" | "csv" | "json" | "text" | "document";
  required: boolean;
}
export interface IoOutput {
  name: string;
  type: "document" | "record" | "message";
  destination: string;
  format: string;
}
export interface IoContract {
  inputs: IoInput[];
  outputs: IoOutput[];
  trigger: string;
}

export interface AgentArtifacts {
  manifest: Record<string, unknown>;
  systemPrompt: string;
  allowed: string[];
  approval: string[];
  blocked: string[];
  mcp: McpRecommendation[];
  governance: GovernanceResolution;
}

const GLOBAL_BLOCKED = [
  "Approve final decisions on behalf of the human owner",
  "Commit company resources or budget",
  "Send customer-facing or external communication without approval",
  "Represent yourself as the human owner or an authorized decision maker",
];

const DEFAULT_BLOCKED_TOOLS = [
  "direct_send_external_message",
  "final_approval",
  "access_grants",
  "pricing_or_contract_commitments",
  "production_changes",
];

export function buildAgentArtifacts(ctx: AgentBuildCtx): AgentArtifacts {
  const { person, row, task, respTitle, agentName, policy, riskLevel, companyContext, authored } = ctx;
  const lifecycleClass: AgentLifecycleClass = ctx.lifecycleClass ?? "standing";

  const inResp = (t: TaskItem) => t.respId === task.respId;
  const seedAllowed = uniq([task.label, ...row.tasks.delegatable.filter(inResp).map((t) => t.label)]);
  const seedApproval = uniq(row.tasks.approval.filter(inResp).map((t) => t.label));
  const seedBlocked = uniq([...row.tasks.not_delegatable.filter(inResp).map((t) => t.label), ...GLOBAL_BLOCKED]);

  const seedMerge = mergeGovernance({
    taskLabel: task.label,
    authored,
    seedAllowed,
    seedApproval,
    seedBlocked,
  });

  // Stage B: governance compilation. Policy-derived rules may only promote
  // (blocked > approval > allowed) — the same invariant as the authored merge.
  const governanceRules = ctx.governanceRules ?? getGovernanceRules(companyContext);
  const governance = applyGovernance(governanceRules, seedMerge, {
    owner: person,
    managerEmail: person.managerEmail,
  });
  const mergedGovernance = {
    allowed: governance.allowed,
    approval: governance.approval.map((a) => a.action),
    blocked: governance.blocked.map((b) => b.action),
  };

  const mcpText = [
    respTitle,
    ...mergedGovernance.allowed,
    ...mergedGovernance.approval,
    ...(companyContext?.systems ?? []),
    companyContext?.terminology ?? "",
  ].join(" ");
  const mcp = recommendMcp(mcpText, person.tools);

  const slug = slugify(agentName) || "pedigree-agent";
  const traceId = `pdg-${slug}-001`;
  const ioContract = deriveIoContract(task, respTitle, mcp, person, companyContext);
  const lifecycle = {
    class: lifecycleClass,
    ttl: lifecycleClass === "task" ? "on_complete" : null,
    teardown_policy: "delete_agent_retain_log",
  };

  const constructionSpec = buildConstructionSpec({
    person,
    task,
    respTitle,
    agentName,
    policy,
    riskLevel,
    companyContext,
    authored,
    allowed: mergedGovernance.allowed,
    approval: mergedGovernance.approval,
    blocked: mergedGovernance.blocked,
    mcp,
    ioContract,
  });
  if (governance.audit_events.length) {
    constructionSpec.audit_events = uniqNonEmpty([...constructionSpec.audit_events, ...governance.audit_events]);
  }
  if (governance.sod_findings.length) {
    constructionSpec.validation_warnings = uniqNonEmpty([
      ...(constructionSpec.validation_warnings ?? []),
      ...governance.sod_findings.map((f) => `Segregation of duties (${f.resolution}): ${f.description}`),
    ]);
  }

  const manifest = {
    manifest_version: "pdq-manifest-v0.1",
    schema_version: "pedigree.standard/1.0",
    agent_id: slug,
    agent_name: agentName,
    status: "draft",
    human_owner: {
      id: person.id,
      name: person.name,
      email: person.email,
      title: person.title,
      department: person.department,
    },
    parent_responsibility: {
      id: task.respId,
      name: respTitle,
    },
    task: { id: task.id, label: task.label },
    purpose: constructionSpec.purpose,
    goal: constructionSpec.goal,
    operating_mode: constructionSpec.operating_mode,
    workflow_steps: constructionSpec.workflow_steps,
    input_requirements: constructionSpec.input_requirements,
    output_artifacts: constructionSpec.output_artifacts,
    tool_permissions: constructionSpec.tool_permissions,
    delivery_recommendations: constructionSpec.delivery_recommendations,
    memory_policy: constructionSpec.memory_policy,
    audit_events: constructionSpec.audit_events,
    failure_modes: constructionSpec.failure_modes,
    test_prompts: constructionSpec.test_prompts,
    skills: constructionSpec.skills,
    construction_spec: constructionSpec,
    authored_by: authored ? "ai" : "template",
    validation_warnings: constructionSpec.validation_warnings ?? [],
    allowed_tasks: mergedGovernance.allowed,
    human_approval_required: mergedGovernance.approval,
    blocked_tasks: mergedGovernance.blocked,
    // Structured governance resolution: every rule-derived constraint carries
    // its rule_id + evidence so the manifest can answer "why is this blocked?".
    governance: {
      approval: governance.approval,
      blocked: governance.blocked,
      audit_events: governance.audit_events,
      sod_findings: governance.sod_findings,
      rule_provenance: governance.rule_provenance,
    },
    capabilities: {
      tools: person.tools.map((t) => ({ name: t, scope: scopeForTool(t, policy) })),
    },
    recommended_mcp_servers: mcp.map((m) => ({ name: m.name, scope: m.recommended_scope, reason: m.reason })),
    io_contract: ioContract,
    lifecycle,
    policy: {
      tier: policy,
      risk: riskLevel,
      requires_approval_from: person.name,
    },
    ...(companyContext
      ? {
          company_context: {
            company: companyContext.company,
            url: companyContext.url,
            what_we_do: companyContext.whatWeDo,
            industry: companyContext.industry,
            market: companyContext.market,
            business_model: companyContext.businessModel,
            mission: companyContext.mission,
            strategic_goals: companyContext.strategicGoals,
            initiatives: companyContext.initiatives,
            terminology: companyContext.terminology,
            systems: companyContext.systems ?? [],
            sops: companyContext.sops ?? [],
            approval_rules: companyContext.approvalRules ?? [],
            segregation_of_duties: companyContext.segregationOfDuties ?? [],
            compliance_notes: companyContext.complianceNotes ?? [],
            governance_risks: companyContext.governanceRisks ?? [],
            context_documents: (companyContext.contextDocuments ?? []).map((doc) => ({
              id: doc.id,
              bucket: doc.bucket,
              file_name: doc.fileName,
              title: doc.title || doc.fileName,
              mime_type: doc.mimeType,
              size_bytes: doc.sizeBytes,
              uploaded_at: doc.uploadedAt,
              source_id: doc.sourceId,
              text: doc.text,
            })),
          },
        }
      : {}),
    audit: {
      trace_id: traceId,
      log_destination: "pedigree.audit.bus",
      retention: "90d",
    },
  };

  const systemPrompt = buildSystemPrompt({ person, respTitle, agentName, task, allowed: mergedGovernance.allowed, approval: mergedGovernance.approval, blocked: mergedGovernance.blocked, mcp, policy, riskLevel, companyContext, constructionSpec });

  return { manifest, systemPrompt, allowed: mergedGovernance.allowed, approval: mergedGovernance.approval, blocked: mergedGovernance.blocked, mcp, governance };
}

function mergeGovernance(args: {
  taskLabel: string;
  authored?: Partial<AgentConstructionSpec> | null;
  seedAllowed: string[];
  seedApproval: string[];
  seedBlocked: string[];
}): { allowed: string[]; approval: string[]; blocked: string[] } {
  const blocked = uniqNonEmpty([...(args.authored?.blocked_tasks ?? []), ...args.seedBlocked]);
  const blockedKeys = new Set(blocked.map(keyOf));

  const approval = uniqNonEmpty([...(args.authored?.approval_required ?? []), ...args.seedApproval])
    .filter((item) => !blockedKeys.has(keyOf(item)));
  const approvalKeys = new Set(approval.map(keyOf));

  const allowed = uniqNonEmpty([args.taskLabel, ...(args.authored?.allowed_tasks ?? []), ...args.seedAllowed])
    .filter((item) => !approvalKeys.has(keyOf(item)) && !blockedKeys.has(keyOf(item)));

  return { allowed, approval, blocked };
}

function buildConstructionSpec(args: {
  person: Person;
  task: TaskItem;
  respTitle: string;
  agentName: string;
  policy: string;
  riskLevel: RiskLevel;
  companyContext?: CompanyContext;
  authored?: Partial<AgentConstructionSpec> | null;
  allowed: string[];
  approval: string[];
  blocked: string[];
  mcp: McpRecommendation[];
  ioContract: IoContract;
}): AgentConstructionSpec {
  const { person, task, respTitle, agentName, policy, riskLevel, companyContext, authored, allowed, approval, blocked, mcp, ioContract } = args;
  const operatingMode = normalizeOperatingMode(authored?.operating_mode, ioContract.trigger, `${respTitle} ${task.label}`);
  const warnings: string[] = [];

  const toolPermissions = normalizeToolPermissions({
    authored: authored?.tool_permissions,
    person,
    mcp,
    warnings,
  });

  const defaultSchedule = operatingMode === "scheduled"
    ? {
        type: "cron" as const,
        timezone: "America/New_York",
        reason: "The task appears recurring and should be reviewed before enabling a runtime schedule.",
      }
    : {
        type: modeToScheduleType(operatingMode),
        reason: "Defaulted from the selected task and lifecycle.",
      };

  const recommendedSchedule = authored?.recommended_schedule
    ? normalizeSchedule(authored.recommended_schedule, operatingMode)
    : defaultSchedule;

  const defaultInputs = ioContract.inputs.map((input) => `${input.name} from ${input.source}${input.required ? "" : " (optional)"}`);
  const defaultOutputs = ioContract.outputs.map((output) => `${output.name} as ${output.format} to ${output.destination}`);
  const companyGrounding = companyContext
    ? `Ground decisions in ${companyContext.company}${companyContext.systems?.length ? ` systems (${companyContext.systems.join(", ")})` : ""}.`
    : "Ground decisions in approved owner-provided context.";

  return {
    role: cleanText(authored?.role) || `You are ${agentName}, a governed AI agent working for ${person.name}, ${person.title}.`,
    authority_ceiling: cleanText(authored?.authority_ceiling) || `You inherit no authority beyond ${person.name}'s role. You support "${respTitle}" and must stop whenever a request requires ${person.name}'s judgment or approval.`,
    purpose: cleanText(authored?.purpose) || `Help ${person.name} with: ${task.label.toLowerCase()}.`,
    goal: cleanText(authored?.goal) || `Produce accurate, review-ready support for ${task.label.toLowerCase()} while preserving ${person.name}'s authority ceiling.`,
    operating_mode: operatingMode,
    recommended_schedule: recommendedSchedule,
    workflow_steps: uniqNonEmpty(authored?.workflow_steps ?? []).length
      ? uniqNonEmpty(authored?.workflow_steps ?? [])
      : [
          `Confirm the request is inside ${person.name}'s responsibility for "${respTitle}".`,
          companyGrounding,
          `Collect the required inputs for "${task.label}" before analysis.`,
          "Prepare the output as a draft or recommendation for owner review.",
          "Escalate instead of acting when approval, authority, or source data is unclear.",
        ],
    input_requirements: uniqNonEmpty(authored?.input_requirements ?? []).length ? uniqNonEmpty(authored?.input_requirements ?? []) : defaultInputs,
    output_artifacts: uniqNonEmpty(authored?.output_artifacts ?? []).length ? uniqNonEmpty(authored?.output_artifacts ?? []) : defaultOutputs,
    allowed_tasks: allowed,
    approval_required: approval,
    blocked_tasks: blocked,
    escalation_rules: uniqNonEmpty(authored?.escalation_rules ?? []).length
      ? uniqNonEmpty(authored?.escalation_rules ?? [])
      : [
          "The request involves a blocked task.",
          "The request requires writing to a system of record or sending an external message.",
          "The request involves financial, legal, customer, employee, security, access, or production risk.",
          "Required source data is missing, stale, or contradictory.",
        ],
    tool_permissions: toolPermissions,
    delivery_recommendations: normalizeDeliveryTargets(authored?.delivery_recommendations, person),
    skills: uniqNonEmpty(authored?.skills ?? []),
    memory_policy: cleanText(authored?.memory_policy) || "Use only approved conversation context, uploaded documents, the Pedigree manifest, and connected tool outputs. Do not retain sensitive details beyond the runtime's configured audit and memory policy.",
    audit_events: uniqNonEmpty(authored?.audit_events ?? []).length
      ? uniqNonEmpty(authored?.audit_events ?? [])
      : ["request_received", "sources_checked", "draft_created", "approval_requested", "escalation_triggered"],
    failure_modes: uniqNonEmpty(authored?.failure_modes ?? []).length
      ? uniqNonEmpty(authored?.failure_modes ?? [])
      : ["Missing required input", "Conflicting source data", "Request exceeds owner authority", "Approval is required before completion"],
    test_prompts: uniqNonEmpty(authored?.test_prompts ?? []).length
      ? uniqNonEmpty(authored?.test_prompts ?? [])
      : [
          `Draft the output for ${task.label.toLowerCase()} using only approved inputs.`,
          "Try to perform a blocked final approval and explain why you must escalate.",
          "Ask for clarification when the required source data is missing.",
        ],
    output_style: cleanText(authored?.output_style) || `Be concise, operational, and decision-ready. Separate facts, assumptions, risks, and recommended next steps. Label anything requiring ${person.name}'s approval as a draft.`,
    validation_warnings: warnings,
  };
}

function normalizeToolPermissions(args: {
  authored?: Partial<AgentConstructionSpec["tool_permissions"]>;
  person: Person;
  mcp: McpRecommendation[];
  warnings: string[];
}): AgentConstructionSpec["tool_permissions"] {
  const enabled = uniqNonEmpty([...(args.authored?.enabled ?? []), ...args.person.tools, ...args.mcp.map((m) => m.name)]);
  const blocked = uniqNonEmpty([...(args.authored?.blocked ?? []), ...DEFAULT_BLOCKED_TOOLS]);
  const authoredMcp = args.authored?.mcp_servers ?? [];
  const mcpServers = (authoredMcp.length
    ? authoredMcp
    : args.mcp.map((m) => ({ name: m.name, scope: m.recommended_scope, reason: m.reason })))
    .map((server) => {
      const requestedScope = server.scope ?? "read_only";
      if (requestedScope === "full") {
        args.warnings.push(`${server.name} requested full access; downgraded to draft_only for this slice.`);
        return { name: server.name, scope: "draft_only" as const, reason: server.reason || "Full access is not allowed by default." };
      }
      return {
        name: server.name,
        scope: requestedScope === "draft_only" ? "draft_only" as const : "read_only" as const,
        reason: server.reason || "Recommended from the responsibility and known tools.",
      };
    });

  return { enabled, blocked, mcp_servers: uniqByName(mcpServers) };
}

function normalizeSchedule(schedule: RecommendedSchedule, mode: AgentOperatingMode): RecommendedSchedule {
  const type = schedule.type || modeToScheduleType(mode);
  return {
    type,
    cron: schedule.cron || undefined,
    timezone: schedule.timezone || (type === "cron" ? "America/New_York" : undefined),
    reason: cleanText(schedule.reason) || "Recommended by the construction spec.",
  };
}

function modeToScheduleType(mode: AgentOperatingMode): RecommendedSchedule["type"] {
  if (mode === "scheduled") return "cron";
  if (mode === "event_driven") return "event-driven";
  if (mode === "one_shot") return "one-shot";
  return "on-demand";
}

function normalizeOperatingMode(mode: unknown, trigger: string, haystack: string): AgentOperatingMode {
  if (mode === "scheduled" || mode === "event_driven" || mode === "one_shot" || mode === "on_demand") return mode;
  const text = `${trigger} ${haystack}`.toLowerCase();
  if (/event|webhook|when |whenever/.test(text)) return "event_driven";
  if (/one[- ]?shot|one time|one-off/.test(text)) return "one_shot";
  if (/schedule|daily|weekly|monthly|quarterly|report|digest|brief|forecast/.test(text)) return "scheduled";
  return "on_demand";
}

function normalizeDeliveryTargets(targets: DeliveryTarget[] | undefined, person: Person): DeliveryTarget[] {
  const raw = targets?.length ? targets : [{ platform: "email" as const, recipient: person.email, format: "brief" as const }];
  return raw
    .map((target) => ({
      platform: target.platform || "email",
      recipient: target.recipient || person.email,
      channel: target.channel || "",
      format: target.format || "brief",
    }))
    .filter((target) => Boolean(target.recipient));
}

function scopeForTool(tool: string, policy: string): string {
  if (policy === "read-only") return "read";
  const t = tool.toLowerCase();
  if (/slack|gmail|email|outreach/.test(t)) return "draft";
  return "read";
}

function bullets(items: string[]): string {
  if (!items.length) return "- (none specified)";
  return items.map((i) => `- ${i}`).join("\n");
}

function buildSystemPrompt(a: {
  person: Person;
  respTitle: string;
  agentName: string;
  task: TaskItem;
  allowed: string[];
  approval: string[];
  blocked: string[];
  mcp: McpRecommendation[];
  policy: string;
  riskLevel: RiskLevel;
  companyContext?: CompanyContext;
  constructionSpec: AgentConstructionSpec;
}): string {
  const { person, respTitle, agentName, task, allowed, approval, blocked, mcp, policy, riskLevel, companyContext, constructionSpec } = a;
  const mcpLines = constructionSpec.tool_permissions.mcp_servers?.length
    ? constructionSpec.tool_permissions.mcp_servers.map((m) => `- ${m.name}: ${m.scope.replace("_", "-")} scope. ${m.reason}.`).join("\n")
    : mcp.length
      ? mcp.map((m) => `- ${m.name}: ${m.recommended_scope.replace("_", "-")} scope. ${m.reason}.`).join("\n")
      : `- Recommended from ${person.name}'s known tools: ${person.tools.join(", ") || "none listed"} (read-only).`;
  const documentStoreLines = companyContext?.contextDocuments?.length
    ? companyContext.contextDocuments
        .map((doc) => `- ${doc.bucket}: ${doc.title || doc.fileName} (${doc.id})`)
        .join("\n")
    : "- No uploaded company context documents.";

  const businessContext = companyContext
    ? `\n\n[BUSINESS CONTEXT]
You operate inside ${companyContext.company}. ${companyContext.whatWeDo}${companyContext.mission ? ` Mission: ${companyContext.mission}.` : ""}${companyContext.initiatives ? ` Current initiatives: ${companyContext.initiatives}.` : ""}${companyContext.systems?.length ? ` Systems/tools in context: ${companyContext.systems.join(", ")}.` : ""}${companyContext.approvalRules?.length ? ` Approval rules: ${companyContext.approvalRules.join("; ")}.` : ""}${companyContext.segregationOfDuties?.length ? ` Segregation of duties: ${companyContext.segregationOfDuties.join("; ")}.` : ""}${companyContext.complianceNotes?.length ? ` Compliance/security notes: ${companyContext.complianceNotes.join("; ")}.` : ""}${companyContext.terminology ? ` Use the company's own terminology where relevant: ${companyContext.terminology}.` : ""}
Ground your work in this business context; do not contradict it or invent facts about the company.

Uploaded company context document stores available in the manifest:
${documentStoreLines}`
    : "";

  return `[ROLE]
${constructionSpec.role}

[HUMAN OWNER AND AUTHORITY CEILING]
${constructionSpec.authority_ceiling}${businessContext}

[PARENT RESPONSIBILITY]
Responsibility: ${respTitle}
Anchored task: ${task.label}

[GOAL]
${constructionSpec.goal}

[OPERATING MODE]
- Mode: ${constructionSpec.operating_mode.replace("_", "-")}
- Schedule: ${constructionSpec.recommended_schedule?.type ?? "on-demand"}${constructionSpec.recommended_schedule?.cron ? ` (${constructionSpec.recommended_schedule.cron})` : ""}
- Reason: ${constructionSpec.recommended_schedule?.reason ?? "None"}

[WORKFLOW]
${bullets(constructionSpec.workflow_steps)}

[INPUT REQUIREMENTS]
${bullets(constructionSpec.input_requirements)}

[OUTPUT ARTIFACTS]
${bullets(constructionSpec.output_artifacts)}

[ALLOWED TASKS]
You may perform the following tasks:
${bullets(allowed)}

[HUMAN APPROVAL REQUIRED]
The following actions require approval from ${person.name} before completion:
${bullets(approval.length ? approval : ["Any action that writes to a system of record", "Any external communication"])}

[BLOCKED TASKS]
You must not perform the following tasks:
${bullets(blocked)}

[TOOLS AND MCP SERVERS]
You may only use the tools and MCP servers listed below, and only within the stated scope:
${mcpLines}

[SOURCE OF TRUTH]
Use the Pedigree manifest, approved discovery evidence, approved company documents, and connected tool outputs as your source of truth.
Do not invent company policy, customer commitments, pricing terms, approvals, or system access.

[POLICY]
- Policy tier: ${policy}
- Risk tier: ${riskLevel}
- All material writes require explicit approval from ${person.name}.

[MEMORY AND AUDIT]
- Memory policy: ${constructionSpec.memory_policy}
- Audit events:
${bullets(constructionSpec.audit_events)}

[ESCALATION RULES]
Escalate to ${person.name} when:
${bullets(constructionSpec.escalation_rules)}

[FAILURE MODES]
${bullets(constructionSpec.failure_modes)}

[TEST PROMPTS]
${bullets(constructionSpec.test_prompts)}

[OUTPUT STYLE]
${constructionSpec.output_style}`;
}

export function newAgentRecord(ctx: AgentBuildCtx, artifacts: AgentArtifacts): AgentRecord {
  return {
    id: `A-${Math.floor(100 + Math.random() * 900)}`,
    name: ctx.agentName,
    taskId: ctx.task.id,
    respId: ctx.task.respId,
    respTitle: ctx.respTitle,
    policy: ctx.policy,
    riskLevel: ctx.riskLevel,
    lifecycle: ctx.lifecycleClass ?? "standing",
    person: ctx.person,
    task: ctx.task,
    createdAt: new Date().toISOString(),
    manifest: artifacts.manifest,
    systemPrompt: artifacts.systemPrompt,
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function uniqNonEmpty(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const text = cleanText(item);
    const key = keyOf(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function uniqByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item.name);
    if (!item.name || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function deriveIoContract(task: TaskItem, respTitle: string, mcp: McpRecommendation[], person: Person, companyContext?: CompanyContext): IoContract {
  const hay = `${respTitle} ${task.label}`.toLowerCase();
  const inputs: IoInput[] = [];

  for (const m of mcp) {
    const isDoc = /drive|notion|doc/i.test(m.name);
    inputs.push({
      name: slugify(m.name).replace(/-mcp$/, "") + (isDoc ? "_docs" : "_data"),
      type: isDoc ? "document" : "data_source",
      source: m.name,
      format: isDoc ? "document" : "json",
      required: true,
    });
  }
  inputs.push({
    name: "owner_reference_docs",
    type: "human_upload",
    source: `Documents provided by ${person.name}`,
    format: "document",
    required: false,
  });
  const docsByBucket = companyContext?.contextDocuments?.reduce<Record<string, string[]>>((acc, doc) => {
    if (!doc.text?.trim()) return acc;
    const label = doc.title || doc.fileName;
    acc[doc.bucket] = [...(acc[doc.bucket] ?? []), label];
    return acc;
  }, {}) ?? {};
  const bucketInputs: Array<{ bucket: string; name: string; required: boolean }> = [
    { bucket: "segregation_of_duties", name: "company_segregation_of_duties_store", required: true },
    { bucket: "policy", name: "company_policy_store", required: true },
    { bucket: "knowledge", name: "company_knowledge_store", required: false },
  ];
  for (const bucketInput of bucketInputs) {
    const labels = docsByBucket[bucketInput.bucket] ?? [];
    if (!labels.length) continue;
    inputs.push({
      name: bucketInput.name,
      type: "document",
      source: `company_context.contextDocuments[${bucketInput.bucket}]: ${labels.join("; ")}`,
      format: "text",
      required: bucketInput.required,
    });
  }

  const outName = slugify(task.label).split("-").slice(0, 4).join("_") || "summary";
  const externalDraft = /draft|email|message|notify|slack/.test(hay);
  const outputs: IoOutput[] = [
    {
      name: outName,
      type: externalDraft ? "message" : "document",
      destination: externalDraft ? "Slack draft (owner approves before send)" : "owner_review_queue",
      format: "markdown",
    },
  ];

  const recurring = /daily|weekly|forecast|report|digest|monthly|variance|scorecard|brief/.test(hay);
  const trigger = recurring ? "schedule:weekly" : "human";

  return { inputs, outputs, trigger };
}

const PLATFORMS: { id: string; name: string; steps: (a: DeploymentInfo) => string[] }[] = [
  {
    id: "openai",
    name: "OpenAI (Custom GPT / Assistants)",
    steps: (a) => [
      "Create a new Custom GPT (chatgpt.com -> Explore GPTs -> Create) or an Assistant (platform.openai.com).",
      "Paste the System Prompt (below / system-prompt.txt) into Instructions.",
      a.documents.length ? `Upload these documents to Knowledge: ${a.documents.join("; ")}.` : "No knowledge documents required.",
      a.mcp.length ? `Connect these tools/actions with the stated scope: ${a.mcp.join("; ")}. Configure each as read-only unless noted.` : "No external tools required.",
      a.dataSources.length ? `Wire these data sources (read-only): ${a.dataSources.join("; ")}.` : "No data sources required.",
      `Set the trigger: ${a.trigger}.`,
      "Guardrails: OpenAI cannot natively block the approval-required actions; instruct the owner to review any output before it is sent or written. The prompt already enforces this.",
      "Verify: run a test request and confirm the agent escalates blocked actions instead of performing them.",
    ],
  },
  {
    id: "claude",
    name: "Claude (Project + connectors)",
    steps: (a) => [
      "Create a new Project in Claude (claude.ai -> Projects -> New).",
      "Paste the System Prompt into the Project's custom instructions.",
      a.documents.length ? `Add these documents to Project knowledge: ${a.documents.join("; ")}.` : "No knowledge documents required.",
      a.mcp.length ? `Connect these MCP servers with the stated scope: ${a.mcp.join("; ")}.` : "No MCP servers required.",
      a.dataSources.length ? `Connect these data sources (read-only): ${a.dataSources.join("; ")}.` : "No data sources required.",
      `Set the trigger: ${a.trigger}.`,
      "Guardrails: enforce approval-required actions via the owner's review; Claude will escalate per the prompt.",
      "Verify with a test prompt that falls outside scope; the agent should reply that it falls outside its pedigree.",
    ],
  },
  {
    id: "generic",
    name: "Generic runtime (LangGraph / CrewAI / your cloud)",
    steps: (a) => [
      "Instantiate an agent/LLM with the System Prompt as its system message.",
      a.documents.length ? `Load these documents into the agent's context/RAG store: ${a.documents.join("; ")}.` : "No documents required.",
      a.mcp.length ? `Register these tools with the stated scopes: ${a.mcp.join("; ")}.` : "No tools required.",
      a.dataSources.length ? `Grant read-only access to: ${a.dataSources.join("; ")}.` : "No data sources required.",
      `Trigger: ${a.trigger}.`,
      "Implement an approval gate for the human-approval-required actions before any write/send.",
      "Log every action with the manifest trace_id for audit.",
    ],
  },
];

interface DeploymentInfo {
  documents: string[];
  mcp: string[];
  dataSources: string[];
  trigger: string;
}

export function buildDeploymentGuide(manifest: Record<string, any>): string {
  const owner = manifest.human_owner ?? {};
  const io: IoContract = manifest.io_contract ?? { inputs: [], outputs: [], trigger: "human" };
  const spec: Partial<AgentConstructionSpec> = manifest.construction_spec ?? {};
  const documents = io.inputs.filter((i) => i.type === "document" || i.type === "human_upload").map((i) => `${i.name} (${i.source})`);
  const dataSources = io.inputs.filter((i) => i.type === "data_source").map((i) => `${i.source} - read-only`);
  const mcp: string[] = (manifest.recommended_mcp_servers ?? []).map((m: any) => `${m.name} - ${String(m.scope).replace("_", "-")}`);
  const info: DeploymentInfo = { documents, mcp, dataSources, trigger: io.trigger };

  const lines: string[] = [];
  lines.push(`# Deployment Package - ${manifest.agent_name}`);
  lines.push("");
  lines.push(`Provisioned by Pedigree - manifest \`${manifest.agent_id}\` - class: ${manifest.lifecycle?.class ?? "standing"}`);
  lines.push(`Human owner: ${owner.name} (${owner.title}${owner.department ? ", " + owner.department : ""})`);
  lines.push(`Parent responsibility: ${manifest.parent_responsibility?.name ?? ""}`);
  lines.push("");
  lines.push("This package contains everything needed to stand up this governed agent on the platform of your choice: the system prompt, the manifest, the construction spec, the documents to load, the tools/data to connect, and platform-specific steps.");
  lines.push("");
  lines.push("## 1. Artifacts");
  lines.push("- `system-prompt.txt` - paste into the agent's instructions");
  lines.push("- `manifest.json` - the portable Pedigree manifest (authority, I/O contract, lifecycle)");
  lines.push("- `hermes-manifest.json` - draft Hermes executable manifest");
  lines.push("- `hermes-agent.md` - Hermes Markdown package with YAML front matter");
  lines.push("");
  lines.push("## 2. Construction summary");
  lines.push(`- Goal: ${spec.goal ?? manifest.goal ?? manifest.purpose ?? ""}`);
  lines.push(`- Operating mode: ${spec.operating_mode ?? manifest.operating_mode ?? "on_demand"}`);
  lines.push("- Workflow:");
  lines.push((spec.workflow_steps ?? manifest.workflow_steps ?? []).length ? (spec.workflow_steps ?? manifest.workflow_steps).map((s: string) => `  - ${s}`).join("\n") : "  - None");
  lines.push("");
  lines.push("## 3. Required documents to load");
  lines.push(documents.length ? documents.map((d) => `- ${d}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 4. Required tools / MCP servers (with scopes)");
  lines.push(mcp.length ? mcp.map((m) => `- ${m}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 5. Data sources");
  lines.push(dataSources.length ? dataSources.map((d) => `- ${d}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 6. Approval & guardrails");
  const approvals: string[] = manifest.human_approval_required ?? [];
  const blocked: string[] = manifest.blocked_tasks ?? [];
  lines.push(`These actions require ${owner.name}'s approval before completion:`);
  lines.push(approvals.length ? approvals.map((a) => `- ${a}`).join("\n") : "- None");
  lines.push("");
  lines.push("These actions are blocked entirely (never perform, even with approval):");
  lines.push(blocked.length ? blocked.map((b) => `- ${b}`).join("\n") : "- None");
  lines.push("");
  lines.push("> Most target platforms cannot natively enforce these approval gates. The system prompt instructs the agent to escalate, but the human owner must review outputs before they are sent or written.");
  lines.push("");
  lines.push("## 7. Trigger");
  lines.push(`- ${io.trigger}`);
  lines.push("");
  lines.push("## 8. Platform-specific setup");
  for (const p of PLATFORMS) {
    lines.push("");
    lines.push(`### ${p.name}`);
    p.steps(info).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push("");
  lines.push("---");
  lines.push("Generated by Pedigree Discover Lite. The manifest is the source of truth.");
  return lines.join("\n");
}
