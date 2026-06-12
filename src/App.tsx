import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Topbar } from "./components/Topbar";
import { Spreadsheet } from "./components/Spreadsheet";
import { OrgMap } from "./components/OrgMap";
import { Drawer, type CreateAgentCtx } from "./components/Drawer";
import { SessionWorkspace } from "./components/SessionWorkspace";
import { CreateAgentModal, type GenerateCtx } from "./components/modals/CreateAgentModal";
import { ManifestScreen } from "./components/ManifestScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { OrgSyncModal } from "./components/OrgSyncModal";
import { CompanyProfileScreen } from "./components/CompanyProfileScreen";
import { applyOrgSync, type Changeset } from "./lib/orgSync";
import type { CompanyContext, CompanyContextDocument, CompanyContextDocumentBucket, CompanyResearchSource, TaskSpec, WorkflowTemplate } from "./types";
import { Toasts, type Toast } from "./components/Toasts";
import { LoginScreen } from "./components/LoginScreen";
import { WorkspacesHome, type DemoCompany } from "./components/WorkspacesHome";
import { Icon } from "./components/Icon";
import { BrandChip, BrandLogo, findBrand } from "./components/BrandLogo";
import { OnboardingTour } from "./components/onboarding/OnboardingTour";

import { McpLibraryScreen } from "./components/McpLibraryScreen";
import { ReviewInbox } from "./components/ReviewInbox";
import { AuditTrail } from "./components/AuditTrail";
import { RiskBadge } from "./components/ProvenanceBadge";
import { DiscoveryPlanPanel } from "./components/DiscoveryPlanPanel";
import { DigestScreen, type DigestStatePatch } from "./components/DigestScreen";
import { MemberWorkspace, type MemberStatePatch } from "./components/MemberWorkspace";
import { buildReviewQueue, confirmReviewItems, editReviewItem, type ReviewEditPatch, type ReviewQueueItem } from "./lib/provenance";
import type { AgentRecord, AgentRegistryEntry, CompanyMcpServer, DiscoveryPlan, ParsedMap, PedigreeState, Person, PersonLifecycleStatus, QuestionBacklogItem, RegisteredMeeting, SessionBrief, SessionSchedule, StackAuditRecord, StackChangeProposal, StackSignal, UserProfile, UserRole, WorkspaceAuditEvent, WorkspaceSummary } from "./types";
import { parsePeopleCsv } from "./lib/csv";
import { applyParsed, computeMetrics, exportEnrichedCsv, initialPedigreeState, downloadFile } from "./lib/state";
import { buildAgentArtifacts, newAgentRecord, type AgentConstructionSpec } from "./lib/agent";
import { authorAgent, requestTaskEnrichment, taskEnrichmentAvailable } from "./lib/api";
import { computeNextRecommendedSessions } from "./lib/sessions";
import { useTheme } from "./lib/useTheme";
import {
  saveWorkspace, loadWorkspace, deleteWorkspace, listWorkspaces, newWorkspaceId,
  getLastWorkspaceId, setLastWorkspaceId, loadProfile, saveProfile, clearProfile,
} from "./lib/persist";
import { refreshStaleness } from "./lib/registry";
import { applyStackProposals } from "./lib/stackSync";
import type { ApplyMappingArgs } from "./components/SessionWorkspace";
import { adaptPlan, discoveryCompletion, generatePlan, setSessionSchedule, setSessionStatus } from "./lib/discoveryPlan";
import { ingestBriefOutcomes, ingestParserOpenQuestions, openBacklog, resolveBacklogFromParse, resolveBacklogItem } from "./lib/questionBacklog";
import { computeReadiness } from "./lib/readiness";
import { authorityAssertionSignals, deriveAuthorityFromRules, enforceLeaverInvariant, flagAgentsForMover, mergeApprovalAuthority, suspendAgentsForLeaver } from "./lib/authority";
import { getGovernanceRules } from "./lib/governance";
import { ingestSignals, pendingSignals } from "./lib/signalLedger";
import { buildRecommendations } from "./lib/optimizer";
import { canAdminister } from "./lib/rbac";
import {
  canDefaultToOrgMap, defaultSurface, deriveStage, nextAction, setupChecklist,
  setupComplete, stageMetrics, type CompanyStage, type MaturityInput, type WorkspaceSurface,
} from "./lib/maturity";
import { SetupChecklist } from "./components/SetupChecklist";
import { ResponsibilityMatrix } from "./components/ResponsibilityMatrix";
import { AgentPlan } from "./components/AgentPlan";
import {
  completeOnboarding,
  getInitialWorkspaceOnboardingStep,
  recordOnboardingStep,
  resetOnboarding,
  shouldShowUploadOnboarding,
  shouldShowWorkspaceOnboarding,
  skipOnboarding,
} from "./lib/onboarding";
import { assertContextMatchesCompany, bindCompanyContext, emptyCompanyContext, safeHeaderDescription } from "./lib/contextGuard";
import { deriveOperationalState } from "./lib/taskState";

type Screen = "login" | "home" | "workspace" | "manifest" | "profile" | "company" | "mcplibrary" | "member" | "session";
type Tab = "spreadsheet" | "orgmap" | "plan" | "agents" | "review" | "digest" | "audit";

// Maturity surfaces → workspace tabs (internal tab ids stay stable).
const SURFACE_TAB: Record<WorkspaceSurface, Tab> = {
  people: "spreadsheet",
  orgmap: "orgmap",
  discovery: "plan",
  review: "review",
  responsibilities: "orgmap",
  agentplan: "agents",
  digest: "digest",
  evidence: "audit",
};

function sessionReviewConfirmationEvents(args: ApplyMappingArgs, actor: string, exceptionKeys: Set<string>): WorkspaceAuditEvent[] {
  const events: WorkspaceAuditEvent[] = [];
  let seq = 0;
  const timestamp = new Date().toISOString();
  for (const personId of args.scopeIds) {
    for (const resp of args.parsed[personId]?.responsibilities ?? []) {
      const respKey = `${personId}::${resp.id}`;
      if (!exceptionKeys.has(respKey)) {
        events.push({
          id: `EVT-${Date.now().toString(36)}-session-review-${seq++}`,
          type: "provenance_confirmed",
          actor,
          timestamp,
          summary: `Session review confirmed responsibility "${resp.title}" in ${args.sessionLabel}.`,
          subject_id: resp.id,
          ...(resp.evidence_quote ? { evidence: resp.evidence_quote } : {}),
        });
      }
      const labels = [...resp.tasks.delegatable, ...resp.tasks.approval, ...resp.tasks.not_delegatable];
      for (const label of labels) {
        const taskKey = `${personId}::${resp.id}::${label.trim().toLowerCase()}`;
        if (exceptionKeys.has(taskKey)) continue;
        const detail = resp.taskDetails?.find((task) => task.name.trim().toLowerCase() === label.trim().toLowerCase());
        events.push({
          id: `EVT-${Date.now().toString(36)}-session-review-${seq++}`,
          type: "provenance_confirmed",
          actor,
          timestamp,
          summary: `Session review confirmed task "${label}" in ${args.sessionLabel}.`,
          subject_id: taskKey,
          ...(detail?.evidence_quote || resp.evidence_quote ? { evidence: detail?.evidence_quote || resp.evidence_quote } : {}),
        });
      }
    }
  }
  return events;
}

const CONTEXT_UPLOAD_PREFIX = "uploaded-context:";
const CONNECTED_CONTEXT_PREFIX = "connected-context:";

type ContextConnector = {
  name: string;
  label: string;
  description: string;
  kind: "upload" | "coming-soon";
  bucket?: CompanyContextDocumentBucket;
  icon: string;
  match: string[];
};

const CONTEXT_CONNECTORS: ContextConnector[] = [
  {
    name: "SOD documents",
    label: "SOD docs",
    description: "Segregation matrices, conflicts, attestation evidence.",
    kind: "upload",
    bucket: "segregation_of_duties",
    icon: "shield",
    match: ["sod", "segregation"],
  },
  {
    name: "Saviant",
    label: "Saviant",
    description: "Segregation-of-duties rules and access conflicts.",
    kind: "coming-soon",
    icon: "shield",
    match: ["saviant"],
  },
  {
    name: "Okta",
    label: "Okta",
    description: "Groups, roles, apps, and identity context.",
    kind: "coming-soon",
    icon: "lock",
    match: ["okta"],
  },
  {
    name: "Microsoft Entra ID",
    label: "Entra ID",
    description: "Directory, roles, groups, and app assignments.",
    kind: "coming-soon",
    icon: "network",
    match: ["microsoft entra", "entra", "intra", "azure ad"],
  },
  {
    name: "Policy documents",
    label: "Policies",
    description: "SOPs, approval policies, risk and compliance notes.",
    kind: "upload",
    bucket: "policy",
    icon: "doc",
    match: ["policy", "sop", "approval", "compliance"],
  },
  {
    name: "Knowledge base",
    label: "Knowledge",
    description: "Team docs, operating notes, goals, and initiative context.",
    kind: "upload",
    bucket: "knowledge",
    icon: "doc",
    match: ["google drive", "sharepoint", "notion", "confluence", "knowledge base"],
  },
];

