import type { AiUseCaseRequest, CompanyContext, ControlManifest, Person, SystemManifest } from "@/types";

function now(): string {
  return new Date().toISOString();
}

function findPerson(people: Person[], match: RegExp): Person | undefined {
  return people.find((person) => match.test(`${person.name} ${person.title} ${person.department}`));
}

export function keystoneCompanyContext(workspaceId: string): CompanyContext {
  const stamped = now();
  return {
    companyId: workspaceId,
    company: "Keystone Industrial Supply",
    url: "https://keystone-industrial.example",
    whatWeDo:
      "Keystone Industrial Supply is a fictional electrical and industrial distribution enterprise serving contractors, utilities, and industrial maintenance teams across North America.",
    industry: "Industrial and electrical distribution",
    market: "Large B2B customers, branch operations, utility accounts, and national industrial accounts",
    businessModel: "Distributor margin on products, services, managed inventory, and project support",
    mission: "Keep critical infrastructure projects supplied without compromising financial controls.",
    strategicGoals:
      "1. Reduce quote-to-cash exceptions during the DDP transformation\n2. Shorten monthly close evidence preparation\n3. Govern AI use cases through the AI Council\n4. Build a trusted inventory of human-owned AI workers",
    initiatives: "Digital Distribution Platform (DDP) modernization; AI Council intake; Oracle control remediation; non-human account review",
    terminology: "AI Council, DDP, Oracle in-scope systems, non-human account, SOX population, Birth Certificate, service-account exception",
    currentState:
      "The AI Council has a growing backlog of use-case requests. Copilot and local agents exist in pockets, but enterprise creation is constrained until ownership, SOX, access, and evidence controls are clear.",
    bottlenecks:
      "Manual AI request review, Oracle exception reporting, monthly SOX evidence binders, non-human account review, and uncertainty around agents owned by employees who move or leave.",
    systems: ["Oracle", "Microsoft Teams", "Copilot Studio", "ServiceNow", "Entra ID", "Okta", "Workday", "BlackLine", "Salesforce", "Power BI", "SharePoint"],
    sops: [
      "AI Council reviews high-risk AI use cases before design.",
      "SOX-relevant agents require control owner review before deployment.",
      "Non-human and service-account access requires exception approval and monitoring.",
    ],
    approvalRules: [
      "Oracle write access for billing, vendor, or close processes requires system owner approval.",
      "SOX-relevant agents require Internal Controls review before deployment.",
      "Service-account exceptions require business justification, system owner approval, expiration, and monitoring.",
      "Agents may draft reports and evidence packages, but they may not post Oracle transactions.",
    ],
    segregationOfDuties: [
      "The same human or agent may not create a vendor and approve that vendor.",
      "The same human or agent may not prepare and approve a payment run.",
      "The same human or agent may not create and approve journal entries.",
      "The same human or agent may not change access and approve the access review.",
    ],
    complianceNotes: [
      "Oracle is treated as a SOX in-scope system for the pilot.",
      "SOC 1 Type 2 vendor readiness is a sales/procurement requirement, not a claim about this prototype.",
    ],
    governanceRisks: [
      "Ownerless local agents created in Copilot.",
      "Agents with broader service-account access than their human sponsor.",
      "Drift between approved Birth Certificates and live runtime scopes.",
    ],
    departments: ["Executive", "AI Council", "Finance", "Internal Controls", "IT Security", "Sales Operations", "HR", "Procurement"],
    unknowns: [
      "Official AI Council status names.",
      "Final list of SOX in-scope Oracle modules.",
      "PwC-requested population report format.",
    ],
    kpis: [
      { department: "AI Council", metric: "AI request review cycle time", cadence: "weekly", owner_hint: "Owen" },
      { department: "Internal Controls", metric: "SOX agent population completeness", cadence: "monthly", owner_hint: "Priya" },
      { department: "Finance", metric: "Close evidence binder completion", cadence: "monthly", owner_hint: "Dana" },
      { department: "IT Security", metric: "Non-human account exception age", cadence: "monthly", owner_hint: "Sofia" },
    ],
    researchSources: [{ url: "user-provided-notes", title: "Fictional WESCO-like pilot context", source_type: "user_text" }],
    confidence: 0.91,
    updatedAt: stamped,
  };
}

