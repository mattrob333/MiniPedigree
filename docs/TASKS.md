# WESCO Enterprise Governance — Task Board

## Legend
- [ ] = not started
- [~] = in progress
- [x] = completed

---

### Phase 0: Foundations & Type Expansion
- [x] Add ControlManifest interface to types.ts
- [x] Add SystemManifest interface to types.ts
- [x] Add AgentBirthCertificate interface to types.ts
- [x] Add AiCouncilRequest interface to types.ts
- [x] Add EvidenceRecord interface to types.ts
- [x] Add RiskFinding interface to types.ts
- [x] Add ExternalAgentRecord interface to types.ts
- [x] Extend Workspace with optional arrays for new types
- [x] Update persist.ts serialization/deserialization
- [x] Create src/lib/controls.ts (stub + derive + tests)
- [x] Create src/lib/systems.ts (stub + derive + tests)
- [x] Create src/lib/agentInventory.ts (stub + flatten + tests)
- [x] Create src/lib/birthCertificate.ts (stub + create + tests)
- [x] Create src/lib/aiCouncil.ts (stub + CRUD + tests)
- [x] Create src/lib/approvalGates.ts (stub + derive + tests)
- [x] Create src/lib/riskFindings.ts (stub + derive + tests)
- [x] Create src/lib/evidence.ts (stub + export + tests)
- [x] Create src/lib/agentTransfer.ts (stub + compare + tests)
- [x] Create src/lib/externalAgents.ts (stub + classify + tests)
- [x] Add demo seed helpers for WESCO-style data
- [x] Verify: npm run typecheck && npm run test

### Phase 1: Agent Inventory + System Inventory
- [x] Implement SystemManifest derivation from company context
- [x] Build AgentInventoryScreen.tsx (table, filters, sorting)
- [x] Build SystemsScreen.tsx (system list, create/edit)
- [x] Build SystemDetailDrawer.tsx (detail, linked agents)
- [x] Add filters by system, owner, dept, risk, status, SOX, orphan
- [x] Link agent rows to Manifest/Birth Certificate placeholder
- [x] Re-export and integrate in App.tsx navigation
- [x] Tests: system derivation, inventory flattening, filter logic

### Phase 2: Control Manifest + SOX Mapping
- [x] Build ControlsScreen.tsx (list, create/edit/import)
- [x] Build ControlDetailDrawer.tsx (detail, lineage)
- [x] Implement control-to-task/agent/system linking
- [x] Add SOX relevance toggle and filter
- [x] Surface related controls in Agent Manifest
- [x] Re-export and integrate in App.tsx navigation
- [x] Tests: control CRUD, SOX filter, lineage

### Phase 3: Birth Certificate + Approval Gates
- [x] Implement approval gate derivation (triggers from PRD §7.7)
- [x] Build ApprovalChecklist shared component
- [x] Implement BirthCertificate creation on approval
- [x] Build AgentBirthCertificateView.tsx (display + export)
- [x] Integrate into approval/export path
- [x] Tests: certificate creation, immutability, gate derivation

### Phase 4: AI Council Intake
- [x] Build AiCouncilRequestForm.tsx
- [x] Build AiCouncilQueue.tsx (statuses, filters)
- [x] Build AiCouncilScreen.tsx (tabs: submit + queue)
- [x] Implement approval/reject/request-info actions
- [ ] Implement approved-to-manifest conversion
- [x] Re-export and integrate in App.tsx navigation
- [x] Tests: request lifecycle, evidence writing, manifest linking

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
