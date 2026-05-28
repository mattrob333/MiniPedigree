import type { Workspace } from "@/types";
import { supabase, supabaseEnabled } from "./supabase";

const LS_KEY = "pedigree.workspace.v1";

/** Persist the active workspace. Uses Supabase when configured, else localStorage. */
export async function saveWorkspace(ws: Workspace): Promise<void> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ws));
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

export function loadWorkspaceLocal(): Workspace | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

export function clearWorkspaceLocal(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
