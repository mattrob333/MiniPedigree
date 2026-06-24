# Build State: Pedigree WESCO Enterprise Governance

**Spec source:** `docs/wesco-enterprise-governance-prd.md`
**Repo:** `https://github.com/mattrob333/MiniPedigree` (branch: `claude/sleepy-ramanujan-c79dxw`)
**Workspace:** `C:\Users\mrobe\Documents\Projects\minipedigree\MiniPedigree-latest`
**Status:** Phase 0 in progress — types extended, persist/App.tsx updated, WESCO demo data created, lib modules building in parallel sub-agents

## Architecture: Two-Tier Build Loop
- Inner Loop (builder) — every 10m: Check -> Test -> Advance -> Repeat. Self-pauses both crons at a genuine stopping point.
- Outer Loop (supervisor) — every 30m: active supervisor (audits + writes corrections + trivial fixes + escalation).

## Implementation Phases (from PRD §10)

### Phase 0: Foundations and Type Expansion
Goal: Add types, persistence fields, utility derivations, and tests without large UI changes.
- [x] Extend `src/types.ts` with target object interfaces (ControlManifest, SystemManifest, AgentBirthCertificate, AiCouncilRequest, EvidenceRecord, RiskFinding, ExternalAgentRecord, AgentManifest, HumanManifest)
- [x] Extend `Workspace` with optional arrays for all new types
- [x] Extend `ResponsibilityRow` with relatedControlIds/relatedSystemIds/relatedAgentIds
- [x] Extend `TaskItem` with relatedControls/relatedSystems/soxRelevant
- [x] Update `src/lib/persist.ts` serialization/deserialization
- [x] Update `src/App.tsx` state management for all new workspace fields
- [x] Create `src/lib/wescoDemoData.ts` with WESCO seed data (Oracle, Workday, Salesforce, SOX controls, risk findings, AI Council requests)
- [~] Create 10 utility lib modules with tests (controls, systems, agentInventory, birthCertificate, aiCouncil, approvalGates, riskFindings, evidence, agentTransfer, externalAgents)
- [ ] npm run typecheck && npm run test green
- [ ] Commit and push Phase 0

### Phase 1: Agent Inventory + System Inventory
Goal: Answer WESCO's "show me all agents touching Oracle" question.
- [ ] Build SystemManifest model and system derivation
- [ ] Build AgentInventoryScreen with filters
- [ ] Build SystemsScreen with detail drawer
- [ ] Link from agent rows to Manifest/Birth Certificate placeholder

### Phase 2: Control Manifest + SOX Mapping
Goal: Make controls first-class and link them into agent lineage.
- [ ] Build ControlsScreen with create/edit/import
- [ ] SOX relevance toggle
- [ ] Task-to-control linking
- [ ] Agent Manifest shows related controls

### Phase 3: Birth Certificate + Approval Gates
Goal: Turn approved manifests into immutable proof records.
- [ ] Approval gate derivation
- [ ] Approval checklist on Manifest
- [ ] Birth Certificate creation on approval
- [ ] Birth Certificate view and export

### Phase 4: AI Council Intake
Goal: Represent WESCO's manual request queue.
- [ ] Intake form
- [ ] Reviewer queue
- [ ] Statuses and prioritization
- [ ] Approve/reject/request-info
- [ ] Convert approved request to task/manifest

### Phase 5: Risk Dashboard + Evidence Library
Goal: Make governance status actionable and exportable.
- [ ] Risk derivation rules
- [ ] Risk Dashboard with clickable cards
- [ ] Evidence Library with filter/export
- [ ] Evidence packet exports by agent/control/system

### Phase 6: Orphan + Transfer Workflows
Goal: Handle joiner/mover/leaver operations.
- [ ] Orphan findings from lifecycle/offboarding
- [ ] Transfer drawer with authority comparison
- [ ] Approval for mismatches
- [ ] Transfer evidence generation

### Phase 7: Customs and Immigration
Goal: Import and govern outside agents.
- [ ] External agent import (form/paste/upload)
- [ ] Classification (missing owner/purpose/scope)
- [ ] Approve/restrict/sandbox/reject

### Phase 8: WESCO Demo Kit
Goal: Complete WESCO-specific end-to-end demo.
- [ ] Demo seed data with Oracle/SOX/realistic names
- [ ] Smoke tests for demo beats
- [ ] Documentation updates

## Completed Tasks
_(none yet)_

## Open Issues / Blockers
_(none yet)_

## Next Action
Wait for user to signal go-ahead, then begin Phase 0: create internal types for ControlManifest, SystemManifest, AgentBirthCertificate, AiCouncilRequest, EvidenceRecord, RiskFinding.

## Pitfalls / Notes for Future Ticks
- Commit each green slice before starting the next file (a tick cut off mid-write leaves a broken, uncommitted facade).
- Always `git pull` before working — the supervisor and user may push to the same branch.
- Do NOT claim SOX compliance — say "SOX-aware governance workflows."
- Keep domain logic in `src/lib`; UI components in `src/components`.
- Add tests for every new derivation or policy decision.
- Preserve deterministic no-API-key behavior.
- Use `npm run typecheck && npm run test` as the quality gate.

**Last Updated:** 2026-06-23 — Initial setup with all 8 phases from PRD
