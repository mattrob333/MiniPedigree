import type { UserRole } from "@/types";

// ── Living Stack B.2: role capabilities ────────────────────────────────
// Local-first role model; client-side checks are UX only. The production
// enforcement layer (Supabase auth + RLS per migration 006) is the stated
// pre-rollout long pole — no screen pretends these local roles are SSO.

export const ROLE_LABEL: Record<UserRole, string> = {
  editor: "Editor",
  reviewer: "Reviewer",
  operator: "Operator (admin)",
  governance_reviewer: "Governance Reviewer",
  manager: "Manager",
  member: "Member",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  editor: "Map responsibilities, classify tasks, and generate agents.",
  reviewer: "Confirm provenance and approve manifests. Cannot approve own work.",
  operator: "Everything an editor can, plus apply authority-affecting changes and manage roles, meetings, and the MCP library.",
  governance_reviewer: "Read everything; approve or reject authority-affecting proposals. Cannot edit content directly.",
  manager: "A member view plus direct reports' slices; endorse their proposals.",
  member: "See and curate your own responsibilities, tasks, agents, and questions.",
};

/** Map, classify, generate, edit content directly. */
export function canEditContent(role: UserRole): boolean {
  return role === "editor" || role === "operator";
}

/** Confirm provenance / approve manifests (separation from generation enforced elsewhere). */
export function canReview(role: UserRole): boolean {
  return role === "reviewer" || role === "operator" || role === "governance_reviewer";
}

/** Apply digest/changeset items that do NOT touch authority. */
export function canApplyNonAuthority(role: UserRole): boolean {
  return role === "editor" || role === "reviewer" || role === "operator" || role === "manager";
}

/** Apply authority-affecting proposals (rule changes, scope widening, transfers). */
export function canApplyAuthority(role: UserRole): boolean {
  return role === "operator" || role === "governance_reviewer";
}

/** Manage meeting registry, MCP library, roles, person lifecycle. */
export function canAdminister(role: UserRole): boolean {
  return role === "operator";
}

/** Member-workspace surfaces (everyone has a "my slice"; these roles default into it). */
export function isMemberFacing(role: UserRole): boolean {
  return role === "member" || role === "manager";
}
