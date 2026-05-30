# MiniPedigree: Company Profile + Hermes Bridge Build Plan

## Branch

`feature/company-profile-hermes-bridge`

## Product thesis

MiniPedigree should evolve from a CSV-to-agent-prompt MVP into a governed agent packaging system.

The upgraded flow is:

```text
Company Profile → People CSV → Org Chart → Responsibility Mapping → Task Decomposition → Agent Type Selection → Runtime-Specific Manifest → Deployment Package
```

The core idea is that Pedigree owns the governance layer and Hermes owns execution.

Pedigree should answer:

- Who owns this responsibility?
- What task is being delegated?
- What is the agent allowed to do?
- What requires approval?
- What is blocked?
- What tools/data can it access?
- What runtime package should be exported?

Hermes should answer:

- When does the agent run?
- What tools are loaded?
- What skills are mounted?
- Where does the output go?
- How are errors and approvals routed?

---

## 1. New company profile loading step

### Goal

Before uploading people or mapping responsibilities, users should be able to create or enrich a company profile.

This profile becomes the business context injected into:

- Responsibility parsing
- Task decomposition
- Agent authoring
- Hermes manifest generation
- Export/deployment packages

### New user inputs

The company profile screen should support:

- Company name
- Company URL
- Free-text business description
- Current state of the business
- Goals / strategic priorities
- Known bottlenecks
- Departments / major business functions
- Current systems/tools
- Key terminology
- Risk/compliance notes
- Optional research toggle: research from company URL

### Suggested `CompanyProfile` type

```ts
export interface CompanyProfile {
  id: string;
  company: string;
  url?: string;
  description_raw?: string;
  current_state_raw?: string;
  goals_raw?: string;
  known_bottlenecks?: string;
  known_systems?: string[];
  terminology?: string[];
  compliance_notes?: string;

  researched?: boolean;
  research_sources?: CompanyResearchSource[];

  parsed: {
    what_we_do: string;
    industry?: string;
    business_model?: string;
    customers?: string[];
    products_services?: string[];
    departments?: string[];
    strategic_priorities?: string[];
    operating_constraints?: string[];
    likely_systems?: string[];
    governance_risks?: string[];
    company_language?: string[];
  };

  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyResearchSource {
  url: string;
  title?: string;
  snippet?: string;
  source_type: "company_site" | "user_text" | "manual" | "other";
}
```

### Implementation notes

Add a new server endpoint:

```text
POST /api/company/profile/parse
```

Payload:

```ts
{
  company?: string;
  url?: string;
  description?: string;
  current_state?: string;
  goals?: string;
  known_bottlenecks?: string;
  known_systems?: string[];
  research_url?: boolean;
}
```

Returns structured `CompanyProfile`.

Security note: server-side URL fetching must protect against SSRF. Only allow `https://` and public domains. Block localhost, private IP ranges, file URLs, metadata endpoints, and redirects to private networks.

---

## 2. Company profile prompt

Create `server/core/companyProfile.ts`.

System prompt draft:

```text
You are Pedigree's Company Context Analyst.

Your job is to turn a company URL, user-provided business description, current-state notes, goals, bottlenecks, and tool/system notes into a structured company profile used to ground responsibility mapping and agent construction.

You are not writing marketing copy. You are building operational context for governed AI delegation.

Extract and normalize:
1. What the company does
2. Industry and business model
3. Customers/users served
4. Products/services
5. Current state of the business
6. Strategic priorities
7. Operating bottlenecks
8. Departments/functions likely involved
9. Existing systems/tools
10. Company-specific terminology
11. Compliance/security/governance risks
12. Important unknowns that need human confirmation

Rules:
- Prefer user-provided information over inferred research.
- Use the company's own terminology when available.
- Do not invent facts.
- If a detail is inferred, mark it as inferred and lower confidence.
- Separate facts from assumptions.
- Keep outputs operational, not promotional.
- Return only structured JSON matching the schema.
```

---

## 3. Updated product flow

### Current-ish flow

```text
Login → Workspace Home → Upload CSV → Org Map → Company Profile → Responsibility Session → Agent Manifest
```

### Target flow

```text
Login
  → Workspace Home
  → Create Company Workspace
    → Company Profile Loader
      → URL + business notes + goals + current state
      → Parse / Research / Save Company Profile
    → People Upload
      → CSV validation
      → Org chart generation
    → Responsibility Mapping
      → Leadership / Department / Individual sessions
      → Transcript parsing
      → Responsibility + JTBD + task decomposition
    → Agent Candidate Selection
      → User chooses target runtime / agent type
    → Runtime Compiler
      → Pedigree Standard Manifest
      → Hermes Executable Manifest
      → YAML front matter / deployment package
```

