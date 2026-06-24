# Pedigree Enterprise AI Workforce Governance PRD

**Status:** Draft for AI-agent implementation handoff  
**Date:** 2026-06-23  
**Primary customer context:** WESCO enterprise AI governance / AI Council / SOX-aware workforce agent oversight  
**Repo:** `C:\Users\mrobe\Documents\Projects\minipedigree\MiniPedigree-latest`  
**Audience:** AI coding agents, product engineers, design agents, QA agents, and technical reviewers

---

## 1. Executive Summary

Pedigree must evolve from a strong agent-design and discovery tool into an enterprise AI workforce governance system. The product should answer, for every human-owned or imported agent:

> Who owns this agent, what can it do, what systems does it touch, what controls does it affect, who approved it, how has it changed, and can we prove all of that?

The current repo already has important foundations:

- Roster/org import and workspace persistence.
- Company context and governance-rule extraction from policies, approval rules, and SOD documents.
- Transcript-driven discovery sessions.
- Responsibility and task extraction with evidence review.
- Authority profiles, authority ceiling logic, SoD checks, lifecycle/offboarding logic, registry staleness, and audit events.
- Agent manifest generation, validation gates, runtime-neutral export packages, and registry versioning.

This PRD defines the missing enterprise product layer WESCO needs:

- Human Manifest
- Control Manifest
- Agent Manifest
- Agent Birth Certificate
- AI Council Intake
- Agent Inventory
- System View
- Agent Lifecycle Timeline
- Orphaned Agent Detection
- Agent Transfer Workflow
- Agent Customs and Immigration
- Drift Detection and Review
- Risk Dashboard
- Evidence Library and Export
- Approval Gates
- Service/Bot Account Governance
- Role-Based UX

The implementation principle is:

> Keep the app simple first and deep on click. Business users should see work, owners, systems, risks, and next steps. Auditors and governance reviewers should be able to drill into controls, evidence, lineage, and policy decisions.

---

## 2. Current State vs. Target State

### 2.1 Current State

The repo currently supports the first half of the governance chain:

```
Company Context
  -> Org / People Import
  -> Discovery Sessions
  -> Responsibility + Task Extraction
  -> Review
  -> Agent Planning
  -> Agent Manifest
  -> Runtime Export
  -> Registry / Audit Trail / Drift Signals
```

Core files:

- Domain model: `src/types.ts`
- App state/navigation: `src/App.tsx`
- Company context: `src/components/CompanyProfileScreen.tsx`
- Session discovery: `src/components/SessionWorkspace.tsx`
- Review: `src/components/ReviewInbox.tsx`
- Human profile: `src/components/ProfileScreen.tsx`
- Agent plan: `src/components/AgentPlan.tsx`
- Manifest/export: `src/components/ManifestScreen.tsx`
- Authority logic: `src/lib/authority.ts`
- Governance rules: `src/lib/governance.ts`
- Registry/staleness: `src/lib/registry.ts`
- Validation: `src/lib/validate.ts`
- Audit trail: `src/components/AuditTrail.tsx`

### 2.2 Target State

The target governance chain is:

```
Human
  -> Role
  -> Responsibility
  -> Control
  -> Task
  -> Agent Request
  -> Agent Manifest
  -> Approval Gates
  -> Agent Birth Certificate
  -> Deployment / Runtime Export
  -> Inventory
  -> Monitoring
  -> Drift / Orphan / Transfer Review
  -> Audit Evidence
```

Pedigree becomes the system of record for the design, approval, ownership, lineage, and evidence of enterprise AI workers.

---

## 3. Product Principles

1. **No agent without accountable human ownership.**  
   Every agent must trace to a human owner or to a service-account exception with a business owner and technical owner.

2. **No agent without lineage.**  
   Every generated or imported agent must trace to a role, responsibility, task, control/system context where applicable, approval state, and evidence.

3. **No authority expansion without review.**  
   An agent may not exceed its human owner's authority ceiling unless a documented exception is approved and stored as evidence.

4. **Governance is progressive.**  
   Business users should not start with SOX vocabulary. They should start with work ownership, systems touched, risk, and approvals. SOX/control fields appear when relevant.

5. **Evidence is created by normal use.**  
   Users should not manually assemble audit evidence. Evidence should accumulate when users request, review, approve, transfer, suspend, export, or change agents.

6. **Runtime-neutral first.**  
   Export packages are sufficient for MVP. API deployment to OpenAI, Claude, Copilot, Hermes, Slack, or internal runtimes can follow later.

7. **Honest enforcement.**  
   If a runtime cannot enforce a policy directly, say so. Distinguish runtime-enforceable, prompt-advisory, and not-yet-enforceable controls.

---

## 4. Personas and Role-Based UX

### 4.1 Business User

Needs:

- Request help with a task.
- Confirm responsibilities and tasks.
- Understand what an agent will do.
- Know what they own.

Primary views:

- My Pedigree
- Human Manifest summary
- AI Council request form
- Agent Birth Certificate summary

Complexity hidden:

- Raw system prompts
- Policy JSON
- SoD rule internals
- Runtime adapters

### 4.2 AI Council Reviewer

Needs:

- Review agent requests.
- Understand business value, risk, owner, systems, and approvals.
- Approve/reject/request more information.

Primary views:

- AI Council Intake Queue
- Agent Manifest overview
- Approval checklist
- Risk findings
- Evidence packet

### 4.3 Internal Controls / SOX Owner

