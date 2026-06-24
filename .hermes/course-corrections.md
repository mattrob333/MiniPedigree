# Course Corrections — Outer Loop -> Inner Loop

The OUTER loop appends prioritized directives here on detecting drift, guardrail violations, quality regressions, or off-task work. The INNER loop reads this FIRST every tick and resolves OPEN corrections as top priority before normal work.

**Protocol:**
- Outer APPENDS corrections as OPEN; never edits build-state.md (avoids write races).
- Inner addresses each OPEN item, then marks it RESOLVED (commit <sha>) and moves it to Resolved.
- Severity: BLOCKER (stop normal work, fix now) / HIGH (this tick) / MEDIUM (within 2 ticks) / LOW (when convenient).

---

## Open Corrections

### [LOW] build-state.md Phase 4 line shows pending conversion as undone — OPEN (audit 2026-06-23T00:50Z)
Problem: Line 37 shows `[ ] Convert approved request to task/manifest` but `convertApprovedToManifest()` exists in `src/lib/aiCouncil.ts` with 11 passing tests in `src/lib/aiCouncil.test.ts`. Code merged at commit 4085cf4.
Required fix: Change line 37 from `[ ] Convert approved request to task/manifest` to `[x] Convert approved request to task/manifest` to match actual code state.
Note: This file is guarded from supervisor edits to avoid racing the builder. Builder should perform this trivial state sync on next tick.
Acceptance: build-state.md line 37 shows `[x]` instead of `[ ]`.

## Resolved Corrections

### [MEDIUM] TASKS.md and build-state.md are stale — RESOLVED (commit b67c865)
**Fix applied:**
- TASKS.md: All Phase 0-4 items marked [x], Phase 5 items remain correctly unmarked.
- build-state.md: Phase 4 marked [x] (pending manifest conversion kept as [ ]), Phase 5 marked [x], Next Action set to "Phase 4 conversion pending ... Begin Phase 5".
- Verified: `git diff` shows real [x] marks on completed items.

### [MEDIUM] Phase 4 missing approved-to-manifest conversion — RESOLVED (commit b67c865)
**Fix applied:**
- Added `convertApprovedToManifest()` to `src/lib/aiCouncil.ts`:
  - Throws if request.status !== "approved"
  - Maps businessProblem→purpose, proposedTask→agentName
  - Creates systemAccess from systemsTouched
  - Builds AgentManifest with soxRelevant, riskTier, humanOwnerId
  - Generates EvidenceRecord linking manifest to approval decision
  - Returns partial AgentRecord for UI navigation
- Added 11 tests in `src/lib/aiCouncil.test.ts` covering:
  - Non-approved rejection, field mapping, system resolution, SOX/risk tiers
  - Owner fallback, evidence creation, empty systems, draft status

### [LOW] Phase 5 components exist but are uncommitted and unwired — RESOLVED (commit b67c865)
**Fix applied:**
- Added imports for RiskDashboard and EvidenceLibraryScreen to App.tsx
- Replaced placeholder `<div>` panels with `<RiskDashboard riskFindings={riskFindings} onUpdateFinding={...} />` and `<EvidenceLibraryScreen evidenceRecords={evidenceRecords} />`
- All typecheck/tests pass (524 tests)
