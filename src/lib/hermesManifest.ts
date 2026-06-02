import type { AgentRecord, RiskLevel } from "@/types";
import type { AgentConstructionSpec, DeliveryTarget as ConstructionDeliveryTarget, IoContract, RecommendedSchedule } from "./agent";

export type DeliveryTarget = ConstructionDeliveryTarget;

export interface HermesAgentManifest {
  manifest_version: "1.0";
  runtime: "hermes";
  agent_id: string;
  agent_name: string;
  owner: {
    name: string;
    email: string;
    role: string;
  };
  department: string;
  responsibility_id: string;
  responsibility_title: string;
  task_id: string;
  task_label: string;
  goal: string;
  schedule: {
    type: "cron" | "one-shot" | "on-demand" | "event-driven";
    cron?: string;
    timezone?: string;
    expiry?: string | null;
  };
  task: {
    steps?: string[];
    input: string;
    output: string;
  };
  io: IoContract;
  tools: {
    enabled: string[];
    blocked: string[];
    mcp_servers?: {
      name: string;
      scope: "read_only" | "draft_only" | "full";
    }[];
  };
  skills?: string[];
  policy: string;
  risk_level: RiskLevel;
  allowed_tasks: string[];
  approval_required: string[];
  blocked_tasks: string[];
  escalation_rules: string[];
  delivery: {
    on_complete: DeliveryTarget[];
    on_error: DeliveryTarget[];
    on_approval: DeliveryTarget[];
    format: "brief" | "full" | "raw";
  };
  data_sources?: {
    name: string;
    type: "file" | "api" | "supabase" | "notion";
    path?: string;
    endpoint?: string;
    auth_env_var?: string;
    access: "read" | "write" | "read_write";
  }[];
  model?: {
    provider: string;
    model: string;
  };
  system_prompt?: string;
  validation_warnings?: string[];
}

export interface HermesBuildResult {
  manifest: HermesAgentManifest;
  markdown: string;
  warnings: string[];
}

type ManifestLike = Record<string, any>;
type HermesMcpDraft = { name: string; scope: "read_only" | "draft_only" | "full"; reason?: string };

export function buildHermesManifest(agentOrManifest: AgentRecord | ManifestLike): HermesBuildResult {
  const sourceManifest = getSourceManifest(agentOrManifest);
  const systemPrompt = getSystemPrompt(agentOrManifest, sourceManifest);
  const warnings = uniqStrings([...(sourceManifest.validation_warnings ?? [])]);
  const owner = sourceManifest.human_owner ?? {};
  const responsibility = sourceManifest.parent_responsibility ?? {};
  const task = sourceManifest.task ?? {};
  const io: IoContract = sourceManifest.io_contract ?? { inputs: [], outputs: [], trigger: "human" };
  const constructionSpec = getConstructionSpec(sourceManifest);
  const schedule = buildSchedule(constructionSpec.recommended_schedule, constructionSpec.operating_mode, warnings);
  const delivery = buildDelivery(constructionSpec.delivery_recommendations, owner, warnings);
  const tools = buildTools(sourceManifest, constructionSpec, warnings);
  const dataSources = buildDataSources(io, warnings);

  const manifest: HermesAgentManifest = {
    manifest_version: "1.0",
    runtime: "hermes",
    agent_id: String(sourceManifest.agent_id ?? "pedigree-agent"),
    agent_name: String(sourceManifest.agent_name ?? "Pedigree Agent"),
    owner: {
      name: String(owner.name ?? ""),
      email: String(owner.email ?? ""),
      role: String(owner.title ?? owner.role ?? ""),
    },
    department: String(owner.department ?? ""),
    responsibility_id: String(responsibility.id ?? ""),
    responsibility_title: String(responsibility.name ?? responsibility.title ?? ""),
    task_id: String(task.id ?? ""),
    task_label: String(task.label ?? ""),
    goal: constructionSpec.goal || String(sourceManifest.goal ?? sourceManifest.purpose ?? ""),
    schedule,
    task: {
      steps: constructionSpec.workflow_steps,
      input: constructionSpec.input_requirements.join("\n"),
      output: constructionSpec.output_artifacts.join("\n"),
    },
    io,
    tools,
    skills: constructionSpec.skills,
    policy: String(sourceManifest.policy?.tier ?? sourceManifest.policy ?? ""),
    risk_level: normalizeRisk(sourceManifest.policy?.risk ?? sourceManifest.riskLevel ?? "low"),
    allowed_tasks: sourceManifest.allowed_tasks ?? constructionSpec.allowed_tasks ?? [],
    approval_required: sourceManifest.human_approval_required ?? constructionSpec.approval_required ?? [],
    blocked_tasks: sourceManifest.blocked_tasks ?? constructionSpec.blocked_tasks ?? [],
    escalation_rules: constructionSpec.escalation_rules,
    delivery,
    data_sources: dataSources,
    model: {
      provider: "openai",
      model: "runtime_default",
    },
    system_prompt: systemPrompt,
    validation_warnings: warnings,
  };

  return {
    manifest,
    warnings,
    markdown: buildHermesMarkdownPackage(manifest, systemPrompt, warnings, constructionSpec),
  };
}

