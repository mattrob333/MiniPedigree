import { describe, it, expect } from "vitest";
import { checkAgentSod, checkOrgSod, checkTaskSetSod, proposedAgentTaskLabels, DEFAULT_SOD_RULES } from "../src/lib/sod";
import { buildAgentArtifacts } from "../src/lib/agent";
import type { PedigreeRow, Person, TaskItem } from "../src/types";

const person: Person = {
  id: "P-001",
  name: "Sam Ortiz",
  email: "sam@x.co",
  title: "Vendor Master Data Analyst",
  department: "Finance",
  managerId: null,
  managerEmail: null,
  tools: ["SAP S/4HANA"],
};

const t = (id: string, label: string, respId = "R-1", respTitle = "Vendor master data"): TaskItem => ({ id, label, respId, respTitle });

function row(partial?: Partial<PedigreeRow>): PedigreeRow {
  return {
    status: "ready",
    responsibilities: [{ id: "R-1", title: "Vendor master data" }],
    tasks: { delegatable: [], approval: [], not_delegatable: [] },
    agents: [],
    ...partial,
  };
}

describe("checkTaskSetSod", () => {
  it("detects one actor holding both sides of a duty pair", () => {
    const findings = checkTaskSetSod([
      "Create vendor records with bank details",
      "Approve payment runs for suppliers",
    ]);
    expect(findings.some((f) => f.ruleId === "SOD-01" && f.severity === "block")).toBe(true);
  });

  it("stays quiet on a clean task set", () => {
    expect(checkTaskSetSod(["Summarize weekly metrics", "Draft board narrative"])).toEqual([]);
    expect(checkTaskSetSod(["Create vendor records"])).toEqual([]);
  });

  it("SOD-04: releasing blocked orders is a credit-side duty, not an order-entry duty", () => {
    // A credit manager doing both credit functions is NOT a conflict…
    expect(checkTaskSetSod([
      "Set customer credit limits",
      "Release blocked orders after review",
    ]).filter((f) => f.ruleId === "SOD-04")).toEqual([]);
    // …but combining credit release with sales order entry IS.
    const findings = checkTaskSetSod([
      "Own releasing blocked orders for the Northeast branch",
      "Enter sales orders for the branch",
    ]);
    expect(findings.some((f) => f.ruleId === "SOD-04" && f.severity === "block")).toBe(true);
  });
});

describe("checkAgentSod", () => {
  it("flags a proposed agent whose own tasks span a duty pair", () => {
    const findings = checkAgentSod({
      person,
      row: row(),
      agentTaskLabels: ["Maintain vendor bank details", "Release payment runs"],
      agentName: "AP Automation Agent",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].scope).toBe("agent");
    expect(findings[0].ruleId).toBe("SOD-01");
  });

  it("flags an agent that hands its owner the other side of a duty the owner already holds", () => {
    const ownerRow = row({
      tasks: {
        delegatable: [t("R-1-d-0", "Create vendor records in SAP")],
        approval: [],
        not_delegatable: [],
      },
    });
    const findings = checkAgentSod({
      person,
      row: ownerRow,
      agentTaskLabels: ["Draft approval of payment runs"],
      agentName: "Payment Agent",
    });
    expect(findings.some((f) => f.scope === "owner" && f.ruleId === "SOD-01")).toBe(true);
  });

  it("is clean when agent and owner duties do not conflict", () => {
    const findings = checkAgentSod({
      person,
      row: row({ tasks: { delegatable: [t("R-1-d-0", "Create vendor records in SAP")], approval: [], not_delegatable: [] } }),
      agentTaskLabels: ["Compile vendor data quality report"],
      agentName: "Reporting Agent",
    });
    expect(findings).toEqual([]);
  });
});

