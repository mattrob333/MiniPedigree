import { describe, it, expect } from "vitest";
import {
  buildReviewQueue,
  confirmReviewItems,
  confirmTaskProvenance,
  deriveProvenance,
  isBulkConfirmable,
} from "../src/lib/provenance";
import { applyParsed } from "../src/lib/state";
import { generateParsed } from "../src/lib/parse";
import { buildAgentArtifacts, newAgentRecord } from "../src/lib/agent";
import { governancePreservedChecks, preservationPassed } from "../src/lib/validate";
import { enforcementProfile, enforcementSummary } from "../src/lib/enforcement";
import { buildGovernanceSummaryHtml } from "../src/lib/governanceSummary";
import { compileAgent } from "../src/lib/runtimes";
import type { PedigreeRow, PedigreeState, Person, TaskItem } from "../src/types";

const jane: Person = {
  id: "P-001", name: "Jane Smith", email: "jane@x.co", title: "Sales Operations Manager",
  department: "Revenue Ops", managerId: null, managerEmail: "vp@x.co", tools: ["Salesforce"],
};

const task: TaskItem = {
  id: "R-001-d-0", label: "Clean stale forecast records", respId: "R-001", respTitle: "Forecast hygiene",
  evidence: "I clean stale forecast records every Friday",
  riskLevel: "low",
  provenance: { state: "evidenced", evidence_quote: "I clean stale forecast records every Friday", confidence: 0.86, source: "Leadership Session" },
};

const row: PedigreeRow = {
  status: "ready",
  responsibilities: [{ id: "R-001", title: "Forecast hygiene", provenance: { state: "evidenced", evidence_quote: "Jane owns forecast hygiene" } }],
  tasks: {
    delegatable: [task],
    approval: [{ id: "R-001-a-0", label: "Export forecast report", respId: "R-001", respTitle: "Forecast hygiene", riskLevel: "medium", provenance: { state: "ai_inferred", confidence: 0.55 } }],
    not_delegatable: [{ id: "R-001-n-0", label: "Approve final forecast number", respId: "R-001", respTitle: "Forecast hygiene", riskLevel: "critical", provenance: { state: "evidenced", evidence_quote: "only Jane signs the number" } }],
  },
  agents: [],
};

function buildAgent(extra?: Partial<Parameters<typeof buildAgentArtifacts>[0]>) {
  const buildCtx = { person: jane, row, task, respTitle: "Forecast hygiene", agentName: "Forecast Cleanup Agent", policy: "read-only", riskLevel: "low" as const, ...extra };
  const artifacts = buildAgentArtifacts(buildCtx);
  return newAgentRecord(buildCtx, artifacts);
}

describe("P0-1 provenance", () => {
  it("derives evidenced vs ai_inferred from evidence presence", () => {
    expect(deriveProvenance({ evidence: "a quote" }).state).toBe("evidenced");
    expect(deriveProvenance({ evidence: "  " }).state).toBe("ai_inferred");
    expect(deriveProvenance({}).state).toBe("ai_inferred");
  });

  it("applyParsed stamps provenance on tasks and responsibilities", () => {
    const parsed = generateParsed([jane], "Jane cleans stale forecast records weekly.");
    const next = applyParsed([jane], parsed, {}, { sessionLabel: "Leadership Session" });
    const r = next[jane.id];
    expect(r.responsibilities.every((resp) => resp.provenance)).toBe(true);
    const allTasks = [...r.tasks.delegatable, ...r.tasks.approval, ...r.tasks.not_delegatable];
    expect(allTasks.every((t) => t.provenance)).toBe(true);
    // Role-template items with no transcript evidence must read ai_inferred.
    expect(allTasks.some((t) => t.provenance!.state === "ai_inferred")).toBe(true);
  });

  it("confirmation records who and when; provenance survives into the manifest", () => {
    const pedigree: PedigreeState = { [jane.id]: row };
    const confirmed = confirmTaskProvenance(pedigree, jane.id, task.id, "grc@x.co");
    const t = confirmed[jane.id].tasks.delegatable[0];
    expect(t.provenance?.state).toBe("human_confirmed");
    expect(t.provenance?.confirmed_by).toBe("grc@x.co");
    expect(t.provenance?.evidence_quote).toContain("every Friday"); // original evidence preserved

    const agent = buildAgent();
    const manifest = agent.manifest as Record<string, any>;
    expect(manifest.task.provenance.state).toBe("evidenced");
    expect(manifest.task.provenance.evidence_quote).toContain("every Friday");
    expect(manifest.parent_responsibility.provenance.state).toBe("evidenced");
  });
});

