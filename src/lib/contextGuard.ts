import type { CompanyContext, Workspace } from "@/types";

function normalizeName(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactName(value: string | undefined): string {
  return normalizeName(value).replace(/\b(inc|llc|ltd|corp|corporation|company|co|saas)\b/g, "").replace(/\s+/g, "");
}

function namesClearlyDifferent(contextName: string | undefined, workspaceName: string | undefined): boolean {
  const context = compactName(contextName);
  const workspace = compactName(workspaceName);
  if (!context || !workspace) return false;
  return context !== workspace && !context.includes(workspace) && !workspace.includes(context);
}

export function emptyCompanyContext(workspaceId: string, workspaceName: string): CompanyContext {
  return {
    companyId: workspaceId,
    company: workspaceName,
    whatWeDo: "",
    updatedAt: new Date().toISOString(),
  };
}

export function bindCompanyContext(context: CompanyContext | undefined, workspaceId: string, workspaceName: string): CompanyContext | undefined {
  if (!context) return undefined;
  return {
    ...context,
    companyId: workspaceId,
    company: context.company?.trim() || workspaceName,
  };
}

export function assertContextMatchesCompany(context: CompanyContext | undefined, workspaceId: string, workspaceName: string): void {
  if (!context) return;
  if (context.companyId && context.companyId !== workspaceId) {
    throw new Error(`Context companyId "${context.companyId}" does not match active company "${workspaceId}".`);
  }
  if (!context.companyId && namesClearlyDifferent(context.company, workspaceName)) {
    throw new Error(`Legacy context company "${context.company}" does not match active company "${workspaceName}".`);
  }
}

export function sanitizeWorkspaceContext<T extends Workspace>(workspace: T): T {
  const context = workspace.companyContext;
  if (!context) return workspace;

  const mismatchedId = Boolean(context.companyId && context.companyId !== workspace.id);
  const legacyDifferentName = !context.companyId && namesClearlyDifferent(context.company, workspace.name);
  if (!mismatchedId && !legacyDifferentName) {
    return {
      ...workspace,
      companyContext: bindCompanyContext(context, workspace.id, workspace.name),
    };
  }

  return {
    ...workspace,
    companyContext: emptyCompanyContext(workspace.id, workspace.name),
    quarantinedContext: context,
    contextWarning: `A company description from another workspace was removed from this company. Re-add context for ${workspace.name}.`,
  };
}

export function safeHeaderDescription(context: CompanyContext | undefined, workspaceId: string | null, workspaceName: string): string {
  if (!context?.whatWeDo?.trim()) return "";
  if (workspaceId && context.companyId && context.companyId !== workspaceId) return "";
  if (!context.companyId && namesClearlyDifferent(context.company, workspaceName)) return "";
  return context.whatWeDo.trim();
}
