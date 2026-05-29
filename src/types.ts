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
export interface ParsedTask {
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
  ownerEmail?: string;
  updatedAt?: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  peopleCount: number;
  mappedCount: number;
  agentsCount: number;
  updatedAt: string;
}

// ── Auth-lite: user profile + company context (P1.4) ──────────────────
// The single source of truth about the business. The whole system (discovery
// parsing + agent authoring) draws from this. Mostly static; edited in the
// Company Profile screen. Login captures the first three; the rest are optional
// but make agents far more grounded.
export interface CompanyContext {
  company: string;
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
}

export interface UserProfile {
  email: string;
  name: string;
  company: string;
  companyContext: CompanyContext;
  createdAt: string;
}