Needs:

- See controls, SOX relevance, systems touched, related agents.
- Inspect control-to-agent lineage.
- Review SoD findings.

Primary views:

- Control Manifest
- SOX agent filter
- System View
- Evidence Library

### 4.4 Auditor

Needs:

- Inspect evidence without changing data.
- Export packages by agent, control, system, and date range.
- Understand approvals, lineage, and changes.

Primary views:

- Evidence Library
- Agent Birth Certificate
- Agent lifecycle timeline
- Control/system audit packages

### 4.5 IT / Security Admin

Needs:

- Review systems, tools, permissions, runtime targets, MCP/API access.
- Handle service accounts and bot accounts.
- Monitor drift and orphaned agents.

Primary views:

- System Inventory
- Agent Inventory
- Permissions comparison
- Service Account exceptions
- Drift review

### 4.6 HR User

Needs:

- See joiner/mover/leaver impact.
- Detect agents owned by terminated or transferred users.
- Reassign/suspend/archive agents.

Primary views:

- Orphaned Agents
- Transfer Workflow
- Human lifecycle changes

---

## 5. Core Objects

This section defines target domain objects. Existing types should be extended rather than duplicated where practical.

### 5.1 Human Manifest

Purpose:

The Human Manifest is the structured profile of a person as an accountable owner of work and potential agent authority.

Existing base:

- `Person`
- `AuthorityProfile`
- `PedigreeRow`
- `ResponsibilityRow`
- `TaskItem`

Required fields:

```ts
interface HumanManifest {
  personId: string;
  name: string;
  email: string;
  title: string;
  department: string;
  managerId: string | null;
  employmentStatus: "active" | "transitioning" | "offboarded";
  responsibilities: ResponsibilityRow[];
  tasks: TaskItem[];
  systems: HumanSystemAccess[];
  authorityProfile: AuthorityProfile;
  approvalAuthority: ApprovalAuthority[];
  controlOwnership: ControlOwnershipRef[];
  agentOwnership: AgentOwnershipRef[];
  evidenceRefs: EvidenceRef[];
  lastReviewedAt?: string;
}
```

UX:

- Default tabs: Overview, Responsibilities, Systems, Agents.
- Advanced tabs: Controls, SOX, Approvals, Evidence, Risk History.
- Use plain copy: "This person owns these areas of work. Agents can only inherit authority this person has or an approved exception."

Acceptance criteria:

- A user can open any person and see their responsibilities, tasks, systems, agents, lifecycle status, and authority ceiling.
- Offboarded users clearly show owned agents requiring action.
- Advanced governance details are hidden until clicked.

### 5.2 Responsibility

Purpose:

A responsibility is an ownership area, not a task.

Existing base:

- `ResponsibilityRow`

Add / confirm fields:

```ts
interface ResponsibilityRow {
  id: string;
  title: string;
  description?: string;
  ownerPersonId?: string;
  ownershipRole?: "accountable_owner" | "contributor" | "approver" | "informed";
  relatedControlIds?: string[];
  relatedSystemIds?: string[];
  relatedAgentIds?: string[];
  provenance?: ItemProvenance;
  last_confirmed_at?: string;
}
```

Acceptance criteria:

- Responsibilities can be reviewed and confirmed.
- Duplicate ownership conflicts can be resolved.
- Only accountable-owner responsibilities may parent agent-ready tasks unless an exception is approved.

### 5.3 Task

Purpose:

A task is repeatable work inside a responsibility.

Existing base:

- `TaskItem`
- `TaskSpec`
- `TaskOperationalState`

Required behavior:

- Tasks must be classified as delegation candidate, approval-required, not delegatable, or unclear.
- Tasks must have a workflow status before agent generation.
- Tasks must link to related controls/systems when relevant.

Add / confirm fields:

```ts
interface TaskControlLink {
  controlId: string;
  relevance: "direct" | "supporting" | "evidence_only";
}

interface TaskSystemLink {
  systemId: string;
  accessNeeded: "none" | "read" | "draft" | "write_with_approval" | "write" | "admin";
}

interface TaskItem {
  relatedControls?: TaskControlLink[];
  relatedSystems?: TaskSystemLink[];
  soxRelevant?: boolean;
}
```

Acceptance criteria:

- A user can distinguish responsibility vs task vs agent candidate.
- A task cannot generate an agent until it is `agent_ready`.
- If SOX relevant, control fields appear progressively.

### 5.4 Control Manifest

Purpose:

The Control Manifest is a first-class record for SOX/SOC/internal controls and their relationship to people, tasks, systems, agents, approvals, and evidence.

New type:

```ts
interface ControlManifest {
  id: string;
  controlId: string;
  name: string;
  description?: string;
  ownerPersonId: string;
  process: string;
  relatedRisk: string;
  frequency: "ad_hoc" | "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  systemIds: string[];
  evidenceRequired: string[];
  soxRelevant: boolean;
  socRelevant?: boolean;
  relatedTaskIds: string[];
  relatedAgentIds: string[];
  approvalRequirements: ApprovalRequirement[];
  status: "draft" | "active" | "retired";
  source: "manual" | "policy_document" | "sod_document" | "import";
  provenance?: ItemProvenance;
  createdAt: string;
  updatedAt: string;
}
```

UX:

- A "Controls" tab should list controls by ID, process, owner, SOX relevance, systems, related agents, and evidence readiness.
- Control detail answers: "Which agents touch this control?"
- Use toggle: "Is this SOX relevant?" If yes, reveal SOX/control fields.

