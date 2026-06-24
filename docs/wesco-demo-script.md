# WESCO Enterprise Governance Demo Script

> **End-to-end demo of all 7 governance tabs.**  
> Pre-seeded data loads automatically — no copy-paste required.  
> Open any WESCO-enabled workspace to see the governance tab bar.

---

## Demo Walkthrough

### 1. Agent Inventory — All Agents in One Place
- Navigate to the **Agents** tab (governance section).
- **See:** A table of all generated and imported agents with columns: Name, Owner, Department, Systems, Risk, SOX, Status.
- **Filter:** Use the filter bar — search by name, filter by SOX, risk level, orphaned, or stale.
- **Transfer:** Click the transfer icon on any agent row with a registry entry to open the **AgentTransferDrawer**.
- **Empty state:** When no agents exist, explains why agents matter and how to create them.

### 2. Systems — Registered IT Systems
- Navigate to the **Systems** tab.
- **See:** Oracle EBS (SOX-in-scope, regulated), Workday (SOX-in-scope, confidential), Salesforce (non-SOX, internal), ServiceNow (non-SOX).
- **Details:** Click any system to open **SystemDetailDrawer** showing:
  - Integration status, data sensitivity, connected people
  - Risk findings (if any)
  - Approval requirements and gates
- **SOX badge:** Oracle and Workday are flagged with SOX badges.

### 3. Controls — SOX-Aware Control Manifests
- Navigate to the **Controls** tab.
- **See:** Four controls — Vendor Payment Processing, Procurement to Pay, Identity & Access Management, Financial Forecasting.
- **Create:** Click "Add Control" to create a new control with name, description, SOX toggle, frequency, system links.
- **Filters:** Search by name, filter by SOX relevance, system, status.
- **Detail drawer:** Click any control row to see full detail — evidence requirements, approval gates, related agents.

### 4. AI Council — Intake Queue
- Navigate to the **AI Council** tab.
- **See:** Two tabs — Queue (all requests with status/priority) and Submit (new request form).
- **Queue:** Shows existing requests: "Account Reconciliation Agent" (under_review, high priority, SOX-relevant) and "Salesforce Pipeline Agent" (submitted, medium priority).
- **Submit:** Fill in business problem, proposed task, systems, data sensitivity, SOX relevance, optional expected benefit. Auto-suggest helps with SOX detection and risk tier.
- **Actions:** Approve, Reject, Request More Info buttons on each request.
- **Approval flow:** Approving a request creates an evidence ID and transitions status to "approved". The `convertApprovedToManifest` function can then produce a draft AgentManifest.

### 5. Risk Dashboard — Governance Risk Surface
- Navigate to the **Risk** tab.
- **See:** Summary cards (Critical, High, Medium, Low, Open counts) + risk findings list.
- **Three demo findings:**
  - **High — Orphaned Agent: Vendor Risk Scan** — Agent owned by offboarded person. "Why it matters" explains orphaned agent risk. "Recommended action" tells user to reassign or suspend.
  - **Medium — Unreviewed SOX System Access** — Agent has Oracle EBS access not reviewed by control owner.
  - **Low — Minor Scope Drift** — PO Monitor agent has unexpected draft permission.
- **Expand:** Click any finding to see full description, why it matters, recommended action, related agents/systems.
- **Resolve:** Click "Resolve" to mark a finding as resolved (with timestamp).
- **Filters:** Filter by severity (Critical/High/Medium/Low), category, status (Open/Resolved).
- **Empty state:** When no findings exist, explains that findings appear when governance issues are detected.

### 6. Evidence Library — Audit Trail
- Navigate to the **Evidence** tab.
- **See:** Timeline of evidence records sorted newest-first.
- **Three demo records:**
  - Transfer — Vendor Risk Scan reassigned, authority comparison logged
  - Birth Certificate — Financial Summary Agent v1 created
  - Approval — AI Council approved Financial Summary Agent with Oracle access
- **Filters:** By type (approval, birth_certificate, transfer), subject type (agent, control, system, request), free text search.
- **Export:** JSON and CSV export buttons download filtered records.
- **Empty state:** Explains that evidence is created by governance actions.

### 7. Customs — External Agent Management
- Navigate to the **Customs** tab.
- **See:** (Initially empty) agent list with import form and filter bar.
- **Import:** Click "Import Agent" to expand the inline form — add name, source (Manual, GitHub Copilot, Claude Project, Custom GPT, Vendor Bot, etc.), systems, purpose.
- **Classification:** Imported agents are auto-classified for missing owner, missing purpose, unknown tools, excessive scope, SOX system access.
- **Actions:** Pending-review agents show Approve/Restrict/Sandbox/Reject buttons. Each action calls the corresponding lib function and updates state.

---

## Technical Notes
- All WESCO demo data lives in `src/lib/wescoDemoData.ts`:
  - `demoWescoSystems()` — 4 systems
  - `demoWescoControls()` — 4 controls
  - `demoWescoEvidenceRecords()` — 3 evidence records
  - `demoWescoRiskFindings()` — 3 risk findings
  - `demoWescoAiCouncilRequests()` — 2 AI council requests
- All 7 governance tabs are wired into `App.tsx` with state management.
- No API keys needed — fully deterministic local demo.
- 524+ tests passing at all times.

## QA Checklist
- [ ] Agent Inventory tab renders agents with search/filter/sort
- [ ] Transfer button appears on agent rows; opens drawer with candidates
- [ ] Systems tab shows 4 systems; drawer shows full details
- [ ] Controls tab shows 4 controls; create/edit/detail works
- [ ] AI Council tab: queue shows 2 requests; submit form works; approve/reject actions work
- [ ] Risk Dashboard shows 3 findings; expand/resolve works; summary cards update
- [ ] Evidence Library shows 3 records; filters work; JSON/CSV export works
- [ ] Customs tab: import form works; classification flags appear; action buttons work
- [ ] All tabs navigate correctly via the governance tab bar
