// ── Core domain types for Pedigree Discover Lite ──────────────────────

export type Status =
  | "needs-discovery"
  | "session-scheduled"
  | "session-captured"
  | "needs-review"
  | "parsed"
  | "mapped"
  | "ready"
  | "generated"
  | "blocked";

export type MappingSessionType =
  | "leadership_session"
  | "department_session"
  | "individual_role_session"
  | "clarification_session";

export type SessionScope =
  | "self"
  | "self_and_reports"
  | "unmapped_reports"
  | "department"
  | "leadership";

export interface RecommendedSession {
  personId: string;
  type: MappingSessionType;
  reason: string;
}

export interface MappingSession {
  id: string;
  type: MappingSessionType;
  scopeOwnerPersonId: string;
  scopedPersonIds: string[];
  status: "draft" | "captured" | "parsed" | "reviewed" | "applied";
  rawInput: string;
}

export type DelegationClass =
  | "delegatable"
  | "human_approval_required"
  | "not_delegatable"
  | "unclear";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type TaskReadiness = "ready" | "needs_clarification";

/**
 * Completion context extracted from the discovery transcript per task.
 * Every field is nullable: null means "not stated in transcript" — the
 * deterministic fallback never invents these.
 */
export interface TaskCompletionContext {
  trigger: string | null;
  inputs: string[] | null;
  outputs: string[] | null;
  tools_mentioned: string[] | null;
  definition_of_done: string | null;
  readiness: TaskReadiness | null;
  open_questions: string[] | null;
  candidate_pattern: string | null;
}

// ── Authority Profile (amendment): what authority this human actually holds ──
// An agent can only inherit authority its owner holds. Grants are populated from
// trust-ranked sources; a lower-trust source never overwrites a higher one.
export type AuthorityGrantScope = "none" | "read_only" | "draft_only" | "read_write" | "admin";
export type AuthorityStatus = "asserted" | "reviewed" | "verified"; // verified reserved for future IAM sync
export type DataTier = "public" | "internal" | "confidential" | "regulated";

export type AuthorityProvenance =
  | { source: "csv" }
  | { source: "rule_derived"; rule_id: string }
  | { source: "discovery"; transcript_id: string }
  | { source: "self_attested"; person_id: string }
  | { source: "operator"; operator_id: string }
  | { source: "iam_sync"; provider: string }; // roadmap; highest trust

export interface SystemGrant {
  system: string;                          // matches CompanyMcpServer.systems_matched / context systems
  scope: AuthorityGrantScope;
  provenance: AuthorityProvenance;
  evidence_quote?: string;
  status: AuthorityStatus;
}

export interface ApprovalAuthority {
  domain: string;                          // "spend", "forecast_signoff", "refunds", "hiring"
  limit?: { amount?: number; currency?: string; description?: string };
  provenance: AuthorityProvenance;
  evidence_quote?: string;
  status: AuthorityStatus;
}

export interface SodRole {
  flow: string;                            // "payment_processing", "vendor_onboarding"
  role: "preparer" | "approver" | "both_flagged"; // both_flagged = detected conflict on the human
  provenance: AuthorityProvenance;
}

export interface DataClearance {
  tiers: DataTier[];
  provenance: AuthorityProvenance;
}

export interface AuthorityProfile {
  system_grants: SystemGrant[];
  approval_authority: ApprovalAuthority[];
  sod_roles: SodRole[];
  data_clearance?: DataClearance;
  updated_at: string;
}

export interface AuthorityDiscrepancy {
  id: string;
  person_id: string;
  kind: "system_grant" | "approval_authority";
  key: string;                             // system or domain
  held: string;                            // what the higher-trust source says
  asserted: string;                        // what the lower-trust source claimed
  lower_source: AuthorityProvenance["source"];
  higher_source: AuthorityProvenance["source"];
  raised_at: string;
}

// Joiner / mover / leaver — authority is only meaningful if it ends.
export type PersonLifecycleStatus = "active" | "transitioning" | "offboarded";

export interface Person {
  id: string;
  name: string;
  email: string;
  title: string;
  managerId: string | null;
  managerEmail?: string | null;
  department: string;
  team?: string;
  location?: string;
  tools: string[];
  notes?: string;
  authority?: AuthorityProfile;
  lifecycle?: PersonLifecycleStatus;       // default "active"
}

