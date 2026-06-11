# Pedigree UX Reset: Spreadsheet-First Discovery — Implementation Plan

Source: external UX review (2026-06). Decision: **adopt**, with three amendments
noted at the bottom. Core principle accepted as the product spine:

> Organize the product around **discovery maturity**, not features. The app
> always knows which state the company is in and defaults to the surface that
> matches it. The org chart is the payoff, not the entry point.

```
Upload roster → validate people → add company context → plan discovery
→ run sessions → review extracted work → responsibility map → agent plan
→ export manifests
```

## The maturity ladder (drives everything)

| # | Stage | Default surface | Primary CTA |
|---|---|---|---|
| 1 | No roster | Start Workspace | Upload roster |
| 2 | Roster needs validation | People & Roles (table) | Validate roster |
| 3 | Context missing | Company Context | Add company context |
| 4 | Sessions need planning | Discovery Plan | Generate discovery plan |
| 5 | Sessions need running | Discovery Plan / Session Workspace | Prepare next session |
| 6 | Findings need review | Review Queue | Review extracted work |
| 7 | Tasks need classification | Responsibility Matrix | Classify tasks |
| 8 | Candidates need planning | Agent Plan | Plan agents |
| 9 | Manifests ready | Export | Export manifests |

Stage signals already exist in state: `people` (+ CSV warnings), readiness
score (`computeReadiness`), `discoveryPlan` session statuses, `buildReviewQueue`
count, classified-task counts, `registry` statuses. No new persistence needed.

Post-discovery operational surfaces (Digest, My Pedigree, Evidence) are
**stage-gated**, not deleted: they appear once the stage ladder passes 6.

---

## Sprint 1 — Make the product understandable (hierarchy + state)

**1. `src/lib/maturity.ts`** (new, pure, tested)
- `deriveStage(state): CompanyStage` over the ladder above.
- `nextAction(stage, state): { label, tab/screen }` — powers the one primary CTA.
- `stageMetrics(stage, state)` — which header metrics are meaningful now.
- `canDefaultToOrgMap(state)` — confirmed responsibilities ≥ 5 OR applied
  sessions ≥ 2 OR coverage ≥ 50%.
- Tests: each stage transition, CTA labels, org-map threshold.

**2. State-based default surface** (`App.tsx`)
- Workspace open routes to the stage's tab, never Org Map before threshold.
- One primary CTA in the header: label + target from `nextAction`. The current
  "Map Responsibilities" header button becomes this state-routed CTA.
- Home screen company cards show their next action ("Continue discovery",
  "Validate roster"), not just "Open".

**3. Persistent SetupChecklist** (new component)
- Left rail / header strip in the workspace until setup completes; items:
  validate roster → add context → prepare sessions → run sessions → review
  extracted work → plan agents → export. States: done / current / locked.
  Each item routes to the real surface.
- The slideshow tour stops auto-launching; stays available from Settings.

**4. Renames** (user-facing labels only; internal names unchanged)
- Company Profile → **Company Context** · MCP Library → **Sources & Tools**
- Spreadsheet → **People & Roles** · Plan → **Discovery Plan**
- Review → **Review Queue** · Audit → **Evidence** · Agents → **Agent Plan**
- ~~Digest → Brief~~ **rejected** (collides with Session Brief); Digest keeps
  its name and appears only post-discovery.

**5. Stage-aware header metrics**
- Early: people imported, manager links valid, departments found, context
  readiness, discovery coverage. Funnel metrics (delegatable / candidates /
  built) appear only once their stage is reachable. No zero-walls.

**6. People & Roles progressive columns**
- Early: Person · Title · Manager · Department · Tools · Data quality ·
  Discovery status · Next action (row CTA = start/prepare the right session).
- Responsibilities/task/agent columns appear only when populated.
- Validation summary panel above the table (import warnings surfaced, not
  buried in a toast).

**7. Visual pass**
- Tokens: body ≥14px, working text 15–16px, session questions ≥18px; primary
  buttons 40–44px; cyan reserved for the primary action + active nav; glow
  removed from secondary elements; department colors muted.
- Empty states rewritten to: what's missing → why it matters → the CTA.

## Sprint 2 — Make discovery usable on a live call

**1. Full-screen Session Workspace** (replaces the wizard modal)
- Screen (not modal), three modes — all reusing existing libs:
  - **Prepare**: objective, participants, gaps this session closes (from
    readiness + backlog), editable question script (`SessionBriefView`),
    context sources used. CTA: Start live session.
  - **Run**: three columns — question queue (left), current question LARGE +
    notes (center, dominant), live capture/findings (right). Controls: mark
    answered / follow-up / skip / park. Recording runs alongside.
  - **Review**: parsed findings as an accept/edit/reject queue per item
    (responsibility, task, approval rule, authority assertion) with source +
    speaker + confidence + provenance state, BEFORE apply. Rejecting an item
    drops it from the applied map.
- Session cards in Discovery Plan expand: purpose, gaps closed, expected
  output; CTA becomes **Prepare session** (not Start).

**2. Review Queue extension** (existing ReviewInbox grows)
- Group by type: Responsibilities · Tasks · Approval rules · Tool mentions ·
  Agent candidates · Conflicts. Every item shows evidence metadata. Edit
  action added (today: confirm only).

**3. Right-rail rework**
- In discovery stages, recommended sessions live in the main column; the rail
  summarizes status (setup state, next session, blockers, recent evidence).

## Sprint 3 — Make the payoff land

**1. Responsibility Matrix** (new view; stage-7 default)
- Rows = confirmed responsibilities under owners; nested tasks with
  delegatable / approval / blocked classification, evidence, status. Drawer:
  description, owner, sources, tools, approval rules, candidate agents, risks.
- Tasks never float without a responsibility owner (already enforced in data).

**2. Org Map staging**
- Early: "Preview" tab with an empty-state explaining what's missing.
- Mid: coverage map (who's interviewed, departments covered, blockers).
- Late: switches to **Responsibility Map** — owner → responsibilities → tasks
  → agents → approval boundaries overlaid.

**3. Agent Plan** (Agents tab reframed)
- Candidates grouped by responsibility (owner → responsibility → task →
  candidate), each showing parent human, task source, tools, approval rule,
  risk, evidence, manifest status. Business justification first; **runtime
  selection moves entirely to Export**.
- Export disabled/muted until ≥1 approved agent; emits the evidence packet
  with the manifest package.

**4. Consolidate transcript intake**
- Org Sync's transcript flow merges into the Digest intake (one door for
  "paste a meeting"); roster re-import becomes a distinct "Sync roster"
  action on People & Roles. (The reviewer's rename pointed at a real
  structural duplication; this is the deeper fix.)

---

## Amendments to the review (what we're NOT doing)

1. **Digest is not renamed "Brief"** — direct collision with Session Brief.
2. **Org Sync ≠ roster import** — instead of renaming, its transcript flow is
   consolidated into the Digest (Sprint 3.4); roster sync becomes its own
   small action on People & Roles.
3. **Tour is demoted, not deleted** — checklist is primary; tour stays
   reachable from Settings for people who want the walkthrough.
4. The 7-workspace nav is adopted, with **Digest** and **My Pedigree** added
   as stage-gated operational surfaces after discovery completes — they're
   the living-stack layer the review didn't cover.

## Acceptance criteria

The review's §15 checklist is adopted verbatim (navigation, onboarding,
people table, discovery, evidence, visual design), with the amendment that
"Digest renamed Brief" is replaced by "Digest hidden until stage ≥ 6".