export function buildHermesYamlFrontMatter(manifest: HermesAgentManifest): string {
  const frontMatter = {
    manifest_version: manifest.manifest_version,
    runtime: manifest.runtime,
    agent_id: manifest.agent_id,
    agent_name: manifest.agent_name,
    owner: manifest.owner,
    department: manifest.department,
    responsibility_id: manifest.responsibility_id,
    responsibility_title: manifest.responsibility_title,
    task_id: manifest.task_id,
    task_label: manifest.task_label,
    schedule: manifest.schedule,
    tools: manifest.tools,
    skills: manifest.skills ?? [],
    policy: manifest.policy,
    risk_level: manifest.risk_level,
    delivery: manifest.delivery,
    data_sources: manifest.data_sources ?? [],
    validation_warnings: manifest.validation_warnings ?? [],
  };
  return toYaml(frontMatter);
}

export function buildHermesMarkdownPackage(
  manifest: HermesAgentManifest,
  systemPrompt = manifest.system_prompt ?? "",
  warnings: string[] = manifest.validation_warnings ?? [],
  constructionSpec?: Partial<AgentConstructionSpec>,
): string {
  const spec = constructionSpec ?? {};
  const lines: string[] = [];
  lines.push("---");
  lines.push(buildHermesYamlFrontMatter(manifest));
  lines.push("---");
  lines.push("");
  lines.push(`# ${manifest.agent_name}`);
  lines.push("");
  lines.push("Draft Hermes executable package generated by Pedigree.");
  lines.push("");
  if (warnings.length) {
    lines.push("## Validation Warnings");
    lines.push(warnings.map((warning) => `- ${warning}`).join("\n"));
    lines.push("");
  }
  lines.push("## System Prompt");
  lines.push("");
  lines.push(systemPrompt || "(No system prompt provided.)");
  lines.push("");
  lines.push("## Construction Spec Summary");
  lines.push("");
  lines.push(`- Goal: ${manifest.goal}`);
  lines.push(`- Operating mode: ${spec.operating_mode ?? scheduleToMode(manifest.schedule.type)}`);
  lines.push(`- Policy: ${manifest.policy}`);
  lines.push(`- Risk: ${manifest.risk_level}`);
  lines.push("");
  lines.push("### Workflow");
  lines.push(listOrNone(manifest.task.steps ?? []));
  lines.push("");
  lines.push("### Inputs");
  lines.push(listOrNone(splitLines(manifest.task.input)));
  lines.push("");
  lines.push("### Outputs");
  lines.push(listOrNone(splitLines(manifest.task.output)));
  lines.push("");
  lines.push("### Approval Required");
  lines.push(listOrNone(manifest.approval_required));
  lines.push("");
  lines.push("### Blocked Tasks");
  lines.push(listOrNone(manifest.blocked_tasks));
  lines.push("");
  lines.push("### Test Prompts");
  lines.push(listOrNone(spec.test_prompts ?? []));
  lines.push("");
  lines.push("## hermes-manifest.json");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(manifest, null, 2));
  lines.push("```");
  return lines.join("\n");
}

function getSourceManifest(agentOrManifest: AgentRecord | ManifestLike): ManifestLike {
  if (agentOrManifest && typeof agentOrManifest === "object" && "manifest" in agentOrManifest) {
    return ((agentOrManifest as AgentRecord).manifest ?? {}) as ManifestLike;
  }
  return agentOrManifest as ManifestLike;
}

