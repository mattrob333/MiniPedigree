import { describe, expect, it } from "vitest";
import type { ApprovalGate } from "../src/types";
import {
  allGatesMet,
  approveGate,
  checkGate,
  deriveApprovalGates,
  GATES,
  pendingGates,
  requiredGatesMet,
} from "../src/lib/approvalGates";

// ── deriveApprovalGates ──────────────────────────────────────────────

describe("deriveApprovalGates", () => {
  it("returns an empty array when no triggers are present", () => {
    const gates = deriveApprovalGates({});
    expect(gates).toEqual([]);
  });

  it("SOX relevance creates a SOX_COMPLIANCE_REVIEW gate", () => {
    const gates = deriveApprovalGates({ soxRelevant: true });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.SOX_COMPLIANCE_REVIEW);
    expect(gates[0].required).toBe(true);
    expect(gates[0].met).toBe(false);
  });

  it("financial system access creates a FINANCIAL_SYSTEM_ACCESS gate", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "FIN_ERP_CLOUD", accessNeeded: "read" }],
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.FINANCIAL_SYSTEM_ACCESS);
    expect(gates[0].met).toBe(false);
  });

  it("HR system access creates an HR_SYSTEM_ACCESS gate", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "HRIS_WORKDAY", accessNeeded: "read" }],
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.HR_SYSTEM_ACCESS);
  });

  it("payroll system access also triggers HR_SYSTEM_ACCESS", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "PAYROLL_NETSUITE", accessNeeded: "read" }],
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.HR_SYSTEM_ACCESS);
  });

  it("write access creates a WRITE_ACCESS_REVIEW gate", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "SALESFORCE", accessNeeded: "write" }],
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.WRITE_ACCESS_REVIEW);
  });

  it("admin access creates a WRITE_ACCESS_REVIEW gate", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "SALESFORCE", accessNeeded: "admin" }],
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.WRITE_ACCESS_REVIEW);
  });

  it("read-only non-financial/non-HR access produces no gates", () => {
    const gates = deriveApprovalGates({
      systemAccess: [{ systemId: "CONFLUENCE", accessNeeded: "read" }],
    });
    expect(gates).toEqual([]);
  });

  it("high risk creates a HIGH_RISK_REVIEW gate", () => {
    const gates = deriveApprovalGates({ riskTier: "high" });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.HIGH_RISK_REVIEW);
  });

  it("critical risk creates a HIGH_RISK_REVIEW gate", () => {
    const gates = deriveApprovalGates({ riskTier: "critical" });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.HIGH_RISK_REVIEW);
  });

  it("low risk does NOT create a HIGH_RISK_REVIEW gate", () => {
    const gates = deriveApprovalGates({ riskTier: "low" });
    expect(gates).toEqual([]);
  });

  it("service account name creates a SERVICE_ACCOUNT_EXCEPTION gate", () => {
    const gates = deriveApprovalGates({ agentName: "deploy-bot" });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.SERVICE_ACCOUNT_EXCEPTION);
  });

  it("purpose text mentioning automation creates a SERVICE_ACCOUNT_EXCEPTION gate", () => {
    const gates = deriveApprovalGates({
      agentName: "DataPump",
      purpose: "Runs as a scheduled task to sync data nightly",
    });
    expect(gates).toHaveLength(1);
    expect(gates[0].gate).toBe(GATES.SERVICE_ACCOUNT_EXCEPTION);
  });

  it("plain agent name does NOT create a service account gate", () => {
    const gates = deriveApprovalGates({
      agentName: "Claims Assistant",
      purpose: "Helps the revenue team summarise claims",
    });
    expect(gates).toEqual([]);
  });

  // ── Combined triggers ───────────────────────────────────────────────

  it("combines multiple triggers into distinct gates", () => {
    const gates = deriveApprovalGates({
      soxRelevant: true,
      riskTier: "high",
      systemAccess: [
        { systemId: "FIN_ERP", accessNeeded: "read" },
        { systemId: "HRIS_BAMBOO", accessNeeded: "write" },
      ],
    });
    const gateNames = gates.map((g) => g.gate);
    expect(gateNames).toContain(GATES.SOX_COMPLIANCE_REVIEW);
    expect(gateNames).toContain(GATES.FINANCIAL_SYSTEM_ACCESS);
    expect(gateNames).toContain(GATES.HR_SYSTEM_ACCESS);
    expect(gateNames).toContain(GATES.WRITE_ACCESS_REVIEW);
    expect(gateNames).toContain(GATES.HIGH_RISK_REVIEW);
    expect(gates).toHaveLength(5);
    gates.forEach((g) => {
      expect(g.required).toBe(true);
      expect(g.met).toBe(false);
    });
  });
});

// ── checkGate ────────────────────────────────────────────────────────

