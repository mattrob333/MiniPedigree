import { describe, expect, it } from "vitest";
import type { AgentRecord, AiUseCaseRequest, ControlManifest, PedigreeState, Person, SystemManifest } from "../src/types";
import type { CompiledAgent } from "../src/lib/runtimes/types";
import {
  createBirthCertificate,
  createDelegationGrantFromAgent,
  deriveRiskFindings,
  inferAgentSystems,
  isSoxRelevantAgent,
  renderInventoryCsv,
  transitionAiRequest,
  validateAgentTransfer,
} from "../src/lib/wescoGovernance";

const owner: Person = {
  id: "P-1",
  name: "Dana Controls",
  email: "dana@example.com",
  title: "Controller",
  managerId: null,
  department: "Finance",
  tools: ["Oracle", "Teams"],
  authority: {
    system_grants: [{ system: "Oracle", scope: "read_only", provenance: { source: "operator", operator_id: "ops@example.com" }, status: "reviewed" }],
    approval_authority: [],
    sod_roles: [],
    updated_at: "2026-06-16T00:00:00.000Z",
  },
};

const oracle: SystemManifest = {
  id: "SYS-oracle",
  name: "Oracle",
  category: "erp",
  soxInScope: true,
  dataSensitivity: "regulated",
  linkedControlIds: ["CTRL-rev-104"],
  linkedAgentIds: [],
  updatedAt: "2026-06-16T00:00:00.000Z",
};

const control: ControlManifest = {
  id: "CTRL-rev-104",
  controlId: "REV-104",
  name: "Billing exception review",
  process: "Revenue",
  riskAddressed: "Billing adjustments are reviewed before posting.",
  ownerPersonId: owner.id,
  frequency: "Monthly",
  system: "Oracle",
  evidenceRequired: ["Reviewer sign-off log", "Oracle exception report"],
  soxRelevant: true,
  linkedTaskIds: [],
  linkedAgentIds: [],
  updatedAt: "2026-06-16T00:00:00.000Z",
};

const agent: AgentRecord = {
  id: "local-agent",
  name: "Oracle Billing Exception Agent",
  taskId: "task-1",
  respId: "resp-1",
  respTitle: "Billing exception review",
  policy: "auto-write-with-approval",
  riskLevel: "high",
  person: owner,
  task: { id: "task-1", label: "Prepare Oracle billing exception report", respId: "resp-1", respTitle: "Billing exception review" },
  createdAt: "2026-06-16T00:00:00.000Z",
  manifest: {
    agent_id: "agent-oracle",
    allowed_tasks: ["Prepare Oracle billing exception report"],
    blocked_tasks: ["Post billing adjustments automatically"],
    human_approval_required: ["Submit Oracle billing adjustment"],
    recommended_mcp_servers: [{ name: "Oracle", scope: "read_write", reason: "Needs billing exception records" }],
    construction_spec: { goal: "Prepare the exception report", authority_ceiling: "Cannot exceed Dana's Oracle access." },
  },
  systemPrompt: "test",
};

const compiled = {
  agent_id: "agent-oracle",
  agent_name: agent.name,
  version: 1,
  owner,
  responsibility: { id: "resp-1", title: "Billing exception review" },
  task: agent.task,
  company_context_snapshot_id: "ctx",
  governance: {
    allowed: ["Prepare Oracle billing exception report"],
    approval: [{ action: "Submit Oracle billing adjustment", approver: "Dana Controls" }],
    blocked: [{ action: "Post billing adjustments automatically" }],
    audit_events: [],
    sod_findings: [],
    rule_provenance: [],
  },
  construction_spec: { goal: "Prepare the exception report", authority_ceiling: "Cannot exceed Dana's Oracle access." },
  system_prompt: "test",
  manifest: agent.manifest,
  mcp_grants: [],
  runtime: "pedigree",
  policy: "auto-write-with-approval",
  risk_level: "high",
  provenance: { trace_id: "trace", ingredient_hashes: {}, compiler_version: "test", compiled_at: "now" },
} as unknown as CompiledAgent;