describe("checkOrgSod", () => {
  it("finds people whose combined task set spans a duty pair", () => {
    const pedigree = {
      "P-001": row({
        tasks: {
          delegatable: [t("R-1-d-0", "Post goods receipts at the dock")],
          approval: [t("R-1-a-0", "Process invoices through three-way match")],
          not_delegatable: [],
        },
      }),
    };
    const findings = checkOrgSod([person], pedigree);
    expect(findings.some((f) => f.ruleId === "SOD-03" && f.personId === "P-001")).toBe(true);
  });

  it("includes duties held via generated agents", () => {
    const pedigree = {
      "P-001": row({
        tasks: { delegatable: [t("R-1-d-0", "Create vendor records")], approval: [], not_delegatable: [] },
        agents: [
          {
            id: "A-x",
            name: "Payments Agent",
            taskId: "T",
            respId: "R-2",
            respTitle: "Payments",
            policy: "read-only",
            riskLevel: "low" as const,
            person,
            task: t("T", "x"),
            createdAt: "",
            manifest: { allowed_tasks: ["Draft payment run approvals"], human_approval_required: [] },
          },
        ],
      }),
    };
    const findings = checkOrgSod([person], pedigree);
    expect(findings.some((f) => f.ruleId === "SOD-01")).toBe(true);
  });
});

describe("buildAgentArtifacts SOD integration", () => {
  it("embeds sod_findings in the manifest, warnings, and system prompt", () => {
    const task = t("R-1-d-0", "Maintain vendor bank details");
    const theRow = row({
      tasks: {
        delegatable: [task, t("R-1-d-1", "Approve payment runs weekly")],
        approval: [],
        not_delegatable: [],
      },
    });
    const artifacts = buildAgentArtifacts({
      person,
      row: theRow,
      task,
      respTitle: "Vendor master data",
      agentName: "Vendor Ops Agent",
      policy: "read-only",
      riskLevel: "low",
    });
    expect(artifacts.sodFindings.length).toBeGreaterThan(0);
    const manifest = artifacts.manifest as { sod_findings: Array<{ rule_id: string }>; validation_warnings: string[] };
    expect(manifest.sod_findings.some((f) => f.rule_id === "SOD-01")).toBe(true);
    expect(manifest.validation_warnings.some((w) => w.includes("SOD-01"))).toBe(true);
    expect(artifacts.systemPrompt).toContain("[SEGREGATION OF DUTIES CONSTRAINTS]");
    expect(artifacts.systemPrompt).toContain("SOD-01");
  });

  it("emits no SOD block for a clean agent", () => {
    const task = t("R-1-d-0", "Compile vendor data quality report");
    const artifacts = buildAgentArtifacts({
      person,
      row: row({ tasks: { delegatable: [task], approval: [], not_delegatable: [] } }),
      task,
      respTitle: "Vendor master data",
      agentName: "Reporting Agent",
      policy: "read-only",
      riskLevel: "low",
    });
    expect(artifacts.sodFindings).toEqual([]);
    expect(artifacts.systemPrompt).not.toContain("[SEGREGATION OF DUTIES CONSTRAINTS]");
  });
});

describe("proposedAgentTaskLabels", () => {
  it("mirrors the manifest seeding: task + same-responsibility delegatable and approval tasks", () => {
    const task = t("R-1-d-0", "Maintain vendor records");
    const theRow = row({
      tasks: {
        delegatable: [task, t("R-1-d-1", "Compile vendor report"), t("R-2-d-0", "Other resp task", "R-2")],
        approval: [t("R-1-a-0", "Submit vendor changes")],
        not_delegatable: [t("R-1-n-0", "Approve vendor payments")],
      },
    });
    const labels = proposedAgentTaskLabels(theRow, task);
    expect(labels).toContain("Maintain vendor records");
    expect(labels).toContain("Compile vendor report");
    expect(labels).toContain("Submit vendor changes");
    expect(labels).not.toContain("Other resp task");
    expect(labels).not.toContain("Approve vendor payments");
  });
});

describe("DEFAULT_SOD_RULES", () => {
  it("has unique ids and non-empty duty sides", () => {
    const ids = DEFAULT_SOD_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of DEFAULT_SOD_RULES) {
      expect(r.dutyA.length).toBeGreaterThan(0);
      expect(r.dutyB.length).toBeGreaterThan(0);
      // matcher phrases must be lower-case (matching lower-cases the labels)
      for (const p of [...r.dutyA, ...r.dutyB]) expect(p).toBe(p.toLowerCase());
    }
  });
});
