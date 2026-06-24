import type {
  AgentRegistryEntry,
  AuthorityGrantScope,
  EvidenceRecord,
  Person,
  SystemGrant,
} from "@/types";
import { scopeRank } from "./authority";

// ── Types ───────────────────────────────────────────────────────────────

export interface TransferComparisonResult {
  agentId: string;
  oldOwnerId: string;
  newOwnerId: string;
  systemMismatches: {
    system: string;
    oldScope: string;
    newScope: string;
  }[];
  authorityChange: "none" | "reduced" | "expanded";
  requiresApproval: boolean;
  evidenceId?: string;
}

// ── Compare system grants between old and new owner ─────────────────────

/**
 * Compare the system grants of the old owner vs the new owner for a given
 * agent's owner authority.  Returns mismatches per system, an overall
 * authorityChange direction, and whether the transfer requires approval.
 *
 * - If the new owner has equal or higher scope on every system → no change.
 * - If the new owner has at least one system with a lower scope → reduced.
 * - If the new owner has at least one system with a higher scope → expanded
 *   (always requires approval, even if some others are reduced).
 */
export function compareTransferAuthority(
  agent: { owner_person_id: string },
  oldOwner: Person,
  newOwner: Person,
): {
  systemMismatches: TransferComparisonResult["systemMismatches"];
  authorityChange: TransferComparisonResult["authorityChange"];
  requiresApproval: boolean;
} {
  const oldGrants: SystemGrant[] = oldOwner.authority?.system_grants ?? [];
  const newGrants: SystemGrant[] = newOwner.authority?.system_grants ?? [];

  const newBySystem = new Map<string, SystemGrant>();
  for (const g of newGrants) {
    newBySystem.set(g.system.toLowerCase().trim(), g);
  }

  const mismatches: TransferComparisonResult["systemMismatches"] = [];
  let hasReduced = false;
  let hasExpanded = false;

  // Compare every system the old owner had grants for.
  for (const oldGrant of oldGrants) {
    const key = oldGrant.system.toLowerCase().trim();
    const newGrant = newBySystem.get(key);

    if (!newGrant) {
      // Old owner had access; new owner has none → reduced.
      mismatches.push({
        system: oldGrant.system,
        oldScope: oldGrant.scope,
        newScope: "none",
      });
      hasReduced = true;
      continue;
    }

    const oldRank = scopeRank(oldGrant.scope);
    const newRank = scopeRank(newGrant.scope === "admin" ? "read_write" : newGrant.scope);

    if (newRank < oldRank) {
      mismatches.push({
        system: oldGrant.system,
        oldScope: oldGrant.scope,
        newScope: newGrant.scope,
      });
      hasReduced = true;
    } else if (newRank > oldRank) {
      mismatches.push({
        system: oldGrant.system,
        oldScope: oldGrant.scope,
        newScope: newGrant.scope,
      });
      hasExpanded = true;
    }
  }

  // Also check systems the new owner has that the old owner lacked.
  // These count as "expanded" since the new owner brings additional coverage.
  const oldBySystem = new Map<string, SystemGrant>();
  for (const g of oldGrants) {
    oldBySystem.set(g.system.toLowerCase().trim(), g);
  }
  for (const newGrant of newGrants) {
    const key = newGrant.system.toLowerCase().trim();
    if (!oldBySystem.has(key)) {
      mismatches.push({
        system: newGrant.system,
        oldScope: "none",
        newScope: newGrant.scope,
      });
      hasExpanded = true;
    }
  }

  let authorityChange: TransferComparisonResult["authorityChange"];
  let requiresApproval: boolean;

  if (hasExpanded) {
    authorityChange = "expanded";
    requiresApproval = true;
  } else if (hasReduced) {
    authorityChange = "reduced";
    requiresApproval = false; // reduction is always safe
  } else {
    authorityChange = "none";
    requiresApproval = false;
  }

  return { systemMismatches: mismatches, authorityChange, requiresApproval };
}

// ── Execute transfer ────────────────────────────────────────────────────

let transferSeq = 0;

/**
 * Execute an agent ownership transfer.
 *
 * - Updates `owner_person_id` on the registry entry
 * - Marks the entry `stale: true` so it will be recompiled under the new owner
 * - Creates a transfer `EvidenceRecord`
 *
 * If `approved` is `false` (for authority-expanding transfers), the entry is
 * marked `stale` but the owner is still updated — the caller's workflow must
 * gate deployment on the approval.
 */
export function executeTransfer(params: {
  agentRegistryEntry: AgentRegistryEntry;
  newOwner: Person;
  actor: string;
  approved: boolean;
}): { updatedEntry: AgentRegistryEntry; evidence: EvidenceRecord } {
  const { agentRegistryEntry, newOwner, actor, approved } = params;

  transferSeq += 1;

  const updatedEntry: AgentRegistryEntry = {
    ...agentRegistryEntry,
    owner_person_id: newOwner.id,
    stale: true,
    stale_reason: approved ? "ownership_transferred" : "ownership_transfer_pending_approval",
  };

  const evidence: EvidenceRecord = {
    id: `EVT-TRANSFER-${Date.now().toString(36)}-${transferSeq}`,
    type: "transfer",
    subjectType: "agent",
    subjectId: agentRegistryEntry.agent_id,
    actor,
    timestamp: new Date().toISOString(),
    summary: approved
      ? `Ownership of agent ${agentRegistryEntry.agent_id} transferred to ${newOwner.name} (${newOwner.email})`
      : `Ownership transfer of agent ${agentRegistryEntry.agent_id} to ${newOwner.name} (${newOwner.email}) — pending approval`,
    details: {
      previous_owner_id: agentRegistryEntry.owner_person_id,
      new_owner_id: newOwner.id,
      new_owner_name: newOwner.name,
      new_owner_email: newOwner.email,
      approved,
    },
  };

  return { updatedEntry, evidence };
}

// ── Find reassignment candidates ───────────────────────────────────────

/**
 * Find people in the same department as the current agent owner who could
 * potentially be the new owner.  Each candidate is evaluated on whether
 * their authority profile covers the same systems as the existing owner's
 * grants (at equal or higher scope).
 */
export function findReassignmentCandidates(
  agent: AgentRegistryEntry,
  people: Person[],
): { person: Person; coversGrants: boolean }[] {
  const owner = people.find((p) => p.id === agent.owner_person_id);
  if (!owner) return [];

  const ownerGrants: SystemGrant[] = owner.authority?.system_grants ?? [];

  return people
    .filter(
      (p) =>
        p.id !== agent.owner_person_id &&
        p.lifecycle !== "offboarded" &&
        p.department.toLowerCase().trim() === owner.department.toLowerCase().trim(),
    )
    .map((person) => ({
      person,
      coversGrants:
        ownerGrants.length === 0 ||
        ownerGrants.every((grant) => {
          const candidateGrant = person.authority?.system_grants.find(
            (sg) => sg.system.toLowerCase().trim() === grant.system.toLowerCase().trim(),
          );
          if (!candidateGrant) return false;
          const candidateScope =
            candidateGrant.scope === "admin" ? ("read_write" as AuthorityGrantScope) : candidateGrant.scope;
          return scopeRank(candidateScope) >= scopeRank(grant.scope);
        }),
    }))
    .sort((a, b) => Number(b.coversGrants) - Number(a.coversGrants));
}
