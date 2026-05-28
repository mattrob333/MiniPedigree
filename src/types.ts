// ── Core domain types for Pedigree Discover Lite ──────────────────────

export type Status =
  | "needs-discovery"
  | "needs-review"
  | "parsed"
  | "mapped"
  | "ready"
  | "generated"
  | "blocked";

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

export interface AgentRecord {
  id: string;
  name: string;
  taskId: string;
  respId: string;
  respTitle: string;
  policy: string;
  riskLevel: RiskLevel;
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
}
