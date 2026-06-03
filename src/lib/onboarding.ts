export interface OnboardingProgress {
  hasCompletedOnboarding: boolean;
  hasSkippedOnboarding: boolean;
  lastStepId?: string;
  completedAt?: string;
  skippedAt?: string;
  updatedAt?: string;
}

const PREFIX = "pedigree.onboarding.v1";

function safeKey(value?: string | null): string {
  return (value || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function storageKey(userKey?: string | null, workspaceId?: string | null): string {
  return `${PREFIX}.${safeKey(userKey)}.${safeKey(workspaceId || "home")}`;
}

function globalKey(userKey?: string | null): string {
  return `${PREFIX}.${safeKey(userKey)}.global`;
}

function readKey(key: string): OnboardingProgress {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { hasCompletedOnboarding: false, hasSkippedOnboarding: false };
    return {
      hasCompletedOnboarding: false,
      hasSkippedOnboarding: false,
      ...(JSON.parse(raw) as Partial<OnboardingProgress>),
    };
  } catch {
    return { hasCompletedOnboarding: false, hasSkippedOnboarding: false };
  }
}

function writeKey(key: string, progress: OnboardingProgress): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }));
  } catch {
    /* localStorage may be unavailable */
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* localStorage may be unavailable */
  }
}

export function getOnboardingProgress(userKey?: string | null, workspaceId?: string | null): OnboardingProgress {
  return readKey(storageKey(userKey, workspaceId));
}

export function getGlobalOnboardingProgress(userKey?: string | null): OnboardingProgress {
  return readKey(globalKey(userKey));
}

export function shouldShowUploadOnboarding(userKey?: string | null): boolean {
  const global = getGlobalOnboardingProgress(userKey);
  if (global.hasCompletedOnboarding || global.hasSkippedOnboarding) return false;
  const home = getOnboardingProgress(userKey, "home");
  return !home.hasCompletedOnboarding && !home.hasSkippedOnboarding && !home.lastStepId;
}

export function shouldShowWorkspaceOnboarding(userKey?: string | null, workspaceId?: string | null): boolean {
  if (!workspaceId) return false;
  const global = getGlobalOnboardingProgress(userKey);
  if (global.hasCompletedOnboarding || global.hasSkippedOnboarding) return false;
  const workspace = getOnboardingProgress(userKey, workspaceId);
  return !workspace.hasCompletedOnboarding && !workspace.hasSkippedOnboarding;
}

export function getInitialWorkspaceOnboardingStep(userKey?: string | null, workspaceId?: string | null): string {
  const workspace = getOnboardingProgress(userKey, workspaceId);
  return workspace.lastStepId || "company-profile";
}

export function recordOnboardingStep(userKey: string | undefined, workspaceId: string | null | undefined, stepId: string): void {
  const progress = getOnboardingProgress(userKey, workspaceId || "home");
  writeKey(storageKey(userKey, workspaceId || "home"), {
    ...progress,
    hasCompletedOnboarding: false,
    hasSkippedOnboarding: false,
    lastStepId: stepId,
  });
}

export function completeOnboarding(userKey: string | undefined, workspaceId?: string | null): void {
  const now = new Date().toISOString();
  const done: OnboardingProgress = {
    hasCompletedOnboarding: true,
    hasSkippedOnboarding: false,
    completedAt: now,
    lastStepId: "export-manifests",
  };
  writeKey(globalKey(userKey), done);
  writeKey(storageKey(userKey, workspaceId || "home"), done);
}

export function skipOnboarding(userKey: string | undefined, workspaceId?: string | null): void {
  const now = new Date().toISOString();
  const skipped: OnboardingProgress = {
    hasCompletedOnboarding: false,
    hasSkippedOnboarding: true,
    skippedAt: now,
  };
  writeKey(globalKey(userKey), skipped);
  writeKey(storageKey(userKey, workspaceId || "home"), skipped);
}

export function resetOnboarding(userKey: string | undefined, workspaceId?: string | null): void {
  removeKey(globalKey(userKey));
  removeKey(storageKey(userKey, "home"));
  if (workspaceId) removeKey(storageKey(userKey, workspaceId));
}
