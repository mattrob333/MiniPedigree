import type { AgentRecord, CompanyContext, McpRecommendation, PedigreeRow, Person, RiskLevel, TaskItem } from "@/types";
import { recommendMcp } from "./mcpCatalog";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface AgentBuildCtx {
  person: Person;
  row: PedigreeRow;
  task: TaskItem;
  respTitle: string;
  agentName: string;
  policy: string;
  riskLevel: RiskLevel;
  companyContext?: CompanyContext;
}

export interface AgentArtifacts {
  manifest: Record<string, unknown>;
  systemPrompt: string;
  allowed: string[];
  approval: string[];
  blocked: string[];
  mcp: McpRecommendation[];
}

const GLOBAL_BLOCKED = [
  "Approve final decisions on behalf of the human owner",
  "Commit company resources or budget",
  "Send customer-facing or external communication without approval",
  "Represent yourself as the human owner or an authorized decision maker",
];

export function buildAgentArtifacts(ctx: AgentBuildCtx): AgentArtifacts {
  const { person, row, task, respTitle, agentName, policy, riskLevel, companyContext } = ctx;

  const inResp = (t: TaskItem) => t.respId === task.respId;
  const allowed = uniq([
    task.label,
    ...row.tasks.delegatable.filter(inResp).map((t) => t.label),
  ]);
  const approval = uniq(row.tasks.approval.filter(inResp).map((t) => t.label));
  const blocked = uniq([
    ...row.tasks.not_delegatable.filter(inResp).map((t) => t.label),
    ...GLOBAL_BLOCKED,
  ]);

  const mcpText = [respTitle, ...allowed, ...approval].join(" ");
  const mcp = recommendMcp(mcpText, person.tools);

  const slug = slugify(agentName) || "pedigree-agent";
  const traceId = `pdg-${slug}-001`;

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
    purpose: `Help ${person.name} with: ${task.label.toLowerCase()}.`,
    allowed_tasks: allowed,
    human_approval_required: approval,
    blocked_tasks: blocked,
    capabilities: {
      tools: person.tools.map((t) => ({ name: t, scope: scopeForTool(t, policy) })),
    },
    recommended_mcp_servers: mcp.map((m) => ({ name: m.name, scope: m.recommended_scope, reason: m.reason })),
    policy: {
      tier: policy,
      risk: riskLevel,
      requires_approval_from: person.name,
    },
    ...(companyContext
      ? {
          company_context: {
            company: companyContext.company,
            what_we_do: companyContext.whatWeDo,
            mission: companyContext.mission,
            initiatives: companyContext.initiatives,
            terminology: companyContext.terminology,
          },
        }
      : {}),
    audit: {
      trace_id: traceId,
      log_destination: "pedigree.audit.bus",
      retention: "90d",
    },
  };

  const systemPrompt = buildSystemPrompt({ person, respTitle, agentName, task, allowed, approval, blocked, mcp, policy, riskLevel, companyContext });

  return { manifest, systemPrompt, allowed, approval, blocked, mcp };
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
}): string {
  const { person, respTitle, agentName, task, allowed, approval, blocked, mcp, policy, riskLevel, companyContext } = a;
  const mcpLines = mcp.length
    ? mcp.map((m) => `- ${m.name}: ${m.recommended_scope.replace("_", "-")} scope. ${m.reason}.`).join("\n")
    : `- Recommended from ${person.name}'s known tools: ${person.tools.join(", ") || "none listed"} (read-only).`;

  const businessContext = companyContext
    ? `\n\n[BUSINESS CONTEXT]
You operate inside ${companyContext.company}. ${companyContext.whatWeDo}${companyContext.mission ? ` Mission: ${companyContext.mission}.` : ""}${companyContext.initiatives ? ` Current initiatives: ${companyContext.initiatives}.` : ""}${companyContext.terminology ? ` Use the company's own terminology where relevant: ${companyContext.terminology}.` : ""}
Ground your work in this business context; do not contradict it or invent facts about the company.`
    : "";

  return `[ROLE]
You are ${agentName}. You work for ${person.name}, ${person.title}. You support the business responsibility defined in the Pedigree manifest.

[HUMAN OWNER AND AUTHORITY CEILING]
Your human owner is ${person.name}. You do not replace this person. You assist with specific delegated tasks under their responsibility for "${respTitle}".
You may not exceed the authority of ${person.name}, and you may not perform actions that require human approval unless approval is explicitly granted.${businessContext}

[PARENT RESPONSIBILITY]
Responsibility: ${respTitle}
Anchored task: ${task.label}

[GOAL]
Your goal is to help ${person.name} with ${task.label.toLowerCase()}, staying strictly within the scope above.

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

[ESCALATION RULES]
Escalate to ${person.name} when:
- The request involves a blocked task.
- The request affects official business records.
- The request involves external communication.
- The request involves financial, legal, customer, employee, or security risk.
- The available information is incomplete or conflicting.

[OUTPUT STYLE]
Be concise, operational, and decision-ready.
When summarizing, separate facts, assumptions, risks, and recommended next steps.
When approval is required, clearly label the output as a draft or recommendation.`;
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
