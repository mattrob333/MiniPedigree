import type {
  AgentRegistryEntry,
  ContextReadiness,
  DiscoveryPlan,
  PedigreeState,
  Person,
  QuestionBacklogItem,
} from "@/types";
import { isMapped } from "./sessions";

// ── UX reset: the maturity ladder ──────────────────────────────────────
// Pedigree is organized around discovery maturity, not features. The app
// always knows which state the company is in, defaults to the surface that
// matches it, and shows ONE next action. The org chart is the payoff, not
// the entry point. (docs/ux-reset-plan.md)

export type CompanyStage =
  | "no_roster"          // 1 — nothing uploaded (home screen handles this)
  | "validate_roster"    // 2 — roster imported, needs a human look
  | "add_context"        // 3 — context below minimum readiness
  | "run_sessions"       // 4/5 — discovery sessions planned, need running
  | "review_findings"    // 6 — extracted work awaiting confirmation
  | "plan_agents"        // 7/8 — classified tasks ready to become agents
  | "export"             // 9 — approved agents, manifests ready
  | "operate";           // post-setup: the living stack (digest, members)

/** Minimum context readiness before discovery questions stop being generic. */
export const MIN_CONTEXT_READINESS = 6;

export interface MaturityInput {
  people: Person[];
  pedigree: PedigreeState;
  readiness: ContextReadiness;
  rosterValidatedAt?: string;
  discoveryPlan: DiscoveryPlan | null;
  reviewQueueCount: number;
  questionBacklog: QuestionBacklogItem[];
  registry: AgentRegistryEntry[];
  agentsBuilt: number;
}

export function deriveStage(s: MaturityInput): CompanyStage {
  if (!s.people.length) return "no_roster";
  if (!s.rosterValidatedAt) return "validate_roster";
  if (s.readiness.overall < MIN_CONTEXT_READINESS) return "add_context";

  const active = s.people.filter((p) => p.lifecycle !== "offboarded");
  const mapped = active.filter((p) => isMapped(s.pedigree[p.id]?.status)).length;
  const coverage = active.length ? mapped / active.length : 0;
  const delegatable = active.reduce((n, p) => n + (s.pedigree[p.id]?.tasks.delegatable.length ?? 0), 0);

  // Run sessions until half the org is covered; after that the review queue
  // becomes the bottleneck, then agent planning, then export.
  if (coverage < 0.5) return "run_sessions";
  if (s.reviewQueueCount > 0 && s.agentsBuilt === 0) return "review_findings";
  if (delegatable > 0 && s.agentsBuilt === 0) return "plan_agents";

  const approved = s.registry.filter((e) => e.status === "approved" || e.status === "deployed").length;
  if (s.agentsBuilt > 0 && approved === 0) return "export"; // approve + package
  if (s.agentsBuilt === 0) return "run_sessions";
  return "operate";
}

export type WorkspaceSurface =
  | "people" | "orgmap" | "discovery" | "review" | "responsibilities"
  | "agentplan" | "digest" | "evidence";

export interface NextAction {
  label: string;
  hint: string;
  /** Workspace tab, or a screen for off-tab surfaces. */
  target: { kind: "tab"; tab: WorkspaceSurface } | { kind: "screen"; screen: "company" };
}

