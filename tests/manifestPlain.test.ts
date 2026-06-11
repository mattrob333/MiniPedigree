import { describe, it, expect } from "vitest";
import { buildPlainAgentCard } from "../src/lib/manifestPlain";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { compileAgent } from "../src/lib/runtimes";
import { upsertCompiledVersion } from "../src/lib/registry";
import { requestStatusLabel } from "../src/lib/memberSignals";
import type { CompanyContext, PedigreeRow, Person, TaskItem } from "../src/types";

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "RevOps Manager",
  department: "Revenue Ops", managerId: "P-000", managerEmail: "vp@x.co", tools: ["Salesforce"],
};
const task: TaskItem = { id: "T-001", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene" };

const row: PedigreeRow = {
  status: "ready",
  responsibilities: [{ id: "R-001", title: "Forecast hygiene" }],
  tasks: {
    delegatable: [task],
    approval: [{ id: "T-002", label: "Send hygiene scorecard to AE managers", respId: "R-001", respTitle: "Forecast hygiene" }],
    not_delegatable: [{ id: "T-003", label: "Approve final forecast number", respId: "R-001", respTitle: "Forecast hygiene" }],
  },
  agents: [],
};

const ctx: CompanyContext = {
  company: "Acme", whatWeDo: "x",
  approvalRules: ["Exports of forecast data must be approved by a manager."],
};

describe("buildPlainAgentCard", () => {
  const buildCtx = { person: jane, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const, companyContext: ctx };
  const agent = newAgentRecord(buildCtx, buildAgentArtifacts(buildCtx));

  it("renders every blocked task and approval gate — no silent omissions", () => {
    const card = buildPlainAgentCard(agent);
    const manifest = agent.manifest as Record<string, any>;
    const blocked: string[] = manifest.blocked_tasks ?? [];
    const approvals: string[] = manifest.human_approval_required ?? [];
    expect(blocked.length).toBeGreaterThan(0);
    expect(approvals.length).toBeGreaterThan(0);
    for (const b of blocked) {
      expect(card.blocked_from, `blocked task missing from card: ${b}`).toContain(b);
    }
    for (const a of approvals) {
      expect(card.needs_my_approval.map((x) => x.action), `approval gate missing from card: ${a}`).toContain(a);
    }
  });

  it("renders tools with plain-language scopes and an owner-facing purpose", () => {
    const card = buildPlainAgentCard(agent);
    expect(card.what_it_does.length).toBeGreaterThan(10);
    for (const tool of card.tools) {
      expect(tool.scope_plain.length).toBeGreaterThan(5);
    }
    expect(card.owner_name).toBe("Jane Smith");
  });

  it("carries version and status from the registry entry", () => {
    const compiled = compileAgent({ agent, runtime: "pedigree", companyContext: ctx, mcpLibrary: [] });
    const registry = upsertCompiledVersion([], compiled, []);
    const card = buildPlainAgentCard(agent, registry[0]);
    expect(card.version).toBe(1);
    expect(card.status).toBe("draft");
  });
});

describe("requestStatusLabel", () => {
  it("maps every ledger status to a member-readable label", () => {
    for (const status of ["ledgered", "proposed", "applied", "rejected", "expired"] as const) {
      expect(requestStatusLabel(status).length).toBeGreaterThan(3);
    }
  });
});