---

## 4. Agent type / runtime selection

When the user clicks Create Agent, add a runtime selection step:

### Runtime target

- Pedigree Standard Prompt
- Hermes Agent
- OpenAI Custom GPT / Assistant
- Claude Project / MCP Agent
- Generic LangGraph / CrewAI

### Agent operating type

- On-demand assistant
- Scheduled briefing agent
- Event-driven monitor
- Drafter/reviewer
- Research agent
- Data reconciliation agent
- Approval-gated workflow agent

### This determines defaults for

- Schedule type
- Tool scopes
- Delivery targets
- Skills
- Data source requirements
- Manifest export format
- System prompt sections

---

## 5. Hermes executable manifest schema

Add a new file:

```text
src/lib/hermesManifest.ts
```

This should export:

- `HermesAgentManifest`
- `DeliveryTarget`
- `buildHermesManifest()`
- `buildHermesYamlFrontMatter()`
- `buildHermesMarkdownPackage()`

### Type draft

```ts
export interface HermesAgentManifest {
  manifest_version: "1.0";

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
}

export interface DeliveryTarget {
  platform: "telegram" | "discord" | "email" | "slack" | "webhook";
  recipient: string;
  channel?: string;
  format?: "brief" | "full" | "rich";
}
```

---

## 6. YAML front matter export

Hermes package should be exportable as a Markdown file with YAML front matter:

```md
---
manifest_version: "1.0"
runtime: hermes
agent_id: revenue-brief-agent
agent_name: Revenue Brief Agent
owner:
  name: Nadia Bennett
  email: nadia@example.com
  role: Chief Revenue Officer
department: Revenue
responsibility_id: R-003
responsibility_title: Revenue Forecast Hygiene
task_id: T-014
task_label: Deliver daily revenue brief
schedule:
  type: cron
  cron: "0 8 * * *"
  timezone: America/New_York
tools:
  enabled:
    - x_search
    - file
  blocked:
    - gmail
    - browser
    - delegate_task
skills:
  - revenue-forecast-analysis
policy: auto-write-with-approval
risk_level: medium
delivery:
  format: brief
  on_complete:
    - platform: telegram
      recipient: "OWNER_TELEGRAM_CHAT_ID"
      format: brief
---

# System Prompt

[ROLE]
...
```

---

## 7. Upgrade agent authoring into agent construction

Current `agentAuthor.ts` writes prompt sections. Upgrade it to output an `AgentConstructionSpec`.

Suggested schema:

```ts
export interface AgentConstructionSpec {
  role: string;
  authority_ceiling: string;
  purpose: string;
  goal: string;
  operating_mode: "on_demand" | "scheduled" | "event_driven";
  recommended_schedule?: {
    type: "cron" | "one-shot" | "on-demand" | "event-driven";
    cron?: string;
    timezone?: string;
    reason: string;
  };
  workflow_steps: string[];
  input_requirements: string[];
  output_artifacts: string[];
  allowed_tasks: string[];
  approval_required: string[];
  blocked_tasks: string[];
  escalation_rules: string[];
  tool_permissions: {
    enabled: string[];
    blocked: string[];
    mcp_servers?: { name: string; scope: "read_only" | "draft_only" | "full"; reason: string }[];
  };
  delivery_recommendations: DeliveryTarget[];
  memory_policy: string;
  audit_events: string[];
  failure_modes: string[];
  test_prompts: string[];
  output_style: string;
}
```

---

## 8. Updated agent construction prompt