export function nextAction(stage: CompanyStage, s: MaturityInput): NextAction {
  switch (stage) {
    case "no_roster":
      return { label: "Upload roster", hint: "Start with a CSV of people, titles, managers, and departments.", target: { kind: "tab", tab: "people" } };
    case "validate_roster":
      return { label: "Validate roster", hint: "Confirm people, manager links, and departments imported correctly before discovery.", target: { kind: "tab", tab: "people" } };
    case "add_context":
      return { label: "Add company context", hint: "Goals, systems, and policies make discovery questions specific and task classification safe.", target: { kind: "screen", screen: "company" } };
    case "run_sessions": {
      const next = s.discoveryPlan?.sessions.find((session) => session.status !== "applied");
      return {
        label: next ? "Prepare next session" : "Continue discovery",
        hint: next ? `Next: ${next.rationale}` : "Run discovery sessions to map responsibilities.",
        target: { kind: "tab", tab: "discovery" },
      };
    }
    case "review_findings":
      return { label: "Clear follow-ups", hint: `${s.reviewQueueCount} follow-up${s.reviewQueueCount === 1 ? "" : "s"} to resolve or carry into the next session.`, target: { kind: "tab", tab: "review" } };
    case "plan_agents":
      return { label: "Plan agents", hint: "Choose which delegatable tasks become agents, under which human owner.", target: { kind: "tab", tab: "agentplan" } };
    case "export":
      return { label: "Approve & export agents", hint: "Approve manifests and export governed deployment packages.", target: { kind: "tab", tab: "agentplan" } };
    case "operate":
      return { label: "Process meeting signals", hint: "The stack is live — keep it fresh from recurring meetings and member confirmations.", target: { kind: "tab", tab: "digest" } };
  }
}

/** The default surface when a workspace opens. Never the org map early. */
export function defaultSurface(stage: CompanyStage): WorkspaceSurface {
  switch (stage) {
    case "no_roster":
    case "validate_roster":
    case "add_context":
      return "people";
    case "run_sessions":
      return "discovery";
    case "review_findings":
      return "review";
    case "plan_agents":
    case "export":
      return "agentplan";
    case "operate":
      return "digest";
  }
}

/** The org map earns default/“payoff” treatment only once there is data to overlay. */
export function canDefaultToOrgMap(s: MaturityInput): boolean {
  const active = s.people.filter((p) => p.lifecycle !== "offboarded");
  const mapped = active.filter((p) => isMapped(s.pedigree[p.id]?.status)).length;
  const confirmedResponsibilities = active.reduce(
    (n, p) => n + (s.pedigree[p.id]?.responsibilities.length ?? 0),
    0,
  );
  const appliedSessions = s.discoveryPlan?.sessions.filter((x) => x.status === "applied").length ?? 0;
  return confirmedResponsibilities >= 5 || appliedSessions >= 2 || (active.length > 0 && mapped / active.length >= 0.5);
}

// ── Stage-aware metrics: no zero-walls ─────────────────────────────────

export interface StageMetric {
  label: string;
  value: string | number;
  delta?: string;
  up?: boolean;
}

