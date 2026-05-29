import type { AgentLifecycleClass, AgentRecord, CompanyContext, McpRecommendation, PedigreeRow, Person, RiskLevel, TaskItem } from "@/types";
import { recommendMcp } from "./mcpCatalog";

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
  /** When present, the AI-authored sections are used instead of the deterministic template. */
  authored?: AuthoredAgent | null;
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
}

const GLOBAL_BLOCKED = [
  "Approve final decisions on behalf of the human owner",
  "Commit company resources or budget",
  "Send customer-facing or external communication without approval",
  "Represent yourself as the human owner or an authorized decision maker",
];

export function buildAgentArtifacts(ctx: AgentBuildCtx): AgentArtifacts {
  const { person, row, task, respTitle, agentName, policy, riskLevel, companyContext, authored } = ctx;
  const lifecycleClass: AgentLifecycleClass = ctx.lifecycleClass ?? "standing";

  const inResp = (t: TaskItem) => t.respId === task.respId;
  // Deterministic governance seeds from the discovery classification.
  const seedAllowed = uniq([task.label, ...row.tasks.delegatable.filter(inResp).map((t) => t.label)]);
  const seedApproval = uniq(row.tasks.approval.filter(inResp).map((t) => t.label));
  const seedBlocked = uniq([...row.tasks.not_delegatable.filter(inResp).map((t) => t.label), ...GLOBAL_BLOCKED]);

  // AI-authored content refines/expands the seeds. Guardrails can only be
  // STRENGTHENED: blocked/approval always include the deterministic seeds.
  const allowed = authored ? uniq([task.label, ...authored.allowed_tasks]) : seedAllowed;
  const approval = uniq([...(authored?.approval_required ?? []), ...seedApproval]);
  const blocked = uniq([...(authored?.blocked_tasks ?? []), ...seedBlocked]);

  const mcpText = [respTitle, ...allowed, ...approval].join(" ");
  const mcp = recommendMcp(mcpText, person.tools);

  const slug = slugify(agentName) || "pedigree-agent";
  const traceId = `pdg-${slug}-001`;
  const ioContract = deriveIoContract(task, respTitle, mcp, person);
  const lifecycle = {
    class: lifecycleClass,
    ttl: lifecycleClass === "task" ? "on_complete" : null,
    teardown_policy: "delete_agent_retain_log",
  };

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
    purpose: authored?.purpose || `Help ${person.name} with: ${task.label.toLowerCase()}.`,
    authored_by: authored ? "ai" : "template",
    allowed_tasks: allowed,
    human_approval_required: approval,
    blocked_tasks: blocked,
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

  const systemPrompt = buildSystemPrompt({ person, respTitle, agentName, task, allowed, approval, blocked, mcp, policy, riskLevel, companyContext, authored });

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
  authored?: AuthoredAgent | null;
}): string {
  const { person, respTitle, agentName, task, allowed, approval, blocked, mcp, policy, riskLevel, companyContext, authored } = a;
  const mcpLines = mcp.length
    ? mcp.map((m) => `- ${m.name}: ${m.recommended_scope.replace("_", "-")} scope. ${m.reason}.`).join("\n")
    : `- Recommended from ${person.name}'s known tools: ${person.tools.join(", ") || "none listed"} (read-only).`;

  // AI-authored prose for the human sections (governed lists stay deterministic above).
  const roleLine = authored?.role
    ? authored.role
    : `You are ${agentName}. You work for ${person.name}, ${person.title}. You support the business responsibility defined in the Pedigree manifest.`;
  const authorityLine = authored?.authority_ceiling
    ? authored.authority_ceiling
    : `Your human owner is ${person.name}. You do not replace this person. You assist with specific delegated tasks under their responsibility for "${respTitle}".\nYou may not exceed the authority of ${person.name}, and you may not perform actions that require human approval unless approval is explicitly granted.`;
  const goalLine = authored?.goal
    ? authored.goal
    : `Your goal is to help ${person.name} with ${task.label.toLowerCase()}, staying strictly within the scope above.`;
  const escalationBlock = authored?.escalation_rules?.length
    ? bullets(authored.escalation_rules)
    : bullets([
        "The request involves a blocked task.",
        "The request affects official business records.",
        "The request involves external communication.",
        "The request involves financial, legal, customer, employee, or security risk.",
        "The available information is incomplete or conflicting.",
      ]);
  const outputStyle = authored?.output_style
    ? authored.output_style
    : `Be concise, operational, and decision-ready.\nWhen summarizing, separate facts, assumptions, risks, and recommended next steps.\nWhen approval is required, clearly label the output as a draft or recommendation.`;

  const businessContext = companyContext
    ? `\n\n[BUSINESS CONTEXT]
You operate inside ${companyContext.company}. ${companyContext.whatWeDo}${companyContext.mission ? ` Mission: ${companyContext.mission}.` : ""}${companyContext.initiatives ? ` Current initiatives: ${companyContext.initiatives}.` : ""}${companyContext.terminology ? ` Use the company's own terminology where relevant: ${companyContext.terminology}.` : ""}
Ground your work in this business context; do not contradict it or invent facts about the company.`
    : "";

  return `[ROLE]
${roleLine}

[HUMAN OWNER AND AUTHORITY CEILING]
${authorityLine}${businessContext}

[PARENT RESPONSIBILITY]
Responsibility: ${respTitle}
Anchored task: ${task.label}

[GOAL]
${goalLine}

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
${escalationBlock}

[OUTPUT STYLE]
${outputStyle}`;
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

// ── io_contract derivation (P1.1) ─────────────────────────────────────
function deriveIoContract(task: TaskItem, respTitle: string, mcp: McpRecommendation[], person: Person): IoContract {
  const hay = `${respTitle} ${task.label}`.toLowerCase();
  const inputs: IoInput[] = [];

  // Data sources / documents from recommended MCP servers (read-only feeds).
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
  // Always allow the owner to hand the agent reference documents.
  inputs.push({
    name: "owner_reference_docs",
    type: "human_upload",
    source: `Documents provided by ${person.name}`,
    format: "document",
    required: false,
  });

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

  const recurring = /weekly|forecast|report|digest|monthly|variance|scorecard/.test(hay);
  const trigger = recurring ? "schedule:weekly" : "human";

  return { inputs, outputs, trigger };
}

// ── Deployment package guide (P1.2) ───────────────────────────────────
const PLATFORMS: { id: string; name: string; steps: (a: DeploymentInfo) => string[] }[] = [
  {
    id: "openai",
    name: "OpenAI (Custom GPT / Assistants)",
    steps: (a) => [
      "Create a new Custom GPT (chatgpt.com → Explore GPTs → Create) or an Assistant (platform.openai.com).",
      "Paste the System Prompt (below / system-prompt.txt) into Instructions.",
      a.documents.length ? `Upload these documents to Knowledge: ${a.documents.join("; ")}.` : "No knowledge documents required.",
      a.mcp.length ? `Connect these tools/actions with the stated scope: ${a.mcp.join("; ")}. OpenAI calls these Actions — configure each as read-only unless noted.` : "No external tools required.",
      a.dataSources.length ? `Wire these data sources (read-only): ${a.dataSources.join("; ")}.` : "No data sources required.",
      `Set the trigger: ${a.trigger}.`,
      "Guardrails: OpenAI cannot natively block the approval-required actions — instruct the owner to review any output before it is sent or written. The prompt already enforces this.",
      "Verify: run a test request and confirm the agent escalates blocked actions instead of performing them.",
    ],
  },
  {
    id: "claude",
    name: "Claude (Project + connectors)",
    steps: (a) => [
      "Create a new Project in Claude (claude.ai → Projects → New).",
      "Paste the System Prompt into the Project's custom instructions.",
      a.documents.length ? `Add these documents to Project knowledge: ${a.documents.join("; ")}.` : "No knowledge documents required.",
      a.mcp.length ? `Connect these MCP servers with the stated scope: ${a.mcp.join("; ")}.` : "No MCP servers required.",
      a.dataSources.length ? `Connect these data sources (read-only): ${a.dataSources.join("; ")}.` : "No data sources required.",
      `Set the trigger: ${a.trigger}.`,
      "Guardrails: enforce approval-required actions via the owner's review; Claude will escalate per the prompt.",
      "Verify with a test prompt that falls outside scope — the agent should reply that it falls outside its pedigree.",
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
  const documents = io.inputs.filter((i) => i.type === "document" || i.type === "human_upload").map((i) => `${i.name} (${i.source})`);
  const dataSources = io.inputs.filter((i) => i.type === "data_source").map((i) => `${i.source} — read-only`);
  const mcp: string[] = (manifest.recommended_mcp_servers ?? []).map((m: any) => `${m.name} — ${String(m.scope).replace("_", "-")}`);
  const info: DeploymentInfo = { documents, mcp, dataSources, trigger: io.trigger };

  const lines: string[] = [];
  lines.push(`# Deployment Package — ${manifest.agent_name}`);
  lines.push("");
  lines.push(`Provisioned by Pedigree · manifest \`${manifest.agent_id}\` · class: ${manifest.lifecycle?.class ?? "standing"}`);
  lines.push(`Human owner: ${owner.name} (${owner.title}${owner.department ? ", " + owner.department : ""})`);
  lines.push(`Parent responsibility: ${manifest.parent_responsibility?.name ?? ""}`);
  lines.push("");
  lines.push("This package contains everything needed to stand up this governed agent on the platform of your choice: the system prompt, the manifest, the documents to load, the tools/data to connect, and platform-specific steps.");
  lines.push("");
  lines.push("## 1. Artifacts");
  lines.push("- `system-prompt.txt` — paste into the agent's instructions");
  lines.push("- `manifest.json` — the portable Pedigree manifest (authority, I/O contract, lifecycle)");
  lines.push("");
  lines.push("## 2. Required documents to load");
  lines.push(documents.length ? documents.map((d) => `- ${d}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 3. Required tools / MCP servers (with scopes)");
  lines.push(mcp.length ? mcp.map((m) => `- ${m}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 4. Data sources");
  lines.push(dataSources.length ? dataSources.map((d) => `- ${d}`).join("\n") : "- None");
  lines.push("");
  lines.push("## 5. Approval & guardrails");
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
  lines.push(`## 6. Trigger`);
  lines.push(`- ${io.trigger}`);
  lines.push("");
  lines.push("## 7. Platform-specific setup");
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