// ── Provenance: where every responsibility/task came from ─────────────
// "evidenced" = backed by a transcript/document quote; "ai_inferred" = the
// parser inferred it (e.g. role templates) with no direct evidence;
// "human_confirmed" = a reviewer explicitly confirmed it.
export type ProvenanceState = "evidenced" | "ai_inferred" | "human_confirmed";

export interface ItemProvenance {
  state: ProvenanceState;
  confidence?: number;        // 0..1 from the parser
  evidence_quote?: string;    // the source excerpt behind "evidenced"
  source?: string;            // session label / transcript reference
  confirmed_by?: string;
  confirmed_at?: string;
}

export interface ResponsibilityRow {
  id: string;
  title: string;
  suggestedAgent?: string;
  source?: string; // e.g. "Leadership Session", "Department Session · Dr. Claire Donovan"
  assignedByName?: string; // manager who assigned this responsibility (lineage)
  confidence?: number;
  provenance?: ItemProvenance;
  last_confirmed_at?: string;
}

export interface TaskItem {
  id: string;
  label: string;
  respId: string;
  respTitle: string;
  riskLevel?: RiskLevel;
  evidence?: string;
  completion?: TaskCompletionContext;
  provenance?: ItemProvenance;
  /** Freshness: set by confirmations (meetings or the owner), applied changes. */
  last_confirmed_at?: string;
}

export interface PersonTasks {
  delegatable: TaskItem[];
  approval: TaskItem[];
  not_delegatable: TaskItem[];
}

export type AgentLifecycleClass = "standing" | "task";

export interface AgentRecord {
  id: string;
  name: string;
  taskId: string;
  respId: string;
  respTitle: string;
  policy: string;
  riskLevel: RiskLevel;
  lifecycle?: AgentLifecycleClass;
  person: Person;
  task: TaskItem;
  createdAt: string;
  generatedBy?: string; // email of the user who generated this agent
  manifest?: Record<string, unknown>;
  systemPrompt?: string;
}

export interface PedigreeRow {
  status: Status;
  summary?: string;
  needsReview?: boolean;
  responsibilities: ResponsibilityRow[];
  tasks: PersonTasks;
  agents: AgentRecord[];
  lastSession?: string; // label of the most recent session that mapped this person
}

export type PedigreeState = Record<string, PedigreeRow>;

// ── Parsed-discovery shape (per person) ───────────────────────────────
export interface ParsedTask extends TaskCompletionContext {
  name: string;
  delegation_class: DelegationClass;
  risk_level: RiskLevel;
  requires_human_approval: boolean;
  reason?: string;
  evidence_quote?: string;
}

export interface ParsedResponsibility {
  id: string;
  title: string;
  description?: string;
  confidence?: number;
  evidence_quote?: string;
  tasks: {
    delegatable: string[];
    approval: string[];
    not_delegatable: string[];
  };
  /** Full per-task records (completion context, risk, evidence) keyed by task name. */
  taskDetails?: ParsedTask[];
  unclear?: boolean;
}

/**
 * Authority claims extracted from discovery transcripts (approval-boundary
 * questions). These land as review-gated proposals — never direct writes.
 */
export interface AuthorityAssertion {
  kind: "system_access" | "approval" | "sod_role";
  system?: string;
  scope?: AuthorityGrantScope;
  domain?: string;
  limit_description?: string;
  flow?: string;
  role?: "preparer" | "approver";
  evidence_quote: string;
}

export interface ParsedPerson {
  summary: string;
  needsReview?: boolean;
  responsibilities: ParsedResponsibility[];
  recommended_mcp_servers?: McpRecommendation[];
  authority_assertions?: AuthorityAssertion[];
}

export type ParsedMap = Record<string, ParsedPerson>;

export interface McpRecommendation {
  name: string;
  reason: string;
  recommended_scope: "read_only" | "draft_only" | "none";
  risk_level: RiskLevel;
}

export interface CsvImportResult {
  people: Person[];
  warnings: string[];
  errors: string[];
  workspaceName: string;
}

