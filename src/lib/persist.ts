import type { UserProfile, Workspace, WorkspaceSummary } from "@/types";
import { supabase, supabaseEnabled } from "./supabase";
import { assertContextMatchesCompany, sanitizeWorkspaceContext } from "./contextGuard";

const WS_PREFIX = "pedigree.ws.";       // per-workspace blob
const IDX_PREFIX = "pedigree.index.";   // per-owner list of summaries
const LAST_PREFIX = "pedigree.lastws."; // per-owner last-open id
const PROFILE_KEY = "pedigree.profile.v1";

function ownerSlug(email?: string): string {
  return (email || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
const wsKey = (id: string) => WS_PREFIX + id;
const idxKey = (email?: string) => IDX_PREFIX + ownerSlug(email);
const lastKey = (email?: string) => LAST_PREFIX + ownerSlug(email);

export function newWorkspaceId(name: string): string {
  const slug = (name || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
  return `${slug}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function summarize(ws: Workspace): WorkspaceSummary {
  let mapped = 0;
  let agents = 0;
  const MAPPED = new Set(["mapped", "ready", "generated"]);
  for (const p of ws.people) {
    const row = ws.pedigree[p.id];
    if (row && MAPPED.has(row.status)) mapped++;
    agents += row?.agents?.length ?? 0;
  }
  return { id: ws.id, name: ws.name, peopleCount: ws.people.length, mappedCount: mapped, agentsCount: agents, updatedAt: new Date().toISOString() };
}

function readIndex(email?: string): WorkspaceSummary[] {
  try {
    const raw = localStorage.getItem(idxKey(email));
    return raw ? (JSON.parse(raw) as WorkspaceSummary[]) : [];
  } catch {
    return [];
  }
}
function writeIndex(email: string | undefined, list: WorkspaceSummary[]) {
  try {
    localStorage.setItem(idxKey(email), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function listWorkspaces(email?: string): WorkspaceSummary[] {
  return readIndex(email).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getLastWorkspaceId(email?: string): string | null {
  try {
    return localStorage.getItem(lastKey(email));
  } catch {
    return null;
  }
}
export function setLastWorkspaceId(email: string | undefined, id: string | null) {
  try {
    if (id) localStorage.setItem(lastKey(email), id);
    else localStorage.removeItem(lastKey(email));
  } catch {
    /* ignore */
  }
}

/** Persist a workspace (per id) and update this owner's index + last-open pointer. */
export async function saveWorkspace(ws: Workspace, email?: string): Promise<void> {
  assertContextMatchesCompany(ws.companyContext, ws.id, ws.name);
  const stamped: Workspace = { ...ws, ownerEmail: email, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(wsKey(ws.id), JSON.stringify(stamped));
  } catch {
    /* ignore quota */
  }
  // update index
  const summary = summarize(stamped);
  const list = readIndex(email).filter((s) => s.id !== ws.id);
  list.unshift(summary);
  writeIndex(email, list);
  setLastWorkspaceId(email, ws.id);

  if (supabaseEnabled && supabase) {
    try {
      await supabase.from("workspaces").upsert({
        id: ws.id,
        name: ws.name,
        owner_email: email ?? null,
        snapshot: { people: ws.people, pedigree: ws.pedigree, companyContext: ws.companyContext, quarantinedContext: ws.quarantinedContext, contextWarning: ws.contextWarning, taskSpecs: ws.taskSpecs, workflowTemplates: ws.workflowTemplates, mcpLibrary: ws.mcpLibrary, registry: ws.registry, auditLog: ws.auditLog, events: ws.events, discoveryPlan: ws.discoveryPlan, sessionBriefs: ws.sessionBriefs, questionBacklog: ws.questionBacklog, meetings: ws.meetings, signalLedger: ws.signalLedger, freshnessConfig: ws.freshnessConfig, rosterValidatedAt: ws.rosterValidatedAt },
        updated_at: stamped.updatedAt,
      });
      if (ws.mcpLibrary?.length) {
        await supabase.from("company_mcp_servers").upsert(ws.mcpLibrary.map((server) => ({
          id: server.id,
          workspace_id: ws.id,
          name: server.name,
          endpoint: server.endpoint ?? null,
          approved_scopes: server.approved_scopes,
          default_scope: server.default_scope,
          owner_email: server.owner_email,
          systems_matched: server.systems_matched,
          notes: server.notes ?? null,
          added_at: server.added_at,
          updated_at: stamped.updatedAt,
        })));
      }
      if (ws.registry?.length) {
        await supabase.from("agent_registry").upsert(ws.registry.map((entry) => ({
          agent_id: entry.agent_id,
          workspace_id: ws.id,
          owner_person_id: entry.owner_person_id,
          task_id: entry.task_id,
          resp_id: entry.resp_id,
          runtime: entry.runtime,
          status: entry.status,
          stale: entry.stale,
          ingredient_hashes: entry.ingredient_hashes,
          versions: entry.versions,
          updated_at: stamped.updatedAt,
        })));
      }
      if (ws.meetings?.length) {
        await supabase.from("registered_meetings").upsert(ws.meetings.map((meeting) => ({
          id: meeting.id,
          workspace_id: ws.id,
          name: meeting.name,
          cadence: meeting.cadence,
          usual_participant_ids: meeting.usual_participant_ids,
          department: meeting.department ?? null,
          source: meeting.source,
          source_ref: meeting.source_ref ?? null,
          signal_profile: meeting.signal_profile ?? null,
          active: meeting.active,
          updated_at: stamped.updatedAt,
        })));
      }
      if (ws.signalLedger?.length) {
        await supabase.from("stack_signals").upsert(ws.signalLedger.map((signal) => ({
          id: signal.id,
          workspace_id: ws.id,
          type: signal.type,
          source: signal.source,
          evidence_quote: signal.evidence_quote,
          confidence: signal.confidence,
          refs: signal.refs,
          proposed_patch: signal.proposed_patch ?? null,
          authority_expanding: signal.authority_expanding,
          status: signal.status,
          decision: signal.decision ?? null,
          captured_at: signal.captured_at,
          updated_at: stamped.updatedAt,
        })));
      }
      const contextDocuments = ws.companyContext?.contextDocuments ?? [];
      if (contextDocuments.length) {
        await supabase.from("company_context_documents").upsert(contextDocuments.map((doc) => ({
          id: doc.id,
          workspace_id: ws.id,
          bucket: doc.bucket,
          file_name: doc.fileName,
          title: doc.title ?? doc.fileName,
          mime_type: doc.mimeType ?? null,
          size_bytes: doc.sizeBytes ?? null,
          content_text: doc.text,
          uploaded_at: doc.uploadedAt,
          source_id: doc.sourceId ?? null,
          updated_at: stamped.updatedAt,
        })));
      }
    } catch (e) {
      console.warn("Supabase save failed, kept local copy", e);
    }
  }
}

export async function loadWorkspace(id: string): Promise<Workspace | null> {
  if (supabaseEnabled && supabase) {
    try {
      const { data } = await supabase.from("workspaces").select("id,name,owner_email,snapshot").eq("id", id).maybeSingle();
      if (data?.snapshot) {
        const snap = data.snapshot as Partial<Workspace> & { people: Workspace["people"]; pedigree: Workspace["pedigree"] };
        if (snap.people?.length) {
          return sanitizeWorkspaceContext({
            id: data.id, name: data.name, people: snap.people, pedigree: snap.pedigree,
            companyContext: snap.companyContext, mcpLibrary: snap.mcpLibrary, registry: snap.registry,
            auditLog: snap.auditLog, events: snap.events,
            discoveryPlan: snap.discoveryPlan, sessionBriefs: snap.sessionBriefs, questionBacklog: snap.questionBacklog,
            meetings: snap.meetings, signalLedger: snap.signalLedger, freshnessConfig: snap.freshnessConfig,
            rosterValidatedAt: snap.rosterValidatedAt,
            quarantinedContext: snap.quarantinedContext, contextWarning: snap.contextWarning,
            taskSpecs: snap.taskSpecs, workflowTemplates: snap.workflowTemplates,
            ownerEmail: data.owner_email ?? undefined, createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn("Supabase load failed, trying local", e);
    }
  }
  try {
    const raw = localStorage.getItem(wsKey(id));
    if (raw) return sanitizeWorkspaceContext(JSON.parse(raw) as Workspace);
  } catch {
    /* ignore */
  }
  return null;
}

export async function deleteWorkspace(id: string, email?: string): Promise<void> {
  try {
    localStorage.removeItem(wsKey(id));
  } catch {
    /* ignore */
  }
  writeIndex(email, readIndex(email).filter((s) => s.id !== id));
  if (getLastWorkspaceId(email) === id) setLastWorkspaceId(email, null);
  if (supabaseEnabled && supabase) {
    try {
      await supabase.from("workspaces").delete().eq("id", id);
    } catch {
      /* ignore */
    }
  }
}

// ── Profile (identity) ────────────────────────────────────────────────
export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  if (supabaseEnabled && supabase) {
    supabase
      .from("profiles")
      .upsert({ email: profile.email, name: profile.name, company: profile.company, company_context: profile.companyContext, updated_at: new Date().toISOString() })
      .then(undefined, (e) => console.warn("Supabase profile save failed", e));
  }
}

export function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
