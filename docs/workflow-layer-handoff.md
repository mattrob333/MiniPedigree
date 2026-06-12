# Pedigree Workflow Layer: From Transcript to Agent — Implementation Handoff

**Audience:** junior developer picking up this work fresh.
**Status:** approved direction from product critique (2026-06-12). This document is the source of truth for the next four sprints.
**Read first:** `docs/ux-reset-plan.md` (the navigation model you are building on) and `docs/pedigree-agent-compiler.md` (how agents compile today).

---

## 0. The one-paragraph context

Pedigree's flow — upload roster → validate people → company context → discovery sessions → transcript parse → review findings → responsibility matrix → create agents → manifest — is now structurally right. The remaining problem is conceptual: **the product jumps from "the AI found a delegatable task" to "create an agent" without ever operationalizing the task.** A task being *delegatable* does not make it *agent-ready*. "Summarize claims" is a delegation candidate; it is not an agent spec. Your job across these sprints is to insert a **workflow design layer** between review (step 6) and agent creation (step 8), and to stop every screen from overselling readiness.

## The core product rule: no agent without a birth certificate

An agent may only be created when its task has **all** of the following. This is a hard gate, not a suggestion:

1. **Human owner** (e.g. Morgan Hayes)
2. **Parent responsibility** (e.g. Revenue cycle operations)
3. **Specific task** — not "Summarize claims" but "Summarize open customer claims from Salesforce into a weekly revenue-risk brief for Morgan"
4. **Workflow template or custom workflow spec**
5. **Required inputs** (e.g. claims records, date range, status, owner, amount, SLA)
6. **Required tools** (e.g. Salesforce read, Slack draft, Google Docs write)
7. **Output format** (e.g. 5-bullet summary with exceptions and approvals needed)
8. **Definition of done** (e.g. includes count, value, aging, exceptions, missing data, next action)
9. **Approval boundary** (e.g. AI drafts; Morgan approves before sending)
10. **Evidence** (transcript excerpt, speaker, session, confidence)
11. **Test case** (e.g. given 10 sample claims, produce the correct brief and flag missing data)

Until all eleven exist, no button anywhere in the app may say **Create Agent**. It says **Design workflow** or **Complete task spec** instead.

The product's promise changes from *"we found a delegatable task, so we can make an agent"* to *"we found a task that may be delegatable; now we match it to a known workflow, fill the missing operating details, confirm the human boundary, test it, and then generate the agent."*

---

## Codebase orientation (where everything lives today)

| Area | File(s) |
| --- | --- |
| All domain types | `src/types.ts` (single file; `DelegationClass` at line ~42, `TaskCompletionContext` at ~57, `TaskItem` at ~175, `ItemProvenance` at ~155, `CompanyContext` at ~611) |
| Server transcript parser + LLM prompt | `server/core/parse.ts` (`SYSTEM_PROMPT`, `runDiscoveryParse()`), `server/core/openaiCall.ts` |
| Client deterministic fallback parser | `src/lib/parse.ts` (`classifyTask()`, verb lists, role `TEMPLATES`) |
| Zod schemas for parsed output | `src/lib/schemas.ts` |
| State merge after parse | `src/lib/state.ts` (`applyParsed()`) |
| Review queue + bulk confirm | `src/components/ReviewInbox.tsx`, `src/lib/provenance.ts` (`buildReviewQueue()`, `confirmReviewItems()`, `isBulkConfirmable()`) |
| Evidence popover (to be replaced) | `src/components/ProvenanceBadge.tsx` |
| Create Agent modal | `src/components/modals/CreateAgentModal.tsx` |
| Manifest page + export | `src/components/ManifestScreen.tsx`, `src/lib/agent.ts`, `src/lib/hermesManifest.ts` |
| People table / matrix / profile | `src/components/Spreadsheet.tsx`, `src/components/ResponsibilityMatrix.tsx`, `src/components/ProfileScreen.tsx` |
| Discovery plan + session cards | `src/components/DiscoveryPlanPanel.tsx`, `src/components/SessionBriefView.tsx`, `src/components/SessionWorkspace.tsx` |
| Company context screen + demo guard | `src/components/CompanyProfileScreen.tsx` (guard at ~168–192), `src/lib/demoKit.ts` (`demoCompanyContext()`) |
| Persistence | `src/lib/persist.ts` (Supabase or localStorage), state held in `src/App.tsx` hooks (no Redux) |
| Styling | Plain CSS + variables in `src/styles.css`; dark default, light via `data-theme`; classes like `btn`, `tag`, `badge {status}`, `manifest-card` |
| Demo data | `src/lib/demoData.ts`, `src/lib/demoKit.ts`, CSVs referenced in `src/components/WorkspacesHome.tsx` |