describe("P0-3 review inbox queue", () => {
  const pedigree: PedigreeState = { [jane.id]: row };

  it("queues everything not human-confirmed, highest-risk first", () => {
    const queue = buildReviewQueue([jane], pedigree);
    expect(queue.length).toBe(4); // 1 resp + 3 tasks
    const tasksOnly = queue.filter((i) => i.kind === "task");
    expect(tasksOnly[0].riskLevel).toBe("critical");
  });

  it("bulk-confirm is limited to evidenced, delegatable items", () => {
    const queue = buildReviewQueue([jane], pedigree);
    const bulk = queue.filter(isBulkConfirmable);
    // The evidenced delegatable task and the evidenced responsibility qualify;
    // the ai_inferred approval task and the blocked task never do.
    expect(bulk.some((i) => i.itemId === task.id)).toBe(true);
    expect(bulk.some((i) => i.cls === "approval")).toBe(false);
    expect(bulk.some((i) => i.cls === "not_delegatable")).toBe(false);
    expect(bulk.some((i) => i.provenance.state === "ai_inferred")).toBe(false);
  });

  it("confirmations drop items from the queue and write audit events", () => {
    const queue = buildReviewQueue([jane], pedigree);
    const out = confirmReviewItems(pedigree, queue, "grc@x.co");
    expect(buildReviewQueue([jane], out.pedigree)).toHaveLength(0);
    expect(out.events).toHaveLength(4);
    expect(out.events.every((e) => e.type === "provenance_confirmed" && e.actor === "grc@x.co")).toBe(true);
  });

  it("bulk confirm cannot change a task's classification", () => {
    const out = confirmReviewItems(pedigree, buildReviewQueue([jane], pedigree).filter(isBulkConfirmable), "grc@x.co");
    const r = out.pedigree[jane.id];
    expect(r.tasks.approval.map((t) => t.label)).toEqual(["Export forecast report"]);
    expect(r.tasks.not_delegatable.map((t) => t.label)).toEqual(["Approve final forecast number"]);
  });
});

describe("P0-4 governance preserved checks", () => {
  it("passes for an intact manifest", () => {
    const checks = governancePreservedChecks(buildAgent(), row);
    expect(preservationPassed(checks)).toBe(true);
    expect(checks.find((c) => c.id === "blocked_preserved")?.status).toBe("pass");
    expect(checks.find((c) => c.id === "approval_preserved")?.status).toBe("pass");
  });

  it("fails when a blocked task was silently dropped from the manifest", () => {
    const agent = buildAgent();
    const manifest = agent.manifest as Record<string, any>;
    manifest.blocked_tasks = (manifest.blocked_tasks as string[]).filter((t) => t !== "Approve final forecast number");
    const checks = governancePreservedChecks(agent, row);
    expect(preservationPassed(checks)).toBe(false);
    expect(checks.find((c) => c.id === "blocked_preserved")?.detail).toContain("Approve final forecast number");
  });

  it("fails when an approval-required task lost its gate or was demoted", () => {
    const agent = buildAgent();
    const manifest = agent.manifest as Record<string, any>;
    manifest.human_approval_required = [];
    manifest.allowed_tasks = [...(manifest.allowed_tasks as string[]), "Export forecast report"];
    const checks = governancePreservedChecks(agent, row);
    expect(checks.find((c) => c.id === "approval_preserved")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "no_demotion")?.status).toBe("fail");
  });

  it("warns (not fails) on authority added during enrichment", () => {
    const agent = buildAgent({ authored: { allowed_tasks: ["Summarize partner rebates"] } });
    const checks = governancePreservedChecks(agent, row);
    const expansion = checks.find((c) => c.id === "no_silent_expansion");
    expect(expansion?.status).toBe("warn");
    expect(expansion?.detail).toContain("Summarize partner rebates");
    expect(preservationPassed(checks)).toBe(true);
  });
});

describe("P0-2 enforcement reality", () => {
  it("every runtime profile covers the same controls and is never all-enforceable", () => {
    const runtimes = ["pedigree", "hermes", "openclaw", "openai", "claude", "generic"] as const;
    const controlCount = enforcementProfile("pedigree").length;
    for (const rt of runtimes) {
      const entries = enforcementProfile(rt);
      expect(entries.length).toBe(controlCount);
      const summary = enforcementSummary(entries);
      // No runtime path may claim full enforcement — that capability is not shipped.
      expect(summary.enforceable).toBeLessThan(summary.total);
      expect(summary.enforceable + summary.advisory + summary.notYet).toBe(summary.total);
    }
  });

  it("states change with the runtime target (hermes enforces schedule; openai does not)", () => {
    const hermes = enforcementProfile("hermes").find((e) => e.control === "Schedule");
    const openai = enforcementProfile("openai").find((e) => e.control === "Schedule");
    expect(hermes?.status).toBe("enforceable");
    expect(openai?.status).toBe("not_yet");
  });
});

describe("P1-1 governance one-pager", () => {
  it("renders owner, scope, constraints, evidence, and enforcement reality", () => {
    const agent = buildAgent();
    const compiled = compileAgent({ agent, runtime: "hermes", mcpLibrary: [] });
    const html = buildGovernanceSummaryHtml(compiled);
    expect(html).toContain("Jane Smith");
    expect(html).toContain("Forecast hygiene");
    expect(html).toContain("Clean stale forecast records");
    expect(html).toContain("Approve final forecast number"); // blocked
    expect(html).toContain("every Friday");                  // evidence
    expect(html).toContain("What is and is not enforced at runtime");
    expect(html).toContain("does not confer certification");
  });
});
