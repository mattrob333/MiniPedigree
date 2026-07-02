import Papa from "papaparse";
import type { CsvImportResult, Person } from "@/types";

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

  // First pass — build people with temp ids, track emails.
  const byEmail = new Map<string, string>(); // email(lower) -> id
  const seenEmails = new Set<string>();
  const people: Person[] = [];

  result.data.forEach((r, i) => {
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim();
    const title = (r.title ?? "").trim();
    const managerEmail = (r.manager_email ?? "").trim();

    if (!name && !email) return; // fully blank row
    if (!name) {
      warnings.push(`Row ${i + 2}: missing name — skipped`);
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`Row ${i + 2}: "${email}" is not a valid email`);
    }
    const emailKey = email.toLowerCase();
    if (email && seenEmails.has(emailKey)) {
      warnings.push(`Duplicate email skipped: ${email}`);
      return;
    }
    if (email) seenEmails.add(emailKey);

    const id = slugId(people.length);
    if (email) byEmail.set(emailKey, id);

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
      tools: splitTools(r.known_tools),
      notes: (r.notes ?? "").trim() || undefined,
    });
  });

  // Second pass — resolve manager references.
  let rootCount = 0;
  for (const p of people) {
    if (!p.managerEmail) {
      p.managerId = null;
      rootCount++;
      continue;
    }
    const mid = byEmail.get(p.managerEmail.toLowerCase());
    if (mid === p.id) {
      p.managerId = null;
      rootCount++;
      warnings.push(`${p.name} is listed as their own manager — treated as a root`);
    } else if (mid) {
      p.managerId = mid;
    } else {
      p.managerId = null;
      rootCount++;
      warnings.push(`Manager "${p.managerEmail}" for ${p.name} not found in CSV — treated as a root`);
    }
  }

  // Cycle guard: walk each manager chain once; when a chain loops back on
  // itself, detach the link that closes the loop (people merely *downstream*
  // of a cycle keep their valid manager links).
  const byId = new Map(people.map((p) => [p.id, p]));
  const visitState = new Map<string, "visiting" | "done">();
  for (const p of people) {
    if (visitState.has(p.id)) continue;
    const path: Person[] = [];
    let cur: Person | undefined = p;
    while (cur && !visitState.has(cur.id)) {
      visitState.set(cur.id, "visiting");
      path.push(cur);
      cur = cur.managerId ? byId.get(cur.managerId) : undefined;
    }
    if (cur && visitState.get(cur.id) === "visiting") {
      warnings.push(`Reporting cycle detected near ${cur.name} — link removed`);
      cur.managerId = null;
      rootCount++;
    }
    for (const node of path) visitState.set(node.id, "done");
  }

  if (rootCount > 1) {
    warnings.push(`${rootCount} people have no manager (multiple roots will render side by side)`);
  }

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