export interface Workspace {
  id: string;
  name: string;
  people: Person[];
  pedigree: PedigreeState;
  createdAt: string;
  companyContext?: CompanyContext; // per-workspace company profile (one per client)
  mcpLibrary?: CompanyMcpServer[]; // the company's approved MCP tool surface
  registry?: AgentRegistryEntry[]; // the Agent Stack state (versioned, append-only)
  auditLog?: StackAuditRecord[];   // applied stack changes with approver + evidence
  events?: WorkspaceAuditEvent[];  // append-only workspace audit trail
  discoveryPlan?: DiscoveryPlan;   // the discovery campaign (guided discovery)
  sessionBriefs?: SessionBrief[];  // generated/edited session briefs
  questionBacklog?: QuestionBacklogItem[]; // open questions per person
  meetings?: RegisteredMeeting[];  // recurring meeting registry (maintenance engine)
  signalLedger?: StackSignal[];    // maintenance + member signals awaiting durability/review
  freshnessConfig?: FreshnessConfig;
  ownerEmail?: string;
  updatedAt?: string;
}

// ── Company MCP Library — the approved tool surface for this company ──
export type McpScope = "read_only" | "draft_only" | "read_write";

export interface CompanyMcpServer {
  id: string;
  name: string;                      // "Salesforce", "Slack", ...
  endpoint?: string;
  approved_scopes: McpScope[];
  default_scope: "read_only" | "draft_only";
  owner_email: string;               // who approved this server for the company
  systems_matched: string[];         // company-context system names this maps to
  notes?: string;
  added_at: string;
}

export interface McpGrant {
  server_id: string;
  name: string;
  scope: McpScope;
  source: "library" | "catalog_fallback";
  reason: string;
}

// ── Governance rules extracted from context documents ─────────────────
export type GovernanceRuleType = "blocked" | "approval" | "audit" | "sod_conflict";

export interface GovernanceRule {
  rule_id: string;
  type: GovernanceRuleType;
  condition: string;                 // human-readable matcher description
  matcher: { keywords?: string[]; verbs?: string[]; amount_threshold?: number };
  approver?: "owner" | "owner_manager" | string; // email for named approvers
  source_doc: string;                // context document id (or "company_context.approvalRules", etc.)
  evidence_quote: string;
  extracted_at: string;
  confidence: number;
}

export interface GovernanceResolution {
  allowed: string[];
  approval: { action: string; approver: string; rule_id?: string }[];
  blocked: { action: string; rule_id?: string }[];
  audit_events: string[];
  sod_findings: { description: string; rule_id: string; resolution: "split" | "blocked" | "warned" }[];
  rule_provenance: { rule_id: string; source_doc: string; evidence_quote: string }[];
}

// ── Agent Registry = stack state ───────────────────────────────────────
// "suspended" sits between deployed and retired: the owner was offboarded or
// the agent was administratively paused — the export package is invalid until
// the agent is reassigned and recompiled under the new owner's ceiling.
export type AgentRegistryStatus = "draft" | "approved" | "deployed" | "suspended" | "retired";

export interface AgentRegistryVersion {
  version: number;
  compiled: Record<string, unknown>; // serialized CompiledAgent
  artifacts_manifest: string[];      // artifact paths emitted at compile time
  created_at: string;
}

export interface AgentRegistryEntry {
  agent_id: string;
  owner_person_id: string;
  task_id: string;
  resp_id: string;
  runtime: string;
  status: AgentRegistryStatus;
  stale: boolean;                    // ingredient hash drift detected
  stale_reason?: string;             // e.g. "owner_role_changed", "owner_offboarded"
  ingredient_hashes: Record<string, string>;
  versions: AgentRegistryVersion[];  // append-only history
  last_confirmed_at?: string;        // freshness: last signal confirming the underlying work
}

// ── Stack sync loop ────────────────────────────────────────────────────
export type StackChangeType =
  | "new_task"
  | "task_changed"
  | "ownership_transfer"
  | "rule_changed"
  | "agent_feedback"
  | "retire_candidate";

export interface StackChangeProposal {
  id: string;
  type: StackChangeType;
  summary: string;
  evidence_quote: string;
  transcript_id: string;
  confidence: number;
  affected: { person_ids: string[]; agent_ids: string[]; rule_ids: string[] };
  authority_expanding: boolean;      // drives the red-flag treatment in review UI
  proposed_patch: unknown;           // typed per proposal type
  decision?: { by: string; at: string; action: "applied" | "rejected" | "edited" };
}

