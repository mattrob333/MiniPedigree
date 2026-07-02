import JSZip from "jszip";
import Papa from "papaparse";
import type { AuditEvent, CompanyContext, PedigreeState, Person } from "@/types";
import { auditLogRows, verifyAuditChain } from "./audit";
import { checkOrgSod, type SodFinding } from "./sod";
import { exportEnrichedCsv } from "./state";
import { slugify } from "./agent";

// ── Evidence pack ──────────────────────────────────────────────────────
// One-click export of everything an auditor asks for: the org snapshot, every
// agent manifest, all SOD findings, and the hash-chained audit log with its
// verification result. This is the artifact an internal-audit champion can
// forward without a product walkthrough.

export interface EvidencePackInput {
  workspaceName: string;
  people: Person[];
  pedigree: PedigreeState;
  companyContext?: CompanyContext;
  auditLog: AuditEvent[];
}

export async function buildEvidencePack(input: EvidencePackInput): Promise<Blob> {
  const { workspaceName, people, pedigree, companyContext, auditLog } = input;
  const generatedAt = new Date().toISOString();
  const chain = verifyAuditChain(auditLog);
  const orgFindings = checkOrgSod(people, pedigree);
  const agents = people.flatMap((p) => pedigree[p.id]?.agents ?? []);
  const agentFindings = agents.flatMap((a) => {
    const sod = ((a.manifest as { sod_findings?: unknown[] } | undefined)?.sod_findings ?? []) as Record<string, unknown>[];
    return sod.map((f) => ({ agent_id: a.id, agent_name: a.name, owner: a.person.name, ...f }));
  });

  const zip = new JSZip();
  const root = zip.folder(`${slugify(workspaceName) || "workspace"}-evidence-pack`) ?? zip;

  root.file("README.md", buildReadme({ workspaceName, generatedAt, people, agents, orgFindings, agentFindings, chain, companyContext }));
  root.file("audit-log.json", JSON.stringify({ chain_verification: chain, events: auditLog }, null, 2));
  root.file("audit-log.csv", Papa.unparse(auditLogRows(auditLog)));
  root.file(
    "sod-findings.json",
    JSON.stringify(
      {
        generated_at: generatedAt,
        people_findings: orgFindings.map(sodFindingJson),
        agent_findings: agentFindings,
      },
      null,
      2,
    ),
  );
  root.file("org-snapshot.csv", exportEnrichedCsv(people, pedigree));
  if (companyContext) {
    // context documents carry full text; the snapshot lists them by reference
    const { contextDocuments, ...profile } = companyContext;
    root.file(
      "company-profile.json",
      JSON.stringify(
        { ...profile, context_documents: (contextDocuments ?? []).map((d) => ({ id: d.id, bucket: d.bucket, file_name: d.fileName, uploaded_at: d.uploadedAt })) },
        null,
        2,
      ),
    );
  }

  const manifests = root.folder("manifests") ?? root;
  for (const agent of agents) {
    manifests.file(`${slugify(agent.name) || agent.id}.json`, JSON.stringify(agent.manifest ?? {}, null, 2));
  }

  return zip.generateAsync({ type: "blob" });
}

function sodFindingJson(f: SodFinding): Record<string, unknown> {
  return {
    rule_id: f.ruleId,
    rule_name: f.ruleName,
    severity: f.severity,
    scope: f.scope,
    person_id: f.personId,
    person_name: f.personName,
    agent_name: f.agentName,
    duty_a_matches: f.dutyAMatches,
    duty_b_matches: f.dutyBMatches,
    message: f.message,
  };
}

function buildReadme(args: {
  workspaceName: string;
  generatedAt: string;
  people: Person[];
  agents: unknown[];
  orgFindings: SodFinding[];
  agentFindings: unknown[];
  chain: ReturnType<typeof verifyAuditChain>;
  companyContext?: CompanyContext;
}): string {
  const { workspaceName, generatedAt, people, agents, orgFindings, agentFindings, chain } = args;
  const blocking = orgFindings.filter((f) => f.severity === "block").length;
  return [
    `# Evidence Pack — ${workspaceName}`,
    "",
    `Generated: ${generatedAt} by Pedigree Discover Lite`,
    "",
    "## Contents",
    "- `audit-log.json` / `audit-log.csv` — append-only, hash-chained event ledger (who did what, when)",
    "- `sod-findings.json` — segregation-of-duties findings across people and generated agents",
    "- `org-snapshot.csv` — the full org with responsibilities, task classifications, and agent candidates",
    "- `company-profile.json` — business context grounding the agents (document texts referenced, not embedded)",
    "- `manifests/` — one governed manifest per generated agent (authority, approvals, blocked tasks, I/O contract)",
    "",
    "## Summary",
    `- People: ${people.length}`,
    `- Generated agents: ${agents.length}`,
    `- SOD findings: ${orgFindings.length} person-level (${blocking} blocking), ${agentFindings.length} agent-level`,
    `- Audit ledger: ${chain.length} events — chain ${chain.ok ? "INTACT" : `BROKEN at seq ${chain.brokenAtSeq}`}`,
    "",
    "## Verifying the audit chain",
    "Each event's `hash` covers its content plus the previous event's hash, starting from a",
    "zero genesis hash. Recompute FNV-1a 64-bit over `seq|ts|actor|type|summary|details|prevHash`",
    "for each event in order; any edited, removed, or reordered event breaks every hash after it.",
    "(v0 note: FNV-1a is tamper-evident, not cryptographic; the production ledger is server-side SHA-256.)",
  ].join("\n");
}
