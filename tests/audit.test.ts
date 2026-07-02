import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { appendAuditEvent, auditLogRows, verifyAuditChain, GENESIS_HASH } from "../src/lib/audit";
import { buildEvidencePack } from "../src/lib/evidence";
import type { AuditEvent, PedigreeState, Person } from "../src/types";

function sampleLog(): AuditEvent[] {
  let log: AuditEvent[] = [];
  log = appendAuditEvent(log, { type: "workspace_created", summary: "Workspace created", actor: "matt@x.co", details: { people: 28 } });
  log = appendAuditEvent(log, { type: "session_applied", summary: "Leadership session applied", actor: "matt@x.co" });
  log = appendAuditEvent(log, { type: "agent_generated", summary: "Agent generated with 1 SOD finding", actor: "matt@x.co", details: { sod_findings: [{ rule_id: "SOD-01", severity: "block" }] } });
  return log;
}

describe("audit ledger", () => {
  it("appends immutably with increasing seq and linked hashes", () => {
    const log = sampleLog();
    expect(log.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(log[0].prevHash).toBe(GENESIS_HASH);
    expect(log[1].prevHash).toBe(log[0].hash);
    expect(log[2].prevHash).toBe(log[1].hash);
    // append returns a new array
    const before = sampleLog();
    const after = appendAuditEvent(before, { type: "export_performed", summary: "x", actor: "a" });
    expect(before).toHaveLength(3);
    expect(after).toHaveLength(4);
  });

  it("verifies an intact chain", () => {
    expect(verifyAuditChain(sampleLog())).toEqual({ ok: true, length: 3 });
    expect(verifyAuditChain([])).toEqual({ ok: true, length: 0 });
  });

  it("detects a tampered event", () => {
    const log = sampleLog();
    const tampered = log.map((e) => (e.seq === 2 ? { ...e, summary: "Session applied to EVERYONE" } : e));
    const result = verifyAuditChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it("detects a deleted event", () => {
    const log = sampleLog();
    const withoutMiddle = [log[0], log[2]];
    const result = verifyAuditChain(withoutMiddle);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(3);
  });

  it("detects a reordered chain", () => {
    const log = sampleLog();
    expect(verifyAuditChain([log[1], log[0], log[2]]).ok).toBe(false);
  });

  it("flattens to CSV-friendly rows", () => {
    const rows = auditLogRows(sampleLog());
    expect(rows).toHaveLength(3);
    expect(rows[2].type).toBe("agent_generated");
    expect(String(rows[2].details)).toContain("SOD-01");
  });
});

describe("evidence pack", () => {
  const person: Person = { id: "P-001", name: "Sam Ortiz", email: "sam@x.co", title: "Analyst", department: "Finance", managerId: null, managerEmail: null, tools: [] };
  const pedigree: PedigreeState = {
    "P-001": {
      status: "generated",
      responsibilities: [{ id: "R-1", title: "Vendor master data" }],
      tasks: {
        delegatable: [{ id: "R-1-d-0", label: "Create vendor records", respId: "R-1", respTitle: "Vendor master data" }],
        approval: [{ id: "R-1-a-0", label: "Approve payment runs", respId: "R-1", respTitle: "Vendor master data" }],
        not_delegatable: [],
      },
      agents: [
        {
          id: "A-1", name: "Vendor Ops Agent", taskId: "R-1-d-0", respId: "R-1", respTitle: "Vendor master data",
          policy: "read-only", riskLevel: "low", person, task: { id: "R-1-d-0", label: "Create vendor records", respId: "R-1", respTitle: "Vendor master data" },
          createdAt: "2026-07-02T00:00:00.000Z",
          manifest: { agent_id: "vendor-ops-agent", sod_findings: [{ rule_id: "SOD-01", severity: "block", message: "conflict" }] },
        },
      ],
    },
  };

  it("zips the ledger, SOD findings, snapshot, and manifests", async () => {
    const blob = await buildEvidencePack({
      workspaceName: "Granite Ridge",
      people: [person],
      pedigree,
      auditLog: sampleLog(),
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    const expectFile = (suffix: string) => expect(names.some((n) => n.endsWith(suffix)), suffix).toBe(true);
    expectFile("README.md");
    expectFile("audit-log.json");
    expectFile("audit-log.csv");
    expectFile("sod-findings.json");
    expectFile("org-snapshot.csv");
    expectFile("manifests/vendor-ops-agent.json");

    const auditJson = JSON.parse(await zip.file(names.find((n) => n.endsWith("audit-log.json"))!)!.async("string"));
    expect(auditJson.chain_verification.ok).toBe(true);
    expect(auditJson.events).toHaveLength(3);

    const sod = JSON.parse(await zip.file(names.find((n) => n.endsWith("sod-findings.json"))!)!.async("string"));
    // person-level SOD-01 (vendor create + payment approval) and the agent's embedded finding
    expect(sod.people_findings.some((f: { rule_id: string }) => f.rule_id === "SOD-01")).toBe(true);
    expect(sod.agent_findings.some((f: { agent_name: string }) => f.agent_name === "Vendor Ops Agent")).toBe(true);

    const readme = await zip.file(names.find((n) => n.endsWith("README.md"))!)!.async("string");
    expect(readme).toContain("chain INTACT");
  });
});