function uniqueText(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function mergeResearchSources(existing: CompanyResearchSource[] = [], incoming: CompanyResearchSource[] = []): CompanyResearchSource[] {
  const byUrl = new Map<string, CompanyResearchSource>();
  for (const source of [...existing, ...incoming]) {
    const key = source.url || source.title || source.snippet;
    if (!key) continue;
    byUrl.set(key, source);
  }
  return [...byUrl.values()];
}

function mergeContextDocuments(existing: CompanyContextDocument[] = [], incoming: CompanyContextDocument[] = []): CompanyContextDocument[] {
  const byId = new Map<string, CompanyContextDocument>();
  for (const doc of [...existing, ...incoming]) {
    if (!doc.id) continue;
    byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

function isReadableContextFile(file: File): boolean {
  return file.type.startsWith("text/")
    || file.type.includes("json")
    || /\.(csv|json|md|markdown|txt|yml|yaml)$/i.test(file.name);
}

async function readContextFile(file: File, bucket: CompanyContextDocumentBucket): Promise<{ document: CompanyContextDocument; source: CompanyResearchSource; rawNote: string }> {
  const uploadedAt = new Date().toISOString();
  let text = "";
  if (isReadableContextFile(file)) {
    try {
      text = (await file.text()).trim();
    } catch {
      text = "";
    }
  }
  const documentId = `${bucket}:${file.name}:${file.size}:${file.lastModified}`;
  const sourceId = CONTEXT_UPLOAD_PREFIX + encodeURIComponent(documentId);
  const marker = `[Uploaded ${contextBucketLabel(bucket)} file: ${file.name}]`;
  const readableText = compactWhitespace(text).slice(0, 6000);
  const snippet = readableText
    ? `${formatFileSize(file.size)} - ${readableText.slice(0, 220)}`
    : `${formatFileSize(file.size)} - uploaded ${uploadedAt}`;

  return {
    document: {
      id: documentId,
      bucket,
      fileName: file.name,
      title: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
      text: readableText || "Content extraction pending. Upload a text file to make this source available to generated agents.",
      uploadedAt,
      sourceId,
    },
    source: {
      url: sourceId,
      title: file.name,
      snippet,
      source_type: "manual",
    },
    rawNote: readableText
      ? `${marker}\n${readableText}`
      : `${marker}\n${formatFileSize(file.size)} file uploaded. Content extraction is pending.`,
  };
}

function contextBucketLabel(bucket: CompanyContextDocumentBucket): string {
  if (bucket === "segregation_of_duties") return "segregation of duties";
  if (bucket === "policy") return "policy";
  return "knowledge";
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export default function App() {
  const [themePref, setThemePref, resolvedTheme] = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("login");
  const [tab, setTab] = useState<Tab>("orgmap");

  const [people, setPeople] = useState<Person[]>([]);
  const [pedigree, setPedigree] = useState<PedigreeState>({});
  const [workspaceName, setWorkspaceName] = useState("Untitled Workspace");
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [companyContext, setCompanyContext] = useState<CompanyContext | undefined>(undefined);
  const [contextWarning, setContextWarning] = useState<string | undefined>(undefined);
  const [taskSpecs, setTaskSpecs] = useState<Record<string, TaskSpec>>({});
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [mcpLibrary, setMcpLibrary] = useState<CompanyMcpServer[]>([]);
  const [registry, setRegistry] = useState<AgentRegistryEntry[]>([]);
  const [auditLog, setAuditLog] = useState<StackAuditRecord[]>([]);
  const [events, setEvents] = useState<WorkspaceAuditEvent[]>([]);
  const [discoveryPlan, setDiscoveryPlan] = useState<DiscoveryPlan | null>(null);
  const [discoveryJustCompleted, setDiscoveryJustCompleted] = useState(false);
  const [sessionBriefs, setSessionBriefs] = useState<SessionBrief[]>([]);
  const [questionBacklog, setQuestionBacklog] = useState<QuestionBacklogItem[]>([]);
  const [meetings, setMeetings] = useState<RegisteredMeeting[]>([]);
  const [signalLedger, setSignalLedger] = useState<StackSignal[]>([]);
  const [rosterValidatedAt, setRosterValidatedAt] = useState<string | undefined>(undefined);
  const [respView, setRespView] = useState<"matrix" | "map" | null>(null); // null = auto by maturity
  const [memberPersonId, setMemberPersonId] = useState<string | null>(null);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStartStep, setTourStartStep] = useState<string | undefined>("upload-team");
  const [aiTaskRefinementAvailable, setAiTaskRefinementAvailable] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [wizardPersonId, setWizardPersonId] = useState<string | null>(null);
  const [orgSyncOpen, setOrgSyncOpen] = useState(false);
  const [createAgentCtx, setCreateAgentCtx] = useState<CreateAgentCtx | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentRecord | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (t1: string, t2?: string, green?: boolean) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, t1, t2, green }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3800);
  };

  const metrics = useMemo(() => computeMetrics(people, pedigree), [people, pedigree]);
  const selectedPerson = useMemo(() => people.find((p) => p.id === selectedId), [people, selectedId]);
  const recommended = useMemo(() => computeNextRecommendedSessions(people, pedigree), [people, pedigree]);
  const topDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    return counts.size > 1 ? "All" : [...counts.keys()][0] ?? "";
  }, [people]);
  const tourUserKey = profile?.email ?? profile?.name ?? "anon";

  const openWorkspaceState = (ws: { id: string; name: string; people: Person[]; pedigree: PedigreeState; companyContext?: CompanyContext; contextWarning?: string; taskSpecs?: Record<string, TaskSpec>; workflowTemplates?: WorkflowTemplate[]; mcpLibrary?: CompanyMcpServer[]; registry?: AgentRegistryEntry[]; auditLog?: StackAuditRecord[]; events?: WorkspaceAuditEvent[]; discoveryPlan?: DiscoveryPlan; sessionBriefs?: SessionBrief[]; questionBacklog?: QuestionBacklogItem[]; meetings?: RegisteredMeeting[]; signalLedger?: StackSignal[]; rosterValidatedAt?: string }) => {
    setPeople(ws.people);
    setPedigree(ws.pedigree);
    setWorkspaceName(ws.name);
    setCurrentWorkspaceId(ws.id);
    setCompanyContext(ws.companyContext);
    setContextWarning(ws.contextWarning);
    setTaskSpecs(ws.taskSpecs ?? {});
    setWorkflowTemplates(ws.workflowTemplates ?? []);
    setMcpLibrary(ws.mcpLibrary ?? []);
    setRegistry(ws.registry ?? []);
    setAuditLog(ws.auditLog ?? []);
    setEvents(ws.events ?? []);
    // The discovery plan is a first-class object: generate it the moment
    // people are loaded; regenerate non-destructively when one exists.
    const plan = generatePlan(ws.people, ws.pedigree, ws.companyContext, ws.discoveryPlan);
    setDiscoveryPlan(plan);
    setSessionBriefs(ws.sessionBriefs ?? []);
    setQuestionBacklog(ws.questionBacklog ?? []);
    setMeetings(ws.meetings ?? []);
    setSignalLedger(ws.signalLedger ?? []);
    setRosterValidatedAt(ws.rosterValidatedAt);
    setCompanyProfileOpen(false);
    setSelectedId(null);
    setDrawerOpen(false);
    setScreen("workspace");
    // State-based default: the workspace opens to the surface that matches
    // the company's maturity — never the org map before there is data to
    // overlay on it. (docs/ux-reset-plan.md)
    const stage = deriveStage({
      people: ws.people,
      pedigree: ws.pedigree,
      readiness: computeReadiness(ws.companyContext, ws.companyContext?.contextDocuments ?? [], ws.people),
      rosterValidatedAt: ws.rosterValidatedAt,
      discoveryPlan: plan,
      reviewQueueCount: buildReviewQueue(ws.people, ws.pedigree).length,
      questionBacklog: ws.questionBacklog ?? [],
      registry: ws.registry ?? [],
      agentsBuilt: ws.people.reduce((n, p) => n + (ws.pedigree[p.id]?.agents.length ?? 0), 0),
    });
    setTab(SURFACE_TAB[defaultSurface(stage)]);
  };

  // Bootstrap: restore session, list this user's companies, resume the last one.
  useEffect(() => {
    const p = loadProfile();
    if (!p) {
      setScreen("login");
      setBooting(false);
      return;
    }
    setProfile(p);
    setWorkspaces(listWorkspaces(p.email));
    const lastId = getLastWorkspaceId(p.email);
    if (lastId) {
      loadWorkspace(lastId)
        .then((ws) => {
          if (ws && ws.people.length) openWorkspaceState(ws);
          else setScreen("home");
        })
        .finally(() => setBooting(false));
    } else {
      setScreen("home");
      setBooting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booting) return;
    void taskEnrichmentAvailable().then(setAiTaskRefinementAvailable).catch(() => setAiTaskRefinementAvailable(false));
  }, [booting]);

  // Persist the active workspace by its own id whenever it changes.
  // Debounced: bursts of state updates (digest applies, guided-capture
  // sessions, member confirms) collapse into one localStorage/Supabase write.
  useEffect(() => {
    if (booting) return;
    if (!(currentWorkspaceId && people.length && profile)) return;
    const handle = setTimeout(() => {
      void saveWorkspace(
        { id: currentWorkspaceId, name: workspaceName, people, pedigree, companyContext, contextWarning, taskSpecs, workflowTemplates, mcpLibrary, registry, auditLog, events, discoveryPlan: discoveryPlan ?? undefined, sessionBriefs, questionBacklog, meetings, signalLedger, rosterValidatedAt, createdAt: new Date().toISOString() },
        profile.email,
      );
    }, 800);
    return () => clearTimeout(handle);
  }, [people, pedigree, workspaceName, companyContext, contextWarning, taskSpecs, workflowTemplates, mcpLibrary, registry, auditLog, events, discoveryPlan, sessionBriefs, questionBacklog, meetings, signalLedger, rosterValidatedAt, currentWorkspaceId, profile, booting]);

  const refreshWorkspaces = (email?: string) => setWorkspaces(listWorkspaces(email ?? profile?.email));

  const onSignIn = (p: UserProfile) => {
    saveProfile(p);
    setProfile(p);
    setWorkspaces(listWorkspaces(p.email));
    setScreen("home");
  };

  const onSignOut = () => {
    clearProfile();
    setProfile(null);
    setPeople([]);
    setPedigree({});
    setCurrentWorkspaceId(null);
    setCompanyContext(undefined);
    setContextWarning(undefined);
    setTaskSpecs({});
    setWorkflowTemplates([]);
    setWorkspaces([]);
    setScreen("login");
  };

  const exitToHome = () => {
    setLastWorkspaceId(profile?.email, null);
    setCurrentWorkspaceId(null);
    refreshWorkspaces();
    setScreen("home");
  };

  const openWorkspace = (id: string) => {
    loadWorkspace(id).then((ws) => {
      if (ws) {
        openWorkspaceState(ws);
        setLastWorkspaceId(profile?.email, id);
      } else {
        pushToast("Could not open company", "It may have been removed");
        refreshWorkspaces();
      }
    });
  };

  const onDeleteWorkspace = (id: string) => {
    void deleteWorkspace(id, profile?.email);
    if (currentWorkspaceId === id) setCurrentWorkspaceId(null);
    refreshWorkspaces();
  };

  const persistCompanyContext = (ctx: CompanyContext) => {
    const bound = currentWorkspaceId ? bindCompanyContext(ctx, currentWorkspaceId, workspaceName) ?? ctx : ctx;
    if (currentWorkspaceId) assertContextMatchesCompany(bound, currentWorkspaceId, workspaceName);
    setCompanyContext(bound);
    setContextWarning(undefined);
    if (currentWorkspaceId) {
      void saveWorkspace({ id: currentWorkspaceId, name: workspaceName, people, pedigree, companyContext: bound, contextWarning: undefined, taskSpecs, workflowTemplates, mcpLibrary, registry, auditLog, events, discoveryPlan: discoveryPlan ?? undefined, sessionBriefs, questionBacklog, meetings, signalLedger, rosterValidatedAt, createdAt: new Date().toISOString() }, profile?.email);
    }
  };

  const onSaveCompanyProfile = (ctx: CompanyContext) => {
    persistCompanyContext(ctx);
    // The free win: governance rules that name an authority holder write
    // approval authority onto matching people (trust-ordered, evidence-bound).
    const writes = deriveAuthorityFromRules(getGovernanceRules(ctx), people);
    if (writes.length) {
      setPeople((prev) => prev.map((person) => {
        const mine = writes.filter((w) => w.person_id === person.id);
        if (!mine.length) return person;
        let authority = person.authority ?? { system_grants: [], approval_authority: [], sod_roles: [], updated_at: new Date().toISOString() };
        for (const write of mine) authority = mergeApprovalAuthority(authority, person.id, write.authority).profile;
        return { ...person, authority };
      }));
    }
    // Re-rank the plan: bottleneck/goal mentions change the session order.
    setDiscoveryPlan((prev) => generatePlan(people, pedigree, ctx, prev ?? undefined));
    setScreen("workspace");
    pushToast("Company profile saved", `Grounds discovery and agent generation${writes.length ? ` · ${writes.length} rule-derived authority grant${writes.length === 1 ? "" : "s"} recorded` : ""}`, true);
  };

  const onUploadContextFiles = async (files: FileList | null, bucket: CompanyContextDocumentBucket) => {
    if (!files?.length) return;
    const current = companyContext ?? emptyCompanyContext(currentWorkspaceId ?? "", workspaceName);
    const uploads = await Promise.all(Array.from(files).map((file) => readContextFile(file, bucket)));
    const newNotes = uploads
      .map((upload) => upload.rawNote)
      .filter((note) => note && !(current.rawNotes ?? "").includes(note.split("\n")[0]));
    const next: CompanyContext = {
      ...current,
      rawNotes: [current.rawNotes?.trim(), ...newNotes].filter(Boolean).join("\n\n"),
      researchSources: mergeResearchSources(current.researchSources, uploads.map((upload) => upload.source)),
      contextDocuments: mergeContextDocuments(current.contextDocuments, uploads.map((upload) => upload.document)),
      updatedAt: new Date().toISOString(),
    };
    persistCompanyContext(next);
    pushToast("Context files loaded", `${uploads.length} ${contextBucketLabel(bucket)} file${uploads.length === 1 ? "" : "s"} added to the profile store`, true);
  };

  useEffect(() => {
    if (screen !== "workspace") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") setTab("spreadsheet");
      if (e.key === "2") setTab("orgmap");
      if (e.key === "3" && metrics.agentsBuilt > 0) setTab("agents");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, metrics.agentsBuilt]);

  // UX reset: the slideshow tour no longer auto-launches — the persistent
  // setup checklist guides setup instead. The tour stays available from the
  // Settings menu (onRestartTour).

  const createWorkspaceFromCsv = (text: string, fileName: string, nameOverride?: string) => {
    setUploadError(null);
    if (!text.trim()) {
      setUploadError("Could not read the file. Please try again.");
      return;
    }
    const result = parsePeopleCsv(text, fileName);
    if (result.errors.length) {
      setUploadError(result.errors.join("\n"));
      return;
    }
    const name = nameOverride || result.workspaceName;
    const id = newWorkspaceId(name);
    const ped = initialPedigreeState(result.people);
    const ctx: CompanyContext = emptyCompanyContext(id, name);
    const plan = generatePlan(result.people, ped, ctx);
    void saveWorkspace({ id, name, people: result.people, pedigree: ped, companyContext: ctx, taskSpecs: {}, workflowTemplates: [], discoveryPlan: plan, createdAt: new Date().toISOString() }, profile?.email);
    setLastWorkspaceId(profile?.email, id);
    openWorkspaceState({ id, name, people: result.people, pedigree: ped, companyContext: ctx, discoveryPlan: plan });
    refreshWorkspaces();
    const warn = result.warnings.length ? ` · ${result.warnings.length} warning(s)` : "";
    pushToast("Company created", `${result.people.length} people loaded${warn}`);
  };

  const onUploadText = (text: string, fileName: string) => createWorkspaceFromCsv(text, fileName);

  const onOpenDemo = async (demo: DemoCompany) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${demo.file}`);
      const text = await res.text();
      createWorkspaceFromCsv(text, demo.file, demo.label);
    } catch {
      setUploadError(`Could not load demo company "${demo.label}".`);
    }
  };

  const [wizardPlannedSessionId, setWizardPlannedSessionId] = useState<string | undefined>(undefined);

  const onStartSession = (personId: string | undefined, plannedSessionId?: string) => {
    if (!personId) return;
    setWizardPlannedSessionId(plannedSessionId);
    setWizardPersonId(personId);
    setDrawerOpen(false);
    setScreen("session"); // full-screen Session Workspace — not a modal
  };

  const onPlanEvent = (sessionId: string, status: Parameters<typeof setSessionStatus>[2], briefId?: string) => {
    setDiscoveryPlan((prev) => (prev ? setSessionStatus(prev, sessionId, status, briefId) : prev));
  };

  const onScheduleSession = (sessionId: string, schedule: SessionSchedule) => {
    setDiscoveryPlan((prev) => (prev ? setSessionSchedule(prev, sessionId, schedule) : prev));
  };

  // Stage 5 of the guided-discovery loop: apply → coverage update → question
  // ledger → plan adaptation. This is what makes session 3 smarter than session 1.
  const onApplyMapping = (args: ApplyMappingArgs) => {
    const beforeCompletion = discoveryCompletion(people, pedigree, questionBacklog);
    const exceptionKeys = new Set(args.exceptionKeys ?? []);
    const reviewer = profile?.email ?? "unknown";
    const next = applyParsed(people, args.parsed, pedigree, {
      scopeIds: args.scopeIds,
      sessionLabel: args.sessionLabel,
      people,
      confirmedBy: reviewer,
      exceptionKeys,
    });
    setPedigree(next);
    setEvents((prev) => [...prev, ...sessionReviewConfirmationEvents(args, reviewer, exceptionKeys)]);

    // Question ledger: resolve answered items, ingest new open questions and
    // unanswered/parked brief questions.
    let backlog = resolveBacklogFromParse(questionBacklog, args.parsed, args.scopeIds, args.plannedSessionId ?? args.sessionLabel);
    backlog = ingestParserOpenQuestions(backlog, args.parsed, args.scopeIds);
    if (args.brief) {
      backlog = ingestBriefOutcomes(backlog, args.brief, args.parkedNotes ?? [], args.brief.coverage_targets[0] ?? args.scopeIds[0]);
      setSessionBriefs((prev) => [...prev.filter((b) => b.id !== args.brief!.id), args.brief!]);
    }
    setQuestionBacklog(backlog);

    // Authority assertions ("I can approve refunds up to $2k") land in the
    // digest as review-gated proposals — never direct writes.
    const assertionSignals = authorityAssertionSignals(args.parsed, args.scopeIds, args.plannedSessionId ?? args.sessionLabel);
    if (assertionSignals.length) {
      setSignalLedger((prev) => ingestSignals(prev, assertionSignals).ledger);
    }

    // Plan: session applied → re-prioritize, propose targeted deep-dives,
    // flag thin sessions for a re-run.
    setDiscoveryPlan((prev) => {
      if (!prev) return prev;
      const applied = args.plannedSessionId ? setSessionStatus(prev, args.plannedSessionId, "applied", args.brief?.id) : prev;
      return adaptPlan({ plan: applied, people, pedigree: next, questionBacklog: backlog });
    });

    const afterCompletion = discoveryCompletion(people, next, backlog);
    setDiscoveryJustCompleted(!beforeCompletion.complete && afterCompletion.complete);
    const newQuestions = openBacklog(backlog).length - openBacklog(questionBacklog).length;
    pushToast("Discovery applied", `${args.scopeIds.length} people updated · ${args.sessionLabel}${newQuestions > 0 ? ` · ${newQuestions} open question${newQuestions === 1 ? "" : "s"} queued for the next brief` : ""}`, true);
  };

  // Joiner/mover/leaver: authority is only meaningful if it ends.
  const onLifecycleChange = (personId: string, status: PersonLifecycleStatus) => {
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, lifecycle: status } : p)));
    if (status === "offboarded") {
      const { registry: nextRegistry, suspended } = suspendAgentsForLeaver(registry, personId);
      setRegistry(nextRegistry);
      setEvents((prev) => [...prev, {
        id: `EVT-${Date.now().toString(36)}-lifecycle`,
        type: "person_lifecycle_changed",
        actor: profile?.email ?? "unknown",
        timestamp: new Date().toISOString(),
        summary: `${person.name} offboarded — ${suspended.length} agent${suspended.length === 1 ? "" : "s"} suspended. Reassignment proposals appear in the digest.`,
        subject_id: personId,
      }]);
      pushToast(`${person.name} offboarded`, suspended.length ? `${suspended.length} owned agent${suspended.length === 1 ? "" : "s"} suspended — no agent stays deployed with an offboarded owner` : "No owned agents to suspend", true);
    } else if (status === "transitioning") {
      setRegistry((prev) => flagAgentsForMover(prev, personId));
      setEvents((prev) => [...prev, {
        id: `EVT-${Date.now().toString(36)}-lifecycle`,
        type: "person_lifecycle_changed",
        actor: profile?.email ?? "unknown",
        timestamp: new Date().toISOString(),
        summary: `${person.name} marked transitioning — authority profile stale, owned agents flagged for re-review.`,
        subject_id: personId,
      }]);
      pushToast(`${person.name} transitioning`, "Owned agents flagged owner_role_changed", true);
    } else {
      pushToast(`${person.name} active`, "Lifecycle restored");
    }
  };

  const onPersonChange = (person: Person) => {
    setPeople((prev) => prev.map((p) => (p.id === person.id ? person : p)));
    setEvents((prev) => [...prev, {
      id: `EVT-${Date.now().toString(36)}-authority`,
      type: "authority_changed",
      actor: profile?.email ?? "unknown",
      timestamp: new Date().toISOString(),
      summary: `Authority profile updated for ${person.name} (${person.authority?.system_grants.length ?? 0} grants, ${person.authority?.approval_authority.length ?? 0} approval domains).`,
      subject_id: person.id,
    }]);
  };

  const onDigestStateChange = (patch: DigestStatePatch) => {
    if (patch.meetings) setMeetings(patch.meetings);
    if (patch.ledger) setSignalLedger(patch.ledger);
    if (patch.pedigree) setPedigree(patch.pedigree);
    if (patch.registry) setRegistry(patch.registry);
    if (patch.backlog) setQuestionBacklog(patch.backlog);
    if (patch.companyContext) setCompanyContext(currentWorkspaceId ? bindCompanyContext(patch.companyContext, currentWorkspaceId, workspaceName) : patch.companyContext);
    if (patch.auditLog) setAuditLog(patch.auditLog);
    if (patch.people) setPeople(patch.people);
    if (patch.events?.length) setEvents((prev) => [...prev, ...patch.events!]);
  };

  const onMemberStateChange = (patch: MemberStatePatch) => {
    if (patch.ledger) setSignalLedger(patch.ledger);
    if (patch.pedigree) setPedigree(patch.pedigree);
    if (patch.registry) setRegistry(patch.registry);
    if (patch.backlog) setQuestionBacklog(patch.backlog);
    if (patch.people) setPeople(patch.people);
    if (patch.events?.length) setEvents((prev) => [...prev, ...patch.events!]);
  };

  const openMyPedigree = () => {
    const me = people.find((p) => p.email.toLowerCase() === (profile?.email ?? "").toLowerCase());
    setMemberPersonId(me?.id ?? people[0]?.id ?? null);
    if (me || people.length) setScreen("member");
    else pushToast("No people loaded", "Upload a team first");
  };

  const onGenerateAgent = async (ctx: GenerateCtx) => {
    const row = pedigree[ctx.person.id];
    if (!row) return;
    const spec = taskSpecs[ctx.task.id];
    const operationalState = deriveOperationalState(ctx.task, spec, row.agents.find((agent) => agent.taskId === ctx.task.id));
    if (operationalState !== "agent_ready") {
      pushToast("Workflow incomplete", "Complete the task spec and add a test case before generating an agent.");
      setCreateAgentCtx(null);
      return;
    }
    const baseCtx = {
      person: ctx.person, row, task: ctx.task, respTitle: ctx.respTitle,
      agentName: ctx.agentName, policy: ctx.policy, riskLevel: ctx.riskLevel,
      lifecycleClass: ctx.lifecycleClass,
      companyContext,
    };

    let authored: AgentConstructionSpec | null = null;
    if (ctx.aiAuthored) {
      // Deterministic build first to get the governance seeds, then let GPT-5.5 construct the richer spec.
      const seed = buildAgentArtifacts(baseCtx);
      setCreateAgentCtx(null);
      pushToast("Constructing with GPT-5.5...", "Grounding in company profile + responsibility");
      authored = await authorAgent({
        agentName: ctx.agentName,
        person: { name: ctx.person.name, title: ctx.person.title, department: ctx.person.department, email: ctx.person.email, tools: ctx.person.tools },
        responsibility: { title: ctx.respTitle },
        task: { label: ctx.task.label },
        allowed: seed.allowed,
        approval: seed.approval,
        blocked: seed.blocked,
        mcp: seed.mcp.map((m) => ({ name: m.name, scope: m.recommended_scope })),
        company_context: companyContext,
        policy: ctx.policy,
        riskLevel: ctx.riskLevel,
      });
    }

    const buildCtx = { ...baseCtx, authored };
    const artifacts = buildAgentArtifacts(buildCtx);
    const agent = newAgentRecord(buildCtx, artifacts);
    agent.generatedBy = profile?.email;
    setEvents((prev) => [...prev, {
      id: `EVT-${Date.now().toString(36)}-gen`,
      type: "agent_generated" as const,
      actor: profile?.email ?? "unknown",
      timestamp: new Date().toISOString(),
      summary: `Generated ${agent.name} for ${ctx.person.name} (${authored ? "AI construction" : "standard template"}).`,
      subject_id: String((agent.manifest as Record<string, unknown>)?.agent_id ?? agent.id),
      ...(ctx.task.evidence ? { evidence: ctx.task.evidence } : {}),
    }]);
    setPedigree((prev) => {
      const nextRow = { ...prev[ctx.person.id] };
      nextRow.agents = [...nextRow.agents, agent];
      nextRow.status = "generated";
      return { ...prev, [ctx.person.id]: nextRow };
    });
    setActiveAgent(agent);
    setCreateAgentCtx(null);
    setScreen("manifest");
    pushToast("Agent generated", `${agent.name} - ${authored ? "constructed by GPT-5.5" : "standard template"} - owner ${ctx.person.name}`, true);
  };

  const onSelect = (id: string) => {
    if (selectedId === id && drawerOpen) {
      setDrawerOpen(false);
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const onOpenProfile = (id: string) => {
    setProfileId(id);
    setDrawerOpen(false);
    setScreen("profile");
  };

  const onApplyOrgSync = (parsed: ParsedMap, changeset: Changeset, approvedIds: string[], stackProposals: StackChangeProposal[]) => {
    const approver = profile?.email ?? "unknown";
    const merged = applyOrgSync(people, pedigree, parsed, changeset, new Set(approvedIds));
    const decided = stackProposals.map((p) => ({
      ...p,
      decision: { by: approver, at: p.decision?.at ?? new Date().toISOString(), action: "applied" as const },
    }));
    const result = applyStackProposals({
      proposals: decided,
      approver,
      people,
      pedigree: merged,
      companyContext,
      registry,
      auditLog,
    });
    setPedigree(result.pedigree);
    if (result.companyContext) setCompanyContext(currentWorkspaceId ? bindCompanyContext(result.companyContext, currentWorkspaceId, workspaceName) : result.companyContext);
    if (result.people) setPeople(result.people);
    setRegistry(result.registry);
    setAuditLog(result.auditLog);
    setOrgSyncOpen(false);
    // P1-2: make the downstream manifest impact visible, not a separate hunt.
    const impactedAgents = Array.from(new Set(decided.flatMap((p) => p.affected.agent_ids)));
    pushToast(
      "Org Sync applied",
      `${approvedIds.length} people updated · ${result.applied} stack change${result.applied === 1 ? "" : "s"}${impactedAgents.length ? ` · ${impactedAgents.length} agent${impactedAgents.length === 1 ? "" : "s"} marked needs re-review (Agents tab)` : ""} · audit recorded`,
      true,
    );
  };

  const onExport = () => {
    const csv = exportEnrichedCsv(people, pedigree);
    downloadFile(`${workspaceName.toLowerCase().replace(/\s+/g, "-")}-pedigree.csv`, csv, "text/csv");
    pushToast("CSV exported", "Enriched spreadsheet downloaded", true);
  };

  const onAdvanceTourFromHome = (nextStepId: string) => {
    recordOnboardingStep(tourUserKey, "home", nextStepId);
    setTourStartStep(nextStepId);
    setTourOpen(false);
    pushToast("Tour paused", "Upload a team or open a demo company to continue");
  };

  const onCompleteTour = () => {
    completeOnboarding(tourUserKey, currentWorkspaceId ?? "home");
    setTourOpen(false);
    pushToast("Tour complete", "You're ready to build governed agents", true);
  };

  const onSkipTour = () => {
    skipOnboarding(tourUserKey, currentWorkspaceId ?? "home");
    setTourOpen(false);
    pushToast("Tour skipped", "Restart it from Settings whenever you want");
  };

  const onRestartTour = () => {
    resetOnboarding(tourUserKey, currentWorkspaceId ?? "home");
    setTourStartStep(screen === "home" ? "upload-team" : "company-profile");
    setTourOpen(true);
  };

  const allAgents = useMemo(() => people.flatMap((p) => pedigree[p.id]?.agents ?? []), [people, pedigree]);
  const reviewQueueCount = useMemo(() => buildReviewQueue(people, pedigree).length, [people, pedigree]);
  const openBacklogCount = useMemo(() => openBacklog(questionBacklog).length, [questionBacklog]);
  const userRole = profile?.role ?? "reviewer";

  const switchToReviewerDemo = () => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next: UserProfile = { ...prev, role: "reviewer" as UserRole };
      saveProfile(next);
      return next;
    });
    pushToast("Reviewer mode enabled", "Demo role switched so you can confirm extracted findings", true);
  };

  const onConfirmReview = (items: ReviewQueueItem[]) => {
    const result = confirmReviewItems(pedigree, items, profile?.email ?? "unknown");
    setPedigree(result.pedigree);
    setEvents((prev) => [...prev, ...result.events]);
  };

  const onEditReview = (item: ReviewQueueItem, patch: ReviewEditPatch) => {
    const newLabel = patch.label;
    const result = editReviewItem(pedigree, item, patch, profile?.email ?? "unknown");
    setPedigree(result.pedigree);
    setEvents((prev) => [...prev, result.event]);
    pushToast("Edited and confirmed", `"${newLabel}" — the correction is itself a confirmation`, true);
  };

  const onAddReviewQuestion = (personId: string, question: string, sourceRef: string) => {
    const clean = question.trim();
    if (!clean) return;
    setQuestionBacklog((prev) => {
      const key = clean.toLowerCase().replace(/\s+/g, " ");
      if (prev.some((item) => item.person_id === personId && item.question.trim().toLowerCase().replace(/\s+/g, " ") === key)) return prev;
      return [...prev, {
        id: `QB-${Date.now().toString(36)}-review`,
        person_id: personId,
        question: clean,
        source: "parser_open_question",
        source_ref: sourceRef,
        created_at: new Date().toISOString(),
      }];
    });
    pushToast("Follow-up queued", clean, true);
  };

  const onRefineReviewTasks = async (items: ReviewQueueItem[]) => {
    const tasks = items.filter((item) => item.kind === "task");
    if (!tasks.length) return;
    const drafts = await requestTaskEnrichment({
      companyContext,
      tasks: tasks.map((item) => {
        const owner = people.find((p) => p.id === item.personId);
        return {
          taskId: item.itemId,
          label: item.label,
          description: item.description,
          reviewer_note: item.reviewer_note,
          completion: item.completion,
          evidence_quote: item.provenance.evidence_quote,
          responsibility: item.respTitle ?? "",
          owner: {
            name: item.personName,
            title: owner?.title ?? "",
            department: item.department,
          },
        };
      }),
    });
    if (!drafts?.length) return;
    setTaskSpecs((prev) => {
      const next = { ...prev };
      for (const draft of drafts) {
        const item = tasks.find((task) => task.itemId === draft.taskId);
        if (!item) continue;
        const existing = prev[draft.taskId];
        next[draft.taskId] = {
          id: draft.taskId,
          name: item.label,
          plainLanguageDescription: draft.plainLanguageDescription,
          ownerId: item.personId,
          parentResponsibilityId: item.respId ?? "",
          trigger: existing?.trigger ?? "manual",
          cadence: existing?.cadence,
          inputSources: draft.suggestedInputs,
          requiredTools: draft.suggestedTools,
          outputFormat: draft.suggestedOutputs.join("; ") || existing?.outputFormat || "Draft for owner review",
          recipient: existing?.recipient,
          definitionOfDone: draft.definitionOfDone,
          aiAllowedTo: existing?.aiAllowedTo ?? ["draft"],
          aiMustNot: existing?.aiMustNot ?? ["send externally", "make final approval decisions"],
          approvalRequiredFor: existing?.approvalRequiredFor ?? ["external sends", "authority-expanding actions"],
          businessKpi: existing?.businessKpi,
          operationalMetric: existing?.operationalMetric,
          evidenceIds: item.provenance.evidence_quote ? [item.itemId] : [],
          workflowTemplateId: existing?.workflowTemplateId,
          workflowMatchConfidence: existing?.workflowMatchConfidence,
          testCases: existing?.testCases,
          readiness: "needs_clarification",
        };
      }
      return next;
    });
    setQuestionBacklog((prev) => {
      const next = [...prev];
      for (const draft of drafts) {
        const item = tasks.find((task) => task.itemId === draft.taskId);
        if (!item) continue;
        for (const question of draft.openQuestions) {
          const clean = question.trim();
          if (!clean) continue;
          const key = clean.toLowerCase().replace(/\s+/g, " ");
          if (next.some((q) => q.person_id === item.personId && q.question.trim().toLowerCase().replace(/\s+/g, " ") === key)) continue;
          next.push({
            id: `QB-${Date.now().toString(36)}-${next.length}-enrich`,
            person_id: item.personId,
            question: clean,
            source: "parser_open_question",
            source_ref: item.itemId,
            created_at: new Date().toISOString(),
          });
        }
      }
      return next;
    });
    pushToast("AI drafts added", `${drafts.length} task spec${drafts.length === 1 ? "" : "s"} drafted for review`, true);
  };

  const onUpdateReviewTaskSpec = (taskId: string, patch: Partial<TaskSpec>) => {
    setTaskSpecs((prev) => {
      const existing = prev[taskId];
      if (!existing) return prev;
      return { ...prev, [taskId]: { ...existing, ...patch } };
    });
  };

  // Recompute registry staleness whenever an ingredient (person record, task,
  // company context, governance docs, MCP library) changes — and enforce the
  // leaver invariant: no agent stays deployed under an offboarded owner.
  useEffect(() => {
    if (booting) return;
    setRegistry((prev) => {
      if (!prev.length) return prev;
      const byId = new Map(allAgents.map((a) => [String((a.manifest as Record<string, unknown> | undefined)?.agent_id ?? a.id), a]));
      const refreshed = refreshStaleness(prev, byId, companyContext, mcpLibrary);
      const { registry: enforced, suspended } = enforceLeaverInvariant(refreshed, people);
      return suspended.length ? enforced : refreshed;
    });
  }, [allAgents, companyContext, mcpLibrary, people, booting]);

  const readiness = useMemo(
    () => computeReadiness(companyContext, companyContext?.contextDocuments ?? [], people),
    [companyContext, people],
  );
  const discoveryCompletionState = useMemo(() => discoveryCompletion(people, pedigree, questionBacklog), [people, pedigree, questionBacklog]);
  const planPendingCount = discoveryPlan?.sessions.filter((s) => s.status !== "applied").length ?? 0;
  const appliedSessionCount = discoveryPlan?.sessions.filter((s) => s.status === "applied").length ?? 0;
  const nextPendingSession = discoveryPlan?.sessions.find((s) => s.status !== "applied");
  const digestPendingCount = pendingSignals(signalLedger).length;
  const recommendations = useMemo(
    () => buildRecommendations({ ledger: signalLedger, registry, people, pedigree, mcpLibrary }),
    [signalLedger, registry, people, pedigree, mcpLibrary],
  );

  // ── Maturity ladder: the app always knows which state the company is in ──
  const maturityInput: MaturityInput = useMemo(() => ({
    people, pedigree, readiness, rosterValidatedAt, discoveryPlan,
    reviewQueueCount, questionBacklog, registry, agentsBuilt: metrics.agentsBuilt,
  }), [people, pedigree, readiness, rosterValidatedAt, discoveryPlan, reviewQueueCount, questionBacklog, registry, metrics.agentsBuilt]);
  const stage = useMemo(() => deriveStage(maturityInput), [maturityInput]);
  const inSetup = ["validate_roster", "add_context", "run_sessions", "review_findings"].includes(stage);
  const action = useMemo(() => nextAction(stage, maturityInput), [stage, maturityInput]);
  const checklist = useMemo(() => setupChecklist(stage), [stage]);
  const headerMetrics = useMemo(() => stageMetrics(stage, maturityInput), [stage, maturityInput]);
  const orgMapEarned = useMemo(() => canDefaultToOrgMap(maturityInput), [maturityInput]);

  const navigateToSurface = (target: ReturnType<typeof nextAction>["target"]) => {
    if (target.kind === "screen") {
      setScreen(target.screen);
    } else {
      setScreen("workspace");
      setTab(SURFACE_TAB[target.tab]);
    }
  };

  // One primary CTA, routed by state. For run_sessions it goes straight into
  // the next planned session instead of just landing on the Discovery tab.
  const onPrimaryCta = () => {
    if (stage === "run_sessions") {
      const next = discoveryPlan?.sessions.find((s) => s.status !== "applied");
      if (next) {
        onStartSession(next.anchor_person_id, next.id);
        return;
      }
    }
    navigateToSurface(action.target);
  };

  const onChecklistNavigate = (target: CompanyStage) => navigateToSurface(nextAction(target, maturityInput).target);

  const onValidateRoster = () => {
    setRosterValidatedAt(new Date().toISOString());
    pushToast("Roster validated", "Next: add company context so discovery questions are specific to this business", true);
    setScreen("company");
  };
  const wizardPerson = wizardPersonId ? people.find((p) => p.id === wizardPersonId) ?? null : null;
  const closeSessionWorkspace = () => {
    setWizardPersonId(null);
    setWizardPlannedSessionId(undefined);
    setDiscoveryJustCompleted(false);
    setScreen("workspace");
  };
  const goToReviewFromSession = () => {
    closeSessionWorkspace();
    setTab("review");
  };
  const startNextPendingSession = (session: DiscoveryPlan["sessions"][number]) => {
    setDiscoveryJustCompleted(false);
    onStartSession(session.anchor_person_id, session.id);
  };
  const discoveryComplete = metrics.peopleCount > 0 && metrics.mappedPeople === metrics.peopleCount;
  const companyTitle = companyContext?.company?.trim() || workspaceName;
  const companySubtitle = safeHeaderDescription(companyContext, currentWorkspaceId, workspaceName)
    || (discoveryComplete
      ? `Discovery complete - ${workspaceName} - use Org Sync to capture changes from new meetings`
      : `Company context not loaded yet - add goals, systems, policies, and SOD boundaries for future agents`);

  return (
    <div className="app">
      <Topbar
        screen={screen}
        workspaceName={workspaceName}
        agentName={activeAgent?.name}
        themePref={themePref}
        setThemePref={setThemePref}
        resolvedTheme={resolvedTheme}
        onHome={screen !== "login" ? exitToHome : undefined}
        onWorkspace={currentWorkspaceId ? () => setScreen("workspace") : undefined}
        userInitials={profile ? profile.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() : undefined}
        userName={profile?.name}
        onSignOut={profile ? onSignOut : undefined}
        onRestartOnboarding={profile ? onRestartTour : undefined}
      />

      {screen === "login" && <LoginScreen onSignIn={onSignIn} existingProfile={profile} />}

      {screen === "home" && profile && (
        <WorkspacesHome
          userName={profile.name}
          workspaces={workspaces}
          onOpen={openWorkspace}
          onDelete={onDeleteWorkspace}
          onUploadText={onUploadText}
          onOpenDemo={onOpenDemo}
          error={uploadError}
        />
      )}

      {screen === "workspace" && (
        <div className="workspace">
          <div className="workspace-header">
            <div
              className={"workspace-hero company-profile-row" + (companyProfileOpen ? " open" : "")}
            >
              <button
                type="button"
                className="company-profile-summary"
                aria-expanded={companyProfileOpen}
                aria-label="Toggle company profile"
                onClick={() => setCompanyProfileOpen((open) => !open)}
              >
                <div className="company-profile-title">
                  <h1>{companyTitle}</h1>
                  <Icon name={companyProfileOpen ? "chevron-down" : "chevron-right"} size={14} />
                  {companyContext?.confidence !== undefined && <span className="tag cyan">{Math.round((companyContext.confidence ?? 0) * 100)}%</span>}
                </div>
                <div className="subtitle">{companySubtitle}</div>
              </button>
              <div className="actions">
                <button data-tour="company-profile" className="btn btn-sm btn-ghost" onClick={() => setScreen("company")} title="The grounding context for discovery questions and agent generation"><Icon name="build" size={12} /> Company Context</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setScreen("mcplibrary")} title="The company's approved tool surface — agent grants are resolved from this registry"><Icon name="lock" size={12} /> Sources & Tools{mcpLibrary.length ? ` (${mcpLibrary.length})` : ""}</button>
                <button className="btn btn-sm btn-ghost" onClick={openMyPedigree} title="Your own slice of the stack: confirm tasks, see your agents in plain language, answer questions, request agents"><Icon name="user" size={12} /> My Pedigree</button>
                <button className="btn btn-sm btn-ghost" onClick={exitToHome} title="Switch company / back to all companies"><Icon name="network" size={12} /> Companies</button>
                {/* ONE state-routed primary action — the only saturated CTA on this surface. */}
                <button data-tour="map-responsibilities" className={["plan", "review", "spreadsheet"].includes(tab) ? "btn btn-ghost" : "btn btn-primary"} onClick={onPrimaryCta} title={action.hint}>
                  <Icon name="sparkles" size={12} /> {action.label}
                </button>
              </div>
              {contextWarning && (
                <div className="context-warning">
                  <Icon name="warning" size={12} /> {contextWarning}
                </div>
              )}
            </div>

            {/* Persistent setup checklist until the company reaches operation. */}
            {!setupComplete(stage) && <SetupChecklist items={checklist} onNavigate={onChecklistNavigate} />}

            {companyProfileOpen && (
              <CompanyProfileDropdown
                profile={companyContext}
                workspaceName={workspaceName}
                onEdit={() => setScreen("company")}
                onUploadContextFiles={onUploadContextFiles}
              />
            )}

            {/* Stage-aware metrics: only what is meaningful NOW — no zero-walls. */}
            {!["validate_roster", "add_context"].includes(stage) && appliedSessionCount > 0 && (
              <div className="metrics funnel" data-tour="delegatable-tasks">
                {headerMetrics.map((m, i) => (
                  <Metric key={m.label} label={m.label} value={m.value} delta={m.delta} up={m.up} arrow={i < headerMetrics.length - 1} />
                ))}
              </div>
            )}

            <div className="tabs" role="tablist">
              <button className="tab" role="tab" aria-selected={tab === "spreadsheet"} onClick={() => setTab("spreadsheet")} title="People & Roles — validate the roster, then track everyone's discovery status">
                <Icon name="spreadsheet" size={12} /> People <span className="count">{people.length}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "orgmap"} onClick={() => setTab("orgmap")} title={orgMapEarned ? "The responsibility matrix and map — owners, work, boundaries, agents" : "Org preview — becomes the responsibility map as discovery covers the org"}>
                <Icon name="network" size={12} /> Responsibilities <span className="count">{metrics.respMapped || people.length}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "plan"} onClick={() => setTab("plan")} title="The discovery campaign: session cascade, coverage, and the question backlog">
                <Icon name="target" size={12} /> Discovery <span className="count">{planPendingCount}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "review"} onClick={() => setTab("review")} title="Follow-ups: flagged or unconfirmed findings and open questions that need a decision">
                <Icon name="shield" size={12} /> Follow-ups <span className="count">{reviewQueueCount + openBacklogCount}</span>
              </button>
              <button className={"tab" + (metrics.delegTasks === 0 && metrics.agentsBuilt === 0 ? " disabled" : "")} role="tab" aria-selected={tab === "agents"} onClick={() => (metrics.delegTasks > 0 || metrics.agentsBuilt > 0) && setTab("agents")} title={metrics.delegTasks === 0 && metrics.agentsBuilt === 0 ? "Agent planning unlocks once tasks are extracted and classified" : "Plan agents under their human-owned responsibilities"}>
                <Icon name="robot" size={12} /> Agent Plan <span className="count">{metrics.agentsBuilt}</span>
              </button>
              {/* Data-driven gate: the maintenance loop appears once there is a mapped stack to maintain. */}
              {(signalLedger.length > 0 || metrics.mappedPeople > 0) && (
                <button className="tab" role="tab" aria-selected={tab === "digest"} onClick={() => setTab("digest")} title="The maintenance loop: meeting signals, weekly digest, freshness">
                  <Icon name="transcript" size={12} /> Digest <span className="count">{digestPendingCount}</span>
                </button>
              )}
              <button className="tab" role="tab" aria-selected={tab === "audit"} onClick={() => setTab("audit")} title="Evidence: who generated, confirmed, approved, exported — append-only">
                <Icon name="history" size={12} /> Evidence <span className="count">{events.length + auditLog.length}</span>
              </button>
              <span style={{ flex: 1 }} />
              <span className="kbd-hint">Tab <span className="k">1</span> People · <span className="k">2</span> Map</span>
            </div>
          </div>

          <div className="workspace-body">
            {tab === "spreadsheet" && (
              <Spreadsheet people={people} pedigree={pedigree} department={topDepartment} rosterValidated={Boolean(rosterValidatedAt)} onValidateRoster={onValidateRoster} plan={discoveryPlan} onOpenDiscovery={() => setTab("plan")} onSwitchTab={(t) => setTab(t as Tab)} onExport={onExport} selectedId={selectedId} onSelectRow={onSelect} />
            )}
            {tab === "orgmap" && (() => {
              const view = respView ?? (metrics.respMapped > 0 ? "matrix" : "map");
              return (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  <div className="resp-view-toolbar">
                    <button className={"btn btn-sm" + (view === "matrix" ? " btn-outline-cyan" : "")} onClick={() => setRespView("matrix")} title="The working surface: owner × responsibility × task classification with evidence">
                      <Icon name="spreadsheet" size={11} /> Matrix
                    </button>
                    <button className={"btn btn-sm" + (view === "map" ? " btn-outline-cyan" : "")} onClick={() => setRespView("map")} title={orgMapEarned ? "Responsibility map: owners, coverage, and agents over the org" : metrics.mappedPeople > 0 ? "Coverage map: who has been interviewed, which departments are covered" : "Org preview — the roster as a chart"}>
                      <Icon name="network" size={11} /> {orgMapEarned ? "Responsibility Map" : metrics.mappedPeople > 0 ? "Coverage Map" : "Org Preview"}
                    </button>
                    {view === "map" && !orgMapEarned && (
                      <span className="dim" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon name="info" size={11} /> Roster imported — responsibilities not mapped yet. The map lights up as sessions are applied; run the leadership session first.
                      </span>
                    )}
                  </div>
                  {view === "matrix" ? (
                    <ResponsibilityMatrix people={people} pedigree={pedigree} onCreateAgent={(ctx) => setCreateAgentCtx(ctx)} onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }} onStartSession={onStartSession} onSelectPerson={onSelect} />
                  ) : (
                    <OrgMap people={people} pedigree={pedigree} selectedId={selectedId} onSelectNode={onSelect} recommended={recommended} onStartSession={onStartSession} />
                  )}
                </div>
              );
            })()}
            {tab === "plan" && (
              <DiscoveryPlanPanel
                plan={discoveryPlan}
                people={people}
                pedigree={pedigree}
                backlog={questionBacklog}
                readiness={readiness}
                reviewQueueCount={reviewQueueCount}
                onStartSession={(personId, plannedSessionId) => onStartSession(personId, plannedSessionId)}
                onGoToReview={() => setTab("review")}
                onOpenCompanyProfile={() => setScreen("company")}
                onResolveBacklogItem={(itemId) => setQuestionBacklog((prev) => resolveBacklogItem(prev, itemId, "manual"))}
                onSelectPerson={onSelect}
              />
            )}
            {tab === "agents" && <AgentPlan people={people} pedigree={pedigree} registry={registry} recommendations={recommendations} onCreateAgent={(ctx) => setCreateAgentCtx(ctx)} onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }} />}
            {tab === "review" && <ReviewInbox people={people} pedigree={pedigree} taskSpecs={taskSpecs} backlog={questionBacklog} events={events} role={userRole} canRefineWithAi={aiTaskRefinementAvailable} onConfirm={onConfirmReview} onEdit={onEditReview} onPlanAgents={() => setTab("agents")} onSwitchToReviewerDemo={switchToReviewerDemo} onAddFollowUpQuestion={onAddReviewQuestion} onResolveBacklogItem={(itemId) => setQuestionBacklog((prev) => resolveBacklogItem(prev, itemId, "manual"))} onSelectPerson={onSelect} onRefineTasks={onRefineReviewTasks} onUpdateTaskSpec={onUpdateReviewTaskSpec} onToast={pushToast} />}
            {tab === "digest" && (
              <DigestScreen
                people={people}
                pedigree={pedigree}
                registry={registry}
                meetings={meetings}
                ledger={signalLedger}
                backlog={questionBacklog}
                auditLog={auditLog}
                companyContext={companyContext}
                role={userRole}
                approverEmail={profile?.email ?? "unknown"}
                onChange={onDigestStateChange}
                onToast={pushToast}
                onOpenOrgSync={() => setOrgSyncOpen(true)}
              />
            )}
            {tab === "audit" && <AuditTrail events={events} stackAuditLog={auditLog} workspaceName={workspaceName} />}

            <Drawer
              open={drawerOpen}
              person={selectedPerson}
              state={selectedPerson ? pedigree[selectedPerson.id] : null}
              people={people}
              pedigree={pedigree}
              role={userRole}
              onClose={() => setDrawerOpen(false)}
              onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
              onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
              onStartSession={onStartSession}
              onOpenProfile={onOpenProfile}
              onPersonChange={onPersonChange}
              onLifecycleChange={onLifecycleChange}
            />
          </div>
        </div>
      )}

      {screen === "manifest" && (
        <ManifestScreen
          agent={activeAgent}
          row={activeAgent ? pedigree[activeAgent.person.id] ?? null : null}
          companyContext={companyContext}
          mcpLibrary={mcpLibrary}
          registry={registry}
          events={events}
          role={userRole}
          currentUserEmail={profile?.email}
          onRegistryChange={setRegistry}
          onAuditEvents={(evts) => setEvents((prev) => [...prev, ...evts])}
          onBack={() => setScreen("workspace")}
          onSwitchToOrgMap={() => { setScreen("workspace"); setTab("orgmap"); }}
          onToast={pushToast}
        />
      )}

      {screen === "company" && profile && (
        <CompanyProfileScreen context={companyContext ?? emptyCompanyContext(currentWorkspaceId ?? "", workspaceName)} people={people} onSave={onSaveCompanyProfile} onBack={() => setScreen("workspace")} />
      )}

      {screen === "session" && wizardPerson && (
        <SessionWorkspace
          person={wizardPerson}
          people={people}
          pedigree={pedigree}
          companyContext={companyContext}
          plannedSessionId={wizardPlannedSessionId}
          plannedSession={discoveryPlan?.sessions.find((s) => s.id === wizardPlannedSessionId)}
          questionBacklog={questionBacklog}
          reviewQueueCount={reviewQueueCount}
          nextPendingSession={nextPendingSession}
          discoveryJustCompleted={discoveryJustCompleted}
          completionCoverage={{
            covered: discoveryCompletionState.managers_mapped + discoveryCompletionState.ics_mapped,
            total: discoveryCompletionState.managers_total + discoveryCompletionState.ics_total,
          }}
          onClose={closeSessionWorkspace}
          onApply={onApplyMapping}
          onReviewFindings={goToReviewFromSession}
          onStartNextSession={startNextPendingSession}
          onPlanEvent={onPlanEvent}
          onScheduleSession={onScheduleSession}
          onToast={pushToast}
        />
      )}

      {screen === "member" && memberPersonId && people.find((p) => p.id === memberPersonId) && (
        <>
          {/* Preview-as picker: local roles, so the member view is honest about identity */}
          {people.find((p) => p.email.toLowerCase() === (profile?.email ?? "").toLowerCase())?.id !== memberPersonId && (
            <div className="member-preview-bar">
              <Icon name="info" size={12} /> Viewing as
              <select className="select" style={{ maxWidth: 240 }} value={memberPersonId} onChange={(e) => setMemberPersonId(e.target.value)} aria-label="Preview member workspace as">
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
              </select>
              <span className="dim">your sign-in email doesn't match a person record; per-member logins arrive with SSO (roadmap)</span>
            </div>
          )}
          <MemberWorkspace
            person={people.find((p) => p.id === memberPersonId)!}
            people={people}
            pedigree={pedigree}
            registry={registry}
            ledger={signalLedger}
            backlog={questionBacklog}
            onChange={onMemberStateChange}
            onBack={() => setScreen("workspace")}
            onToast={pushToast}
          />
        </>
      )}

      {screen === "mcplibrary" && profile && (
        <McpLibraryScreen
          library={mcpLibrary}
          companyContext={companyContext}
          people={people}
          ownerEmail={profile.email}
          onChange={setMcpLibrary}
          onBack={() => setScreen("workspace")}
          onToast={pushToast}
        />
      )}

      {screen === "profile" && profileId && people.find((p) => p.id === profileId) && (
        <ProfileScreen
          person={people.find((p) => p.id === profileId)!}
          people={people}
          pedigree={pedigree}
          onBack={() => setScreen("workspace")}
          onOpenPerson={(id) => setProfileId(id)}
          onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
          onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
          onStartSession={onStartSession}
        />
      )}


      <CreateAgentModal open={!!createAgentCtx} onClose={() => setCreateAgentCtx(null)} ctx={createAgentCtx} onGenerate={onGenerateAgent} />
      <OrgSyncModal open={orgSyncOpen} people={people} pedigree={pedigree} companyContext={companyContext} registry={registry} onClose={() => setOrgSyncOpen(false)} onApply={onApplyOrgSync} />

      <OnboardingTour
        open={tourOpen}
        startStepId={tourStartStep}
        hasWorkspace={Boolean(currentWorkspaceId)}
        onStepView={(step) => recordOnboardingStep(tourUserKey, currentWorkspaceId ?? "home", step.id)}
        onAdvanceFromHome={onAdvanceTourFromHome}
        onComplete={onCompleteTour}
        onSkip={onSkipTour}
      />
      <Toasts toasts={toasts} />
    </div>
  );
}

function Metric({ label, value, delta, extra, up, arrow, tourId }: { label: string; value: number | string; delta?: string; extra?: string; up?: boolean; arrow?: boolean; tourId?: string }) {
  return (
    <div className="metric" data-tour={tourId}>
      {arrow && <span className="funnel-arrow" aria-hidden>›</span>}
      <div className="label">{label}</div>
      <div className="value">{value}{extra && <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{extra}</span>}</div>
      {delta && <div className={"delta " + (up ? "up" : "")}>{delta}</div>}
    </div>
  );
}

function CompanyProfileDropdown({
  profile,
  workspaceName,
  onEdit,
  onUploadContextFiles,
}: {
  profile?: CompanyContext;
  workspaceName: string;
  onEdit: () => void;
  onUploadContextFiles: (files: FileList | null, bucket: CompanyContextDocumentBucket) => void | Promise<void>;
}) {
  const ctx = profile ?? { company: workspaceName, whatWeDo: "" };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadBucketRef = useRef<CompanyContextDocumentBucket>("knowledge");
  const risks = [...(ctx.complianceNotes ?? []), ...(ctx.governanceRisks ?? [])];
  const uploadedSources = getUploadedContextSources(ctx);
  const contextDocuments = ctx.contextDocuments ?? [];
  const researchSources = getExternalResearchSources(ctx);
  const loadedContext = getLoadedContextItems(ctx, uploadedSources, risks, researchSources, contextDocuments);
  const hasBusinessDetails = Boolean(
    ctx.market?.trim()
    || ctx.products?.trim()
    || ctx.businessModel?.trim()
    || ctx.mission?.trim()
    || ctx.competitors?.trim()
  );
  const hasOperatingDetails = Boolean(
    ctx.strategicGoals?.trim()
    || ctx.initiatives?.trim()
    || ctx.currentState?.trim()
    || ctx.bottlenecks?.trim()
    || ctx.systems?.length
    || ctx.terminology?.trim()
  );
  const hasGovernanceDetails = Boolean(
    ctx.sops?.length
    || ctx.approvalRules?.length
    || ctx.segregationOfDuties?.length
    || contextDocuments.some((doc) => doc.bucket === "segregation_of_duties" || doc.bucket === "policy")
    || risks.length
    || ctx.unknowns?.length
  );
  const hasContext = Boolean(
    ctx.whatWeDo?.trim()
    || ctx.url?.trim()
    || ctx.market?.trim()
    || ctx.strategicGoals?.trim()
    || ctx.initiatives?.trim()
    || ctx.bottlenecks?.trim()
    || ctx.systems?.length
    || ctx.sops?.length
    || ctx.approvalRules?.length
    || ctx.segregationOfDuties?.length
    || risks.length
    || contextDocuments.length
    || uploadedSources.length
    || researchSources.length,
  );
  const handleContextFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void onUploadContextFiles(event.currentTarget.files, uploadBucketRef.current);
    event.currentTarget.value = "";
  };
  const requestContextUpload = (bucket: CompanyContextDocumentBucket = "knowledge") => {
    uploadBucketRef.current = bucket;
    fileInputRef.current?.click();
  };

  return (
    <div className="company-profile-panel">
      <div className="company-profile-panel-head">
        <div className="company-profile-panel-title">
          <div className="eyebrow"><Icon name="build" size={12} /> Agent Company Context</div>
          <h2>{ctx.company || workspaceName}</h2>
          <p className={"company-what-we-do" + (ctx.whatWeDo?.trim() ? "" : " empty")}>
            {ctx.whatWeDo?.trim() || "No company description loaded yet. Add a short paragraph so generated agents understand the business, goals, policies, and operating boundaries."}
          </p>
          {ctx.url && <a href={ctx.url} target="_blank" rel="noreferrer" className="company-url"><Icon name="external" size={11} /> {ctx.url}</a>}
        </div>
        <div className="company-profile-panel-actions">
          <span className={"context-health " + (hasContext ? "loaded" : "needed")}>
            <Icon name={hasContext ? "check-circle" : "warning"} size={12} />
            {loadedContext.length} context area{loadedContext.length === 1 ? "" : "s"} loaded
          </span>
          <button className="btn btn-sm btn-outline-cyan" onClick={() => requestContextUpload("knowledge")}><Icon name="upload" size={12} /> Upload Files</button>
          <button className="btn btn-sm btn-outline-cyan" onClick={onEdit}><Icon name="sparkles" size={12} /> Edit / Research</button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        className="context-file-input"
        type="file"
        multiple
        aria-label="Upload company context files"
        accept=".txt,.md,.markdown,.csv,.json,.yml,.yaml,text/plain,text/markdown,text/csv,application/json"
        onChange={handleContextFileChange}
      />

      <div className="company-context-layout">
        <section className="company-context-brief">
          <div className="section-title">Company brief</div>
          {hasBusinessDetails ? (
            <div className="company-context-facts">
              <PanelText label="Market" value={ctx.market} />
              <PanelText label="Business model" value={ctx.businessModel} />
              <PanelText label="Mission" value={ctx.mission} />
              <PanelText label="Products" value={ctx.products} />
              <PanelText label="Competitors" value={ctx.competitors} />
            </div>
          ) : (
            <div className="company-profile-empty compact">Business basics are not loaded yet.</div>
          )}

          <div className="company-context-columns">
            <div>
              <div className="section-title">Goals and operations</div>
              {hasOperatingDetails ? (
                <>
                  <PanelText label="Goals" value={ctx.strategicGoals} />
                  <PanelText label="Initiatives" value={ctx.initiatives} />
                  <PanelText label="Current state" value={ctx.currentState} />
                  <PanelText label="Bottlenecks" value={ctx.bottlenecks} />
                  <PanelList label="Systems" values={ctx.systems} />
                  <PanelText label="Terminology" value={ctx.terminology} />
                </>
              ) : (
                <div className="company-profile-empty compact">No goals, initiatives, or systems loaded.</div>
              )}
            </div>

            <div>
              <div className="section-title">Policies and boundaries</div>
              {hasGovernanceDetails ? (
                <>
                  <PanelList label="SOPs" values={ctx.sops} />
                  <PanelList label="Approval rules" values={ctx.approvalRules} />
                  <PanelList label="Segregation of duties" values={ctx.segregationOfDuties} />
                  <PanelDocumentList label="Uploaded SOD docs" docs={contextDocuments.filter((doc) => doc.bucket === "segregation_of_duties")} />
                  <PanelDocumentList label="Uploaded policy docs" docs={contextDocuments.filter((doc) => doc.bucket === "policy")} />
                  <PanelList label="Risks / compliance" values={risks} />
                  <PanelList label="Unknowns" values={ctx.unknowns} />
                </>
              ) : (
                <div className="company-profile-empty compact">No SOPs, approvals, SOD rules, or compliance notes loaded.</div>
              )}
            </div>
          </div>
        </section>

        <aside className="company-context-hub">
          <div className="company-context-hub-head">
            <div>
              <div className="section-title">Context sources</div>
              <p>Connect the systems and files an agent needs before it acts for a team.</p>
            </div>
            {typeof ctx.confidence === "number" && <span className="tag cyan">{Math.round(ctx.confidence * 100)}%</span>}
          </div>

          <div className="context-source-grid">
            {CONTEXT_CONNECTORS.map((connector) => (
              <ContextSourceCard
                connector={connector}
                loaded={isConnectorLoaded(connector, ctx, uploadedSources, contextDocuments)}
                onRequestUpload={requestContextUpload}
                key={connector.name}
              />
            ))}
          </div>

          <div className="loaded-context-head">
            <span>Loaded context</span>
            <span className="tag">{loadedContext.length}</span>
          </div>
          {loadedContext.length ? (
            <div className="loaded-context-list">
              {loadedContext.map((item) => <LoadedContextRow item={item} key={item.label} />)}
            </div>
          ) : (
            <div className="loaded-context-empty">No company context has been loaded for this workspace.</div>
          )}

          <PanelSources sources={ctx.researchSources} />
        </aside>
      </div>
    </div>
  );
}

type LoadedContextItem = {
  icon: string;
  label: string;
  value: string;
  detail?: string;
};

function getUploadedContextSources(ctx: CompanyContext): CompanyResearchSource[] {
  return (ctx.researchSources ?? []).filter((source) => source.url?.startsWith(CONTEXT_UPLOAD_PREFIX));
}

function getExternalResearchSources(ctx: CompanyContext): CompanyResearchSource[] {
  return (ctx.researchSources ?? []).filter((source) =>
    source.url
    && !source.url.startsWith(CONTEXT_UPLOAD_PREFIX)
    && !source.url.startsWith(CONNECTED_CONTEXT_PREFIX),
  );
}

function getLoadedContextItems(
  ctx: CompanyContext,
  uploadedSources: CompanyResearchSource[],
  risks: string[],
  researchSources: CompanyResearchSource[],
  contextDocuments: CompanyContextDocument[],
): LoadedContextItem[] {
  const items: LoadedContextItem[] = [];
  const sodDocs = contextDocuments.filter((doc) => doc.bucket === "segregation_of_duties");
  const policyDocs = contextDocuments.filter((doc) => doc.bucket === "policy");
  const knowledgeDocs = contextDocuments.filter((doc) => doc.bucket === "knowledge");
  if (ctx.whatWeDo?.trim()) items.push({ icon: "info", label: "Company description", value: "Loaded", detail: truncateText(ctx.whatWeDo, 120) });
  if (ctx.strategicGoals?.trim() || ctx.initiatives?.trim()) items.push({ icon: "target", label: "Goals / initiatives", value: "Loaded", detail: truncateText(ctx.strategicGoals || ctx.initiatives || "", 120) });
  if (ctx.systems?.length) items.push({ icon: "network", label: "Systems and tools", value: `${ctx.systems.length}`, detail: previewList(ctx.systems) });
  if (ctx.sops?.length) items.push({ icon: "doc", label: "SOPs", value: `${ctx.sops.length}`, detail: previewList(ctx.sops) });
  if (ctx.approvalRules?.length) items.push({ icon: "check-circle", label: "Approval rules", value: `${ctx.approvalRules.length}`, detail: previewList(ctx.approvalRules) });
  if (ctx.segregationOfDuties?.length) items.push({ icon: "shield", label: "Segregation of duties", value: `${ctx.segregationOfDuties.length}`, detail: previewList(ctx.segregationOfDuties) });
  if (sodDocs.length) items.push({ icon: "shield", label: "SOD document store", value: `${sodDocs.length}`, detail: previewList(sodDocs.map((doc) => doc.title || doc.fileName)) });
  if (policyDocs.length) items.push({ icon: "doc", label: "Policy document store", value: `${policyDocs.length}`, detail: previewList(policyDocs.map((doc) => doc.title || doc.fileName)) });
  if (knowledgeDocs.length) items.push({ icon: "doc", label: "Knowledge document store", value: `${knowledgeDocs.length}`, detail: previewList(knowledgeDocs.map((doc) => doc.title || doc.fileName)) });
  if (risks.length) items.push({ icon: "warning", label: "Risk / compliance", value: `${risks.length}`, detail: previewList(risks) });
  if (uploadedSources.length) items.push({ icon: "upload", label: "Uploaded files", value: `${uploadedSources.length}`, detail: previewList(uploadedSources.map((source) => source.title || source.url)) });
  if (researchSources.length) items.push({ icon: "external", label: "Research sources", value: `${researchSources.length}`, detail: previewList(researchSources.map((source) => source.title || source.url)) });
  return items;
}

function isConnectorLoaded(connector: ContextConnector, ctx: CompanyContext, uploadedSources: CompanyResearchSource[], contextDocuments: CompanyContextDocument[]): boolean {
  if (connector.kind === "coming-soon") return false;
  if (connector.bucket && contextDocuments.some((doc) => doc.bucket === connector.bucket)) return true;
  if (connector.name === "SOD documents") {
    return Boolean(ctx.segregationOfDuties?.length || uploadedSources.some((source) => matchesAny(source.title || source.url, connector.match)));
  }
  if (connector.name === "Policy documents") {
    return Boolean(ctx.sops?.length || ctx.approvalRules?.length || ctx.complianceNotes?.length);
  }
  if (connector.name === "Knowledge base") {
    return Boolean(contextDocuments.some((doc) => doc.bucket === "knowledge"));
  }
  return Boolean((ctx.systems ?? []).some((system) => matchesAny(system, connector.match)));
}

function matchesAny(value: string | undefined, needles: string[]): boolean {
  const normalized = (value ?? "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function previewList(values: Array<string | undefined>, limit = 3): string {
  const clean = values.filter((value): value is string => Boolean(value?.trim()));
  const preview = clean.slice(0, limit).join(", ");
  return clean.length > limit ? `${preview} +${clean.length - limit}` : preview;
}

function truncateText(value: string, length: number): string {
  const clean = compactWhitespace(value);
  return clean.length > length ? `${clean.slice(0, length - 1)}...` : clean;
}

function ContextSourceCard({
  connector,
  loaded,
  onRequestUpload,
}: {
  connector: ContextConnector;
  loaded: boolean;
  onRequestUpload: (bucket: CompanyContextDocumentBucket) => void;
}) {
  const hasBrandLogo = Boolean(findBrand(connector.name));
  const isComingSoon = connector.kind === "coming-soon";
  return (
    <div className={"context-source-card" + (loaded ? " loaded" : "") + (isComingSoon ? " coming-soon" : "")}>
      <div className="context-source-main">
        <span className="context-source-icon">
          {hasBrandLogo ? <BrandLogo name={connector.name} size={18} /> : <Icon name={connector.icon} size={13} />}
        </span>
        <div>
          <div className="context-source-name">{connector.label}</div>
          <div className="context-source-description">{connector.description}</div>
        </div>
      </div>
      <div className="context-source-foot">
        <span className={"context-source-status " + (isComingSoon ? "soon" : loaded ? "loaded" : "needed")}>
          <span className="dot" /> {isComingSoon ? "Coming soon" : loaded ? "Loaded" : "Needed"}
        </span>
        {connector.kind === "upload" && connector.bucket ? (
          <button className="context-source-action" onClick={() => onRequestUpload(connector.bucket!)}>Upload</button>
        ) : (
          <button className="context-source-action" disabled>Coming soon</button>
        )}
      </div>
    </div>
  );
}

function LoadedContextRow({ item }: { item: LoadedContextItem }) {
  return (
    <div className="loaded-context-row">
      <span className="loaded-context-icon"><Icon name={item.icon} size={12} /></span>
      <div className="loaded-context-copy">
        <div className="loaded-context-label">{item.label}</div>
        {item.detail && <div className="loaded-context-detail">{item.detail}</div>}
      </div>
      <span className="loaded-context-value">{item.value}</span>
    </div>
  );
}

function ProfilePanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="company-profile-panel-section">
      <div className="section-title">{title}</div>
      {children}
    </section>
  );
}

function PanelText({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="company-profile-kv">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function PanelList({ label, values }: { label: string; values?: string[] }) {
  const clean = (values ?? []).filter((value) => value.trim());
  if (!clean.length) return null;
  return (
    <div className="company-profile-kv">
      <div className="k">{label}</div>
      <div className="company-chip-list">
        {clean.map((value) => <BrandChip name={value} key={value}>{value}</BrandChip>)}
      </div>
    </div>
  );
}

function PanelDocumentList({ label, docs }: { label: string; docs: CompanyContextDocument[] }) {
  if (!docs.length) return null;
  return (
    <div className="company-profile-kv">
      <div className="k">{label}</div>
      <div className="company-chip-list">
        {docs.map((doc) => (
          <span className="brand-chip" key={doc.id}>
            <Icon name="doc" size={12} />
            <span className="brand-chip-label">{doc.title || doc.fileName}</span>
            {doc.text && <span className="brand-chip-suffix">{doc.text.length.toLocaleString()} chars</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function PanelSources({ sources }: { sources?: CompanyResearchSource[] }) {
  const clean = (sources ?? []).filter((source) => source.url && !source.url.startsWith(CONNECTED_CONTEXT_PREFIX));
  if (!clean.length) return null;
  return (
    <div className="company-profile-kv">
      <div className="k">Sources</div>
      <div className="company-source-list">
        {clean.slice(0, 5).map((source) => {
          const label = source.title || source.url;
          if (source.url.startsWith(CONTEXT_UPLOAD_PREFIX)) {
            return <span key={source.url}><Icon name="upload" size={11} /> {label}</span>;
          }
          if (source.url.startsWith(CONNECTED_CONTEXT_PREFIX)) {
            return <span key={source.url}><Icon name="check-circle" size={11} /> {label}</span>;
          }
          return source.url === "user-provided-notes" ? (
            <span key={source.url}><Icon name="doc" size={11} /> {label}</span>
          ) : (
            <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><Icon name="external" size={11} /> {label}</a>
          );
        })}
      </div>
    </div>
  );
}