```text
You are Pedigree's Governed Agent Construction Architect.

You do not merely write a prompt. You design a bounded, executable agent package from a human-owned responsibility and one delegated task.

Pedigree owns governance. Hermes owns execution. Your job is to produce the bridge between them.

Use the company profile, human owner, responsibility, task, policy tier, risk tier, seed task classification, known tools, and recommended MCP servers to design an agent that can be safely executed by a runtime such as Hermes.

You must define:
1. Agent identity and purpose
2. Goal the agent optimizes for
3. Operating mode: on-demand, scheduled, event-driven, or one-shot
4. Recommended schedule if applicable
5. Concrete workflow steps
6. Required inputs and data sources
7. Output artifacts
8. Tool permissions and blocked tools
9. Skills to load if the runtime supports skills
10. Human approval gates
11. Blocked actions
12. Escalation rules
13. Delivery recommendations
14. Memory policy
15. Audit events
16. Failure modes
17. Test prompts
18. Portable system-prompt sections

Rules:
- Never allow the agent to exceed the human owner's authority.
- Never weaken seed approval-required or blocked tasks.
- External communication, writes to systems of record, customer commitments, pricing, legal, financial, HR, security, access control, and production changes require approval or are blocked.
- Prefer read-only and draft-only tools by default.
- Only recommend full tool access when explicitly justified by task scope and policy.
- If a task is too vague to execute, require clarification instead of inventing workflow.
- Keep the output executable, specific, and runtime-portable.
- Return only structured JSON matching the schema.
```

---

## 9. UI changes

### Workspace creation

Add a setup wizard:

1. Company Profile
2. People Upload
3. Org Chart Review
4. Responsibility Mapping
5. Agent Runtime Selection

### Company Profile screen

Fields:

- Company name
- Company URL
- What does the company do?
- Current state
- Goals
- Bottlenecks
- Current systems/tools
- Compliance/security concerns
- Parse / Research button
- Review parsed profile
- Save profile

### Create Agent modal

Add:

- Runtime target: Hermes / Pedigree Standard / OpenAI / Claude / Generic
- Agent operating type
- Schedule fields if Hermes + scheduled
- Delivery target fields
- Model override fields
- Skills field
- Data source field

---

## 10. Files likely to change

### Existing files

- `src/types.ts`
- `src/lib/agent.ts`
- `src/lib/api.ts`
- `src/lib/schemas.ts`
- `src/lib/state.ts`
- `src/lib/persist.ts`
- `src/components/CompanyProfile.tsx`
- `src/components/Drawer.tsx`
- `src/components/ManifestScreen.tsx`
- `server/core/agentAuthor.ts`
- `server/core/parse.ts`
- `server/index.ts`

### New files

- `server/core/companyProfile.ts`
- `server/routes/companyProfileParse.ts`
- `src/lib/hermesManifest.ts`
- `src/components/AgentRuntimeSelector.tsx`
- `src/components/CompanyProfileWizard.tsx`
- `tests/hermesManifest.test.ts`
- `tests/companyProfile.test.ts`

---

## 11. Build phases

### Phase 1: Schema foundation

- Add `CompanyProfile`
- Add `HermesAgentManifest`
- Add `DeliveryTarget`
- Add `AgentRuntimeTarget`
- Add `AgentConstructionSpec`

### Phase 2: Company profile parser

- Add server endpoint
- Add structured prompt
- Add client API wrapper
- Save parsed profile per workspace

### Phase 3: Hermes manifest bridge

- Add builder from existing `AgentArtifacts` + `AgentRecord`
- Add YAML front matter export
- Add Hermes Markdown package export
- Add tests

### Phase 4: Agent author upgrade

- Expand schema from authored prompt sections to construction spec
- Preserve compatibility with existing `AuthoredAgent`
- Use construction spec to populate Hermes manifest defaults

### Phase 5: UI integration

- Add runtime selector to Create Agent flow
- Add Hermes settings form
- Add export button: `Export Hermes Agent`

### Phase 6: Validation / red team

- Validate that blocked tasks are never included in allowed tasks
- Validate Hermes full access is never default
- Validate delivery targets exist for scheduled agents
- Validate cron/timezone exists for scheduled agents
- Validate approval targets exist for approval-required agents

---

## 12. Definition of done

A user can:

1. Create a company workspace.
2. Add company URL, goals, current state, and notes.
3. Parse and save a company profile.
4. Upload people CSV and generate org chart.
5. Map responsibilities from discovery input.
6. Pick a delegatable task.
7. Choose Hermes as the runtime target.
8. Configure schedule, tools, skills, delivery, data sources, and model override.
9. Generate:
   - Pedigree Standard Manifest
   - Hermes Executable Manifest
   - YAML front matter Markdown package
   - System prompt
10. Upload the Hermes package to Hermes with no further questions.

---

## Strategic framing

The product should not be framed as a prompt generator.

It should be framed as:

> Pedigree compiles governed agents from human accountability. Hermes executes them.

This preserves Pedigree's category position as the governance/control-plane layer while allowing runtime-specific exports for Hermes, OpenAI, Claude, or any future agent runtime.