export interface StackAuditRecord {
  id: string;
  proposal_id: string;
  proposal_type: StackChangeType;
  approver: string;
  timestamp: string;
  evidence_quote: string;
  transcript_id: string;
  summary: string;
}

// ── Guided Discovery: readiness → plan → brief → capture → backlog ─────

export type ReadinessDimension =
  | "identity" | "goals" | "kpis" | "bottlenecks"
  | "stack" | "governance" | "org" | "terminology";

export interface ReadinessDimensionScore {
  id: ReadinessDimension;
  score: 0 | 1 | 2;
  gap?: string;       // what's missing, named specifically
  fix_hint?: string;  // where to fix it
}

export interface ContextReadiness {
  overall: number;    // 0–16
  dimensions: ReadinessDimensionScore[];
  computed_at: string;
}

export interface CompanyKpi {
  department: string;
  metric: string;
  cadence?: string;
  owner_hint?: string;
}

export type PlannedSessionStatus = "planned" | "briefed" | "captured" | "parsed" | "applied" | "rerun_suggested";

export interface PlannedSession {
  id: string;
  type: MappingSessionType;
  anchor_person_id: string;
  scope_ids: string[];
  priority: number;
  rationale: string;            // "CEO flagged Finance as bottleneck"
  status: PlannedSessionStatus;
  brief_id?: string;
}

export interface DiscoveryPlan {
  id: string;
  sessions: PlannedSession[];
  coverage: {
    people_mapped: number;
    people_total: number;
    departments_covered: number;
    departments_total: number;
  };
  updated_at: string;
}

export type BriefQuestionIntent =
  | "responsibility" | "cadence" | "system" | "approval_boundary"
  | "kpi_ownership" | "overlap" | "clarification";

export type SessionNoteTag = "responsibility" | "task" | "approval" | "system" | "open_question";

export interface SessionNote {
  id: string;
  question_id: string;
  target_person_id?: string;
  tags: SessionNoteTag[];
  text: string;
  captured_at: string;
}

export type BriefQuestionOutcome = "answered" | "partial" | "skipped" | "parked";

export interface BriefQuestion {
  id: string;
  text: string;
  target_person_id: string | "group";
  intent: BriefQuestionIntent;
  why: string;                  // shown to the facilitator — keeps the interviewer credible
  order: number;
  outcome?: BriefQuestionOutcome;
  notes?: SessionNote[];
}

export interface SessionBrief {
  id: string;
  session_id: string;
  objectives: string;
  questions: BriefQuestion[];
  probe_areas: { system: string; prompt: string }[];
  carried_over: { question: string; source_task_id: string }[];
  coverage_targets: string[];   // person ids that must get mapped in this session
  source: "ai" | "template";
  edited_by_user: boolean;
  generated_at: string;
}

export type QuestionBacklogSource = "unanswered_brief" | "parser_open_question" | "parked";

export interface QuestionBacklogItem {
  id: string;
  person_id: string;
  question: string;
  source: QuestionBacklogSource;
  source_ref: string;           // brief question id or task id
  resolved_by_session_id?: string;
  created_at: string;
}

// ── Living Stack: meeting registry + signal ledger + freshness ─────────

export type MeetingCadence = "daily" | "weekly" | "biweekly" | "monthly" | "ad_hoc";
export type MeetingSignalProfile = "standup" | "planning" | "review" | "leadership";

export interface RegisteredMeeting {
  id: string;
  name: string;                          // "RevOps Monday Standup"
  cadence: MeetingCadence;
  usual_participant_ids: string[];
  department?: string;
  source: "fireflies" | "meet" | "zoom" | "manual_paste";
  source_ref?: string;
  signal_profile?: MeetingSignalProfile;
  active: boolean;
}

export type StackSignalType =
  | "confirmation" | "drift" | "new_candidate" | "retirement"
  | "rule_signal" | "agent_feedback" | "backlog_resolution";

export type StackSignalSource =
  | { kind: "meeting"; meeting_id: string; transcript_id: string }
  | { kind: "member"; person_id: string };

export type StackSignalStatus = "ledgered" | "proposed" | "applied" | "rejected" | "expired";