function request(status = "draft"): AiUseCaseRequest {
  return {
    id: "REQ-1",
    title: "Oracle billing exception helper",
    requesterEmail: "requester@example.com",
    businessOwnerPersonId: owner.id,
    department: "Finance",
    purpose: "Prepare exception reports for reviewer approval.",
    workUnit: "Prepare Oracle billing exception report",
    systems: ["Oracle"],
    dataSensitivity: "regulated",
    soxRelevant: true,
    riskTier: "high",
    status: status as AiUseCaseRequest["status"],
    decisionHistory: [],
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}

describe("WESCO governance helpers", () => {
  it("enforces AI request status transitions and records decision history", () => {
    const submitted = transitionAiRequest(request(), "submitted", "council@example.com", "Ready for review");
    expect(submitted.status).toBe("submitted");
    expect(submitted.decisionHistory[0].note).toBe("Ready for review");
    expect(() => transitionAiRequest(submitted, "converted_to_agent", "council@example.com")).toThrow(/Cannot move/);
  });

  it("links agent systems and SOX controls into a Birth Certificate", () => {
    expect(inferAgentSystems(agent, [oracle])).toContain("Oracle");
    expect(isSoxRelevantAgent(agent, [control], [oracle])).toBe(true);
    const grant = createDelegationGrantFromAgent(agent, [control], [oracle], request("approved_for_design"));
    const cert = createBirthCertificate({ compiled, agent, controls: [control], systems: [oracle], request: request("approved_for_design"), delegationGrant: grant, approvedBy: "reviewer@example.com" });
    expect(cert.soxRelevant).toBe(true);
    expect(cert.controlIds).toEqual(["CTRL-rev-104"]);
    expect(cert.authorityResult).toBe("exceeds_without_exception");
    expect(cert.approval.status).toBe("approved");
  });

  it("derives explainable risk findings for authority, SOX, drift, and inactive owners", () => {
    const offboarded = { ...owner, lifecycle: "offboarded" as const };
    const offboardedAgent = { ...agent, person: offboarded };
    const pedigree: PedigreeState = {
      [offboarded.id]: { status: "generated", responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [offboardedAgent] },
    };
    const findings = deriveRiskFindings({
      people: [offboarded],
      pedigree,
      controls: [control],
      systems: [oracle],
      birthCertificates: [],
      requests: [],
      registryStale: [{ agentId: "agent-oracle", reason: "owner_role_changed" }],
    });
    expect(findings.map((f) => f.type)).toEqual(expect.arrayContaining(["owner_inactive", "authority_exceeds_owner", "sox_review_needed", "agent_drift"]));
    expect(findings.every((f) => f.whatHappened && f.whyItMatters && f.recommendedAction)).toBe(true);
  });

  it("validates transfers against the new owner's recorded authority", () => {
    const newOwner: Person = { ...owner, id: "P-2", name: "Sam Sales", email: "sam@example.com", authority: undefined };
    const result = validateAgentTransfer({ agent, newOwner, systems: [oracle], controls: [control] });
    expect(result.ok).toBe(false);
    expect(result.findings[0].type).toBe("authority_exceeds_owner");
  });

  it("renders inventory evidence rows with SOX and Birth Certificate status", () => {
    const cert = createBirthCertificate({ compiled, agent, controls: [control], systems: [oracle], approvedBy: "reviewer@example.com" });
    const csv = renderInventoryCsv({
      people: [owner],
      pedigree: { [owner.id]: { status: "generated", responsibilities: [], tasks: { delegatable: [], approval: [], not_delegatable: [] }, agents: [agent] } },
      controls: [control],
      systems: [oracle],
      birthCertificates: [cert],
    });
    expect(csv).toContain("Oracle Billing Exception Agent");
    expect(csv).toContain("yes");
    expect(csv).toContain("approved");
  });
});