Run locally: `npm run dev` (client + server), `npm run test` (vitest), `npm run typecheck`. Add tests under `tests/` for every lib change.

---

# Sprint 0 — Fix the cross-company context leak (do this before anything else)

**Bug:** workspaces for Northstar SaaS show a company description beginning "Lumen Bay builds…". In a product whose entire pitch is traceability and per-client agent boundaries, cross-company context leakage is catastrophic. Fix it before polishing anything.

**Root cause:** the only guard is on the *insert button* in `CompanyProfileScreen.tsx` (~line 168: `isDemoCompany = /lumen\s*bay/i.test(activeName)`). Nothing validates contexts that were **saved before the guard existed**, nothing checks at load time, and the header at `src/App.tsx:879` renders `companyContext?.whatWeDo` unconditionally. `CompanyContext` (`src/types.ts:611`) has only a free-text `company` name — no binding to the workspace.

**Tasks:**

1. Add identity binding to the type in `src/types.ts`:
   ```ts
   export interface CompanyContext {
     companyId: string;        // NEW — must equal the active workspace id
     company: string;
     // ...existing fields
   }
   ```
   Update `src/lib/schemas.ts` accordingly (default `companyId` to `""` for old payloads so Zod doesn't reject them — the load-time guard below handles the rest).

2. Add a hard guard in a new file `src/lib/contextGuard.ts`:
   ```ts
   export function assertContextMatchesCompany(context: CompanyContext, workspaceId: string, workspaceName: string) {
     if (context.companyId && context.companyId !== workspaceId) {
       throw new Error(`Context companyId "${context.companyId}" does not match active company "${workspaceId}".`);
     }
   }
   ```
   Call it (a) in `onSaveCompanyProfile` in `src/App.tsx` before persisting, and (b) in `saveWorkspace()` in `src/lib/persist.ts` as a belt-and-suspenders check.

3. **Sanitize on load** (this is what actually fixes the screenshots): in `loadWorkspace()` (`src/lib/persist.ts`), if the loaded context's `companyId` mismatches, or `companyId` is empty but `context.company` clearly names a *different* company than the workspace (e.g. workspace "Northstar Saas" with `context.company === "Lumen Bay"`), do **not** surface the context. Replace it with an empty context for the workspace and set a flag the UI can show: *"A company description from another workspace was removed from this company. Re-add context for {name}."* Quarantine, don't silently delete — keep the stripped context in the saved blob under `quarantinedContext` so nothing is lost.

4. Stamp `companyId` everywhere a context is created: `App.tsx:460`, `App.tsx:507`, `LoginScreen.tsx`, `demoCompanyContext()` in `demoKit.ts`, `stackSync.ts:353`.

5. Keep the existing insert-button block (do not weaken it to a confirm dialog — blocked is correct), but improve the disabled tooltip copy to match: *"This demo context belongs to Lumen Bay. You are editing {activeName}. Open the Lumen Bay demo company to use it."*

6. Tests (`tests/contextGuard.test.ts`): save with mismatched id throws; load with legacy leaked context quarantines and returns empty context; load with matching id passes through untouched; header subtitle derivation (`App.tsx:879` logic) never sees a quarantined description.

**Done when:** no screen can ever render one company's `whatWeDo` under another company's name, including pre-existing saved workspaces.

---

# Sprint 1 — Stop premature agent creation

Goal: the UI stops claiming agent-readiness it can't back up. No new screens yet — this sprint is the state machine, the gating, and the renames.

## 1.1 Add the task operational state machine

In `src/types.ts`, next to `DelegationClass`:

```ts
export type TaskOperationalState =
  | "extracted"          // transcript mentioned this work
  | "classified"         // delegation class assigned (candidate, approval, not delegatable)
  | "workflow_matched"   // a reusable workflow template fits
  | "workflow_needed"    // no template fits; design required
  | "workflow_designed"  // inputs, outputs, steps, tools, DoD, approval rules exist
  | "agent_ready"        // all birth-certificate fields present, incl. test case
  | "agent_generated"    // manifest exists
  | "exported";          // package exported / activated
```

Add `operationalState: TaskOperationalState` to `TaskItem` (`src/types.ts:175`). Write a single derivation function — do **not** scatter the logic:

```ts
// src/lib/taskState.ts
export function deriveOperationalState(task: TaskItem, spec?: TaskSpec, agent?: AgentRecord): TaskOperationalState
```

Rules, in order: agent exported → `exported`; agent exists → `agent_generated`; spec complete incl. ≥1 test case → `agent_ready`; spec has inputs+outputs+steps+tools+DoD+approval policy → `workflow_designed`; `workflowTemplateId` set → `workflow_matched`; classified but no template match → `workflow_needed`; delegation class assigned → `classified`; else `extracted`. Note the existing `TaskCompletionContext` (`types.ts:57`) already captures `trigger/inputs/outputs/tools_mentioned/definition_of_done/readiness` as nullable transcript-extracted fields — `deriveOperationalState` should treat those as *evidence inputs* to the spec, not as the spec itself.

Set the state in `applyParsed()` (`src/lib/state.ts`) when findings land, and recompute whenever a spec or agent changes. Unit-test the derivation exhaustively (`tests/taskState.test.ts`).

## 1.2 Extend the task model toward TaskSpec

Add to `src/types.ts` (full spec is built out in Sprint 2; add the shape now so gating can check it):

```ts
export interface TaskSpec {
  id: string;
  name: string;
  plainLanguageDescription: string;
  ownerId: string;
  parentResponsibilityId: string;
  trigger: "manual" | "scheduled" | "event_based";
  cadence?: string;
  inputSources: string[];
  requiredTools: string[];
  outputFormat: string;
  recipient?: string;
  definitionOfDone: string[];
  aiAllowedTo: string[];
  aiMustNot: string[];
  approvalRequiredFor: string[];
  businessKpi?: string;
  operationalMetric?: string;
  evidenceIds: string[];
  workflowTemplateId?: string;
  workflowMatchConfidence?: number;
  readiness: "needs_clarification" | "workflow_needed" | "workflow_matched" | "agent_ready";
}
```

Store specs keyed by task id in app state (`App.tsx`) and persist them with the workspace.

## 1.3 Gate Create Agent everywhere

There are three Create Agent entry points. All of them must check `operationalState`:

- **`src/components/ProfileScreen.tsx`** (~line 130, per-task button under each responsibility card). Button text by state:

  | Task state | Button |
  | --- | --- |
  | classified / workflow_needed | **Design workflow** |
  | workflow_matched (fields missing) | **Complete task spec** |
  | workflow_designed (no test) | **Add test** |
  | agent_ready | **Create agent** |
  | agent_generated | **View agent** |

- **Person drawer:** remove **Create Agent** as a drawer-level CTA. Agents are born from a specific task, not a person. Primary CTA becomes **Open profile**; secondary **Update discovery session**. Per-task buttons inside the drawer follow the table above.

- **`src/components/modals/CreateAgentModal.tsx`:** refuse to open (or open in a "Workflow incomplete" state, see Sprint 4) for any task that is not `agent_ready`.

In Sprint 1 the workflow builder doesn't exist yet, so **Design workflow** may open a stub drawer that says what's coming and lists the missing fields (pull them from `TaskCompletionContext` nulls). That's acceptable; a disabled honest button beats an enabled dishonest one.

## 1.4 Rename labels product-wide

Do this as one focused commit so it's reviewable. Grep for the user-facing strings; do **not** rename the `DelegationClass` enum values themselves (that would touch persistence and the LLM schema — display-layer only for now).

| Current | Better |
| --- | --- |
| Delegatable (badge/column) | Delegation candidate |
| Agent Ready (person-level status) | Agent candidates found |
| Create Agent (premature) | Design workflow |
| Review Findings | Review parsed findings |
| Apply 12 findings | Apply selected reviewed findings |
| Evidence (button) | View evidence |
| AI-inferred high | AI-drafted, evidence found |
| Default policy | Operating mode |
| Lifecycle | Agent lifecycle |
| AI construction | Construction method |
| Choose Your Output Format | Export package |

Person-level statuses (StatusBadge in `Spreadsheet.tsx`, `ProfileScreen.tsx`): use *Needs discovery → In session → Findings pending review → Responsibilities mapped → Workflow gaps → Agent candidates found → Agent-ready tasks → Agents generated*. A person may only show "Agent-ready tasks" if at least one of their tasks is truly `agent_ready` (template + inputs + tools + DoD + approval policy + test case).

**Sprint 1 acceptance:** every task carries an operational state; Create Agent is unreachable below `agent_ready`; no surface says "Agent Ready" optimistically; all renames shipped.

---

# Sprint 2 — Workflow Library

Goal: Pedigree stops inventing agents from scratch. Tasks are matched against reusable workflow patterns first; unmatched tasks go through a guided designer; approved designs become reusable IP.

## 2.1 The WorkflowTemplate model

New file `src/lib/workflowLibrary.ts` (internal name `WorkflowTemplateRepository`; user-facing name **Workflow Library**). Types go in `src/types.ts`:

```ts
export type WorkflowTemplateScope = "global" | "firm" | "company" | "person";

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: "summary" | "research" | "drafting" | "monitoring" | "reconciliation"
    | "classification" | "data_entry" | "approval_prep" | "reporting" | "routing";
  description: string;
  delegationFit: "high" | "medium" | "low";
  requiredInputs: { name: string; description: string; required: boolean; example?: string }[];
  requiredTools: {
    type: "mcp" | "web_search" | "document_store" | "spreadsheet" | "manual_upload" | "email" | "calendar";
    name?: string;
    permission: "read" | "draft" | "write_with_approval" | "write";
    required: boolean;
  }[];
  steps: { order: number; instruction: string; toolRequired?: string }[];
  outputSchema: {
    format: "brief" | "table" | "email_draft" | "ticket_update" | "dashboard_note" | "manifest_section";
    requiredSections: string[];
  };
  definitionOfDone: string[];
  approvalPolicy: {
    defaultMode: "read_only" | "draft_for_approval" | "execute_after_approval" | "autonomous_within_threshold";
    approvalRequiredFor: string[];
    blockedActions: string[];
  };
  riskChecks: string[];
  evalTests: { name: string; inputExample: string; expectedOutput: string }[];
  missingInfoQuestions: string[];
  scope: WorkflowTemplateScope;
}
```

Note the overlap with the existing `AgentConstructionSpec` in `src/lib/agent.ts` (~lines 40–58: `workflow_steps`, `input_requirements`, `output_artifacts`, `failure_modes`, `test_prompts`). Templates are the *reusable pattern*; the construction spec is the *per-agent instance*. When compiling an agent, populate the construction spec **from** the matched/designed template — don't duplicate the data model a third time.

## 2.2 Seed 10–15 global templates

In `src/lib/workflowSeeds.ts`, seed: weekly status summary, claims summary, pipeline hygiene review, stale deal monitor, customer onboarding status brief, invoice reconciliation, support ticket triage, renewal risk brief, SOP compliance check, meeting follow-up draft, KPI variance explanation, document comparison, approval packet preparation, CRM field cleanup recommendation, internal update draft. Each fully populated — these double as the spec-by-example for anyone writing new templates. Scope: `"global"`.

## 2.3 Workflow matching in the parse pipeline

The pipeline becomes:

```
transcript → agenda coverage → responsibility candidates → task candidates
→ task classification → workflow pattern matching → missing-information detection
→ review queue → workflow design → agent manifest
```

- **Server path:** extend `SYSTEM_PROMPT` in `server/core/parse.ts` so each extracted task also returns verb, object, source system, output, recipient, cadence, approval need (most of `TaskCompletionContext` already does this — extend rather than replace). Then add a post-parse matching step.
- **Matching itself** lives client-safe in `src/lib/workflowMatch.ts` so the deterministic fallback gets it too: `matchWorkflow(task: TaskItem, templates: WorkflowTemplate[]): { templateId: string; confidence: number }[]`. A simple scorer is fine to start: category keywords vs. task verb/object, tool overlap with `tools_mentioned`, output keywords. Thresholds: ≥0.6 → `workflow_matched` (top match recorded on the task), 0.4–0.6 → surface as "suggested matches" but state stays `workflow_needed`, <0.4 → `workflow_needed`.
- **Missing-information detection:** for a matched template, diff the template's `requiredInputs`/`requiredTools` against what the task evidence provides (`TaskCompletionContext`); unmet items become the task's "Missing:" list and feed `missingInfoQuestions` into the discovery question backlog (`DiscoveryPlanPanel` already carries open questions — reuse that channel).

## 2.4 Workflow Design Builder (for unmatched tasks)

New drawer component `src/components/drawers/WorkflowDesignDrawer.tsx` (full-height right drawer, reuse the existing `Drawer.tsx` pattern). A task with `workflow_needed` shows: *Status: Workflow needed. Reason: no matching workflow template found. Next action: Design workflow.*

The builder asks five practical questions, prefilled from evidence where possible:

1. **What input does this task use?** (e.g. Salesforce claims, Gainsight tickets, spreadsheet export)
2. **What output should the agent produce?** (e.g. weekly summary, Slack draft, internal brief)
3. **What steps would a competent human follow?** (ordered list)
4. **What decisions can AI make?** (e.g. flag missing data, suggest next actions, draft language)
5. **What decisions require human approval?** (e.g. approve refunds, send customer communication)

Plus the spec fields the questions don't cover: trigger/cadence, recipient, definition of done (AI can suggest from template defaults + transcript evidence + company SOPs; the human confirms), and at least one test case before `agent_ready`.

On save, ask: **Save this as** → *One-time task workflow* / *Company workflow* / *Firm reusable workflow*. Company/firm saves create a new `WorkflowTemplate` with that scope. This is how implementation work becomes reusable IP — treat this save path as a first-class feature, not an afterthought.

## 2.5 Workflow Library screen

A simple browsable screen (`src/components/WorkflowLibraryScreen.tsx`): templates grouped by scope (Global / Firm / Company / Person), searchable, each card showing name, category, delegation fit, required tools, and where it's used. Navigation: own entry near **Sources & Tools** — it's the sibling concept (*Sources & Tools = what data exists; Workflow Library = what kinds of work agents know how to do*).

**Sprint 2 acceptance:** parsing matches tasks to templates with confidence; unmatched tasks read "Workflow needed", never "Agent ready"; the design drawer produces a complete `TaskSpec`; custom workflows are saveable at company/firm scope; templates persist with the workspace (firm/global templates persist globally in `persist.ts`).

---

# Sprint 3 — Review and evidence UX

Goal: the review step becomes trustworthy — understandable items, real evidence, visible workflow status, and no rubber-stamp bulk approval.

## 3.1 Restructure Review Inbox into buckets

`src/components/ReviewInbox.tsx` currently renders one long filterable list (105 items is intimidating and unprioritized). Replace the flat list with sections, in this order:

1. **High-risk findings**
2. **Low-confidence findings** (provenance confidence below ~0.6)
3. **Duplicate ownership conflicts** (new, see 3.4)
4. **Workflow-needed tasks**
5. **Bulk-confirmable evidence-backed findings**
6. **Open questions**

Keep the existing rule that only evidenced+delegation-candidate items are bulk-confirmable (`isBulkConfirmable()` in `src/lib/provenance.ts`); the bulk button lives only inside bucket 5 and reads **Apply selected reviewed findings** — never "Apply N findings" globally.

## 3.2 Rebuild the review row layout

The current rows cram type badge, title, owner, confidence, and actions into one line. Use a grid (add to `src/styles.css`):

```css
.review-row {
  display: grid;
  grid-template-columns: 32px minmax(420px, 1fr) 220px 220px;
  align-items: center;
  min-height: 64px;
  gap: 16px;
}
.review-row-title { font-size: 15px; font-weight: 600; }
.review-row-meta  { font-size: 12px; color: var(--muted-text); }
.review-row-actions { display: flex; justify-content: flex-end; gap: 8px; }
```

A responsibility row shows: checkbox · title · owner · source session · status (**AI-drafted** / evidence confidence) · workflow coverage line ("5 task candidates, 3 matched, 2 need design") · nested task lines each with classification + workflow status + evidence availability. Row actions: Edit, View evidence, Confirm responsibility, Send to follow-up, Reject. Remember: **86% is AI confidence, not client confirmation** — the status label must say "AI-drafted" until a human confirms (the `ProvenanceState` machine already distinguishes these; surface it honestly).

## 3.3 Task detail drawer

Clicking a task opens a full right-side drawer (new `src/components/drawers/TaskDetailDrawer.tsx`), not tiny inline controls:

```
Task: Summarize claims
Parent responsibility: Revenue cycle operations
Owner: Morgan Hayes
Classification: Delegation candidate
Workflow status: Workflow needed

What Pedigree thinks this means:
Draft a recurring summary of claims activity for review.

Missing details:
- Claim source system  - Recipient  - Cadence  - Required fields  - Approval boundary

Suggested workflow matches:
- Operational summary brief: 62%
- Exception report: 54%

Actions: Choose workflow template · Design custom workflow · Mark not delegatable · Add follow-up question
```

"What Pedigree thinks this means" is the plain-language expansion — vague labels like "Summarize claims" must always be expandable to a full sentence (best form: *"Every Friday, summarize open revenue claims from Salesforce and Gainsight into a weekly executive brief for Morgan. Include claim count, dollar exposure, owner, status, aging, blockers, and approvals needed."*). A task label must never require the user to trust hidden inference. The drawer also carries the **Definition of Done** section (editable list, suggested by AI, confirmed by human) — this is required before agent creation.

Every task should also display exactly one workflow-status badge: **Workflow matched** / **Workflow partially matched** / **Workflow needed** / **Missing tool** / **Approval unclear** / **Not agent-suitable** — with the "Missing:" line underneath when applicable.

## 3.4 Duplicate ownership detection

Similar responsibilities currently appear under multiple people (the parser assigns "Revenue cycle operations" to everyone who discussed it). Wrong owner means wrong agent boundary, because agents inherit authority from their human owner.

Add to `src/types.ts`:

```ts
export type OwnershipRole = "accountable_owner" | "contributor" | "approver" | "informed";
```

Add `ownershipRole?: OwnershipRole` to `ResponsibilityRow`. In `src/lib/provenance.ts` (or a new `src/lib/ownershipConflicts.ts`), detect near-duplicate responsibility titles across people (normalized title match is fine to start) and emit conflict items into review bucket 3:

```
Potential ownership conflict:
"Revenue cycle operations" appears under Morgan Hayes and Nadia Bennett.
Choose: Morgan owns, Nadia contributes · Nadia owns, Morgan approves · Split responsibility · Keep both
```

Resolution writes `ownershipRole` on each copy. Only the `accountable_owner`'s copy may parent agent-ready tasks.

## 3.5 Replace the evidence popover with an Evidence Drawer

Evidence is the trust layer, not a tooltip. Retire the 300px popover in `src/components/ProvenanceBadge.tsx` (keep the badge itself; clicking it now opens the drawer). New `src/components/drawers/EvidenceDrawer.tsx`:

```css
.evidence-drawer { width: 520px; max-width: 40vw; height: 100vh; overflow-y: auto; }
.evidence-quote  { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
```

Content: finding name; source session; speaker; full transcript excerpt (wrapped, never truncated); confidence; **"Why Pedigree inferred this"** (one-sentence reasoning — extend the parser output to include a `reasoning` string per finding); **"Used to support"** (every responsibility/task/boundary citing this evidence). Actions: Open transcript · Copy excerpt · Mark evidence weak · Add follow-up question. "Mark evidence weak" downgrades provenance and routes the item to follow-up; "Add follow-up question" pushes into the discovery question backlog. The data is already on `ItemProvenance` (`evidence_quote`, `source`, `confidence`) — you're adding `speaker`, `reasoning`, and the reverse-index of supported items.

## 3.6 Matrix and people-table readiness badges

`ResponsibilityMatrix.tsx` shows task counts but not operational readiness. Add per-cell badges (or columns) for: **Workflow matched · Workflow needed · Missing tools · Missing approval rule · Test missing** — all derivable from `TaskSpec` + `deriveOperationalState`. Same data drives the person-status labels from Sprint 1.4 in `Spreadsheet.tsx`.

**Sprint 3 acceptance:** review inbox is bucketed; rows use the grid layout; every task opens a full detail drawer with plain-language meaning, missing details, and workflow matches; evidence opens in a 520px drawer with no clipped text; ownership conflicts are detected and resolvable; bulk confirm only exists inside the evidence-backed bucket.

---

# Sprint 4 — Agent creation, manifest, and export

Goal: agent generation feels governed, not generated.

## 4.1 Create Agent modal

`src/components/modals/CreateAgentModal.tsx`:

- Update the tagline to include the fourth ingredient: **"An agent is born from a human owner, a responsibility, a task, and a reviewed workflow."**
- Above the suggested agent name, add a **task explanation block** rendered from the `TaskSpec`:

  ```
  What this agent will do
  Summarize open customer claims for Morgan Hayes so he can review revenue-cycle
  issues without manually pulling data from multiple systems.

  Expected output: Weekly claims brief with counts, aging, owner, dollar exposure,
  exceptions, and approvals needed.

  This agent may:    read claims data · group and summarize records · draft an internal update · flag missing data
  This agent may not: approve claims · send external communication · change customer records without approval
  ```

  If the system cannot fill this block, **manifest generation is blocked**. Show **"Workflow incomplete"** with the missing list (e.g. claim source system, output format, approval rule, test case) and a single CTA: **Complete workflow spec** (opens the task detail / workflow design drawer).

- **Tool access derivation.** Today tool access comes from the owner's `Person.tools` only. Derive it from, in order: (1) task evidence (`tools_mentioned`), (2) the workflow template's `requiredTools`, (3) company systems (`CompanyContext.systems`), (4) the owner's known tools / `AuthorityProfile`, (5) permission policy. When the workflow requires a tool the owner doesn't hold, show a mismatch warning instead of silently proceeding:

  ```
  Tool mismatch:
  This workflow likely requires Salesforce, but Salesforce is not listed in
  Morgan Hayes's known tools.
  Choose: Add Salesforce read-only with approval · Assign to Nadia Bennett instead · Mark workflow needs clarification
  ```

  "Assign to X instead" should suggest people whose tools/authority cover the requirement. This dovetails with the existing authority-ceiling logic in `src/lib/agent.ts` (agent grants are capped at min(task needs, owner grant, library default)) — the mismatch warning is the UI for the case where that min() would silently zero out a needed tool.

## 4.2 Restructure the manifest page

`src/components/ManifestScreen.tsx` currently leads with the raw system prompt. The user's actual decision is *"is this agent safe, scoped, useful, and exportable?"* — so restructure into tabs (default tab: Overview):

1. **Overview** — human owner, parent responsibility, task, workflow, status
2. **Instructions** — plain-language workflow, agent role, allowed actions, blocked actions
3. **Tools** — required MCPs, permissions, missing tools, tool-access rationale
4. **Policy** — approval rules, risk tier, human review requirements (existing `governancePreservedChecks()` output lives here)
5. **Tests** — sample inputs, expected outputs, failure cases (from `evalTests` / the spec's test cases; a test pack is required before export)
6. **Manifest** — the YAML/JSON/system-prompt views that are currently front and center

## 4.3 Export package section

Remove the floating "Choose Your Output Format" panel. Replace with a bottom-of-page section (or sticky right rail — either, but never floating over content):

```css
.export-package-section { margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px; }
/* or */
.export-rail { position: sticky; top: 96px; }
```

```
Export package
Choose runtime: [Pedigree Standard] [Hermes] [OpenAI] [Claude] [Generic YAML]
Included: agent manifest · system prompt · tool policy · approval rules · test pack · evidence packet
Primary CTA: Export selected package
```

The runtime adapters already exist (`ManifestScreen.tsx` line ~11; zip export ~114–128). Add the **test pack** and **evidence packet** (the supporting `ItemProvenance` excerpts) to the zip contents. Export stays blocked by the existing validation gates; add "no test case" as a hard failure.

## 4.4 Navigation

The primary return path from a manifest should be **Back to task** (or **Back to agent plan** / **Back to responsibility matrix**), not "Back to Org Map". Org map becomes secondary.

## 4.5 Discovery page: transcript status on session cards

`DiscoveryPlanPanel.tsx`'s `PlanSessionCard` already has Planned/Briefed/Captured/Parsed/Applied/Re-run statuses — extend the card to show the full lifecycle explicitly as **Transcript status**: *Brief ready → Transcript needed → Transcript uploaded → Parsed → Review pending → Applied*. ("Review pending" is new: parsed but findings not yet confirmed in the Review Inbox.) Keep the current Google Meet instructions exactly as they are — they're right.

**Sprint 4 acceptance:** modal blocks generation without a complete spec and explains what's missing; tool mismatches warn with actionable choices; manifest page defaults to Overview with the raw prompt demoted to its own tab; export is a non-floating package section including tests and evidence; session cards show transcript lifecycle.

---

# Reference: concepts you must keep straight

**Delegatable ≠ agent-ready.** The maturity path is: extracted → classified → workflow matched (or workflow needed) → workflow designed → agent-ready → agent generated → deployed/exported. The old UI jumped from step 2 to step 6.

**Delegation fit is a rubric, not a boolean.** The verb lists in `src/lib/parse.ts` map onto it:
- *Strong AI fit:* summarizing, searching, drafting, classifying, comparing, reconciling, monitoring, routing, reporting, extracting fields, first drafts, flagging exceptions.
- *Medium fit:* multi-step workflows with clear rules, data entry with approval, communication drafts, ops coordination, internal status updates.
- *Poor fit:* final executive decisions, personnel decisions, legal approvals, unbounded negotiation, high-ambiguity strategy, actions where failure is costly and hard to detect.

**A responsibility is an ownership area, not a task.** It carries: owner, description, department, source session, evidence quote, confidence, related tasks, approval boundaries, systems involved.

**A task must be specific enough to hand to a competent assistant.** Verb, object, source system, output, recipient, cadence, approval need, evidence.

**"Done properly" has three layers,** all on the spec: business KPI (e.g. reduce claims aging), operational metric (e.g. brief out every Friday by 9 AM, 100% of open claims, flags >14-day aging), and definition of done (the output's required contents). Sources, in priority order: transcript evidence, SOPs/policies, company context, tool schemas, workflow library defaults, human reviewer confirmation, later performance data. AI suggests; the human confirms.

---

# Master acceptance checklist

## Transcript parsing and review
- [ ] Parser extracts responsibilities, tasks, approvals, tools, open questions, and evidence
- [ ] Every extracted task has a parent responsibility, an owner, evidence, a delegation classification, and a workflow status
- [ ] Nothing becomes confirmed without human review

## Delegation and workflow
- [ ] Binary "delegatable" replaced by "delegation candidate" in all UI copy
- [ ] Workflow matching with confidence; workflow-needed state; workflow design drawer
- [ ] Definition-of-done fields, task-level success criteria, task-level approval boundaries
- [ ] Test case required before `agent_ready`

## Agent creation
- [ ] Agent creation disabled unless task is `agent_ready`
- [ ] Create Agent modal shows plain-language task meaning, the workflow (template or custom), and missing inputs before generation
- [ ] Tool access derived from task + workflow + company systems + owner policy; tool-mismatch warnings shown

## Evidence
- [ ] Evidence popover replaced by 520px drawer; text wraps, never clipped
- [ ] Evidence includes speaker, session, excerpt, confidence, and reasoning
- [ ] Evidence can be marked weak or sent to follow-up

## Manifest
- [ ] Manifest page defaults to agent overview; raw prompt lives in its own tab
- [ ] Output format selector moved to bottom export-package section (nothing floats over content)
- [ ] Export package includes prompt, manifest, tools, policies, tests, and evidence

## Data safety
- [ ] Cross-company demo context insertion impossible
- [ ] Active company context must match active company id at save, load, and render
- [ ] Header description can never show another company's context (including legacy saved workspaces)

---

# Working notes for the implementer

- **Order matters:** Sprint 0 → 1 → 2 → 3 → 4. Sprint 0 is a trust bug; Sprint 1 removes the dangerous overpromise; everything after is additive.
- **One concept, one module.** State derivation in `taskState.ts`, matching in `workflowMatch.ts`, conflicts in `ownershipConflicts.ts`, guard in `contextGuard.ts`. Components render; libs decide. This codebase keeps logic in `src/lib` with vitest coverage in `tests/` — follow that.
- **Don't rename persisted enum values.** `DelegationClass` strings are in saved workspaces and the LLM schema. Renames in this doc are display copy unless explicitly stated.
- **Nullable means honest.** `TaskCompletionContext` fields are null when the transcript didn't say — preserve that discipline in everything you add. The parser never invents inputs, tools, cadences, or DoD items; it proposes, the reviewer confirms.
- **Demo data must exercise the new states.** Update `demoKit.ts` transcripts/parsed output so the Lumen Bay demo shows at least one task in each of: workflow_matched, workflow_needed, workflow_designed, agent_ready, agent_generated — otherwise the demo silently regresses to the old "everything is agent-ready" story.
- **Typecheck and tests before every commit:** `npm run typecheck && npm run test`.