export interface StackSignal {
  id: string;
  type: StackSignalType;
  source: StackSignalSource;
  evidence_quote: string;
  confidence: number;
  refs: { person_ids: string[]; task_ids: string[]; agent_ids: string[]; rule_ids: string[]; backlog_ids: string[] };
  proposed_patch?: unknown;              // typed per signal type; absent for confirmation
  authority_expanding: boolean;
  captured_at: string;
  status: StackSignalStatus;
  decision?: { by: string; at: string };
}

export type FreshnessState = "fresh" | "aging" | "stale";

export interface FreshnessConfig {
  task_days: number;            // default 30
  responsibility_days: number;  // default 60
  agent_days: number;           // default 45
  authority_days: number;       // default 90
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  peopleCount: number;
  mappedCount: number;
  agentsCount: number;
  updatedAt: string;
}

export interface CompanyResearchSource {
  url: string;
  title?: string;
  snippet?: string;
  source_type: "company_site" | "user_text" | "manual" | "other";
}

export type CompanyContextDocumentBucket = "segregation_of_duties" | "policy" | "knowledge";

export interface CompanyContextDocument {
  id: string;
  bucket: CompanyContextDocumentBucket;
  fileName: string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  text: string;
  uploadedAt: string;
  sourceId?: string;
  /** Data tier — agents may only load docs within their owner's clearance. Default "internal". */
  classification?: DataTier;
}

// ── Auth-lite: user profile + company context (P1.4) ──────────────────
// The single source of truth about the business. The whole system (discovery
// parsing + agent authoring) draws from this. Mostly static; edited in the
// Company Profile screen. Login captures the first three; the rest are optional
// but make agents far more grounded.
export interface CompanyContext {
  company: string;
  url?: string;
  rawNotes?: string;

  whatWeDo: string;        // what the company does
  industry?: string;       // e.g. "Outpatient healthcare", "B2B SaaS"
  market?: string;         // who it serves / market segment & geography
  businessModel?: string;  // how it makes money
  mission?: string;        // mission / vision
  strategicGoals?: string; // CEO-level goals & priorities this year
  products?: string;       // key products / services
  competitors?: string;    // notable competitors / positioning
  initiatives?: string;    // key current initiatives
  terminology?: string;    // internal terms / product names

  currentState?: string;
  bottlenecks?: string;
  systems?: string[];
  sops?: string[];
  approvalRules?: string[];
  segregationOfDuties?: string[];
  complianceNotes?: string[];
  governanceRisks?: string[];
  departments?: string[];
  unknowns?: string[];
  kpis?: CompanyKpi[];     // per-department metrics leadership actually tracks

  researchSources?: CompanyResearchSource[];
  contextDocuments?: CompanyContextDocument[];
  confidence?: number;
  researchedAt?: string;
  updatedAt?: string;
}

// Local workspace roles (UX backlog P0-5 minimum viable RBAC, extended by the
// Living Stack member-workspace spec). Editor: map, classify, generate.
// Reviewer: confirm provenance, approve manifests. Operator: editor + apply
// authority-affecting changes, manage meetings/roles/library.
// Governance reviewer: read everything + approve/reject authority proposals.
// Member: own slice only (My Pedigree). SSO/SAML-backed identity is a stated
// roadmap item — these roles gate actions locally and are labeled as such.
export type UserRole = "editor" | "reviewer" | "operator" | "governance_reviewer" | "member" | "manager";

export interface UserProfile {
  email: string;
  name: string;
  company: string;
  companyContext: CompanyContext;
  createdAt: string;
  role?: UserRole;
}

// ── Workspace audit trail (UX backlog P1-3) ────────────────────────────
// Append-only in-app event log: who generated/confirmed/approved/exported
// what, when, based on which evidence. Local-first; schema mirrors the
// planned production audit pipeline.
export type WorkspaceAuditEventType =
  | "agent_generated"
  | "provenance_confirmed"
  | "manifest_approved"
  | "export_validated"
  | "package_exported"
  | "stack_change_applied"
  | "agent_retired"
  | "agent_suspended"
  | "agent_reassigned"
  | "signal_applied"
  | "member_confirmation"
  | "authority_changed"
  | "person_lifecycle_changed";

export interface WorkspaceAuditEvent {
  id: string;
  type: WorkspaceAuditEventType;
  actor: string;              // email of the human who acted
  timestamp: string;
  summary: string;            // human-readable description
  subject_id?: string;        // agent id / task id / proposal id
  evidence?: string;          // source quote where applicable
  details?: Record<string, unknown>;
}
