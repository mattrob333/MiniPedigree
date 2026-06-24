// ── Agent Inventory: flatten, filter, and sort agent records ──────────────
// WESCO Enterprise Governance — unified agent registry view across pedigree
// rows, external agents, controls, systems, birth certificates, and risk findings.

import type {
  AgentBirthCertificate,
  AgentRecord,
  AgentRegistryEntry,
  ControlManifest,
  ExternalAgentRecord,
  PedigreeState,
  Person,
  RiskFinding,
  SystemManifest,
} from "../types";

// ── FlattenedAgentEntry ────────────────────────────────────────────────────

export interface FlattenedAgentEntry extends AgentRecord {
  systemNames?: string[];
  controlIds?: string[];
  birthCertificate?: AgentBirthCertificate;
  registryStatus?: string;
  riskFindings?: RiskFinding[];
  orphaned?: boolean;
  stale?: boolean;
  source: "generated" | "imported";
}

export interface FlattenParams {
  people: Person[];
  pedigree: PedigreeState;
  registry: AgentRegistryEntry[];
  birthCertificates?: AgentBirthCertificate[];
  systems?: SystemManifest[];
  controls?: ControlManifest[];
  riskFindings?: RiskFinding[];
  externalAgents?: ExternalAgentRecord[];
}

export interface AgentFilters {
  ownerId?: string;
  department?: string;
  systemName?: string;
  soxOnly?: boolean;
  riskLevel?: string;
  orphanedOnly?: boolean;
  staleOnly?: boolean;
  search?: string;
}

// ── Lookup helpers ─────────────────────────────────────────────────────────

/** Build a map from person id → Person for O(1) lookups. */
function personById(people: Person[]): Map<string, Person> {
  const map = new Map<string, Person>();
  for (const p of people) map.set(p.id, p);
  return map;
}

/** Build a map from agent id → registry entry. */
function registryByAgentId(registry: AgentRegistryEntry[]): Map<string, AgentRegistryEntry> {
  const map = new Map<string, AgentRegistryEntry>();
  for (const r of registry) map.set(r.agent_id, r);
  return map;
}

/** Build a map from agent id → birth certificate. */
function bcByAgentId(birthCertificates: AgentBirthCertificate[]): Map<string, AgentBirthCertificate> {
  const map = new Map<string, AgentBirthCertificate>();
  for (const bc of birthCertificates) map.set(bc.agentId, bc);
  return map;
}

/** Collect system names that a given agent id is connected to. */
function systemNamesForAgent(agentId: string, systems: SystemManifest[]): string[] {
  const names: string[] = [];
  for (const sys of systems) {
    if (sys.connectedAgentIds.includes(agentId)) {
      names.push(sys.name);
    }
  }
  return names;
}

/** Collect control ids that a given agent id is linked to (via controls or risk findings). */
function controlIdsForAgent(
  agentId: string,
  controls: ControlManifest[],
  riskFindings: RiskFinding[],
): string[] {
  const ids = new Set<string>();
  for (const ctrl of controls) {
    if (ctrl.relatedAgentIds.includes(agentId)) ids.add(ctrl.id);
  }
  for (const rf of riskFindings) {
    if (rf.relatedAgentIds.includes(agentId)) {
      for (const cid of rf.relatedControlIds) ids.add(cid);
    }
  }
  return Array.from(ids);
}

/** Collect risk findings that reference a given agent id. */
function riskFindingsForAgent(agentId: string, riskFindings: RiskFinding[]): RiskFinding[] {
  return riskFindings.filter((rf) => rf.relatedAgentIds.includes(agentId));
}

// ── flattenAgents ──────────────────────────────────────────────────────────

/**
 * Flatten all PedigreeRow.agents and externalAgents into a unified array
 * with cross-referenced metadata from registry, birth certificates, systems,
 * controls, and risk findings.
 */