Acceptance criteria:

- Users can create/edit/import controls.
- Users can link controls to humans, tasks, agents, and systems.
- Users can filter all SOX-related agents.
- Auditors can inspect Control -> Human Owner -> Task -> Agent -> System Access -> Evidence.

### 5.5 System Manifest

Purpose:

The System Manifest represents an enterprise application such as Oracle, Workday, NetSuite, Salesforce, HubSpot, or Okta.

New type:

```ts
interface SystemManifest {
  id: string;
  name: string;
  category: "erp" | "hris" | "crm" | "finance" | "identity" | "collaboration" | "data" | "custom" | "other";
  ownerPersonId?: string;
  soxInScope: boolean;
  dataSensitivity: "public" | "internal" | "confidential" | "regulated";
  integrationStatus: "manual" | "planned" | "connected" | "disabled";
  connectedHumanIds: string[];
  connectedAgentIds: string[];
  connectedControlIds: string[];
  riskFindings: RiskFinding[];
  approvalRequirements: ApprovalRequirement[];
  createdAt: string;
  updatedAt: string;
}
```

UX:

- System Inventory page.
- System detail answers: "What AI is touching this system?"
- For Oracle specifically, a user should click Oracle and see humans, agents, controls, access levels, risk findings, and approval requirements.

Acceptance criteria:

- Users can filter agents by system.
- Users can see all SOX agents touching Oracle or another in-scope system.
- Users can distinguish read/write/admin/draft access.

### 5.6 Agent Manifest

Purpose:

The Agent Manifest is the pre-approval design record for a proposed agent.

Existing base:

- `AgentRecord.manifest`
- `AgentConstructionSpec`
- `CompiledAgent`

Target fields:

```ts
interface AgentManifest {
  id: string;
  agentName: string;
  purpose: string;
  humanOwnerId: string;
  department: string;
  parentResponsibilityId: string;
  parentTaskId: string;
  relatedControlIds: string[];
  systemAccess: AgentSystemAccess[];
  tools: ToolAccess[];
  allowedActions: string[];
  approvalRequiredActions: string[];
  blockedActions: string[];
  approvalGates: ApprovalGate[];
  authorityCeiling: AuthorityCeiling;
  riskTier: RiskLevel;
  soxRelevant: boolean;
  systemPrompt: string;
  runtimeTargets: RuntimeTarget[];
  evidenceRequirements: string[];
  testPrompts: TestPrompt[];
  validationWarnings: string[];
  status: "draft" | "submitted" | "under_review" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}
```

UX:

- Default Manifest tab should be a non-technical summary:
  - What this agent does
  - Who owns it
  - What systems it touches
  - What approvals it needs
  - Risk level
  - SOX relevance
- Advanced tabs:
  - Permissions
  - Controls
  - System prompt
  - Evidence
  - Runtime export

Acceptance criteria:

- Manifest is generated from reviewed human/task/company/control context.
- Export is blocked if validation fails.
- Manifest cannot exceed owner authority without exception.
- Manifest can be exported manually to supported runtime packages.

### 5.7 Agent Birth Certificate

Purpose:

The Agent Birth Certificate is the approved, immutable day-one record of an agent.

New type:

```ts
interface AgentBirthCertificate {
  id: string;
  agentId: string;
  agentName: string;
  birthDate: string;
  createdBy: string;
  approvedBy: ApprovalRecord[];
  humanOwnerId: string;
  parentRole: string;
  parentResponsibilityId: string;
  parentTaskId: string;
  authorityCeiling: AuthorityCeiling;
  systemsAllowed: AgentSystemAccess[];
  systemsDenied: string[];
  relatedControlIds: string[];
  soxRelevant: boolean;
  approvalEvidenceIds: string[];
  initialPromptVersion: string;
  runtimeDestination?: string;
  runtimeResourceId?: string;
  initialRiskScore: number;
  manifestVersion: number;
  evidencePacketId: string;
  createdAt: string;
}
```

Creation rule:

- Created when an agent manifest is approved, deployed, or exported as approved.
- Must be immutable except for metadata corrections through audited amendment.

UX:

- Show as "Birth Certificate" tab or document after approval.
- Linked from Agent Inventory.
- Exportable as JSON, HTML, and later PDF.

Microcopy:

> Every agent needs a birth certificate. This proves who created it, who owns it, what it was approved to do, and what limits it had on day one.

Acceptance criteria:

- Approved agents have a birth certificate.
- Birth certificate includes owner, authority ceiling, approvals, systems, controls, risk, prompt version, and evidence.
- Birth certificate is available from inventory and evidence library.

### 5.8 AI Council Intake Request

Purpose:

Model WESCO's manual AI Council request process and turn approved requests into governed agent manifests.

New type:

