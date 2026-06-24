# Course Corrections — Outer Loop -> Inner Loop

The OUTER loop appends prioritized directives here on detecting drift, guardrail violations, quality regressions, or off-task work. The INNER loop reads this FIRST every tick and resolves OPEN corrections as top priority before normal work.

**Protocol:**
- Outer APPENDS corrections as OPEN; never edits build-state.md (avoids write races).
- Inner addresses each OPEN item, then marks it RESOLVED (commit <sha>) and moves it to Resolved.
- Severity: BLOCKER (stop normal work, fix now) / HIGH (this tick) / MEDIUM (within 2 ticks) / LOW (when convenient).

---

## Open Corrections

### [MEDIUM] TASKS.md and build-state.md are stale — one completely unchecked, one locked in the past — OPEN (audit 2026-06-23T04:15:00Z)
**Problem:**
- TASKS.md has EVERY item unchecked (`[ ]`) across all 8 phases despite Phases 1-4 being fully built (commits 4e72409, 5822d33, dfe4866, f8b7086). This makes it impossible to see real progress.
- build-state.md (line 71) says `"Next Action: Begin Phase 4"` but Phase 4 (AI Council) is already committed in f8b7086. This will mislead the builder into re-doing Phase 4 work.

**Required fix:**
1. Update build-state.md: change "Next Action: Begin Phase 4" to "Next Action: Begin Phase 5 — Risk Dashboard + Evidence Library". Mark Phase 4 as [x] complete. Keep "Begin Phase 4" references pointing at the already-built components.
2. Update TASKS.md: mark [x] on all completed Phase 0-4 items. Leave Phase 5-8 items as [ ].

**Acceptance:** git diff shows TASKS.md with real [x] marks on Phases 0-4, and build-state.md Next Action reads "Phase 5".

### [MEDIUM] Phase 4 missing approved-to-manifest conversion — OPEN (audit 2026-06-23T04:15:00Z)
**Problem:**
TASKS.md Phase 4 task: "Implement approved-to-manifest conversion". No `convertApprovedToManifest` function exists in src/lib/aiCouncil.ts (verified — the file ends at `autoSuggestFields`, no conversion logic). When a request is approved (status → "approved"), no AgentManifest or AgentRecord is created. The approval creates an evidence ID but the request dead-ends without producing a deployable agent record.

**Required fix:**
Add a `convertApprovedToManifest(approvedRequest: AiCouncilRequest, people: Person[], systems: SystemManifest[]): Partial<AgentRecord>` function (or similar) in aiCouncil.ts. It should:
- Accept an approved AiCouncilRequest
- Map fields: businessProblem→purpose, proposedTask→what the agent does, systemsTouched→systemAccess, soxRelevant→soxRelevant
- Create a draft AgentManifest from the approved request data
- Generate an evidence record linking the manifest to the approval decision
- Return the partial AgentRecord (or manifest) so the UI can navigate to it

Add tests for this function in aiCouncil.test.ts covering: field mapping, evidence creation, edge cases (no systems, no SOX).

**Acceptance:** npm run test passes with new tests. A new function `convertApprovedToManifest` exists and is exported from aiCouncil.ts. The function creates a manifest that includes purpose, task, system access, and a linked evidence record.

### [LOW] Phase 5 components exist but are uncommitted and unwired — OPEN (audit 2026-06-23T04:15:00Z)
**Problem:**
`src/components/RiskDashboard.tsx` and `src/components/EvidenceLibraryScreen.tsx` exist on disk as untracked files (`git status --short` shows `??`) but App.tsx lines 1385-1406 still render placeholder panels ("Coming in Phase 5") instead of these components. The builder created the component files but didn't wire them into the app or commit them.

**Required fix:**
1. In App.tsx, replace the placeholder `<div>` for `tab === "risk"` (lines 1385-1395) with `<RiskDashboard riskFindings={riskFindings} onUpdateFinding={...} />`.
2. In App.tsx, replace the placeholder for `tab === "evidence"` (lines 1396-1406) with `<EvidenceLibraryScreen evidenceRecords={evidenceRecords} />`.
3. Add the corresponding imports to App.tsx.
4. Run `npm run typecheck && npm run test`, fix any type errors, then commit.

**Acceptance:** Clicking the Risk tab shows the RiskDashboard with risk summary cards. Clicking Evidence tab shows the EvidenceLibrary with filter/export. typecheck and tests pass.

## Resolved Corrections
_(history appended below)_
