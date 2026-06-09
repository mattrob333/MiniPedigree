import { describe, it, expect } from "vitest";
import {
  applyGovernance,
  clearGovernanceRuleCache,
  extractGovernanceRulesDeterministic,
  getGovernanceRules,
  governanceSourceHash,
} from "../src/lib/governance";
import { buildAgentArtifacts } from "../src/lib/agent";
import type { CompanyContext, PedigreeRow, Person, TaskItem } from "../src/types";

const owner: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: "P-000", managerEmail: "vp@x.co", tools: ["Salesforce"],
};

describe("extractGovernanceRulesDeterministic", () => {
  it("extracts approval rules with amount thresholds", () => {
    const rules = extractGovernanceRulesDeterministic({
      approvalRules: ["Exports of forecast reports above $500 require manager approval."],
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe("approval");
    expect(rules[0].matcher.amount_threshold).toBe(500);
    expect(rules[0].approver).toBe("owner_manager");
    expect(rules[0].evidence_quote).toContain("above $500");
    expect(rules[0].source_doc).toBe("company_context.approvalRules");
  });

  it("extracts prohibition and SoD rules from context documents", () => {
    const rules = extractGovernanceRulesDeterministic({
      contextDocuments: [{
        id: "policy:p.txt:1:1", bucket: "policy", fileName: "p.txt",
        text: "Agents must never grant system access. The same person may not prepare and approve a payment.",
        uploadedAt: "2026-06-01T00:00:00.000Z",
      }],
    });
    expect(rules.map((r) => r.type).sort()).toEqual(["blocked", "sod_conflict"]);
    const blocked = rules.find((r) => r.type === "blocked")!;
    expect(blocked.source_doc).toBe("policy:p.txt:1:1");
    expect(blocked.matcher.keywords).toContain("access");
  });

  it("extracts audit rules and ignores knowledge-bucket documents", () => {
    const rules = extractGovernanceRulesDeterministic({
      contextDocuments: [
        { id: "policy:a.txt", bucket: "policy", fileName: "a.txt", text: "All exports must be logged with an audit trail entry.", uploadedAt: "x" },
        { id: "knowledge:k.txt", bucket: "knowledge", fileName: "k.txt", text: "Customers must never wait more than a day.", uploadedAt: "x" },
      ],
    });
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe("audit");
  });

  it("caches per source hash and invalidates on change", () => {
    clearGovernanceRuleCache();
    const ctx: CompanyContext = { company: "X", whatWeDo: "", approvalRules: ["Refunds must be approved by Finance."] };
    const first = getGovernanceRules(ctx);
    expect(getGovernanceRules({ ...ctx })).toBe(first); // same hash → cached array
    const changed: CompanyContext = { ...ctx, approvalRules: ["Refunds must be approved by Legal."] };
    expect(governanceSourceHash({ approvalRules: changed.approvalRules })).not.toBe(governanceSourceHash({ approvalRules: ctx.approvalRules }));
    expect(getGovernanceRules(changed)).not.toBe(first);
  });
});

describe("applyGovernance (monotonic merge)", () => {
  it("moves a matching action into approval with the right approver", () => {
    const rules = extractGovernanceRulesDeterministic({
      approvalRules: ["Exporting forecast reports above $500 requires manager approval."],
    });
    const out = applyGovernance(rules, {
      allowed: ["Export forecast reports to Finance", "Summarize exceptions"],
      approval: [],
      blocked: [],
    }, { owner, managerEmail: owner.managerEmail });

    expect(out.allowed).toEqual(["Summarize exceptions"]);
    expect(out.approval).toHaveLength(1);
    expect(out.approval[0].action).toBe("Export forecast reports to Finance");
    expect(out.approval[0].approver).toBe("vp@x.co");
    expect(out.approval[0].rule_id).toBeDefined();
  });

  it("splits or blocks SoD prepare/approve conflicts and records a finding", () => {
    const rules = extractGovernanceRulesDeterministic({
      segregationOfDuties: ["The same person may not prepare and approve a payment."],
    });
    const out = applyGovernance(rules, {
      allowed: ["Prepare payment batches", "Approve payment batches"],
      approval: [],
      blocked: [],
    }, { owner });

    expect(out.allowed).toContain("Prepare payment batches");
    expect(out.allowed).not.toContain("Approve payment batches");
    expect(out.blocked.some((b) => b.action === "Approve payment batches")).toBe(true);
    expect(out.sod_findings).toHaveLength(1);
    expect(out.sod_findings[0].resolution).toBe("split");
  });

  it("never demotes: blocked rules promote approval items, nothing moves down", () => {
    const rules = extractGovernanceRulesDeterministic({
      contextDocuments: [{ id: "policy:x", bucket: "policy", fileName: "x", text: "Agents must never send refunds to customers.", uploadedAt: "x" }],
    });
    const out = applyGovernance(rules, {
      allowed: ["Summarize tickets"],
      approval: ["Send refunds to customers"],
      blocked: ["Approve final budget"],
    }, { owner });

    expect(out.blocked.map((b) => b.action)).toContain("Send refunds to customers");
    expect(out.blocked.map((b) => b.action)).toContain("Approve final budget");
    expect(out.approval).toHaveLength(0);
    expect(out.allowed).toEqual(["Summarize tickets"]);
  });

  it("every rule-derived constraint carries rule_id and evidence_quote provenance", () => {
    const rules = extractGovernanceRulesDeterministic({
      approvalRules: ["Exporting customer data requires approval."],
      contextDocuments: [{ id: "policy:audit", bucket: "policy", fileName: "a", text: "Every data export must be logged in the audit trail.", uploadedAt: "x" }],
    });
    const out = applyGovernance(rules, { allowed: ["Export customer data summary"], approval: [], blocked: [] }, { owner });

    expect(out.approval[0].rule_id).toBeDefined();
    expect(out.audit_events.length).toBeGreaterThan(0);
    for (const entry of out.rule_provenance) {
      expect(entry.rule_id).toBeTruthy();
      expect(entry.evidence_quote).toBeTruthy();
      expect(entry.source_doc).toBeTruthy();
    }
    const approvalProv = out.rule_provenance.find((p) => p.rule_id === out.approval[0].rule_id);
    expect(approvalProv?.evidence_quote).toContain("requires approval");
  });
});

describe("governance wired into buildAgentArtifacts", () => {
  const task: TaskItem = { id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };
  const row: PedigreeRow = {
    status: "ready",
    responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
    tasks: {
      delegatable: [task, { id: "R-001-d-1", label: "Export forecast reports to Finance", respId: "R-001", respTitle: "Forecast hygiene" }],
      approval: [],
      not_delegatable: [],
    },
    agents: [],
  };
  const companyContext: CompanyContext = {
    company: "X", whatWeDo: "B2B SaaS",
    approvalRules: ["Exporting forecast reports requires manager approval."],
  };

  it("promotes a policy-matched task into human_approval_required with provenance", () => {
    const out = buildAgentArtifacts({ person: owner, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Agent", policy: "read-only", riskLevel: "low", companyContext });
    expect(out.approval).toContain("Export forecast reports to Finance");
    expect(out.allowed).not.toContain("Export forecast reports to Finance");
    const manifest = out.manifest as any;
    const entry = manifest.governance.approval.find((a: any) => a.action === "Export forecast reports to Finance");
    expect(entry.approver).toBe("vp@x.co");
    expect(manifest.governance.rule_provenance.some((p: any) => p.rule_id === entry.rule_id)).toBe(true);
  });

  it("the AI author cannot demote a rule-blocked item back to allowed", () => {
    const blockedCtx: CompanyContext = {
      company: "X", whatWeDo: "",
      complianceNotes: [],
      contextDocuments: [{ id: "policy:b", bucket: "policy", fileName: "b", text: "Agents must never export forecast reports externally.", uploadedAt: "x" }],
    };
    const out = buildAgentArtifacts({
      person: owner, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Agent",
      policy: "auto-write", riskLevel: "medium", companyContext: blockedCtx,
      authored: { allowed_tasks: ["Export forecast reports to Finance"] },
    });
    expect(out.allowed).not.toContain("Export forecast reports to Finance");
    expect(out.blocked).toContain("Export forecast reports to Finance");
  });
});
