# WESCO Enterprise Governance — Task Board

## Legend
- [ ] = not started
- [~] = in progress
- [x] = completed

---

### Phase 0: Foundations & Type Expansion
- [ ] Add ControlManifest interface to types.ts
- [ ] Add SystemManifest interface to types.ts
- [ ] Add AgentBirthCertificate interface to types.ts
- [ ] Add AiCouncilRequest interface to types.ts
- [ ] Add EvidenceRecord interface to types.ts
- [ ] Add RiskFinding interface to types.ts
- [ ] Add ExternalAgentRecord interface to types.ts
- [ ] Extend Workspace with optional arrays for new types
- [ ] Update persist.ts serialization/deserialization
- [ ] Create src/lib/controls.ts (stub + derive + tests)
- [ ] Create src/lib/systems.ts (stub + derive + tests)
- [ ] Create src/lib/agentInventory.ts (stub + flatten + tests)
- [ ] Create src/lib/birthCertificate.ts (stub + create + tests)
- [ ] Create src/lib/aiCouncil.ts (stub + CRUD + tests)
- [ ] Create src/lib/approvalGates.ts (stub + derive + tests)
- [ ] Create src/lib/riskFindings.ts (stub + derive + tests)
- [ ] Create src/lib/evidence.ts (stub + export + tests)
- [ ] Create src/lib/agentTransfer.ts (stub + compare + tests)
- [ ] Create src/lib/externalAgents.ts (stub + classify + tests)
- [ ] Add demo seed helpers for WESCO-style data
- [ ] Verify: npm run typecheck && npm run test

### Phase 1: Agent Inventory + System Inventory
- [ ] Implement SystemManifest derivation from company context
- [ ] Build AgentInventoryScreen.tsx (table, filters, sorting)
- [ ] Build SystemsScreen.tsx (system list, create/edit)
- [ ] Build SystemDetailDrawer.tsx (detail, linked agents)
- [ ] Add filters by system, owner, dept, risk, status, SOX, orphan
- [ ] Link agent rows to Manifest/Birth Certificate placeholder
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: system derivation, inventory flattening, filter logic

### Phase 2: Control Manifest + SOX Mapping
- [ ] Build ControlsScreen.tsx (list, create/edit/import)
- [ ] Build ControlDetailDrawer.tsx (detail, lineage)
- [ ] Implement control-to-task/agent/system linking
- [ ] Add SOX relevance toggle and filter
- [ ] Surface related controls in Agent Manifest
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: control CRUD, SOX filter, lineage

### Phase 3: Birth Certificate + Approval Gates
- [ ] Implement approval gate derivation (triggers from PRD §7.7)
- [ ] Build ApprovalChecklist shared component
- [ ] Implement BirthCertificate creation on approval
- [ ] Build AgentBirthCertificateView.tsx (display + export)
- [ ] Integrate into approval/export path
- [ ] Tests: certificate creation, immutability, gate derivation

### Phase 4: AI Council Intake
- [ ] Build AiCouncilRequestForm.tsx
- [ ] Build AiCouncilQueue.tsx (statuses, filters)
- [ ] Build AiCouncilScreen.tsx (tabs: submit + queue)
- [ ] Implement approval/reject/request-info actions
- [ ] Implement approved-to-manifest conversion
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: request lifecycle, evidence writing, manifest linking

### Phase 5: Risk Dashboard + Evidence Library
- [ ] Build risk derivation rules
- [ ] Build RiskDashboard.tsx (clickable cards)
- [ ] Build EvidenceLibraryScreen.tsx (list, filter, export)
- [ ] Implement evidence packet generation (by agent/control/system)
- [ ] Export JSON/CSV evidence packets
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: risk derivation, evidence export, packet generation

### Phase 6: Orphan + Transfer Workflows
- [ ] Add orphan findings from lifecycle/offboarding
- [ ] Build AgentTransferDrawer.tsx
- [ ] Implement authority comparison
- [ ] Require approval for mismatches
- [ ] Generate transfer evidence
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: orphan detection, transfer comparison, evidence

### Phase 7: Customs and Immigration
- [ ] Build AgentCustomsScreen.tsx
- [ ] Build ExternalAgentImportDrawer.tsx (form/paste/upload)
- [ ] Implement classification (missing owner/purpose/scope)
- [ ] Implement approve/restrict/sandbox/reject
- [ ] Re-export and integrate in App.tsx navigation
- [ ] Tests: import, classification, action states

### Phase 8: WESCO Demo Kit
- [ ] Add WESCO seed data (Oracle, controls, realistic names)
- [ ] Add demo script for end-to-end beats
- [ ] Smoke tests for demo flow
- [ ] Documentation updates
- [ ] Manual QA checklist verification