export function keystoneGovernanceSeed(people: Person[]): {
  systems: SystemManifest[];
  controls: ControlManifest[];
  requests: AiUseCaseRequest[];
} {
  const stamped = now();
  const dana = findPerson(people, /Dana|Controller/i);
  const priya = findPerson(people, /Priya|Internal Controls/i);
  const sofia = findPerson(people, /Sofia|Identity/i);
  const owen = findPerson(people, /Owen|AI Council/i);
  const linda = findPerson(people, /Linda|Accounts Payable/i);
  const maya = findPerson(people, /Maya|Close/i);
  const marcus = findPerson(people, /Marcus|Sales Operations/i);
  const elena = findPerson(people, /Elena|HR/i);

  const systems: SystemManifest[] = [
    { id: "SYS-oracle", name: "Oracle", category: "erp", soxInScope: true, dataSensitivity: "regulated", ownerPersonId: sofia?.id, linkedControlIds: ["CTRL-rev-104", "CTRL-ap-210", "CTRL-close-302"], linkedAgentIds: [], notes: "Pilot SOX in-scope ERP.", updatedAt: stamped },
    { id: "SYS-copilot", name: "Copilot Studio", category: "runtime", soxInScope: false, dataSensitivity: "internal", ownerPersonId: owen?.id, linkedControlIds: ["CTRL-ai-001"], linkedAgentIds: [], updatedAt: stamped },
    { id: "SYS-servicenow", name: "ServiceNow", category: "other", soxInScope: true, dataSensitivity: "confidential", ownerPersonId: sofia?.id, linkedControlIds: ["CTRL-access-401"], linkedAgentIds: [], updatedAt: stamped },
    { id: "SYS-entra", name: "Entra ID", category: "identity", soxInScope: true, dataSensitivity: "confidential", ownerPersonId: sofia?.id, linkedControlIds: ["CTRL-access-401"], linkedAgentIds: [], updatedAt: stamped },
    { id: "SYS-workday", name: "Workday", category: "hris", soxInScope: true, dataSensitivity: "regulated", ownerPersonId: elena?.id, linkedControlIds: ["CTRL-jml-501"], linkedAgentIds: [], updatedAt: stamped },
    { id: "SYS-blackline", name: "BlackLine", category: "data", soxInScope: true, dataSensitivity: "regulated", ownerPersonId: dana?.id, linkedControlIds: ["CTRL-close-302"], linkedAgentIds: [], updatedAt: stamped },
    { id: "SYS-salesforce", name: "Salesforce", category: "crm", soxInScope: false, dataSensitivity: "confidential", ownerPersonId: marcus?.id, linkedControlIds: ["CTRL-rev-104"], linkedAgentIds: [], updatedAt: stamped },
  ];

  const controls: ControlManifest[] = [
    { id: "CTRL-ai-001", controlId: "AI-001", name: "AI Council intake review", process: "AI governance", riskAddressed: "Unreviewed agents enter production without accountable ownership.", ownerPersonId: owen?.id, reviewerPersonId: priya?.id, frequency: "Weekly", system: "Copilot Studio", evidenceRequired: ["AI Council decision history", "Approved request record"], soxRelevant: false, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
    { id: "CTRL-rev-104", controlId: "REV-104", name: "Billing exception review", process: "Revenue", riskAddressed: "Oracle billing adjustments are posted without independent review.", ownerPersonId: priya?.id, performerPersonId: marcus?.id, reviewerPersonId: dana?.id, frequency: "Monthly", system: "Oracle", evidenceRequired: ["Oracle exception report", "Reviewer sign-off log"], soxRelevant: true, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
    { id: "CTRL-ap-210", controlId: "AP-210", name: "Vendor payment preparation and approval split", process: "Procure to pay", riskAddressed: "One person prepares and approves payments.", ownerPersonId: priya?.id, performerPersonId: linda?.id, reviewerPersonId: dana?.id, frequency: "Monthly", system: "Oracle", evidenceRequired: ["Prepared payment run", "Approval evidence"], soxRelevant: true, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
    { id: "CTRL-close-302", controlId: "CLOSE-302", name: "Close evidence binder review", process: "Financial close", riskAddressed: "Close evidence is incomplete or not reviewed.", ownerPersonId: dana?.id, performerPersonId: maya?.id, reviewerPersonId: priya?.id, frequency: "Monthly", system: "BlackLine", evidenceRequired: ["Binder completeness checklist", "Reviewer approval"], soxRelevant: true, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
    { id: "CTRL-access-401", controlId: "ITAC-401", name: "Quarterly access review", process: "IT general controls", riskAddressed: "Excessive access persists for users, bots, or service accounts.", ownerPersonId: sofia?.id, reviewerPersonId: priya?.id, frequency: "Quarterly", system: "Entra ID", evidenceRequired: ["Access review export", "Reviewer certification"], soxRelevant: true, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
    { id: "CTRL-jml-501", controlId: "HR-501", name: "Terminated employee agent review", process: "Employee lifecycle", riskAddressed: "Agents remain active after owner termination or transfer.", ownerPersonId: elena?.id, reviewerPersonId: sofia?.id, frequency: "Per termination", system: "Workday", evidenceRequired: ["Termination review log", "Agent transfer or suspension record"], soxRelevant: true, linkedTaskIds: [], linkedAgentIds: [], updatedAt: stamped },
  ];

  const requests: AiUseCaseRequest[] = [
    {
      id: "REQ-keystone-001",
      title: "Draft AI Council meeting summaries",
      requesterEmail: owen?.email ?? "owen@keystone.example",
      requesterName: owen?.name,
      businessOwnerPersonId: owen?.id,
      department: "AI Council",
      purpose: "Summarize AI Council decisions and open questions after weekly review.",
      workUnit: "Draft AI Council decision summary",
      systems: ["Microsoft Teams", "ServiceNow"],
      dataSensitivity: "internal",
      soxRelevant: false,
      riskTier: "low",
      status: "approved_for_design",
      councilNotes: "Low-risk drafting use case. Must not send externally without Owen review.",
      decisionHistory: [{ status: "approved_for_design", by: owen?.email ?? "owen@keystone.example", at: stamped, note: "Approved for draft-only design." }],
      createdAt: stamped,
      updatedAt: stamped,
    },
    {
      id: "REQ-keystone-002",
      title: "Oracle billing exception report agent",
      requesterEmail: marcus?.email ?? "marcus@keystone.example",
      requesterName: marcus?.name,
      businessOwnerPersonId: marcus?.id,
      department: "Sales Operations",
      purpose: "Prepare Oracle billing exception reports for controller review.",
      workUnit: "Prepare Oracle billing exception report",
      systems: ["Oracle", "Salesforce"],
      dataSensitivity: "regulated",
      soxRelevant: true,
      riskTier: "high",
      status: "in_review",
      councilNotes: "Requires REV-104 control link and Internal Controls review before deployment.",
      decisionHistory: [{ status: "submitted", by: marcus?.email ?? "marcus@keystone.example", at: stamped }, { status: "in_review", by: owen?.email ?? "owen@keystone.example", at: stamped, note: "Routed to Internal Controls." }],
      createdAt: stamped,
      updatedAt: stamped,
    },
    {
      id: "REQ-keystone-003",
      title: "Service-account AP exception assistant",
      requesterEmail: linda?.email ?? "linda@keystone.example",
      requesterName: linda?.name,
      businessOwnerPersonId: linda?.id,
      department: "Finance",
      purpose: "Use a service account to collect AP exception data from Oracle and ServiceNow.",
      workUnit: "Prepare AP exception packet using service account access",
      systems: ["Oracle", "ServiceNow"],
      dataSensitivity: "regulated",
      soxRelevant: true,
      riskTier: "critical",
      status: "needs_info",
      councilNotes: "Needs explicit service-account exception, expiration, monitoring, and AP-210 control mapping.",
      decisionHistory: [{ status: "submitted", by: linda?.email ?? "linda@keystone.example", at: stamped }, { status: "needs_info", by: sofia?.email ?? "sofia@keystone.example", at: stamped, note: "Document non-human account owner and monitoring." }],
      createdAt: stamped,
      updatedAt: stamped,
    },
    {
      id: "REQ-keystone-004",
      title: "External Copilot agent review",
      requesterEmail: elena?.email ?? "elena@keystone.example",
      requesterName: elena?.name,
      businessOwnerPersonId: elena?.id,
      department: "HR",
      purpose: "Review an employee-carried Copilot agent before it can access HR onboarding data.",
      workUnit: "External agent review for HR onboarding assistant",
      systems: ["Workday", "Copilot Studio", "Entra ID"],
      dataSensitivity: "regulated",
      soxRelevant: true,
      riskTier: "high",
      status: "submitted",
      councilNotes: "External Agent Review / Agent Customs path. Inspect tools, owner, data access, and policy fit.",
      decisionHistory: [{ status: "submitted", by: elena?.email ?? "elena@keystone.example", at: stamped }],
      createdAt: stamped,
      updatedAt: stamped,
    },
  ];

  return { systems, controls, requests };
}
