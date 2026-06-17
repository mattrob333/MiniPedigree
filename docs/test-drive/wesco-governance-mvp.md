# Test Drive: Keystone Industrial Supply

Keystone Industrial Supply is a fictional WESCO-like enterprise pilot for the AI workforce governance MVP. It is intentionally sanitized and does not use real WESCO data.

For the complete start-to-finish demo script, use [wesco-demo-runbook.md](./wesco-demo-runbook.md).

## Walkthrough

1. Open **Keystone Industrial Supply** from Demo companies.
2. Review the company context. It should mention Oracle, Copilot Studio, ServiceNow, Entra ID, SOX controls, AI Council intake, service-account exceptions, and DDP-style transformation.
3. Open **Requests**. Verify four AI Council requests are present:
   - low-risk AI Council summary drafting
   - Oracle billing exception report
   - service-account AP exception assistant
   - external Copilot agent review
4. Open **Governance**. Verify Controls, Systems, and Risk Findings tabs render:
   - Oracle appears as a SOX in-scope system
   - REV-104, AP-210, CLOSE-302, ITAC-401, and HR-501 controls are present
   - risk findings explain what happened, why it matters, and recommended action
5. Run discovery or use an existing task to design an agent. On the manifest screen, review the **Agent Birth Certificate** section.
6. Approve/export the manifest. The deployment package should include:
   - `BIRTH-CERTIFICATE.md`
   - `birth-certificate.json`
   - existing manifest/runtime artifacts
7. Open **Inventory**. Verify filters for SOX, Oracle, risk, missing Birth Certificate, owner inactive, and open findings.
8. Open **Evidence**. Export:
   - full inventory
   - SOX agent population
   - Oracle/system population
   - risk findings
   - Birth Certificate packet
9. Mark an agent owner offboarded from a person drawer/profile. Verify suspended/orphan-style findings appear and lifecycle evidence can be exported.

## Acceptance Checks

- Business users can submit/review requests without seeing the whole compliance model at once.
- SOX and Oracle are obvious slices across Requests, Governance, Inventory, Birth Certificate, and Evidence.
- Every risk finding has plain-language explanation and next action.
- Agent creation still flows through the existing manifest/registry/export path.
- The UI supports the chain: Human Manifest -> Work Unit -> Control Context -> Delegation Grant -> Agent Manifest -> Agent Birth Certificate -> Agent Instance -> Evidence Ledger.