export function flattenAgents(params: FlattenParams): FlattenedAgentEntry[] {
  const {
    people,
    pedigree,
    registry,
    birthCertificates = [],
    systems = [],
    controls = [],
    riskFindings = [],
    externalAgents = [],
  } = params;

  const personMap = personById(people);
  const registryMap = registryByAgentId(registry);
  const bcMap = bcByAgentId(birthCertificates);
  const result: FlattenedAgentEntry[] = [];

  // ── 1. Generated agents from pedigree ────────────────────────────────
  for (const [, row] of Object.entries(pedigree)) {
    for (const agent of row.agents) {
      const regEntry = registryMap.get(agent.id);
      const flat: FlattenedAgentEntry = {
        ...agent,
        source: "generated",
        systemNames: systemNamesForAgent(agent.id, systems),
        controlIds: controlIdsForAgent(agent.id, controls, riskFindings),
        birthCertificate: bcMap.get(agent.id),
        registryStatus: regEntry?.status,
        riskFindings: riskFindingsForAgent(agent.id, riskFindings),
        orphaned:
          regEntry?.stale && regEntry?.stale_reason === "owner_offboarded"
            ? true
            : undefined,
        stale: regEntry?.stale,
      };
      // Detect orphaned via missing person as fallback
      if (flat.orphaned === undefined) {
        const person = personMap.get(agent.person.id);
        if (!person) flat.orphaned = true;
      }
      result.push(flat);
    }
  }

  // ── 2. Imported / external agents ────────────────────────────────────
  for (const ext of externalAgents) {
    const ownerPerson = ext.ownerPersonId ? personMap.get(ext.ownerPersonId) : undefined;
    // Build a synthetic AgentRecord-compatible entry
    const flat: FlattenedAgentEntry = {
      id: ext.id,
      name: ext.name,
      taskId: ext.id, // external agents own a synthetic task id
      respId: ext.id,
      respTitle: ext.purpose ?? ext.name,
      policy: ext.promptSnippet ?? "",
      riskLevel: ext.riskTier,
      person: ownerPerson ?? {
        id: ext.ownerPersonId ?? ext.businessOwnerId ?? ext.technicalOwnerId ?? "unknown",
        name: "",
        email: "",
        title: "",
        managerId: null,
        department: "",
        tools: [],
      },
      task: {
        id: ext.id,
        label: ext.purpose ?? ext.name,
        respId: ext.id,
        respTitle: ext.purpose ?? ext.name,
        soxRelevant: ext.soxRelevant,
      },
      createdAt: ext.createdAt,
      source: "imported",
      systemNames: ext.systems,
      riskFindings: riskFindingsForAgent(ext.id, riskFindings),
      stale: ext.status === "archived" ? true : undefined,
      orphaned: ext.ownerPersonId === undefined ? true : !personMap.has(ext.ownerPersonId),
    };
    result.push(flat);
  }

  return result;
}

// ── filterAgents ───────────────────────────────────────────────────────────

/**
 * Filter a flattened agent list by the given criteria. All filter keys are
 * optional; when absent they are ignored (no filtering on that dimension).
 */
export function filterAgents(
  agents: FlattenedAgentEntry[],
  filters: AgentFilters,
): FlattenedAgentEntry[] {
  return agents.filter((a) => {
    // ownerId
    if (filters.ownerId !== undefined && a.person.id !== filters.ownerId) return false;

    // department
    if (filters.department !== undefined) {
      const dept = (a.person.department ?? "").toLowerCase();
      if (!dept.includes(filters.department.toLowerCase())) return false;
    }

    // systemName
    if (filters.systemName !== undefined) {
      const sysNames = a.systemNames ?? [];
      if (!sysNames.some((s) => s.toLowerCase().includes(filters.systemName!.toLowerCase()))) return false;
    }

    // soxOnly
    if (filters.soxOnly === true && a.task.soxRelevant !== true) return false;

    // riskLevel
    if (filters.riskLevel !== undefined && a.riskLevel !== filters.riskLevel) return false;

    // orphanedOnly
    if (filters.orphanedOnly === true && !a.orphaned) return false;

    // staleOnly
    if (filters.staleOnly === true && !a.stale) return false;

    // search — matches name, agent name, person name, task label
    if (filters.search !== undefined && filters.search.trim() !== "") {
      const q = filters.search.toLowerCase();
      const haystack = [a.name, a.person.name, a.person.email, a.task.label, a.respTitle]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

// ── sortAgents ─────────────────────────────────────────────────────────────

/**
 * Sort a flattened agent list by a named field. Supported sort fields:
 * name, personName, email, department, riskLevel, createdAt, lastConfirmedAt.
 * Falls back to creation date when multiple entries have the same value
 * for the chosen sort field.
 */
export function sortAgents(
  agents: FlattenedAgentEntry[],
  sortBy: string,
  asc: boolean,
): FlattenedAgentEntry[] {
  const sorted = [...agents].sort((a, b) => {
    let cmp = 0;

    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "personName":
        cmp = a.person.name.localeCompare(b.person.name);
        break;
      case "email":
        cmp = a.person.email.localeCompare(b.person.email);
        break;
      case "department":
        cmp = (a.person.department ?? "").localeCompare(b.person.department ?? "");
        break;
      case "riskLevel":
        cmp = sortByRiskLevel(a.riskLevel, b.riskLevel);
        break;
      case "createdAt":
        cmp = a.createdAt.localeCompare(b.createdAt);
        break;
      case "lastConfirmedAt": {
        const aStr = a.task.last_confirmed_at ?? a.createdAt;
        const bStr = b.task.last_confirmed_at ?? b.createdAt;
        cmp = aStr.localeCompare(bStr);
        break;
      }
      default:
        // Unknown sort field — fall back to name
        cmp = a.name.localeCompare(b.name);
    }

    // Tie-break on creation date
    if (cmp === 0) {
      cmp = a.createdAt.localeCompare(b.createdAt);
    }

    return asc ? cmp : -cmp;
  });

  return sorted;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Ordered rank for risk levels (lower index = less risky). */
const RISK_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function sortByRiskLevel(a: string, b: string): number {
  const aRank = RISK_ORDER[a] ?? -1;
  const bRank = RISK_ORDER[b] ?? -1;
  return aRank - bRank;
}
