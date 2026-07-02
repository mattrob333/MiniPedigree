import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Topbar } from "./components/Topbar";
import { Spreadsheet } from "./components/Spreadsheet";
import { OrgMap } from "./components/OrgMap";
import { Drawer, type CreateAgentCtx } from "./components/Drawer";
import { MappingSessionWizard } from "./components/MappingSessionWizard";
import { CreateAgentModal, type GenerateCtx } from "./components/modals/CreateAgentModal";
import { ManifestScreen } from "./components/ManifestScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { OrgSyncModal } from "./components/OrgSyncModal";
import { CompanyProfileScreen } from "./components/CompanyProfileScreen";
import { applyOrgSync, type Changeset } from "./lib/orgSync";
import type { CompanyContext, CompanyContextDocument, CompanyContextDocumentBucket, CompanyResearchSource } from "./types";
import { Toasts, type Toast } from "./components/Toasts";
import { LoginScreen } from "./components/LoginScreen";
import { WorkspacesHome, type DemoCompany } from "./components/WorkspacesHome";
import { Icon } from "./components/Icon";
import { BrandChip, BrandLogo, findBrand } from "./components/BrandLogo";
import { OnboardingTour } from "./components/onboarding/OnboardingTour";

import type { AgentRecord, AuditEvent, AuditEventType, MappingSessionType, ParsedMap, PedigreeState, Person, UserProfile, WorkspaceSummary } from "./types";
import { parsePeopleCsv } from "./lib/csv";
import { applyParsed, computeMetrics, exportEnrichedCsv, initialPedigreeState, downloadFile } from "./lib/state";
import { buildAgentArtifacts, newAgentRecord, type AgentConstructionSpec } from "./lib/agent";
import { checkAgentSod, checkOrgSod, proposedAgentTaskLabels, type SodFinding } from "./lib/sod";
import { appendAuditEvent, verifyAuditChain, AUDIT_TYPE_LABEL } from "./lib/audit";
import { buildEvidencePack } from "./lib/evidence";
import { authorAgent } from "./lib/api";
import { computeNextRecommendedSessions } from "./lib/sessions";
import { useTheme } from "./lib/useTheme";
import {
  saveWorkspace, loadWorkspace, deleteWorkspace, listWorkspaces, newWorkspaceId,
  getLastWorkspaceId, setLastWorkspaceId, loadProfile, saveProfile, clearProfile,
} from "./lib/persist";
import {
  completeOnboarding,
  getInitialWorkspaceOnboardingStep,
  recordOnboardingStep,
  resetOnboarding,
  shouldShowUploadOnboarding,
  shouldShowWorkspaceOnboarding,
  skipOnboarding,
} from "./lib/onboarding";

