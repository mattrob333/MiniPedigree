import type {
  AgentBirthCertificate,
  AgentRecord,
  AiRequestStatus,
  AiUseCaseRequest,
  ControlManifest,
  DelegationGrant,
  EvidenceArtifact,
  GovernanceException,
  PedigreeState,
  Person,
  RiskFinding,
  RiskLevel,
  SystemManifest,
} from "@/types";
import type { CompiledAgent } from "./runtimes/types";

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SCOPE_RANK: Record<string, number> = { none: 0, read_only: 1, draft_only: 2, read_write: 3, admin: 4 };

const REQUEST_TRANSITIONS: Record<AiRequestStatus, AiRequestStatus[]> = {
  draft: ["submitted", "rejected"],
  submitted: ["needs_info", "in_review", "rejected"],
  needs_info: ["submitted", "in_review", "rejected"],
  in_review: ["needs_info", "approved_for_design", "rejected"],
  approved_for_design: ["converted_to_agent", "in_review", "rejected"],
  rejected: ["in_review"],
  converted_to_agent: ["in_review"],
};

function now(): string {
  return new Date().toISOString();
}

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function riskMax(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function agentId(agent: AgentRecord): string {
  return String((agent.manifest as Record<string, unknown> | undefined)?.agent_id ?? agent.id);
}

function agentActionText(agent: AgentRecord): string {
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  return [
    agent.task.label,
    agent.task.description,
    ...(manifest.allowed_tasks ?? []),
    ...(manifest.human_approval_required ?? []),
    ...(manifest.blocked_tasks ?? []),
  ].filter(Boolean).join(" ");
}

export function transitionAiRequest(
  request: AiUseCaseRequest,
  status: AiRequestStatus,
  actor: string,
  note?: string,
): AiUseCaseRequest {
  if (request.status !== status && !REQUEST_TRANSITIONS[request.status].includes(status)) {
    throw new Error(`Cannot move AI request from ${request.status} to ${status}.`);
  }
  const stamped = now();
  return {
    ...request,
    status,
    updatedAt: stamped,
    decisionHistory: [...request.decisionHistory, { status, by: actor, at: stamped, ...(note ? { note } : {}) }],
  };
}

export function inferAgentSystems(agent: AgentRecord, systems: SystemManifest[]): string[] {
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const text = [
    agent.task.label,
    agent.task.description,
    agent.task.completion?.tools_mentioned?.join(" "),
    agent.person.tools.join(" "),
    ...(manifest.recommended_mcp_servers ?? []).map((server: any) => `${server.name ?? ""} ${server.reason ?? ""}`),
    ...(manifest.capabilities?.tools ?? []).map((tool: any) => `${tool.name ?? ""}`),
  ].filter(Boolean).join(" ").toLowerCase();
  const matched = systems.filter((system) => text.includes(system.name.toLowerCase())).map((system) => system.name);
  const fromManifest = (manifest.recommended_mcp_servers ?? []).map((server: any) => String(server.name ?? "")).filter(Boolean);
  return uniq([...matched, ...fromManifest]);
}

export function controlsForAgent(agent: AgentRecord, controls: ControlManifest[], systems: SystemManifest[]): ControlManifest[] {
  const id = agentId(agent);
  const taskId = agent.taskId;
  const agentSystems = inferAgentSystems(agent, systems).map(norm);
  return controls.filter((control) =>
    control.linkedAgentIds.includes(id)
    || control.linkedTaskIds.includes(taskId)
    || agentSystems.includes(norm(control.system)),
  );
}

export function isSoxRelevantAgent(agent: AgentRecord, controls: ControlManifest[], systems: SystemManifest[]): boolean {
  const agentSystems = inferAgentSystems(agent, systems).map(norm);
  return controlsForAgent(agent, controls, systems).some((control) => control.soxRelevant)
    || systems.some((system) => system.soxInScope && agentSystems.includes(norm(system.name)));
}

export function createDelegationGrantFromAgent(
  agent: AgentRecord,
  controls: ControlManifest[],
  systems: SystemManifest[],
  request?: AiUseCaseRequest,
): DelegationGrant {
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const linkedControls = controlsForAgent(agent, controls, systems);
  return {
    id: `DG-${key(agentId(agent))}`,
    ownerPersonId: agent.person.id,
    ...(request ? { requestId: request.id } : {}),
    taskId: agent.taskId,
    responsibilityId: agent.respId,
    workUnit: request?.workUnit || agent.task.label,
    systems: inferAgentSystems(agent, systems),
    allowedActions: manifest.allowed_tasks ?? [agent.task.label],
    blockedActions: manifest.blocked_tasks ?? [],
    approvalRequirements: manifest.human_approval_required ?? [],
    reviewBy: linkedControls.some((control) => control.soxRelevant) ? "SOX control owner" : "AI Council reviewer",
    evidenceObligations: [
      "Approved Agent Birth Certificate",
      ...linkedControls.flatMap((control) => control.evidenceRequired),
    ],
    createdAt: now(),
  };
}

function ownerSystemScope(owner: Person, system: string): string | undefined {
  return owner.authority?.system_grants.find((grant) => norm(grant.system) === norm(system))?.scope;
}

export function authorityResultForAgent(agent: AgentRecord, systems: SystemManifest[], soxRelevant: boolean): AgentBirthCertificate["authorityResult"] {
  const grantSystems = inferAgentSystems(agent, systems);
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const requestedScopes: { system: string; scope: string }[] = (manifest.recommended_mcp_servers ?? []).map((server: any) => ({
    system: String(server.name ?? ""),
    scope: String(server.scope ?? server.recommended_scope ?? "read_only"),
  })).filter((entry: { system: string; scope: string }) => entry.system);
  for (const entry of requestedScopes) {
    const ownerScope = ownerSystemScope(agent.person, entry.system);
    if (!ownerScope && (soxRelevant || SCOPE_RANK[entry.scope] > SCOPE_RANK.read_only)) return "needs_review";
    if (ownerScope && SCOPE_RANK[entry.scope] > SCOPE_RANK[ownerScope]) return "exceeds_without_exception";
  }
  if (soxRelevant && grantSystems.some((system) => !ownerSystemScope(agent.person, system))) return "needs_review";
  return "within_owner_authority";
}

export function createBirthCertificate(input: {
  compiled: CompiledAgent;
  agent: AgentRecord;
  controls: ControlManifest[];
  systems: SystemManifest[];
  request?: AiUseCaseRequest;
  delegationGrant?: DelegationGrant;
  approvedBy?: string;
  existing?: AgentBirthCertificate;
}): AgentBirthCertificate {
  const { compiled, agent, controls, systems, request, delegationGrant, approvedBy, existing } = input;
  const linkedControls = controlsForAgent(agent, controls, systems);
  const soxRelevant = isSoxRelevantAgent(agent, controls, systems);
  const stamped = now();
  const authorityResult = authorityResultForAgent(agent, systems, soxRelevant);
  return {
    id: existing?.id ?? `ABC-${key(compiled.agent_id)}`,
    agentId: compiled.agent_id,
    agentName: compiled.agent_name,
    ...(request ? { requestId: request.id } : existing?.requestId ? { requestId: existing.requestId } : {}),
    ownerPersonId: compiled.owner.id,
    ownerName: compiled.owner.name,
    responsibilityId: compiled.responsibility.id,
    responsibilityTitle: compiled.responsibility.title,
    taskId: compiled.task.id,
    taskLabel: compiled.task.label,
    purpose: compiled.construction_spec.goal || request?.purpose || `Support ${compiled.task.label}`,
    systems: inferAgentSystems(agent, systems),
    controlIds: linkedControls.map((control) => control.id),
    soxRelevant,
    allowedActions: compiled.governance.allowed,
    blockedActions: compiled.governance.blocked.map((blocked) => blocked.action),
    approvalRequirements: compiled.governance.approval.map((approval) => `${approval.action} -> ${approval.approver}`),
    authorityCeiling: compiled.construction_spec.authority_ceiling,
    authorityResult,
    ...(delegationGrant ? { delegationGrantId: delegationGrant.id } : existing?.delegationGrantId ? { delegationGrantId: existing.delegationGrantId } : {}),
    approval: approvedBy
      ? { status: "approved", approvedBy, approvedAt: stamped }
      : existing?.approval ?? { status: "draft" },
    runtimeTarget: compiled.runtime,
    version: compiled.version,
    evidenceObligations: uniq([
      "Request approval history",
      "Manifest validation result",
      ...linkedControls.flatMap((control) => control.evidenceRequired),
    ]),
    createdAt: existing?.createdAt ?? stamped,
    updatedAt: stamped,
  };
}

function finding(args: Omit<RiskFinding, "createdAt" | "updatedAt" | "status"> & { status?: RiskFinding["status"] }): RiskFinding {
  const stamped = now();
  return { ...args, status: args.status ?? "open", createdAt: stamped, updatedAt: stamped };
}

export function deriveRiskFindings(input: {
  people: Person[];
  pedigree: PedigreeState;
  controls: ControlManifest[];
  systems: SystemManifest[];
  birthCertificates: AgentBirthCertificate[];
  requests: AiUseCaseRequest[];
  registryStale?: { agentId: string; reason?: string }[];
  exceptions?: GovernanceException[];
}): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const certByAgent = new Map(input.birthCertificates.map((cert) => [cert.agentId, cert]));
  const exceptionAgentIds = new Set((input.exceptions ?? []).filter((ex) => ex.status === "approved" && ex.agentId).map((ex) => ex.agentId!));
  const staleByAgent = new Map((input.registryStale ?? []).map((entry) => [entry.agentId, entry.reason]));

  for (const person of input.people) {
    const row = input.pedigree[person.id];
    for (const agent of row?.agents ?? []) {
      const id = agentId(agent);
      const owner = peopleById.get(agent.person.id);
      const cert = certByAgent.get(id);
      const linkedControls = controlsForAgent(agent, input.controls, input.systems);
      const soxRelevant = isSoxRelevantAgent(agent, input.controls, input.systems);
      const systems = inferAgentSystems(agent, input.systems);
      const systemIds = input.systems.filter((system) => systems.some((name) => norm(name) === norm(system.name))).map((system) => system.id);

      if (!owner) {
        findings.push(finding({
          id: `RF-owner-missing-${key(id)}`,
          type: "owner_missing",
          severity: "critical",
          title: "Agent has no mapped accountable owner",
          whatHappened: `${agent.name} is registered without a current person record for its owner.`,
          whyItMatters: "Every agent needs a valid human owner before it can be trusted or audited.",
          recommendedAction: "Assign an active owner, transfer the agent, or archive it.",
          affected: { personIds: [], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: [] },
        }));
      }

      if (owner?.lifecycle === "offboarded") {
        findings.push(finding({
          id: `RF-owner-inactive-${key(id)}`,
          type: "owner_inactive",
          severity: "critical",
          title: "Agent owner is offboarded",
          whatHappened: `${agent.name} is owned by ${owner.name}, who is marked offboarded.`,
          whyItMatters: "An agent cannot remain deployed under a terminated or inactive accountable owner.",
          recommendedAction: "Transfer ownership to an active owner, then recompile under the new authority ceiling.",
          affected: { personIds: [owner.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: [] },
        }));
      }

      if (soxRelevant && !linkedControls.length) {
        findings.push(finding({
          id: `RF-control-missing-${key(id)}`,
          type: "control_mapping_missing",
          severity: "high",
          title: "SOX-relevant agent is missing a control link",
          whatHappened: `${agent.name} touches a SOX-relevant system but is not linked to a control manifest.`,
          whyItMatters: "SOX owners and auditors need the control population before approval or deployment.",
          recommendedAction: "Link the agent to the relevant control, or document why it is out of scope.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: [], requestIds: [] },
        }));
      }

      if (soxRelevant && cert?.approval.status !== "approved") {
        findings.push(finding({
          id: `RF-sox-review-${key(id)}`,
          type: "sox_review_needed",
          severity: "high",
          title: "SOX review needed before deployment",
          whatHappened: `${agent.name} is SOX relevant and does not have an approved Agent Birth Certificate.`,
          whyItMatters: "Evidence starts at birth; SOX-relevant agents need an approved creation record.",
          recommendedAction: "Review and approve the Agent Birth Certificate with the control owner.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: cert?.requestId ? [cert.requestId] : [] },
        }));
      }

      const authority = authorityResultForAgent(agent, input.systems, soxRelevant);
      if (authority === "exceeds_without_exception" && !exceptionAgentIds.has(id)) {
        findings.push(finding({
          id: `RF-authority-${key(id)}`,
          type: "authority_exceeds_owner",
          severity: "critical",
          title: "Agent scope exceeds owner authority",
          whatHappened: `${agent.name} requests access wider than ${agent.person.name}'s recorded authority.`,
          whyItMatters: "Pedigree's default rule is agent authority must stay at or below the accountable human authority.",
          recommendedAction: "Reduce scope, transfer ownership, or approve a documented exception with compensating controls.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: cert?.requestId ? [cert.requestId] : [] },
        }));
      }

      if (owner?.authority?.sod_roles.some((role) => role.role === "both_flagged")) {
        findings.push(finding({
          id: `RF-sod-${key(id)}`,
          type: "toxic_combination",
          severity: "high",
          title: "Potential toxic combination",
          whatHappened: `${agent.person.name}'s authority profile has a preparer/approver conflict.`,
          whyItMatters: "Agents can amplify segregation-of-duties conflicts if they inherit conflicting work.",
          recommendedAction: "Split preparation and approval duties or document a compensating control.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: [] },
        }));
      }

      const actionText = agentActionText(agent).toLowerCase();
      if (/\b(service account|bot account|integration account)\b/.test(actionText) && !exceptionAgentIds.has(id)) {
        findings.push(finding({
          id: `RF-service-account-${key(id)}`,
          type: "service_account_exception_needed",
          severity: "high",
          title: "Service account exception needed",
          whatHappened: `${agent.name} appears to require non-human or service-account access.`,
          whyItMatters: "Enterprise bots can exceed a named owner's personal access unless explicitly approved and monitored.",
          recommendedAction: "Create a service account exception with business justification, system owner approval, expiration, and monitoring.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: cert?.requestId ? [cert.requestId] : [] },
        }));
      }

      if (staleByAgent.has(id) || !cert) {
        findings.push(finding({
          id: `RF-drift-${key(id)}`,
          type: "agent_drift",
          severity: cert ? "medium" : "high",
          title: cert ? "Agent may have drifted from its approved record" : "Agent is missing a Birth Certificate",
          whatHappened: cert ? `${agent.name} has changed ingredients or registry staleness.` : `${agent.name} was generated before an approved creation record was captured.`,
          whyItMatters: "The approved Birth Certificate is the evidence baseline for deployment and audit.",
          recommendedAction: cert ? "Recompile and re-approve the Birth Certificate." : "Create and approve the Agent Birth Certificate before deployment.",
          affected: { personIds: [agent.person.id], agentIds: [id], systemIds, controlIds: linkedControls.map((c) => c.id), requestIds: cert?.requestId ? [cert.requestId] : [] },
          evidence: staleByAgent.get(id),
        }));
      }
    }
  }

  for (const request of input.requests) {
    if (/\b(service account|bot account|integration account)\b/i.test(`${request.purpose} ${request.workUnit}`)) {
      findings.push(finding({
        id: `RF-request-service-account-${key(request.id)}`,
        type: "service_account_exception_needed",
        severity: riskMax(request.riskTier, "high"),
        title: "Request may need a service account exception",
        whatHappened: `${request.title} describes bot, service-account, or integration-account access.`,
        whyItMatters: "Non-human accounts need explicit ownership, expiration, monitoring, and evidence.",
        recommendedAction: "Route the request through AI Council and system-owner exception review.",
        affected: { personIds: request.businessOwnerPersonId ? [request.businessOwnerPersonId] : [], agentIds: request.linkedAgentId ? [request.linkedAgentId] : [], systemIds: input.systems.filter((s) => request.systems.some((name) => norm(name) === norm(s.name))).map((s) => s.id), controlIds: [], requestIds: [request.id] },
      }));
    }
  }

  return findings;
}

export function validateAgentTransfer(args: {
  agent: AgentRecord;
  newOwner: Person;
  systems: SystemManifest[];
  controls: ControlManifest[];
}): { ok: boolean; warnings: string[]; findings: RiskFinding[] } {
  const systems = inferAgentSystems(args.agent, args.systems);
  const warnings: string[] = [];
  const findings: RiskFinding[] = [];
  if (args.newOwner.lifecycle === "offboarded") {
    findings.push(finding({
      id: `RF-transfer-inactive-${key(args.agent.id)}-${key(args.newOwner.id)}`,
      type: "owner_inactive",
      severity: "critical",
      title: "Transfer target is inactive",
      whatHappened: `${args.newOwner.name} is not an active owner.`,
      whyItMatters: "Transferred agents need a valid accountable human owner.",
      recommendedAction: "Choose an active owner before transferring the agent.",
      affected: { personIds: [args.newOwner.id], agentIds: [agentId(args.agent)], systemIds: [], controlIds: [], requestIds: [] },
    }));
  }
  for (const system of systems) {
    const ownerScope = ownerSystemScope(args.newOwner, system);
    if (!ownerScope || SCOPE_RANK[ownerScope] < SCOPE_RANK.read_only) {
      warnings.push(`${args.newOwner.name} has no recorded ${system} authority.`);
    }
  }
  if (warnings.length) {
    const linkedControls = controlsForAgent(args.agent, args.controls, args.systems);
    findings.push(finding({
      id: `RF-transfer-authority-${key(args.agent.id)}-${key(args.newOwner.id)}`,
      type: "authority_exceeds_owner",
      severity: linkedControls.some((control) => control.soxRelevant) ? "high" : "medium",
      title: "Transfer requires authority review",
      whatHappened: warnings.join(" "),
      whyItMatters: "The new owner must have enough authority for the agent's systems and actions.",
      recommendedAction: "Grant/review authority, reduce scope, or approve an exception before transfer.",
      affected: { personIds: [args.newOwner.id], agentIds: [agentId(args.agent)], systemIds: args.systems.filter((s) => systems.some((name) => norm(name) === norm(s.name))).map((s) => s.id), controlIds: linkedControls.map((c) => c.id), requestIds: [] },
    }));
  }
  return { ok: findings.length === 0, warnings, findings };
}

export function renderBirthCertificateMarkdown(cert: AgentBirthCertificate, controls: ControlManifest[], systems: SystemManifest[]): string {
  const linkedControls = controls.filter((control) => cert.controlIds.includes(control.id));
  const linkedSystems = systems.filter((system) => cert.systems.some((name) => norm(name) === norm(system.name)));
  return [
    `# Agent Birth Certificate: ${cert.agentName}`,
    "",
    "A formal creation record for ownership, purpose, authority, scope, approvals, controls, and evidence obligations.",
    "",
    `- Owner: ${cert.ownerName}`,
    `- Responsibility: ${cert.responsibilityTitle}`,
    `- Work unit: ${cert.taskLabel}`,
    `- Runtime target: ${cert.runtimeTarget}`,
    `- Version: ${cert.version}`,
    `- Approval status: ${cert.approval.status}${cert.approval.approvedBy ? ` by ${cert.approval.approvedBy}` : ""}`,
    `- SOX relevant: ${cert.soxRelevant ? "yes" : "no"}`,
    `- Authority result: ${cert.authorityResult}`,
    "",
    "## Systems",
    linkedSystems.length ? linkedSystems.map((system) => `- ${system.name}${system.soxInScope ? " (SOX in scope)" : ""}`).join("\n") : "- None linked",
    "",
    "## Controls",
    linkedControls.length ? linkedControls.map((control) => `- ${control.controlId}: ${control.name} (${control.system})`).join("\n") : "- None linked",
    "",
    "## Allowed Actions",
    cert.allowedActions.length ? cert.allowedActions.map((item) => `- ${item}`).join("\n") : "- None",
    "",
    "## Approval Required",
    cert.approvalRequirements.length ? cert.approvalRequirements.map((item) => `- ${item}`).join("\n") : "- None",
    "",
    "## Blocked Actions",
    cert.blockedActions.length ? cert.blockedActions.map((item) => `- ${item}`).join("\n") : "- None",
    "",
    "## Evidence Obligations",
    cert.evidenceObligations.length ? cert.evidenceObligations.map((item) => `- ${item}`).join("\n") : "- None",
  ].join("\n");
}

export function buildEvidenceArtifact(input: {
  type: EvidenceArtifact["type"];
  title: string;
  generatedBy: string;
  content: string;
  format?: EvidenceArtifact["format"];
  subjectId?: string;
}): EvidenceArtifact {
  const stamped = now();
  return {
    id: `EVD-${key(input.type)}-${Date.now().toString(36)}`,
    type: input.type,
    title: input.title,
    format: input.format ?? "markdown",
    generatedBy: input.generatedBy,
    generatedAt: stamped,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    content: input.content,
  };
}

export function renderInventoryCsv(args: {
  people: Person[];
  pedigree: PedigreeState;
  controls: ControlManifest[];
  systems: SystemManifest[];
  birthCertificates: AgentBirthCertificate[];
}): string {
  const certByAgent = new Map(args.birthCertificates.map((cert) => [cert.agentId, cert]));
  const rows = args.people.flatMap((person) => (args.pedigree[person.id]?.agents ?? []).map((agent) => {
    const id = agentId(agent);
    const cert = certByAgent.get(id);
    const systems = inferAgentSystems(agent, args.systems);
    const controls = controlsForAgent(agent, args.controls, args.systems);
    return [
      agent.name,
      person.name,
      person.department,
      systems.join("; "),
      controls.map((control) => control.controlId).join("; "),
      isSoxRelevantAgent(agent, args.controls, args.systems) ? "yes" : "no",
      agent.riskLevel,
      cert?.approval.status ?? "missing",
    ].map(csvEscape).join(",");
  }));
  return [
    "agent,owner,department,systems,controls,sox_relevant,risk,birth_certificate",
    ...rows,
  ].join("\n");
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
