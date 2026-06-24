# Pedigree WESCO Enterprise Governance — Build Plan

**Source:** `docs/wesco-enterprise-governance-prd.md`
**Repo:** `https://github.com/mattrob333/MiniPedigree` (branch `claude/sleepy-ramanujan-c79dxw`)

## Sequencing Rationale

Phase 0 first — types and persistence must exist before any UI. Then Inventory/Systems (Phase 1) and Controls (Phase 2) because they're the core WESCO questions. Approval/Birth Certificate (Phase 3) and AI Council (Phase 4) complete the governance loop. Risk/Evidence (Phase 5) and Orphan/Transfer (Phase 6) add actionability. Customs (Phase 7) and Demo Kit (Phase 8) are the capstone.

### Phase 0 — Foundations & Type Expansion
**Goal:** Add types, persistence fields, utility derivations, and tests without large UI changes.
**Files to create:**
- `src/lib/controls.ts` (stub + tests)
- `src/lib/systems.ts` (stub + tests)
- `src/lib/agentInventory.ts` (stub + tests)
- `src/lib/birthCertificate.ts` (stub + tests)
- `src/lib/aiCouncil.ts` (stub + tests)
- `src/lib/approvalGates.ts` (stub + tests)
- `src/lib/riskFindings.ts` (stub + tests)
- `src/lib/evidence.ts` (stub + tests)
- `src/lib/agentTransfer.ts` (stub + tests)
- `src/lib/externalAgents.ts` (stub + tests)

**Files to modify:**
- `src/types.ts` — add ControlManifest, SystemManifest, AgentBirthCertificate, AiCouncilRequest, EvidenceRecord, RiskFinding, ExternalAgentRecord
- `src/lib/persist.ts` — extend serialization for new workspace fields

**Tests:** typecheck passes, existing tests pass

### Phase 1 — Agent Inventory + System Inventory
**Files to create:**
- `src/components/AgentInventoryScreen.tsx`
- `src/components/SystemsScreen.tsx`
- `src/components/SystemDetailDrawer.tsx`
- `src/lib/systems.ts` (full implementation)

**Tests:** Agent inventory derivation, system filtering, 100+ agent rendering

### Phase 2 — Control Manifest + SOX Mapping
**Files to create:**
- `src/components/ControlsScreen.tsx`
- `src/components/ControlDetailDrawer.tsx`
- `src/lib/controls.ts` (full implementation)

**Tests:** Control CRUD, SOX filtering, control-to-agent lineage

### Phase 3 — Birth Certificate + Approval Gates
**Files to create:**
- `src/components/AgentBirthCertificateView.tsx`
- `src/components/ApprovalChecklist.tsx`
- `src/lib/birthCertificate.ts` (full implementation)
- `src/lib/approvalGates.ts` (full implementation)

**Tests:** Birth certificate creation/immutability, approval gate derivation

### Phase 4 — AI Council Intake
**Files to create:**
- `src/components/AiCouncilScreen.tsx`
- `src/components/AiCouncilRequestForm.tsx`
- `src/components/AiCouncilQueue.tsx`
- `src/lib/aiCouncil.ts` (full implementation)

**Tests:** Request lifecycle, approval evidence, manifest conversion

### Phase 5 — Risk Dashboard + Evidence Library
**Files to create:**
- `src/components/RiskDashboard.tsx`
- `src/components/EvidenceLibraryScreen.tsx`
- `src/lib/riskFindings.ts` (full implementation)
- `src/lib/evidence.ts` (full implementation)

**Tests:** Risk derivation, evidence packet generation, export

### Phase 6 — Orphan + Transfer Workflows
**Files to create:**
- `src/components/AgentTransferDrawer.tsx`
- `src/lib/agentTransfer.ts` (full implementation)

**Tests:** Authority comparison, transfer evidence, owner lifecycle

### Phase 7 — Customs and Immigration
**Files to create:**
- `src/components/AgentCustomsScreen.tsx`
- `src/components/ExternalAgentImportDrawer.tsx`
- `src/lib/externalAgents.ts` (full implementation)

**Tests:** External agent import, classification, approval/restrict

### Phase 8 — WESCO Demo Kit
**Files to modify:**
- `src/lib/demoKit.ts` — Oracle/SOX/realistic WESCO names
- `docs/demo-script.md` — end-to-end demo beats

**Tests:** End-to-end smoke tests, QA checklist

---

## Key Guardrails
1. No agent without accountable human ownership → built into the manifest type
2. No agent without lineage → birth certificate records all parent context
3. No authority expansion without review → approval gates enforce this
4. Governance is progressive → SOX/control fields are visible but not forced
5. Evidence is created by normal use → actions auto-generate EvidenceRecords
6. Runtime-neutral first → export packages, not API deploys
7. Honest enforcement → distinguish enforceable vs prompt-advisory vs not-yet-enforceable
8. Preserve deterministic no-API-key demo behavior at all times
