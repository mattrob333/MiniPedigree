# WESCO Governance MVP Demo Runbook

This runbook shows how to demo the WESCO-style governance MVP from a clean local checkout. The demo company is **Keystone Industrial Supply**, a fictional and sanitized WESCO-like enterprise. Do not present it as real WESCO data.

## 1. Start The App

From the repo root:

```bash
npm install
npm run dev
```

Open:

- UI: `http://localhost:5173/`
- API health context: `http://localhost:8787/`

On the login screen, use:

- Name: `Demo Governance Reviewer`
- Email: `demo.governance@keystone.local`
- Company: `Keystone Industrial Supply`
- Workspace role: `Governance Reviewer`

Use the `Governance Reviewer` role for a one-person local demo because it can approve the Agent Birth Certificate after generating the agent.

## 2. Load The WESCO-Style Demo Company

1. From **Companies**, open **Keystone Industrial Supply**.
2. Confirm the card is labeled as a WESCO MVP or guided demo.
3. Wait for the workspace to open.

Expected starting state:

- 12 fictional people across Finance, Internal Controls, IT/Security, HR, Sales Ops, Procurement, and AI Council.
- Company context mentions Oracle, Copilot Studio, Teams, ServiceNow, Entra ID, SOX, AI Council backlog, service-account exceptions, and a DDP-like transformation.
- Governance seed includes Oracle, Copilot Studio, ServiceNow, Entra ID, Workday, BlackLine, and Salesforce.

## 3. Demo Storyline

Use this framing:

> Pedigree is not just generating agents. It is creating an enterprise evidence chain from the accountable human, through the work unit and controls, into the agent creation record and exportable audit evidence.

Core chain to show:

`Human Manifest -> Work Unit -> Control Context -> Delegation Grant -> Agent Manifest -> Agent Birth Certificate -> Agent Instance -> Evidence Ledger`

## 4. AI Council Intake

1. Open the **Requests** tab.
2. Show the four seeded AI Council requests:
   - AI Council meeting summaries
   - Oracle billing exception report
   - Service-account AP exception assistant
   - External Copilot agent review
3. Pick **Oracle billing exception report** for the strongest WESCO-style story.
4. Move it through:
   - `Submitted`
   - `In review`
   - `Approved for design`
5. Click **Create work unit**.

What to say:

> The request is now tied to a business owner, system, risk tier, SOX relevance, and a concrete work unit. It did not jump straight from idea to agent.

## 5. Inventory And Agent Design

1. After creating the work unit, the app moves to **Inventory**.
2. Scroll to the candidate planning section.
3. Find the new Oracle request work unit.
4. Click the agent creation action for that work unit.
5. The manifest screen opens.

Expected proof points:

- The agent owner is the request's business owner.
- The task is human-confirmed from AI Council intake.
- The agent is grounded in the existing Pedigree manifest and system prompt flow.

## 6. Birth Certificate Approval

On the manifest screen:

1. Review **Pedigree**.
2. Review **Agent Birth Certificate**.
3. Point out:
   - linked request or confirmed discovery task
   - work unit
   - systems, especially Oracle
   - SOX classification
   - linked controls
   - authority result
   - delegation grant ID
4. Click **Approve manifest + Birth Certificate**.

What to say:

> The Agent Manifest is the technical and governance specification. The Agent Birth Certificate is the approved creation record. That distinction is important for audit, lifecycle, and transfer.

## 7. Export The Agent Package

Still on the manifest screen:

1. Click **Export Deployment Package**.
2. Open the downloaded zip if desired.
3. Confirm it includes:
   - `BIRTH-CERTIFICATE.md`
   - `birth-certificate.json`
   - `GOVERNANCE-SUMMARY.html`
   - `TEST-PACK.md`
   - runtime artifacts

Expected proof point:

> The Birth Certificate travels with the runtime package, so the downstream deployment artifact carries the same owner, control, authority, and evidence obligations.

## 8. Governance Console

Return to the workspace and open **Governance**.

Show **Controls**:

- Oracle billing control
- vendor management
- financial close
- user access review
- change management
- terminated employee agent review

Show **Systems**:

- Oracle is SOX in scope.
- System cards show linked agents, write access count, open findings, and linked controls.

Show **Risk Findings**:

- Findings explain:
  - what happened
  - why it matters
  - recommended action
  - affected object context

What to say:

> Pedigree warns and explains by default. It is designed to support governance review, not hide every issue behind a generic red gate.

## 9. Inventory Slices

Open **Inventory** and show filters:

- SOX relevant
- Touching Oracle
- High / critical risk
- Owner inactive or transitioning
- Missing Birth Certificate
- Open findings

Show views:

- By Agent
- By Human
- By System
- By Control

What to say:

> These are the audit populations an enterprise will ask for: all SOX agents, all agents touching Oracle, agents by owner, agents by system, agents by control, and anything missing its creation record.

## 10. Lifecycle Scenario

Open **Governance -> Lifecycle**.

Offboarding simulation:

1. Select an owner with an agent.
2. Show owned agents, systems touched, linked controls, and suspended registry entries.
3. Click **Mark transitioning** or **Mark offboarded**.
4. Show that the app records lifecycle evidence and flags the risk.

Transfer workflow:

1. Select an agent.
2. Select a new owner.
3. Review authority warnings.
4. Click **Record transfer**.
5. Show that the Birth Certificate resets to draft for re-approval.

Exception workflow:

1. Pick `Authority exceedance` or `Service account`.
2. Pick the agent.
3. Add a justification.
4. Click **Approve local exception**.

What to say:

> Lifecycle is auditable. Offboarding, transfer, and exceptions do not silently mutate production authority. They create evidence and re-review obligations.

## 11. Evidence Exports

Open **Evidence** and export:

- Full inventory
- SOX population
- Oracle population
- Birth Certificate packet
- Risk findings
- Lifecycle review

Expected proof point:

> The demo ends with audit evidence, not just a generated prompt.

## 12. Reset The Demo

If you need a clean run:

1. Go to **Companies**.
2. Delete the Keystone workspace if it already exists.
3. Reopen **Keystone Industrial Supply** from demo companies.

If local state is confusing, use a fresh browser profile or clear site data for `localhost:5173`.

## Fast Five-Minute Version

1. Open Keystone.
2. Requests: approve the Oracle billing request and create a work unit.
3. Inventory: create the agent.
4. Manifest: approve the Birth Certificate and export the package.
5. Governance: show Oracle/SOX controls and risk findings.
6. Evidence: export SOX population and Birth Certificate packet.

## Demo Success Checklist

- The audience sees the chain from human owner to evidence ledger.
- Oracle and SOX are visible in Requests, Governance, Inventory, Birth Certificate, and Evidence.
- A Birth Certificate is approved and exported.
- Inventory can answer "all SOX agents" and "all agents touching Oracle."
- Lifecycle shows offboarding, transfer, exception, and evidence behavior.
- No real WESCO confidential data appears anywhere in the demo.
