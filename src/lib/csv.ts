import Papa from "papaparse";
import type { AuthorityGrantScope, AuthorityProfile, CsvImportResult, Person, SystemGrant } from "@/types";

const REQUIRED = ["name", "email", "title"];
// `manager_email` is required by the schema but may be blank for the root.
// We treat a missing manager column as a hard error, blank values as "root".

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

// Accept a few common header aliases so real-world CSVs import cleanly.
const HEADER_ALIASES: Record<string, string> = {
  full_name: "name",
  person: "name",
  job_title: "title",
  role: "title",
  manager: "manager_email",
  manager_email: "manager_email",
  reports_to: "manager_email",
  dept: "department",
  tools: "known_tools",
  known_tools: "known_tools",
  tool_scopes: "tool_scopes",
  scopes: "tool_scopes",
};

function canonicalHeader(h: string): string {
  const n = norm(h);
  return HEADER_ALIASES[n] ?? n;
}

function splitTools(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function slugId(i: number): string {
  return `P-${String(i + 1).padStart(3, "0")}`;
}

const VALID_SCOPES: AuthorityGrantScope[] = ["none", "read_only", "draft_only", "read_write", "admin"];

/**
 * Authority profile from CSV (amendment §2.1). `tool_scopes` is formatted
 * "Salesforce:read_write;Slack:read_only". Unscoped known_tools entries get
 * the conservative default: read_only, asserted, source csv. Returns
 * undefined when the row carries no tool information at all.
 */
export function authorityFromCsv(tools: string[], toolScopesRaw: string | undefined, warnings: string[], rowLabel: string): AuthorityProfile | undefined {
  const grants = new Map<string, SystemGrant>();
  for (const tool of tools) {
    grants.set(tool.toLowerCase(), {
      system: tool,
      scope: "read_only",
      provenance: { source: "csv" },
      status: "asserted",
    });
  }
  for (const part of (toolScopesRaw ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
    const [system, scopeRaw] = part.split(":").map((s) => s.trim());
    if (!system) continue;
    const scope = (scopeRaw ?? "").toLowerCase() as AuthorityGrantScope;
    if (!VALID_SCOPES.includes(scope)) {
      warnings.push(`${rowLabel}: tool_scopes entry "${part}" has an unknown scope — kept as read_only`);
      grants.set(system.toLowerCase(), { system, scope: "read_only", provenance: { source: "csv" }, status: "asserted" });
      continue;
    }
    grants.set(system.toLowerCase(), { system, scope, provenance: { source: "csv" }, status: "asserted" });
  }
  if (!grants.size) return undefined;
  return {
    system_grants: [...grants.values()],
    approval_authority: [],
    sod_roles: [],
    updated_at: new Date().toISOString(),
  };
}

export interface RawRow {
  [key: string]: string;
}

/**
 * Parse a CSV string into Person records.
 * - Validates required columns.
 * - Resolves `manager_email` references to internal person ids.
 * - Flags blank/duplicate emails and unresolved managers as warnings.
 */
export function parsePeopleCsv(text: string, fileName?: string): CsvImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: canonicalHeader,
  });

  if (result.errors.length) {
    for (const e of result.errors.slice(0, 5)) {
      // Papa row index is 0-based for the data rows; +2 accounts for header line.
      errors.push(`Could not parse row ${typeof e.row === "number" ? e.row + 2 : "?"}: ${e.message}`);
    }
  }

  const fields = (result.meta.fields ?? []).map((f) => f);
  for (const req of REQUIRED) {
    if (!fields.includes(req)) {
      errors.push(`Missing required column: ${req}`);
    }
  }
  if (!fields.includes("manager_email")) {
    errors.push("Missing required column: manager_email (values may be blank for the root)");
  }

  if (errors.length) {
    return { people: [], warnings, errors, workspaceName: deriveWorkspaceName(fileName, []) };
  }

  const rows = result.data.filter((r) => (r.name ?? "").trim() || (r.email ?? "").trim());

  // First pass — build people with temp ids, track emails.
  const byEmail = new Map<string, string>(); // email(lower) -> id
  const seenEmails = new Set<string>();
  const people: Person[] = [];
  let blankManagerCount = 0;
  let dupCount = 0;

  rows.forEach((r, i) => {
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim();
    const title = (r.title ?? "").trim();
    const managerEmail = (r.manager_email ?? "").trim();

    if (!name) {
      warnings.push(`Row ${i + 2}: missing name — skipped`);
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`Row ${i + 2}: "${email}" is not a valid email`);
    }
    const emailKey = email.toLowerCase();
    if (email && seenEmails.has(emailKey)) {
      dupCount++;
      warnings.push(`Duplicate email skipped: ${email}`);
      return;
    }
    if (email) seenEmails.add(emailKey);
    if (!managerEmail) blankManagerCount++;

    const id = slugId(people.length);
    if (email) byEmail.set(emailKey, id);

    const tools = splitTools(r.known_tools);
    const authority = authorityFromCsv(tools, r.tool_scopes, warnings, `Row ${i + 2}`);
    people.push({
      id,
      name,
      email,
      title: title || "—",
      managerEmail: managerEmail || null,
      managerId: null, // resolved in second pass
      department: (r.department ?? "").trim() || "—",
      team: (r.team ?? "").trim() || undefined,
      location: (r.location ?? "").trim() || undefined,
      tools,
      notes: (r.notes ?? "").trim() || undefined,
      ...(authority ? { authority } : {}),
      lifecycle: "active",
    });
  });

  // Second pass — resolve manager references.
  let unresolved = 0;
  let rootCount = 0;
  for (const p of people) {
    if (!p.managerEmail) {
      p.managerId = null;
      rootCount++;
      continue;
    }
    const mid = byEmail.get(p.managerEmail.toLowerCase());
    if (mid && mid !== p.id) {
      p.managerId = mid;
    } else {
      p.managerId = null;
      unresolved++;
      rootCount++;
      warnings.push(`Manager "${p.managerEmail}" for ${p.name} not found in CSV — treated as a root`);
    }
  }

  // Cycle guard: if following managers loops, detach to root.
  for (const p of people) {
    const seen = new Set<string>([p.id]);
    let cur = p.managerId;
    while (cur) {
      if (seen.has(cur)) {
        warnings.push(`Reporting cycle detected near ${p.name} — link removed`);
        p.managerId = null;
        break;
      }
      seen.add(cur);
      cur = people.find((x) => x.id === cur)?.managerId ?? null;
    }
  }

  if (blankManagerCount > 1) {
    warnings.push(`${rootCount} people have no manager (multiple roots will render side by side)`);
  }
  void unresolved;
  void dupCount;

  if (people.length === 0) {
    errors.push("No valid people rows found in CSV");
  }

  return {
    people,
    warnings,
    errors,
    workspaceName: deriveWorkspaceName(fileName, people),
  };
}

function deriveWorkspaceName(fileName: string | undefined, people: Person[]): string {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    // "02_northstar_saas_20_people" -> "Northstar Saas"
    const cleaned = base
      .replace(/^\d+[_-]/, "")
      .replace(/[_-]?\d+[_-]?people$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (cleaned) {
      return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  // Fall back to most common email domain.
  const domains = people
    .map((p) => p.email.split("@")[1])
    .filter(Boolean)
    .map((d) => d.split(".")[0]);
  if (domains.length) {
    const top = mode(domains);
    if (top) return top.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Untitled Workspace";
}

function mode(arr: string[]): string | null {
  const counts = new Map<string, number>();
  for (const a of arr) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