export function stageMetrics(stage: CompanyStage, s: MaturityInput): StageMetric[] {
  const active = s.people.filter((p) => p.lifecycle !== "offboarded");
  const mapped = active.filter((p) => isMapped(s.pedigree[p.id]?.status)).length;
  const managerLinks = active.filter((p) => !p.managerId).length; // roots
  const linked = active.length - Math.max(0, managerLinks - 1);   // allow one root
  const departments = new Set(active.map((p) => p.department).filter((d) => d && d !== "—")).size;
  const respCount = active.reduce((n, p) => n + (s.pedigree[p.id]?.responsibilities.length ?? 0), 0);
  const deleg = active.reduce((n, p) => n + (s.pedigree[p.id]?.tasks.delegatable.length ?? 0), 0);
  const openQuestions = s.questionBacklog.filter((q) => !q.resolved_by_session_id).length;
  const pendingSessions = s.discoveryPlan?.sessions.filter((x) => x.status !== "applied").length ?? 0;
  const appliedSessions = s.discoveryPlan?.sessions.filter((x) => x.status === "applied").length ?? 0;
  const approved = s.registry.filter((e) => e.status === "approved" || e.status === "deployed").length;

  switch (stage) {
    case "no_roster":
    case "validate_roster":
      return [
        { label: "People imported", value: active.length, delta: "from roster", up: active.length > 0 },
        { label: "Manager links", value: `${linked}/${active.length}`, delta: linked === active.length ? "all resolve" : "check unlinked", up: linked === active.length },
        { label: "Departments", value: departments, delta: "found", up: departments > 0 },
        { label: "Context readiness", value: `${s.readiness.overall}/16`, delta: s.readiness.overall >= MIN_CONTEXT_READINESS ? "ready" : "next step", up: s.readiness.overall >= MIN_CONTEXT_READINESS },
      ];
    case "add_context":
      return [
        { label: "People", value: active.length, delta: "validated", up: true },
        { label: "Context readiness", value: `${s.readiness.overall}/16`, delta: `${s.readiness.dimensions.filter((d) => d.score === 2).length}/8 areas good`, up: s.readiness.overall >= MIN_CONTEXT_READINESS },
        { label: "Departments", value: departments, delta: "to cover", up: departments > 0 },
        { label: "Sessions planned", value: pendingSessions, delta: "after context", up: false },
      ];
    case "run_sessions":
      return [
        { label: "Sessions run", value: appliedSessions, delta: `${pendingSessions} planned`, up: appliedSessions > 0 },
        { label: "People covered", value: `${mapped}/${active.length}`, delta: "discovery coverage", up: mapped > 0 },
        { label: "Responsibilities", value: respCount, delta: respCount ? "discovered" : "from sessions", up: respCount > 0 },
        { label: "Open questions", value: openQuestions, delta: "carried into briefs", up: false },
      ];
    case "review_findings":
      return [
        { label: "Follow-ups", value: s.reviewQueueCount, delta: "to resolve", up: false },
        { label: "Responsibilities", value: respCount, delta: "extracted", up: respCount > 0 },
        { label: "Tasks ready for delegation", value: deleg, delta: "classified", up: deleg > 0 },
        { label: "People covered", value: `${mapped}/${active.length}`, up: mapped === active.length },
      ];
    case "plan_agents":
    case "export":
    case "operate":
      return [
        { label: "Responsibilities", value: respCount, delta: "confirmed map", up: respCount > 0 },
        { label: "Tasks ready for delegation", value: deleg, up: deleg > 0 },
        { label: "Agents built", value: s.agentsBuilt, delta: approved ? `${approved} approved` : "drafts", up: s.agentsBuilt > 0 },
        { label: "Open questions", value: openQuestions, up: false },
        ...(stage === "operate" ? [{ label: "Coverage", value: `${mapped}/${active.length}`, up: mapped === active.length }] : []),
      ];
  }
}

// ── Setup checklist ─────────────────────────────────────────────────────

export interface ChecklistItem {
  id: CompanyStage;
  label: string;
  state: "done" | "current" | "locked";
}

const LADDER: { id: CompanyStage; label: string }[] = [
  { id: "validate_roster", label: "Validate roster" },
  { id: "add_context", label: "Add company context" },
  { id: "run_sessions", label: "Conduct discovery" },
  { id: "review_findings", label: "Clear follow-ups" },
  { id: "plan_agents", label: "Plan agents" },
  { id: "export", label: "Approve & export" },
];

export function setupChecklist(stage: CompanyStage): ChecklistItem[] {
  const order = LADDER.findIndex((step) => step.id === stage);
  const currentIndex = stage === "operate" ? LADDER.length : order === -1 ? 0 : order;
  return LADDER.map((step, i) => ({
    id: step.id,
    label: step.label,
    state: i < currentIndex ? "done" : i === currentIndex ? "current" : "locked",
  }));
}

export function setupComplete(stage: CompanyStage): boolean {
  return stage === "operate";
}

/** Next-action label for the home screen company cards. */
export function summaryNextAction(summary: { peopleCount: number; mappedCount: number; agentsCount: number }): string {
  if (!summary.peopleCount) return "Upload roster";
  if (!summary.mappedCount) return "Start discovery";
  if (summary.mappedCount < summary.peopleCount && !summary.agentsCount) return "Continue discovery";
  if (!summary.agentsCount) return "Plan agents";
  return "Open workspace";
}