function getSystemPrompt(agentOrManifest: AgentRecord | ManifestLike, manifest: ManifestLike): string {
  if (agentOrManifest && typeof agentOrManifest === "object" && "systemPrompt" in agentOrManifest) {
    return String((agentOrManifest as AgentRecord).systemPrompt ?? "");
  }
  return String(manifest.system_prompt ?? "");
}

function getConstructionSpec(manifest: ManifestLike): AgentConstructionSpec {
  const spec = (manifest.construction_spec ?? {}) as Partial<AgentConstructionSpec>;
  const owner = manifest.human_owner ?? {};
  const task = manifest.task ?? {};
  return {
    role: String(spec.role ?? `You are ${manifest.agent_name ?? "Pedigree Agent"}.`),
    authority_ceiling: String(spec.authority_ceiling ?? `You must not exceed ${owner.name ?? "the human owner"}'s authority.`),
    purpose: String(spec.purpose ?? manifest.purpose ?? ""),
    goal: String(spec.goal ?? manifest.goal ?? manifest.purpose ?? ""),
    operating_mode: spec.operating_mode ?? normalizeMode(manifest.operating_mode),
    recommended_schedule: spec.recommended_schedule,
    workflow_steps: spec.workflow_steps ?? manifest.workflow_steps ?? [],
    input_requirements: spec.input_requirements ?? manifest.input_requirements ?? [],
    output_artifacts: spec.output_artifacts ?? manifest.output_artifacts ?? [],
    allowed_tasks: spec.allowed_tasks ?? manifest.allowed_tasks ?? [],
    approval_required: spec.approval_required ?? manifest.human_approval_required ?? [],
    blocked_tasks: spec.blocked_tasks ?? manifest.blocked_tasks ?? [],
    escalation_rules: spec.escalation_rules ?? ["Escalate when the request exceeds the approved scope."],
    tool_permissions: spec.tool_permissions ?? manifest.tool_permissions ?? { enabled: [], blocked: [], mcp_servers: [] },
    delivery_recommendations: spec.delivery_recommendations ?? manifest.delivery_recommendations ?? [],
    skills: spec.skills ?? manifest.skills ?? [],
    memory_policy: String(spec.memory_policy ?? manifest.memory_policy ?? ""),
    audit_events: spec.audit_events ?? manifest.audit_events ?? [],
    failure_modes: spec.failure_modes ?? manifest.failure_modes ?? [],
    test_prompts: spec.test_prompts ?? manifest.test_prompts ?? [`Ask ${manifest.agent_name ?? "the agent"} to explain its authority ceiling for ${task.label ?? "the task"}.`],
    output_style: String(spec.output_style ?? ""),
    validation_warnings: spec.validation_warnings ?? manifest.validation_warnings ?? [],
  };
}

function buildSchedule(schedule: RecommendedSchedule | undefined, mode: AgentConstructionSpec["operating_mode"], warnings: string[]): HermesAgentManifest["schedule"] {
  const type = schedule?.type ?? modeToScheduleType(mode);
  const out: HermesAgentManifest["schedule"] = { type, expiry: null };
  if (type === "cron") {
    out.cron = schedule?.cron || "TODO_CRON";
    out.timezone = schedule?.timezone || "America/New_York";
    if (!schedule?.cron) warnings.push("Hermes schedule is missing a cron expression; using TODO_CRON.");
    if (!schedule?.timezone) warnings.push("Hermes schedule timezone defaulted to America/New_York.");
  }
  return out;
}

function modeToScheduleType(mode: AgentConstructionSpec["operating_mode"]): HermesAgentManifest["schedule"]["type"] {
  if (mode === "scheduled") return "cron";
  if (mode === "event_driven") return "event-driven";
  if (mode === "one_shot") return "one-shot";
  return "on-demand";
}

