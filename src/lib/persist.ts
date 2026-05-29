import type { UserProfile, Workspace } from "@/types";
import { supabase, supabaseEnabled } from "./supabase";

const WS_PREFIX = "pedigree.workspace.v2.";
const PROFILE_KEY = "pedigree.profile.v1";

function wsKey(id: string) {
  return WS_PREFIX + id;
}

/** Stable workspace id derived from the logged-in company (so reloads restore it). */
export function workspaceIdFor(profile: UserProfile | null, fallback = "default"): string {
  const base = (profile?.company || profile?.email || fallback).toLowerCase().trim();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

/** Persist the active workspace. Uses Supabase when configured, always mirrors to localStorage. */
export async function saveWorkspace(ws: Workspace): Promise<void> {
  try {
    localStorage.setItem(wsKey(ws.id), JSON.stringify(ws));
  } catch {
    /* ignore quota errors */
  }
  if (supabaseEnabled && supabase) {
    try {
      await supabase.from("workspaces").upsert({
        id: ws.id,
        name: ws.name,
        snapshot: { people: ws.people, pedigree: ws.pedigree },
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Supabase save failed, kept local copy", e);
    }
  }
}

/** Load a workspace by id: Supabase first (cross-device), then localStorage. */
export async function loadWorkspace(id: string): Promise<Workspace | null> {
  if (supabaseEnabled && supabase) {
    try {
      const { data } = await supabase.from("workspaces").select("id,name,snapshot").eq("id", id).maybeSingle();
      if (data?.snapshot) {
        const snap = data.snapshot as { people: Workspace["people"]; pedigree: Workspace["pedigree"] };
        if (snap.people?.length) {
          return { id: data.id, name: data.name, people: snap.people, pedigree: snap.pedigree, createdAt: new Date().toISOString() };
        }
      }
    } catch (e) {
      console.warn("Supabase load failed, trying local", e);
    }
  }
  try {
    const raw = localStorage.getItem(wsKey(id));
    if (raw) return JSON.parse(raw) as Workspace;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearWorkspaceLocal(id: string): void {
  try {
    localStorage.removeItem(wsKey(id));
  } catch {
    /* ignore */
  }
}

// ── Profile (auth-lite) ───────────────────────────────────────────────
export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  if (supabaseEnabled && supabase) {
    supabase
      .from("profiles")
      .upsert({
        email: profile.email,
        name: profile.name,
        company: profile.company,
        company_context: profile.companyContext,
        updated_at: new Date().toISOString(),
      })
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