```ts
interface AiCouncilRequest {
  id: string;
  requesterId: string;
  department: string;
  businessProblem: string;
  proposedTask: string;
  expectedBenefit?: string;
  systemsTouched: string[];
  dataSensitivity: DataTier;
  soxRelevant: boolean;
  humanOwnerId?: string;
  riskTier?: RiskLevel;
  approvalRequirements: ApprovalRequirement[];
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "needs_more_info"
    | "approved"
    | "rejected"
    | "built"
    | "deployed"
    | "monitored"
    | "archived";
  priority: "low" | "medium" | "high" | "urgent";
  reviewerIds: string[];
  decision?: ApprovalDecision;
  linkedManifestId?: string;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

UX:

- Intake form should feel like requesting help, not filing a compliance report.
- Queue for AI Council reviewers.
- Approved request can create/unlock Agent Manifest.

Microcopy:

> Describe the work you want help with. Pedigree will help determine whether it is safe and appropriate for an agent.

Acceptance criteria:

- Business users can submit a request.
- Reviewers can approve/reject/request info.
- Approval creates evidence.
- Approved request can be converted into a task/manifest.

### 5.9 Agent Inventory

Purpose:

Enterprise-wide inventory of all agents, whether generated by Pedigree or imported.

Target columns:

- Agent name
- Owner
- Department
- Status
- Risk level
- SOX relevance
- Systems touched
- Runtime
- Last activity
- Approval status
- Drift status
- Orphan status

Required filters:

- Owner
- Department
- System
- SOX relevance
- Risk level
- Runtime
- Status
- Orphaned agents
- Agents exceeding scope

UX:

- Default columns simple.
- Advanced compliance columns through filter/column customization.

Acceptance criteria:

- WESCO can ask "Show me all agents touching Oracle."
- WESCO can ask "Show me all SOX agents."
- WESCO can ask "Show me all high-risk agents."
- WESCO can ask "Show me all agents owned by terminated users."

### 5.10 Risk Finding

Purpose:

Plain-English record of risk conditions.

New type:

```ts
interface RiskFinding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category:
    | "sod_conflict"
    | "authority_exceeded"
    | "orphaned_agent"
    | "drift"
    | "missing_approval"
    | "sox_system_access"
    | "service_account_exception"
    | "missing_evidence"
    | "unknown_owner";
  title: string;
  plainEnglishDescription: string;
  whyItMatters: string;
  recommendedAction: string;
  relatedAgentIds: string[];
  relatedPersonIds: string[];
  relatedSystemIds: string[];
  relatedControlIds: string[];
  status: "open" | "accepted" | "resolved" | "dismissed";
  evidenceIds: string[];
  createdAt: string;
  resolvedAt?: string;
}
```

Acceptance criteria:

- Risk findings are plain English.
- Each risk has recommended action.
- Risk cards can drill into underlying agents.

### 5.11 Evidence Record

Purpose:

Unified audit evidence object for requests, approvals, controls, exports, transfers, drift, and lifecycle events.

New type:

```ts
interface EvidenceRecord {
  id: string;
  type:
    | "agent_request"
    | "approval"
    | "birth_certificate"
    | "permission_scope"
    | "control_mapping"
    | "sox_classification"
    | "risk_acceptance"
    | "transfer"
    | "suspension"
    | "archive"
    | "drift_review"
    | "orphan_remediation"
    | "runtime_export"
    | "policy_quote"
    | "transcript_quote";
  subjectType: "agent" | "control" | "system" | "person" | "request" | "workspace";
  subjectId: string;
  actor: string;
  timestamp: string;
  summary: string;
  source?: {
    kind: "transcript" | "policy_document" | "manual_action" | "system_event" | "export";
    sourceId?: string;
    quote?: string;
  };
  details?: Record<string, unknown>;
}
```

Acceptance criteria:

- Evidence records are generated automatically from normal actions.
- Evidence can be exported as JSON and CSV initially.
- Evidence packets can be generated per agent, control, and system.

---

## 6. Primary User Journeys

### 6.1 Enterprise Setup Journey

Steps:

1. Create workspace.
2. Add company context.
3. Upload policies, SOPs, SOD matrices, and control docs.
4. Import org roster.
5. Review people/org quality.
6. Load or create system inventory.
7. Load or create control inventory.
8. Start discovery.

Acceptance criteria:

- User always knows next step.
- Company context explains why each input matters.
- Governance context shows what rules/controls were extracted.
- Demo data and real company data are clearly separated.

### 6.2 Discovery to Agent Journey

Steps:

1. Open discovery plan.
2. Run session with agenda.
3. Upload/paste transcript.
4. Review extracted responsibilities and tasks.
5. Confirm responsibility owners.
6. Review delegation candidates.
7. Match/design workflow.
8. Link task to systems/controls.
9. Generate Agent Manifest.
10. Submit for approval.
11. Approve and create Birth Certificate.
12. Export/deploy.

Acceptance criteria:

- No agent can be generated from unreviewed extraction.
- No agent can skip workflow readiness.
- Controls/SOX fields appear only when relevant.
- Manifest makes owner, systems, approvals, and risk obvious.

### 6.3 AI Council Intake Journey

Steps:

1. Business user submits AI request.
2. Pedigree classifies likely systems, data sensitivity, risk, SOX relevance.
3. AI Council reviews.
4. Reviewer requests more info or approves.
5. Approved request creates a task/workflow/manifest.
6. Manifest follows approval gates.
7. Birth Certificate is created after approval/export.

Acceptance criteria:

- Non-technical user can complete intake.
- Reviewers can prioritize and decide.
- Approval evidence is stored.
- Approved request is linked to downstream manifest.

### 6.4 Agent Inventory and Audit Journey

Steps:

1. Open Agent Inventory.
2. Filter by system = Oracle.
3. Filter SOX relevant = true.
4. Open an agent.
5. Inspect Birth Certificate.
6. Inspect lifecycle timeline.
7. Export evidence packet.

Acceptance criteria:

- User can answer "what AI touches Oracle?"
- User can answer "who owns each Oracle-touching agent?"
- User can export proof of approvals, controls, scope, and evidence.

### 6.5 Orphan Detection Journey

Steps:

1. HRIS/roster marks human offboarded or transitioning.
2. Pedigree detects owned agents.
3. Agents are flagged or suspended.
4. Risk finding created.
5. User reassigns, suspends, or archives.
6. Evidence is recorded.

Acceptance criteria:

- Offboarded owner cannot retain active deployed agents.
- User sees clear recommended action.
- Reassignment requires authority comparison.

Microcopy:

> This agent no longer has an active accountable owner. Assign a new owner or suspend it.

### 6.6 Agent Transfer Journey

Steps:

1. Select agent.
2. Select proposed new owner.
3. Compare old/new owner permissions.
4. Check systems, controls, risk, authority ceiling.
5. Flag mismatches.
6. Require approval if needed.
7. Create transfer evidence.
8. Update owner and recompile agent under new ceiling.

Acceptance criteria:

- Transfer does not feel like editing JSON.
- Tool/system mismatches are clear.
- Agent cannot exceed new owner authority without exception.

Microcopy:

> Move this agent to a new accountable owner.

### 6.7 Agent Customs and Immigration Journey

Purpose:

Onboard agents not created in Pedigree.

Sources:

- Employee GPTs
- Copilot agents
- Claude Projects
- Vendor bots
- Department-built agents
- Legacy automation/service accounts

Steps:

1. Import/register external agent.
2. Inspect manifest/configuration/prompt where available.
3. Identify tools and systems.
4. Map to human owner or service-account exception.
5. Compare against policies.
6. Flag missing owner/purpose/excessive scope/unknown tools.
7. Approve, restrict, sandbox, reject, or archive.
8. Create onboarding evidence and Birth Certificate if approved.

Acceptance criteria:

- External agents can enter inventory before they are approved.
- Missing owner/purpose/scope creates risk findings.
- Sandbox/restrict/reject options are available.

Microcopy:

> Before an outside agent enters your environment, Pedigree checks its owner, purpose, tools, systems, and permissions.

---

## 7. Feature Requirements

### 7.1 Feature: Enterprise Navigation

Add top-level navigation:

- Home / Workspaces
- Setup
- Discovery
- Review
- Responsibilities
- Agent Plan
- Agent Inventory
- Systems
- Controls
- AI Council
- Risk
- Evidence
- Settings

MVP constraint:

- Do not create empty mega-dashboards. If a feature is not implemented, show a focused empty state with next action.

Acceptance criteria:

- Each screen has one main job.
- Advanced governance screens are discoverable but do not overwhelm the builder workflow.

### 7.2 Feature: Control Manifest MVP

Build:

- `src/lib/controls.ts`
- `src/components/ControlsScreen.tsx`
- `src/components/ControlDetailDrawer.tsx`
- Extend workspace persistence with `controls?: ControlManifest[]`

Operations:

- Create/edit control.
- Mark SOX relevant.
- Link owner, systems, tasks, agents.
- Show evidence requirements.
- Filter by SOX, system, owner, process.

Acceptance criteria:

- A SOX control can be linked to a task and agent.
- Control detail shows lineage to agents.
- Agent Manifest displays related controls.

### 7.3 Feature: System Inventory MVP

Build:

- `src/lib/systems.ts`
- `src/components/SystemsScreen.tsx`
- `src/components/SystemDetailDrawer.tsx`
- Extend workspace persistence with `systems?: SystemManifest[]`

Operations:

- Create/edit system.
- Import from company context systems.
- Mark SOX in-scope.
- Link humans, agents, controls.
- Filter agents by system.

Acceptance criteria:

- Oracle can be represented as a system.
- Oracle detail shows connected agents and controls.
- Agent Inventory filter by system works.

### 7.4 Feature: Agent Inventory MVP

Build:

- `src/components/AgentInventoryScreen.tsx`
- `src/lib/agentInventory.ts`

Operations:

- Flatten all `PedigreeRow.agents` plus registry entries plus imported agents.
- Show filters and sortable columns.
- Surface stale/orphaned/high-risk/SOX/system flags.

Acceptance criteria:

- Inventory supports hundreds of agents without visual collapse.
- Filters can answer WESCO's key questions.
- Agent row opens Manifest/Birth Certificate/Lifecycle.

### 7.5 Feature: Agent Birth Certificate

Build:

- `src/lib/birthCertificate.ts`
- `src/components/AgentBirthCertificateView.tsx`
- Birth certificate creation in approval/export path.

Operations:

- Create birth certificate when manifest approved.
- Link to registry entry.
- Export JSON/HTML.
- Include in deployment package/evidence packet.

Acceptance criteria:

- Approved agents always have birth certificate.
- Agent Inventory shows certificate status.
- Certificate is immutable after creation.

### 7.6 Feature: AI Council Intake

Build:

- `src/components/AiCouncilScreen.tsx`
- `src/components/AiCouncilRequestForm.tsx`
- `src/components/AiCouncilQueue.tsx`
- `src/lib/aiCouncil.ts`
- Extend workspace persistence with `aiCouncilRequests?: AiCouncilRequest[]`

Operations:

- Submit request.
- Auto-suggest owner/system/risk/SOX fields when possible.
- Review queue statuses.
- Approve/reject/request info.
- Convert approved request to task/manifest.

Acceptance criteria:

- Request statuses match checklist.
- Approval writes evidence.
- Approved request can unlock Agent Manifest generation.

### 7.7 Feature: Approval Gates

Build:

- `src/lib/approvalGates.ts`
- Shared component `ApprovalChecklist`

Triggers:

- SOX relevance
- Financial system access
- HR/payroll system access
- Write access
- External data access
- High-risk prompt changes
- Agent exceeding owner scope
- Service account exception
- Control-impacting task

Acceptance criteria:

- Manifest shows required approvals as checklist.
- Approval routes can initially be local/manual.
- Reviewer separation is enforced where role data exists.
- Approvals appear in Birth Certificate.

### 7.8 Feature: Risk Dashboard MVP

Build:

- `src/components/RiskDashboard.tsx`
- `src/lib/riskFindings.ts`

Cards:

- Total agents
- Mapped agents
- Orphaned agents
- High-risk agents
- SOX agents
- Agents exceeding owner access
- Agents with unresolved drift
- Agents missing approval
- Agents touching high-risk systems
- Audit readiness score

Acceptance criteria:

- Every card is clickable.
- Every risk finding explains what is wrong, why it matters, and what to do next.
- Avoid vanity metrics without action.

### 7.9 Feature: Orphan Detection

Build on:

- `src/lib/authority.ts` existing `enforceLeaverInvariant`, `suspendAgentsForLeaver`, `proposeReassignments`.

Add:

- UI surface in Agent Inventory and Risk Dashboard.
- Orphaned Agent detail action drawer.

Acceptance criteria:

- Offboarded users create orphan/suspension findings.
- User can reassign, suspend, or archive.
- Evidence event is written.

### 7.10 Feature: Transfer Workflow

Build:

- `src/components/AgentTransferDrawer.tsx`
- `src/lib/agentTransfer.ts`

Operations:

- Select target owner.
- Compare grants/authority/systems.
- Show allowed/requires approval/blocked transfer outcome.
- Create transfer evidence.
- Update owner and mark agent stale/recompile required.

Acceptance criteria:

- Transfer cannot silently widen authority.
- New owner mismatch is shown plainly.
- Approval is required for authority expansion.

### 7.11 Feature: Customs and Immigration

Build:

- `src/components/AgentCustomsScreen.tsx`
- `src/components/ExternalAgentImportDrawer.tsx`
- `src/lib/externalAgents.ts`

Inputs:

- Manual form
- Paste manifest/prompt/config
- Upload JSON/Markdown/text

Classification:

- Missing owner
- Missing purpose
- Unknown tools
- Excessive scope
- SOX system access
- Service account pattern

Acceptance criteria:

- Imported agent lands in inventory as `imported_pending_review`.
- User can map owner/system/purpose.
- User can approve/restrict/sandbox/reject.

### 7.12 Feature: Drift Detection and Review

Build on:

- `src/lib/registry.ts`
- `src/components/DigestScreen.tsx`
- `src/lib/digest.ts`
- `src/lib/stackSync.ts`

Add:

- Drift detail view comparing approved birth certificate state vs current state.
- Drift categories:
  - Tool added
  - System connected
  - Permission increased
  - Prompt changed
  - Approval removed
  - SOX relevance changed
  - Owner changed
  - Runtime changed
  - MCP/API access changed

Acceptance criteria:

- User can see "created safe, now unsafe."
- Risky drift requires review.
- Drift review writes evidence.

### 7.13 Feature: Evidence Library

Build:

- `src/components/EvidenceLibraryScreen.tsx`
- `src/lib/evidence.ts`

Operations:

- List/filter evidence by subject, type, actor, date.
- Export JSON/CSV.
- Generate evidence packet by agent/control/system.

Acceptance criteria:

- Evidence is human-readable.
- Agent evidence packet includes request, approvals, birth certificate, manifest, control mapping, system access, exports, drift reviews, transfers.
- Control evidence packet includes related agents and approvals.

---

## 8. Technical Architecture

### 8.1 State Model

Extend `Workspace` in `src/types.ts`:

```ts
interface Workspace {
  controls?: ControlManifest[];
  systems?: SystemManifest[];
  aiCouncilRequests?: AiCouncilRequest[];
  birthCertificates?: AgentBirthCertificate[];
  evidenceRecords?: EvidenceRecord[];
  riskFindings?: RiskFinding[];
  externalAgents?: ExternalAgentRecord[];
}
```

Local-first persistence is acceptable for demo/MVP. Supabase schema should follow once state shape stabilizes.

### 8.2 Module Boundaries

Logic belongs in `src/lib`. Components render.

Required modules:

- `src/lib/controls.ts`
- `src/lib/systems.ts`
- `src/lib/agentInventory.ts`
- `src/lib/birthCertificate.ts`
- `src/lib/aiCouncil.ts`
- `src/lib/approvalGates.ts`
- `src/lib/riskFindings.ts`
- `src/lib/evidence.ts`
- `src/lib/agentTransfer.ts`
- `src/lib/externalAgents.ts`

Avoid scattering derived logic across components.

### 8.3 Derivation Rules

Agent Inventory should be derived from:

- `people`
- `pedigree`
- `registry`
- `birthCertificates`
- `systems`
- `controls`
- `riskFindings`
- `externalAgents`

Risk Findings should be derived and persisted when user actions create durable risks.

Evidence should be append-only.

### 8.4 Existing Logic to Reuse

Use existing code rather than rebuilding:

- Authority ceiling and owner lifecycle: `src/lib/authority.ts`
- Governance/SOD extraction: `src/lib/governance.ts`
- Registry versions/staleness: `src/lib/registry.ts`
- Validation gates: `src/lib/validate.ts`
- Runtime export: `src/lib/runtimes/*`
- Audit trail rendering/export: `src/components/AuditTrail.tsx`
- Evidence drawer patterns: `src/components/EvidenceDrawer.tsx`, `src/components/AuditTrailDrawer.tsx`
- Manifest export package: `src/components/ManifestScreen.tsx`

---

## 9. UI Requirements

### 9.1 Progressive Disclosure

Every screen should have one main job:

- Company Context: teach Pedigree how the organization works.
- Human Manifest: understand a person's work and authority.
- Controls: understand control ownership and agent impact.
- Systems: understand what AI touches each system.
- Agent Inventory: find and govern agents.
- Manifest: decide whether an agent is safe to approve/export.
- Birth Certificate: prove what was approved on day one.
- Evidence: prove what happened.

### 9.2 Plain-English Risk Copy

Bad:

> SoD conflict detected.

Good:

> This agent can approve a payment related to a vendor the owner can create. That combination may violate segregation of duties.

### 9.3 Empty States

Required empty states:

- Company profile
- Org chart
- Human profile
- Control inventory
- Agent inventory
- Risk dashboard
- AI Council intake
- Evidence library
- System inventory
- Agent Customs

Empty states must explain:

- What is missing.
- Why it matters.
- What to do next.

Example:

> No agents have been registered yet. Start by importing your org chart or submitting an AI Council request. Pedigree will help map each agent to a human owner before deployment.

### 9.4 Terminology

Use consistently:

- Agent Birth Certificate
- Agent Customs and Immigration
- Human Manifest
- Agent Manifest
- Control Manifest
- Authority Ceiling
- Agent Inventory
- Agent Lineage
- Orphaned Agent
- Agent Drift
- AI Council Intake
- Risk Finding
- Audit Evidence

Explain SOX and SoD near first use.

---

## 10. Implementation Plan

### Phase 0: Foundations and Type Expansion

Goal:

Add types, persistence fields, utility derivations, and tests without large UI changes.

Tasks:

1. Extend `src/types.ts` with target object interfaces.
2. Extend `Workspace` with optional arrays.
3. Update `src/lib/persist.ts` serialization/deserialization.
4. Add empty utility modules with tests.
5. Add demo seed helpers for WESCO-style data.

Acceptance:

- Typecheck passes.
- Existing tests pass.
- Existing demo flow does not regress.

### Phase 1: Agent Inventory + System Inventory

Goal:

Answer WESCO's "show me all agents touching Oracle" question.

Tasks:

1. Build `SystemManifest` model and system derivation from company context.
2. Build `AgentInventoryScreen`.
3. Add filters by system, owner, department, risk, status, SOX, stale/orphan.
4. Build `SystemsScreen` with detail drawer.
5. Link from agent rows to Manifest/Birth Certificate placeholder.

Acceptance:

- Oracle system detail shows related agents.
- Agent Inventory can filter Oracle/SOX/high-risk/orphaned.

### Phase 2: Control Manifest + SOX Mapping

Goal:

Make controls first-class and link them into agent lineage.

Tasks:

1. Build `ControlsScreen`.
2. Add create/edit/import control form.
3. Link controls to systems, humans, tasks, agents.
4. Add SOX relevance toggle.
5. Surface related controls in Agent Manifest.

Acceptance:

- A task can be linked to a SOX control.
- Agent Manifest shows related controls.
- Control detail shows related agents/evidence.

### Phase 3: Birth Certificate + Approval Gates

Goal:

Turn approved manifests into immutable proof records.

Tasks:

1. Implement approval gate derivation.
2. Add approval checklist to Manifest.
3. Create Birth Certificate on approval.
4. Add Birth Certificate view and export.
5. Include Birth Certificate in deployment/evidence package.

Acceptance:

- Approved agent has Birth Certificate.
- Birth Certificate includes approvals, owner, authority ceiling, controls, systems, risk, prompt version.

### Phase 4: AI Council Intake

Goal:

Represent WESCO's manual request queue and connect it to agent creation.

Tasks:

1. Build intake form.
2. Build reviewer queue.
3. Add statuses and prioritization.
4. Add approve/reject/request-info actions.
5. Convert approved request to task/manifest.

Acceptance:

- Business user can submit request.
- AI Council reviewer can approve.
- Approval writes evidence and unlocks manifest path.

### Phase 5: Risk Dashboard + Evidence Library

Goal:

Make governance status actionable and exportable.

Tasks:

1. Build risk derivation rules.
2. Build Risk Dashboard.
3. Build Evidence Library.
4. Add evidence packet exports by agent/control/system.
5. Improve audit event unification with `EvidenceRecord`.

Acceptance:

- Risk cards are clickable.
- Evidence export is human-readable.
- Agent/control/system evidence packets exist.

### Phase 6: Orphan + Transfer Workflows

Goal:

Handle joiner/mover/leaver enterprise operations.

Tasks:

1. Add orphan findings from lifecycle/offboarding.
2. Add transfer drawer.
3. Compare old/new owner authority.
4. Require approval for mismatches.
5. Generate transfer evidence.

Acceptance:

- Offboarding suspends or flags agents.
- Transfer prevents authority expansion unless approved.

### Phase 7: Customs and Immigration

Goal:

Import and govern outside agents.

Tasks:

1. Build external agent import.
2. Parse/paste manifest/prompt/config.
3. Map to owner, systems, purpose, controls.
4. Classify risk.
5. Approve/restrict/sandbox/reject.

Acceptance:

- External agent can be registered and reviewed.
- Missing owner/purpose/scope produces risk finding.

### Phase 8: WESCO Demo Kit

Goal:

Provide a complete WESCO-specific story.

Demo beats:

1. Upload company/org context.
2. Open Human Manifest.
3. Review responsibilities/tasks.
4. Mark a task as delegation candidate.
5. Link it to SOX control.
6. Generate Agent Manifest.
7. Review Authority Ceiling.
8. Approve and create Birth Certificate.
9. Show Agent Inventory.
10. Filter agents touching Oracle.
11. Show risk finding.
12. Show orphaned agent.
13. Transfer agent to new owner.
14. Export audit evidence.

Acceptance:

- Demo is end-to-end with realistic names and systems.
- No step depends on hidden developer setup.

---

## 11. Testing Strategy

### 11.1 Unit Tests

Add tests for:

- Control links and SOX filtering.
- System inventory derivation.
- Agent inventory flattening.
- Birth certificate creation and immutability.
- Approval gate derivation.
- Risk finding derivation.
- Evidence packet generation.
- Transfer authority comparison.
- External agent classification.

### 11.2 Component Tests / Smoke Tests

At minimum:

- Agent Inventory renders 100+ agents.
- Filtering by Oracle works.
- Control detail opens.
- Birth Certificate view opens.
- AI Council request can be submitted and approved.
- Evidence export downloads JSON/CSV.

### 11.3 Regression Tests

Existing invariants must remain:

- Blocked > approval > allowed.
- MCP grants never exceed approved scopes.
- Authority ceiling warnings/failures still block export.
- Offboarded owners cannot keep active deployed agents.
- Registry history remains append-only.

### 11.4 Manual QA Checklist

- No screen says "SOX" without plain-English explanation nearby.
- No agent can be created without reviewed task/workflow context.
- No approved agent lacks a Birth Certificate.
- No orphaned agent appears as healthy.
- No evidence packet contains empty placeholder text.

---

## 12. Non-Functional Requirements

### 12.1 Performance

- Agent Inventory should handle at least 1,000 agents in local state.
- Filters should update within 250ms for 1,000 agents.
- Large org charts should not be the only navigation path; use filters/search.

### 12.2 Accessibility

- Tables and filters must have labels.
- Drawers must trap focus and close predictably.
- Risk color must not be the only signal.

### 12.3 Data Safety

- Never silently delete evidence or birth certificates.
- Evidence records append-only.
- Birth Certificates immutable except audited amendment.
- Company context must remain bound to the active workspace.

### 12.4 Security Posture for MVP

- Local/demo mode may remain local-first.
- Production mode must move approval/evidence writes server-side.
- Role checks in UI are not sufficient for production; server enforcement required before real WESCO deployment.

---

## 13. Open Questions

1. What exact WESCO source should seed controls: SOX control matrix, SOD tool export, manual spreadsheet, or transcript-derived controls?
2. Does WESCO want AI Council Intake to replace the existing queue or mirror it initially?
3. Which runtime is the pilot target: manual export, OpenAI, Claude, Copilot, Hermes, or internal?
4. What systems must appear in first demo besides Oracle?
5. What evidence export format will WESCO auditors expect first: JSON, CSV, HTML, PDF, or ZIP?
6. Should service accounts be allowed in MVP or explicitly marked future?
7. Which personas need separate login roles in the pilot?

---

## 14. Definition of Done

This enterprise governance build is complete when:

- Pedigree can model humans, responsibilities, controls, tasks, systems, agents, approvals, evidence, risks, and lifecycle.
- A user can create or import a control and link it to a task/agent/system.
- A user can generate an Agent Manifest from reviewed task/control context.
- A reviewer can approve the manifest and create an Agent Birth Certificate.
- Agent Inventory can answer WESCO's core questions about Oracle, SOX agents, high-risk agents, and orphaned agents.
- System View can show all agents touching a system.
- Risk Dashboard shows actionable risks with recommended next steps.
- Evidence Library can export agent/control/system evidence packets.
- Orphan and transfer workflows prevent ownerless or authority-expanding agents from remaining healthy without review.
- External agents can be registered and governed through Customs and Immigration.
- The WESCO demo story works end-to-end without code changes.

---

## 15. Agent Implementation Instructions

For AI coding agents:

1. Read this PRD first.
2. Read `docs/production-roadmap.md`.
3. Read `docs/workflow-layer-handoff.md`.
4. Read `docs/pedigree-agent-compiler.md`.
5. Inspect `src/types.ts`, `src/App.tsx`, `src/lib/authority.ts`, `src/lib/governance.ts`, `src/lib/registry.ts`, and `src/components/ManifestScreen.tsx`.
6. Implement one phase at a time.
7. Keep domain logic in `src/lib`.
8. Add tests for every new derivation.
9. Do not break existing deterministic no-API-key demo behavior.
10. Run:

```bash
npm run typecheck
npm run test
```

11. Report:

- Files changed
- Feature implemented
- Tests added
- Verification results
- Remaining gaps

Do not claim SOX compliance or audit certification. Say Pedigree supports SOX-aware governance workflows, control lineage, approval evidence, and audit packages.