describe("checkGate", () => {
  it("returns false for unmet gate", () => {
    const gate: ApprovalGate = { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: false };
    expect(checkGate(gate)).toBe(false);
  });

  it("returns true for met gate", () => {
    const gate: ApprovalGate = { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true, approver: "alice@co.com", metAt: "2026-01-01T00:00:00.000Z" };
    expect(checkGate(gate)).toBe(true);
  });
});

// ── approveGate ─────────────────────────────────────────────────────

describe("approveGate", () => {
  it("returns a new gate with met=true, approver, and a metAt timestamp", () => {
    const gate: ApprovalGate = { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: false };
    const approved = approveGate(gate, "alice@co.com");

    expect(approved.met).toBe(true);
    expect(approved.approver).toBe("alice@co.com");
    expect(approved.metAt).toBeDefined();
    expect(typeof approved.metAt).toBe("string");
    // iso string
    expect(approved.metAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // original is unchanged (immutability)
    expect(gate.met).toBe(false);
    expect(gate.approver).toBeUndefined();
  });
});

// ── allGatesMet ─────────────────────────────────────────────────────

describe("allGatesMet", () => {
  it("returns true when every gate is met", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
      { gate: "HIGH_RISK_REVIEW", required: true, met: true },
    ];
    expect(allGatesMet(gates)).toBe(true);
  });

  it("returns false when any gate is unmet", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
      { gate: "HIGH_RISK_REVIEW", required: true, met: false },
    ];
    expect(allGatesMet(gates)).toBe(false);
  });

  it("returns false for empty gates array", () => {
    expect(allGatesMet([])).toBe(false);
  });
});

// ── requiredGatesMet ────────────────────────────────────────────────

describe("requiredGatesMet", () => {
  it("returns true when all required gates are met", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
      { gate: "FINANCIAL_SYSTEM_ACCESS", required: false, met: false }, // non-required, ignored
    ];
    expect(requiredGatesMet(gates)).toBe(true);
  });

  it("returns false when any required gate is unmet", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
      { gate: "HIGH_RISK_REVIEW", required: true, met: false },
    ];
    expect(requiredGatesMet(gates)).toBe(false);
  });

  it("returns false when there are no required gates", () => {
    const gates: ApprovalGate[] = [
      { gate: "OPTIONAL_GATE", required: false, met: false },
    ];
    expect(requiredGatesMet(gates)).toBe(false);
  });

  it("returns false for empty gates array", () => {
    expect(requiredGatesMet([])).toBe(false);
  });
});

// ── pendingGates ───────────────────────────────────────────────────

describe("pendingGates", () => {
  it("returns only gates where met=false", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
      { gate: "HIGH_RISK_REVIEW", required: true, met: false },
      { gate: "WRITE_ACCESS_REVIEW", required: true, met: false },
    ];
    const pending = pendingGates(gates);
    expect(pending).toHaveLength(2);
    expect(pending.map((g) => g.gate)).toEqual(["HIGH_RISK_REVIEW", "WRITE_ACCESS_REVIEW"]);
  });

  it("returns empty array when all gates are met", () => {
    const gates: ApprovalGate[] = [
      { gate: "SOX_COMPLIANCE_REVIEW", required: true, met: true },
    ];
    expect(pendingGates(gates)).toEqual([]);
  });
});

// ── Full workflow ────────────────────────────────────────────────────

describe("approval gate workflow (end-to-end)", () => {
  it("derives, approves one gate, checks all-met status", () => {
    // 1. Derive gates for a SOX-relevant, high-risk agent with admin financial access
    const gates = deriveApprovalGates({
      soxRelevant: true,
      riskTier: "critical",
      systemAccess: [{ systemId: "FIN_ERP", accessNeeded: "admin" }],
    });
    // Expects: SOX_COMPLIANCE_REVIEW + HIGH_RISK_REVIEW + FINANCIAL_SYSTEM_ACCESS + WRITE_ACCESS_REVIEW = 4
    expect(gates).toHaveLength(4);
    const names = gates.map((g) => g.gate);
    expect(names).toContain(GATES.SOX_COMPLIANCE_REVIEW);
    expect(names).toContain(GATES.HIGH_RISK_REVIEW);
    expect(names).toContain(GATES.FINANCIAL_SYSTEM_ACCESS);
    expect(names).toContain(GATES.WRITE_ACCESS_REVIEW);

    // 2. Initially none met
    expect(allGatesMet(gates)).toBe(false);
    expect(pendingGates(gates)).toHaveLength(4);

    // 3. Approve all gates
    const approvedGates = gates.map((g) => approveGate(g, "auditor@co.com"));
    expect(allGatesMet(approvedGates)).toBe(true);
    expect(pendingGates(approvedGates)).toHaveLength(0);
    expect(requiredGatesMet(approvedGates)).toBe(true);

    // 4. Each approved gate has metadata
    for (const g of approvedGates) {
      expect(g.met).toBe(true);
      expect(g.approver).toBe("auditor@co.com");
      expect(g.metAt).toBeDefined();
    }
  });
});
