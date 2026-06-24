import type { ApprovalGate, RiskLevel } from "../types";

// ── Helper: detect system category from systemId/name ────────────────

const FIN_SYSTEM_PATTERNS = /^(FIN|ERP|ACCOUNTING|BILLING|INVOICE|PAYMENTS?|GL|AR|AP|TAX|BUDGET)/i;
const HR_SYSTEM_PATTERNS = /^(HR|HCM|PAYROLL|PEOPLE|TALENT|WORKFORCE|BENEFITS|TIME|ATTENDANCE)/i;

function isFinancialSystem(systemId: string): boolean {
  return FIN_SYSTEM_PATTERNS.test(systemId);
}

function isHrSystem(systemId: string): boolean {
  return HR_SYSTEM_PATTERNS.test(systemId);
}

function isWriteOrAdmin(accessNeeded: string): boolean {
  const lower = accessNeeded.toLowerCase();
  return lower === "write" || lower === "admin";
}

function isServiceAccountPattern(name?: string, purpose?: string): boolean {
  const text = [name ?? "", purpose ?? ""].join(" ").toLowerCase();
  return /\b(service\s*account|bot|automation|headless|daemon|cron|scheduled\s*task|integration\s*user)\b/.test(text);
}

// ── Well-known approval gate identifiers ─────────────────────────────

export const GATES = {
  SOX_COMPLIANCE_REVIEW: "SOX_COMPLIANCE_REVIEW",
  FINANCIAL_SYSTEM_ACCESS: "FINANCIAL_SYSTEM_ACCESS",
  HR_SYSTEM_ACCESS: "HR_SYSTEM_ACCESS",
  WRITE_ACCESS_REVIEW: "WRITE_ACCESS_REVIEW",
  HIGH_RISK_REVIEW: "HIGH_RISK_REVIEW",
  SERVICE_ACCOUNT_EXCEPTION: "SERVICE_ACCOUNT_EXCEPTION",
} as const;

// ── Derivation ───────────────────────────────────────────────────────

interface DerivationInput {
  soxRelevant?: boolean;
  riskTier?: RiskLevel;
  systemAccess?: { systemId: string; accessNeeded: string }[];
  agentName?: string;
  purpose?: string;
}

/**
 * Derive required approval gates from a (possibly partial) agent manifest.
 * Each detected trigger produces one gate, all starting with met=false.
 *
 * Triggers (PRD §7.7):
 *  - SOX relevance        → SOX_COMPLIANCE_REVIEW
 *  - Financial system     → FINANCIAL_SYSTEM_ACCESS
 *  - HR / payroll system  → HR_SYSTEM_ACCESS
 *  - write / admin access → WRITE_ACCESS_REVIEW
 *  - high / critical risk → HIGH_RISK_REVIEW
 *  - service-account name → SERVICE_ACCOUNT_EXCEPTION
 */
export function deriveApprovalGates(
  manifest: Partial<DerivationInput>,
): ApprovalGate[] {
  const gates: ApprovalGate[] = [];

  // 1. SOX relevance
  if (manifest.soxRelevant) {
    gates.push({
      gate: GATES.SOX_COMPLIANCE_REVIEW,
      required: true,
      met: false,
    });
  }

  // 2. Financial / HR system access
  if (manifest.systemAccess && manifest.systemAccess.length > 0) {
    for (const sa of manifest.systemAccess) {
      if (isFinancialSystem(sa.systemId)) {
        gates.push({
          gate: GATES.FINANCIAL_SYSTEM_ACCESS,
          required: true,
          met: false,
        });
        break; // one gate per category
      }
    }
    for (const sa of manifest.systemAccess) {
      if (isHrSystem(sa.systemId)) {
        gates.push({
          gate: GATES.HR_SYSTEM_ACCESS,
          required: true,
          met: false,
        });
        break;
      }
    }
  }

  // 3. Write / admin access
  if (manifest.systemAccess && manifest.systemAccess.length > 0) {
    const hasWriteOrAdmin = manifest.systemAccess.some((sa) =>
      isWriteOrAdmin(sa.accessNeeded),
    );
    if (hasWriteOrAdmin) {
      gates.push({
        gate: GATES.WRITE_ACCESS_REVIEW,
        required: true,
        met: false,
      });
    }
  }

  // 4. High / critical risk
  if (manifest.riskTier === "high" || manifest.riskTier === "critical") {
    gates.push({
      gate: GATES.HIGH_RISK_REVIEW,
      required: true,
      met: false,
    });
  }

  // 5. Service-account pattern
  if (isServiceAccountPattern(manifest.agentName, manifest.purpose)) {
    gates.push({
      gate: GATES.SERVICE_ACCOUNT_EXCEPTION,
      required: true,
      met: false,
    });
  }

  return gates;
}

// ── Gate inspection helpers ──────────────────────────────────────────

/** Return whether the gate is met. */
export function checkGate(gate: ApprovalGate): boolean {
  return gate.met;
}

/** Mark a gate as approved. Returns a new ApprovalGate object (immutable). */
export function approveGate(
  gate: ApprovalGate,
  approver: string,
): ApprovalGate {
  return {
    ...gate,
    met: true,
    metAt: new Date().toISOString(),
    approver,
  };
}

/** True when *every* gate is met. */
export function allGatesMet(gates: ApprovalGate[]): boolean {
  return gates.length > 0 && gates.every((g) => g.met);
}

/** True when every *required* gate is met. (All gates are required by default.) */
export function requiredGatesMet(gates: ApprovalGate[]): boolean {
  const required = gates.filter((g) => g.required);
  return required.length > 0 && required.every((g) => g.met);
}

/** Return gates that are still pending (not yet met). */
export function pendingGates(gates: ApprovalGate[]): ApprovalGate[] {
  return gates.filter((g) => !g.met);
}
