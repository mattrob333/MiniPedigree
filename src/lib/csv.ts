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
