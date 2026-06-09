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
}

export interface ResponsibilityRow {
  id: string;
  title: string;
  suggestedAgent?: string;
  source?: string; // e.g. "Leadership Session", "Department Session · Dr. Claire Donovan"
  assignedByName?: string; // manager who assigned this responsibility (lineage)
  confidence?: number;
}

export interface TaskItem {
  id: string;
  label: string;
  respId: string;
  respTitle: string;
  riskLevel?: RiskLevel;
  evidence?: string;
  completion?: TaskCompletionContext;
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

export interface ParsedPerson {
  summary: string;
  needsReview?: boolean;
  responsibilities: ParsedResponsibility[];
  recommended_mcp_servers?: McpRecommendation[];
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
export type AgentRegistryStatus = "draft" | "approved" | "deployed" | "retired";

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
  ingredient_hashes: Record<string, string>;
  versions: AgentRegistryVersion[];  // append-only history
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

  researchSources?: CompanyResearchSource[];
  contextDocuments?: CompanyContextDocument[];
  confidence?: number;
  researchedAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  email: string;
  name: string;
  company: string;
  companyContext: CompanyContext;
  createdAt: string;
}