function buildDelivery(targets: DeliveryTarget[] | undefined, owner: ManifestLike, warnings: string[]): HermesAgentManifest["delivery"] {
  const fallbackRecipient = String(owner.email || "OWNER_EMAIL");
  let onComplete = (targets ?? []).filter((target) => target.recipient);
  if (!onComplete.length) {
    onComplete = [{ platform: "email", recipient: fallbackRecipient, format: "brief" }];
    warnings.push("Hermes delivery target was missing; defaulted to owner email.");
    if (fallbackRecipient === "OWNER_EMAIL") warnings.push("Owner email is missing; delivery recipient is OWNER_EMAIL placeholder.");
  }
  const format = normalizeDeliveryFormat(onComplete[0]?.format);
  return {
    on_complete: onComplete,
    on_error: [{ platform: "email", recipient: fallbackRecipient, format: "brief" }],
    on_approval: [{ platform: "email", recipient: fallbackRecipient, format: "brief" }],
    format,
  };
}

function buildTools(sourceManifest: ManifestLike, spec: AgentConstructionSpec, warnings: string[]): HermesAgentManifest["tools"] {
  const capabilities = (sourceManifest.capabilities?.tools ?? []).map((tool: any) => String(tool.name ?? tool));
  const enabled = uniqStrings([...(spec.tool_permissions.enabled ?? []), ...capabilities]);
  const blocked = uniqStrings(spec.tool_permissions.blocked ?? []);
  const rawMcp: HermesMcpDraft[] = spec.tool_permissions.mcp_servers?.length
    ? spec.tool_permissions.mcp_servers
    : (sourceManifest.recommended_mcp_servers ?? []).map((server: any) => ({
        name: String(server.name ?? ""),
        scope: String(server.scope ?? "read_only") as "read_only" | "draft_only" | "full",
        reason: String(server.reason ?? ""),
      }));
  const mcp_servers = rawMcp.map((server) => {
    if (server.scope === "full") {
      warnings.push(`${server.name} requested full Hermes scope; downgraded to draft_only.`);
      return { name: server.name, scope: "draft_only" as const };
    }
    return { name: server.name, scope: server.scope === "draft_only" ? "draft_only" as const : "read_only" as const };
  }).filter((server) => server.name);
  return { enabled, blocked, mcp_servers };
}

function buildDataSources(io: IoContract, warnings: string[]): HermesAgentManifest["data_sources"] {
  return io.inputs.map((input) => {
    if (input.type === "data_source") {
      warnings.push(`${input.name} is missing a concrete API endpoint; using TODO_API_ENDPOINT.`);
      return {
        name: input.name,
        type: "api" as const,
        endpoint: "TODO_API_ENDPOINT",
        auth_env_var: `${toEnvName(input.name)}_API_KEY`,
        access: "read" as const,
      };
    }
    warnings.push(`${input.name} is missing a concrete file path; using TODO_UPLOAD_PATH.`);
    return {
      name: input.name,
      type: "file" as const,
      path: "TODO_UPLOAD_PATH",
      access: "read" as const,
    };
  });
}

function normalizeRisk(value: unknown): RiskLevel {
  return value === "medium" || value === "high" || value === "critical" ? value : "low";
}

function normalizeMode(value: unknown): AgentConstructionSpec["operating_mode"] {
  return value === "scheduled" || value === "event_driven" || value === "one_shot" || value === "on_demand" ? value : "on_demand";
}

function normalizeDeliveryFormat(format: unknown): "brief" | "full" | "raw" {
  if (format === "full" || format === "rich") return "full";
  if (format === "raw") return "raw";
  return "brief";
}

function scheduleToMode(type: HermesAgentManifest["schedule"]["type"]): AgentConstructionSpec["operating_mode"] {
  if (type === "cron") return "scheduled";
  if (type === "event-driven") return "event_driven";
  if (type === "one-shot") return "one_shot";
  return "on_demand";
}

function splitLines(value: string): string[] {
  return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function listOrNone(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function uniqStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => String(item).trim()).filter(Boolean)));
}

function toEnvName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase() || "HERMES_SOURCE";
}

function toYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((item) => {
      if (isScalar(item)) return `${pad}- ${yamlScalar(item)}`;
      const nested = toYaml(item, indent + 2);
      return `${pad}-\n${nested}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (Array.isArray(item)) {
        if (!item.length) return `${pad}${key}: []`;
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      }
      if (item && typeof item === "object") {
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      }
      return `${pad}${key}: ${yamlScalar(item)}`;
    }).join("\n");
  }
  return `${pad}${yamlScalar(value)}`;
}

function isScalar(value: unknown): boolean {
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function yamlScalar(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (!text) return '""';
  return JSON.stringify(text);
}