type Screen = "login" | "home" | "workspace" | "manifest" | "profile" | "company";
type Tab = "spreadsheet" | "orgmap" | "agents" | "compliance";

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
  const [workspaceCreatedAt, setWorkspaceCreatedAt] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  // Refs for async handlers that resolve after a possible workspace switch.
  const currentWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId]);
  // Monotonic token so only the most recent workspace-open request wins.
  const openRequestRef = useRef(0);
  const [companyContext, setCompanyContext] = useState<CompanyContext | undefined>(undefined);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStartStep, setTourStartStep] = useState<string | undefined>("upload-team");

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
  const orgSodFindings = useMemo(() => checkOrgSod(people, pedigree), [people, pedigree]);
  const createAgentSod = useMemo<SodFinding[]>(() => {
    if (!createAgentCtx) return [];
    const row = pedigree[createAgentCtx.person.id];
    if (!row) return [];
    return checkAgentSod({
      person: createAgentCtx.person,
      row,
      agentTaskLabels: proposedAgentTaskLabels(row, createAgentCtx.task),
      agentName: "This agent",
    });
  }, [createAgentCtx, pedigree]);
  const selectedPerson = useMemo(() => people.find((p) => p.id === selectedId), [people, selectedId]);
  const recommended = useMemo(() => computeNextRecommendedSessions(people, pedigree), [people, pedigree]);
  const rootId = useMemo(() => people.find((p) => !p.managerId)?.id ?? people[0]?.id, [people]);
  const topDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    return counts.size > 1 ? "All" : [...counts.keys()][0] ?? "";
  }, [people]);
  const tourUserKey = profile?.email ?? profile?.name ?? "anon";

  const openWorkspaceState = (ws: { id: string; name: string; people: Person[]; pedigree: PedigreeState; companyContext?: CompanyContext; createdAt?: string; auditLog?: AuditEvent[] }) => {
    setPeople(ws.people);
    setPedigree(ws.pedigree);
    setWorkspaceName(ws.name);
    setCurrentWorkspaceId(ws.id);
    setWorkspaceCreatedAt(ws.createdAt ?? new Date().toISOString());
    setAuditLog(ws.auditLog ?? []);
    setCompanyContext(ws.companyContext);
    setCompanyProfileOpen(false);
    setSelectedId(null);
    setDrawerOpen(false);
    setScreen("workspace");
    setTab("orgmap");
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
      const token = ++openRequestRef.current;
      loadWorkspace(lastId)
        .then((ws) => {
          if (openRequestRef.current !== token) return; // superseded by a user action
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

  // Persist the active workspace by its own id whenever it changes.
  useEffect(() => {
    if (booting) return;
    if (currentWorkspaceId && people.length && profile) {
      void saveWorkspace(
        { id: currentWorkspaceId, name: workspaceName, people, pedigree, companyContext, auditLog, createdAt: workspaceCreatedAt ?? new Date().toISOString() },
        profile.email,
      );
    }
  }, [people, pedigree, workspaceName, companyContext, auditLog, currentWorkspaceId, workspaceCreatedAt, profile, booting]);

  // Append to the workspace's tamper-evident audit ledger (see src/lib/audit.ts).
  const logAudit = (type: AuditEventType, summary: string, details?: Record<string, unknown>) => {
    const actor = profile?.email || profile?.name || "anon";
    setAuditLog((prev) => appendAuditEvent(prev, { type, summary, details, actor }));
  };

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
    const token = ++openRequestRef.current;
    loadWorkspace(id).then((ws) => {
      if (openRequestRef.current !== token) return; // a newer open won
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

  // The auto-persist effect above saves the workspace whenever companyContext
  // changes, so setting state is enough (and avoids stamping a fresh createdAt
  // or saving stale closure copies of people/pedigree).
  const persistCompanyContext = (ctx: CompanyContext) => {
    setCompanyContext(ctx);
  };

  const onSaveCompanyProfile = (ctx: CompanyContext) => {
    persistCompanyContext(ctx);
    setScreen("workspace");
    logAudit("company_profile_saved", `Company profile for ${ctx.company || workspaceName} saved`, {
      company: ctx.company,
      sod_rules: ctx.segregationOfDuties?.length ?? 0,
      approval_rules: ctx.approvalRules?.length ?? 0,
      context_documents: ctx.contextDocuments?.length ?? 0,
    });
    pushToast("Company profile saved", "Grounds discovery and agent generation for this company", true);
  };

  const onUploadContextFiles = async (files: FileList | null, bucket: CompanyContextDocumentBucket) => {
    if (!files?.length) return;
    const wsAtStart = currentWorkspaceIdRef.current;
    const uploads = await Promise.all(Array.from(files).map((file) => readContextFile(file, bucket)));
    // Don't apply this company's uploads to a different company opened mid-read.
    if (currentWorkspaceIdRef.current !== wsAtStart) return;
    // Functional update so two quick uploads (e.g. SOD docs then policy docs)
    // merge instead of the second overwriting the first.
    setCompanyContext((cur) => {
      const current = cur ?? { company: workspaceName, whatWeDo: "" };
      const newNotes = uploads
        .map((upload) => upload.rawNote)
        .filter((note) => note && !(current.rawNotes ?? "").includes(note.split("\n")[0]));
      return {
        ...current,
        rawNotes: [current.rawNotes?.trim(), ...newNotes].filter(Boolean).join("\n\n"),
        researchSources: mergeResearchSources(current.researchSources, uploads.map((upload) => upload.source)),
        contextDocuments: mergeContextDocuments(current.contextDocuments, uploads.map((upload) => upload.document)),
        updatedAt: new Date().toISOString(),
      };
    });
    logAudit("context_documents_uploaded", `${uploads.length} ${contextBucketLabel(bucket)} file(s) uploaded`, {
      bucket,
      files: uploads.map((u) => u.document.fileName),
    });
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
      if (e.key === "4") setTab("compliance");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, metrics.agentsBuilt]);

  useEffect(() => {
    if (booting || !profile || tourOpen) return;
    if (screen === "home" && shouldShowUploadOnboarding(tourUserKey)) {
      setTourStartStep("upload-team");
      setTourOpen(true);
      return;
    }
    if (screen === "workspace" && currentWorkspaceId && shouldShowWorkspaceOnboarding(tourUserKey, currentWorkspaceId)) {
      setTourStartStep(getInitialWorkspaceOnboardingStep(tourUserKey, currentWorkspaceId));
      setTourOpen(true);
    }
  }, [booting, currentWorkspaceId, profile, screen, tourOpen, tourUserKey]);

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
    const ctx: CompanyContext = { company: name, whatWeDo: "" };
    const createdAt = new Date().toISOString();
    const initialAudit = appendAuditEvent([], {
      type: "workspace_created",
      summary: `Workspace "${name}" created from ${fileName} (${result.people.length} people)`,
      details: { file_name: fileName, people: result.people.length, warnings: result.warnings.length },
      actor: profile?.email || profile?.name || "anon",
    });
    void saveWorkspace({ id, name, people: result.people, pedigree: ped, companyContext: ctx, auditLog: initialAudit, createdAt }, profile?.email);
    setLastWorkspaceId(profile?.email, id);
    openWorkspaceState({ id, name, people: result.people, pedigree: ped, companyContext: ctx, createdAt, auditLog: initialAudit });
    refreshWorkspaces();
    const warn = result.warnings.length ? ` · ${result.warnings.length} warning(s)` : "";
    pushToast("Company created", `${result.people.length} people loaded${warn}`);
  };

  const onUploadText = (text: string, fileName: string) => createWorkspaceFromCsv(text, fileName);

  const onOpenDemo = async (demo: DemoCompany) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${demo.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      createWorkspaceFromCsv(text, demo.file, demo.label);
    } catch {
      setUploadError(`Could not load demo company "${demo.label}".`);
    }
  };

  const onStartSession = (personId: string | undefined) => {
    if (!personId) return;
    setWizardPersonId(personId);
  };

  const onApplyMapping = (args: { scopeIds: string[]; sessionType: MappingSessionType; sessionLabel: string; parsed: ParsedMap }) => {
    const next = applyParsed(people, args.parsed, pedigree, {
      scopeIds: args.scopeIds,
      sessionLabel: args.sessionLabel,
      people,
    });
    setPedigree(next);
    setWizardPersonId(null);
    logAudit("session_applied", `${args.sessionLabel} applied to ${args.scopeIds.length} people`, {
      session_label: args.sessionLabel,
      session_type: args.sessionType,
      people_updated: args.scopeIds.length,
      person_ids: args.scopeIds,
    });
    pushToast("Discovery applied", `${args.scopeIds.length} people updated · ${args.sessionLabel}`, true);
  };

  const onGenerateAgent = async (ctx: GenerateCtx) => {
    const row = pedigree[ctx.person.id];
    if (!row) return;
    const wsAtStart = currentWorkspaceIdRef.current;
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

    // The authorAgent call above can take a while; if the user switched
    // companies meanwhile, person ids are positional (P-001…) and would
    // silently attach this agent to an unrelated person in the other company.
    if (currentWorkspaceIdRef.current !== wsAtStart) {
      pushToast("Agent generation cancelled", "You switched companies while the agent was being constructed");
      return;
    }

    const buildCtx = { ...baseCtx, authored };
    const artifacts = buildAgentArtifacts(buildCtx);
    const agent = newAgentRecord(buildCtx, artifacts);
    setPedigree((prev) => {
      const prevRow = prev[ctx.person.id];
      if (!prevRow) return prev;
      return { ...prev, [ctx.person.id]: { ...prevRow, agents: [...prevRow.agents, agent], status: "generated" } };
    });
    const blocking = artifacts.sodFindings.filter((f) => f.severity === "block").length;
    logAudit("agent_generated", `Agent "${agent.name}" generated for ${ctx.person.name} (${ctx.task.label})${artifacts.sodFindings.length ? ` — ${artifacts.sodFindings.length} SOD finding(s), ${blocking} blocking, logged` : ""}`, {
      agent_id: agent.id,
      agent_name: agent.name,
      owner: ctx.person.name,
      owner_email: ctx.person.email,
      task: ctx.task.label,
      responsibility: ctx.respTitle,
      policy: ctx.policy,
      risk: ctx.riskLevel,
      lifecycle: ctx.lifecycleClass,
      authored_by: authored ? "ai" : "template",
      sod_findings: artifacts.sodFindings.map((f) => ({ rule_id: f.ruleId, severity: f.severity, scope: f.scope })),
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

  const onApplyOrgSync = (parsed: ParsedMap, changeset: Changeset, approvedIds: string[]) => {
    const next = applyOrgSync(people, pedigree, parsed, changeset, new Set(approvedIds));
    setPedigree(next);
    setOrgSyncOpen(false);
    const approvedSod = changeset.deltas
      .filter((d) => approvedIds.includes(d.personId))
      .flatMap((d) => d.sodFindings.map((f) => ({ rule_id: f.ruleId, severity: f.severity, person: f.personName })));
    logAudit("org_sync_applied", `Org sync approved for ${approvedIds.length} people (${changeset.summary.newResponsibilities} new responsibilities, ${changeset.summary.newTasks} new tasks, ${changeset.summary.reassignments} reassignments)${approvedSod.length ? ` — ${approvedSod.length} SOD conflict(s) approved with override` : ""}`, {
      approved_person_ids: approvedIds,
      ...changeset.summary,
      approved_sod_conflicts: approvedSod,
    });
    pushToast("Org Sync applied", `${approvedIds.length} people updated · ${changeset.summary.newResponsibilities} new resp, ${changeset.summary.newTasks} new tasks`, true);
  };

  const onExport = () => {
    const csv = exportEnrichedCsv(people, pedigree);
    downloadFile(`${workspaceName.toLowerCase().replace(/\s+/g, "-")}-pedigree.csv`, csv, "text/csv");
    logAudit("export_performed", "Enriched org CSV exported", { kind: "enriched_csv", people: people.length });
    pushToast("CSV exported", "Enriched spreadsheet downloaded", true);
  };

  const onExportEvidencePack = async () => {
    // Log first so the export event itself is part of the exported ledger.
    const actor = profile?.email || profile?.name || "anon";
    const logWithExport = appendAuditEvent(auditLog, {
      type: "export_performed",
      summary: "Evidence pack exported (audit log, SOD findings, org snapshot, manifests)",
      details: { kind: "evidence_pack" },
      actor,
    });
    setAuditLog(logWithExport);
    const blob = await buildEvidencePack({ workspaceName, people, pedigree, companyContext, auditLog: logWithExport });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspaceName.toLowerCase().replace(/\s+/g, "-")}-evidence-pack.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast("Evidence pack exported", "Audit log, SOD findings, org snapshot, and manifests zipped", true);
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
  const wizardPerson = wizardPersonId ? people.find((p) => p.id === wizardPersonId) ?? null : null;
  const progressPct = metrics.peopleCount ? Math.round((metrics.mappedPeople / metrics.peopleCount) * 100) : 0;
  const discoveryStarted = metrics.mappedPeople > 0;
  const discoveryComplete = metrics.peopleCount > 0 && metrics.mappedPeople === metrics.peopleCount;
  const companyTitle = companyContext?.company?.trim() || workspaceName;
  const companySubtitle = companyContext?.whatWeDo?.trim()
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
                <button data-tour="company-profile" className="btn btn-sm btn-ghost" onClick={() => setScreen("company")} title="Edit the company profile that grounds discovery & agents"><Icon name="build" size={12} /> Company Profile</button>
                <button data-tour="export" className="btn btn-sm btn-ghost" onClick={onExport}><Icon name="download" size={12} /> Export</button>
                <button className="btn btn-sm btn-ghost" onClick={exitToHome} title="Switch company / back to all companies"><Icon name="network" size={12} /> Companies</button>
                <button className={"btn btn-sm " + (discoveryComplete ? "btn-primary" : "btn-ghost")} onClick={() => setOrgSyncOpen(true)} title="Refresh from a recent meeting transcript (reviewed changeset)"><Icon name="history" size={12} /> Org Sync</button>
                <button data-tour="map-responsibilities" className={"btn " + (discoveryComplete ? "btn-ghost btn-sm" : "btn-primary")} onClick={() => onStartSession(selectedId ?? rootId)} title={discoveryComplete ? "Re-run discovery for a person to update them" : "Run a discovery pass to map responsibilities"}>
                  <Icon name="sparkles" size={12} /> {discoveryStarted ? (discoveryComplete ? "Update Responsibilities" : "Continue Discovery") : "Map Responsibilities"}
                </button>
              </div>
            </div>

            {companyProfileOpen && (
              <CompanyProfileDropdown
                profile={companyContext}
                workspaceName={workspaceName}
                onEdit={() => setScreen("company")}
                onUploadContextFiles={onUploadContextFiles}
              />
            )}

            {/* Funnel: People → Responsibilities → Delegatable → Candidates → Built */}
            <div className="metrics funnel">
              <Metric label="People" value={metrics.peopleCount} delta={`${metrics.mappedPeople} mapped`} up={metrics.mappedPeople > 0} arrow />
              <Metric label="Responsibilities" value={metrics.respMapped} delta={metrics.respMapped > 0 ? "discovered" : "awaiting discovery"} up={metrics.respMapped > 0} arrow />
              <Metric tourId="delegatable-tasks" label="Delegatable Tasks" value={metrics.delegTasks} delta={metrics.delegTasks > 0 ? "automatable" : "—"} up={metrics.delegTasks > 0} arrow />
              <Metric tourId="agent-candidates" label="Agent Candidates" value={metrics.candidates} delta={metrics.candidates > 0 ? "ready to build" : "—"} up={metrics.candidates > 0} arrow />
              <Metric label="Agents Built" value={metrics.agentsBuilt} delta={metrics.agentsBuilt > 0 ? "governed" : "none yet"} up={metrics.agentsBuilt > 0} />
            </div>

            <div className="map-progress">
              <div className="lbl">
                <span>Discovery Progress</span>
                <span className="mono">{metrics.mappedPeople} / {metrics.peopleCount} people mapped</span>
              </div>
              <div className="bar"><span style={{ width: `${progressPct}%` }} /></div>
            </div>

            <div className="tabs" role="tablist">
              <button className="tab" role="tab" aria-selected={tab === "spreadsheet"} onClick={() => setTab("spreadsheet")}>
                <Icon name="spreadsheet" size={12} /> Spreadsheet <span className="count">{people.length}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "orgmap"} onClick={() => setTab("orgmap")}>
                <Icon name="network" size={12} /> Org Map <span className="count">{people.length}</span>
              </button>
              <button className={"tab" + (metrics.agentsBuilt === 0 ? " disabled" : "")} role="tab" aria-selected={tab === "agents"} onClick={() => metrics.agentsBuilt > 0 && setTab("agents")} title={metrics.agentsBuilt === 0 ? "Available after first agent is generated" : "Generated agents"}>
                <Icon name="robot" size={12} /> Agents <span className="count">{metrics.agentsBuilt}</span>
              </button>
              <button className="tab" role="tab" aria-selected={tab === "compliance"} onClick={() => setTab("compliance")} title="Segregation-of-duties findings across the org and its agents">
                <Icon name="shield" size={12} stroke={orgSodFindings.length ? "var(--red)" : undefined} /> Compliance
                {orgSodFindings.length > 0 && <span className="count" style={{ color: "var(--red)" }}>{orgSodFindings.length}</span>}
              </button>
              <span style={{ flex: 1 }} />
              <span className="kbd-hint">Tab <span className="k">1</span> Spreadsheet · <span className="k">2</span> Org Map</span>
            </div>
          </div>

          <div className="workspace-body">
            {tab === "spreadsheet" && (
              <Spreadsheet people={people} pedigree={pedigree} department={topDepartment} onOpenInput={() => onStartSession(selectedId ?? rootId)} onSwitchTab={(t) => setTab(t as Tab)} onExport={onExport} selectedId={selectedId} onSelectRow={onSelect} />
            )}
            {tab === "orgmap" && (
              <OrgMap people={people} pedigree={pedigree} selectedId={selectedId} onSelectNode={onSelect} recommended={recommended} onStartSession={onStartSession} />
            )}
            {tab === "agents" && <AgentsList agents={allAgents} onOpen={(a) => { setActiveAgent(a); setScreen("manifest"); }} />}
            {tab === "compliance" && <CompliancePanel findings={orgSodFindings} agents={allAgents} auditLog={auditLog} onExportEvidencePack={onExportEvidencePack} onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }} onSelectPerson={onSelect} />}

            <Drawer
              open={drawerOpen}
              person={selectedPerson}
              state={selectedPerson ? pedigree[selectedPerson.id] : null}
              people={people}
              pedigree={pedigree}
              onClose={() => setDrawerOpen(false)}
              onCreateAgent={(ctx) => setCreateAgentCtx(ctx)}
              onOpenAgent={(a) => { setActiveAgent(a); setScreen("manifest"); }}
              onStartSession={onStartSession}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </div>
      )}

      {screen === "manifest" && (
        <ManifestScreen agent={activeAgent} onBack={() => setScreen("workspace")} onSwitchToOrgMap={() => { setScreen("workspace"); setTab("orgmap"); }} onToast={pushToast} />
      )}

      {screen === "company" && profile && (
        <CompanyProfileScreen context={companyContext ?? { company: workspaceName, whatWeDo: "" }} onSave={onSaveCompanyProfile} onBack={() => setScreen("workspace")} />
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

      <MappingSessionWizard
        open={!!wizardPerson}
        person={wizardPerson}
        people={people}
        pedigree={pedigree}
        companyContext={companyContext}
        onClose={() => setWizardPersonId(null)}
        onApply={onApplyMapping}
      />
      <CreateAgentModal open={!!createAgentCtx} onClose={() => setCreateAgentCtx(null)} ctx={createAgentCtx} onGenerate={onGenerateAgent} sodFindings={createAgentSod} />
      <OrgSyncModal open={orgSyncOpen} people={people} pedigree={pedigree} companyContext={companyContext} onClose={() => setOrgSyncOpen(false)} onApply={onApplyOrgSync} />

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

function Metric({ label, value, delta, extra, up, arrow, tourId }: { label: string; value: number; delta?: string; extra?: string; up?: boolean; arrow?: boolean; tourId?: string }) {
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

interface ManifestSodFinding {
  rule_id: string;
  rule_name: string;
  severity: "block" | "flag";
  message: string;
  resolution?: string;
}

function CompliancePanel({ findings, agents, auditLog, onExportEvidencePack, onOpenAgent, onSelectPerson }: {
  findings: SodFinding[];
  agents: AgentRecord[];
  auditLog: AuditEvent[];
  onExportEvidencePack: () => void;
  onOpenAgent: (a: AgentRecord) => void;
  onSelectPerson: (id: string) => void;
}) {
  const chain = verifyAuditChain(auditLog);
  const agentFindings = agents.flatMap((a) => {
    const sod = ((a.manifest as { sod_findings?: ManifestSodFinding[] } | undefined)?.sod_findings ?? []);
    return sod.map((f) => ({ agent: a, finding: f }));
  });
  const blocking = findings.filter((f) => f.severity === "block").length;
  const agentBlocking = agentFindings.filter((x) => x.finding.severity === "block").length;

  const SevTag = ({ severity }: { severity: "block" | "flag" }) => (
    <span className={"tag " + (severity === "block" ? "red" : "yellow")}>{severity === "block" ? "blocking" : "flagged"}</span>
  );

  return (
    <div className="sheet-wrap" style={{ padding: 20, overflowY: "auto" }}>
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}><Icon name="shield" size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Segregation of duties</h3>
          <span className="tag">{findings.length + agentFindings.length} finding{findings.length + agentFindings.length === 1 ? "" : "s"}</span>
          {(blocking + agentBlocking) > 0 && <span className="tag red">{blocking + agentBlocking} blocking</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-4)", marginBottom: 16 }}>
          Deterministic SOD scan over every person's mapped tasks and every generated agent's authority. Rules follow the uploaded SOD policy (vendor master × payments, PO × goods receipt, credit × order release, provisioning × certification, …).
        </div>

        {findings.length === 0 && agentFindings.length === 0 ? (
          <div className="manifest-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>
              <Icon name="check-circle" size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> No SOD conflicts detected
            </div>
            <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 6 }}>
              No person or agent currently holds both sides of a prohibited duty pair. Findings appear here as responsibilities are mapped and agents are generated.
            </div>
          </div>
        ) : (
          <>
            {findings.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-2)" }}>People holding conflicting duties</div>
                {findings.map((f, i) => (
                  <div key={`p-${f.ruleId}-${f.personId}-${i}`} className="sod-panel" style={{ marginBottom: 8, cursor: f.personId ? "pointer" : undefined }} onClick={() => f.personId && onSelectPerson(f.personId)}>
                    <div className="sod-item" style={{ marginTop: 0 }}>
                      <SevTag severity={f.severity} />
                      <span className="tag">{f.ruleId}</span>
                      <span>{f.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {agentFindings.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-2)" }}>Agents generated with SOD findings</div>
                {agentFindings.map(({ agent, finding }, i) => (
                  <div key={`a-${agent.id}-${finding.rule_id}-${i}`} className="sod-panel" style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => onOpenAgent(agent)}>
                    <div className="sod-item" style={{ marginTop: 0 }}>
                      <SevTag severity={finding.severity} />
                      <span className="tag">{finding.rule_id}</span>
                      <span><strong>{agent.name}</strong> ({agent.person.name}) — {finding.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}><Icon name="history" size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Audit trail</h3>
          <span className="tag">{auditLog.length} event{auditLog.length === 1 ? "" : "s"}</span>
          <span className={"tag " + (chain.ok ? "green" : "red")}>{chain.ok ? "chain intact" : `chain broken at #${chain.brokenAtSeq}`}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={onExportEvidencePack} title="Zip the audit log, SOD findings, org snapshot, company profile, and every agent manifest">
            <Icon name="download" size={12} /> Export evidence pack
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-4)", marginBottom: 12 }}>
          Append-only, hash-chained ledger of every governance action in this workspace: imports, applied sessions, org syncs, generated agents (with their SOD findings), document uploads, and exports. Editing or deleting any past event breaks the chain.
        </div>
        {auditLog.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>No events yet.</div>
        ) : (
          <div className="manifest-card" style={{ padding: 0 }}>
            {[...auditLog].reverse().map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 14px", borderBottom: "1px solid var(--border-2)", fontSize: 12 }}>
                <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, width: 34 }}>#{e.seq}</span>
                <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0 }}>{e.ts.replace("T", " ").slice(0, 19)}</span>
                <span className="tag cyan" style={{ flexShrink: 0 }}>{AUDIT_TYPE_LABEL[e.type] ?? e.type}</span>
                <span style={{ flex: 1 }}>{e.summary}</span>
                <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0 }} title={`actor: ${e.actor} · hash: ${e.hash}`}>{e.actor.split("@")[0]}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AgentsList({ agents, onOpen }: { agents: AgentRecord[]; onOpen: (a: AgentRecord) => void }) {
  const standing = agents.filter((a) => (a.lifecycle ?? "standing") === "standing");
  const task = agents.filter((a) => a.lifecycle === "task");

  const Card = ({ a }: { a: AgentRecord }) => (
    <div className="manifest-card" style={{ marginBottom: 0, cursor: "pointer" }} onClick={() => onOpen(a)}>
      <div className="manifest-card-head">
        <Icon name="robot" size={11} style={{ marginRight: 6 }} /> {a.id}
        <span className="right" style={{ display: "flex", gap: 4 }}>
          <span className="tag">{a.lifecycle === "task" ? "task" : "standing"}</span>
          <span className="badge generated"><span className="dot" />generated</span>
        </span>
      </div>
      <div className="manifest-card-body">
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>{a.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{a.person.name} · {a.person.title}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span className="tag cyan">{a.respTitle}</span>
          <span className="tag yellow">{a.riskLevel} risk</span>
        </div>
      </div>
    </div>
  );

  const Section = ({ title, hint, list }: { title: string; hint: string; list: AgentRecord[] }) => (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h3>
        <span className="tag">{list.length}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{hint}</span>
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>None yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {list.map((a) => <Card key={a.id} a={a} />)}
        </div>
      )}
    </section>
  );

  return (
    <div className="sheet-wrap" style={{ padding: 20 }}>
      <Section title="Standing agents" hint="persistent, tied to a recurring responsibility" list={standing} />
      <Section title="Task agents (active / recent)" hint="ephemeral but governed — audit log retained on teardown" list={task} />
    </div>
  );
}
