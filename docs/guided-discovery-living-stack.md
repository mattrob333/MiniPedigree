# Guided Discovery + Living Stack + Authority Profile — Implementation Map

Implements three specs on top of the Agent Compiler pipeline
(`docs/pedigree-agent-compiler.md`): the Guided Discovery Engine, the Living
Stack (maintenance engine + member workspace), and the Authority Profile
amendment. Every stage preserves the deterministic no-API-key fallback; all
AI calls go through `callStructured` in `server/core/openaiCall.ts`.

## Guided Discovery Engine

The loop: `Context Readiness → Discovery Plan → Session Brief → Run Session →
Parse → Coverage + Open Questions → (feeds the next brief)`.

| Stage | What | Where |
|---|---|---|
| 1 Readiness | 8-dimension rubric (identity, goals, KPIs, bottlenecks, stack, governance, org, terminology), 0/1/2 each, specific gap messages + fix locations. KPI editor added to the Company Profile. Sessions are never blocked — guidance, not gates. | `src/lib/readiness.ts`, `CompanyProfileScreen` (KPI table + panel), compact banner in the wizard |
| 2 Plan | Deterministic cascade from the org chart: leadership → departments (bottleneck/goal mentions outrank headcount) → clarifications. Stable session ids; regeneration preserves statuses. `adaptPlan` proposes targeted sessions (≥3 open questions) and flags thin applied sessions `rerun_suggested`. Configurable "discovery complete" threshold. | `src/lib/discoveryPlan.ts`, **Plan tab** (`DiscoveryPlanPanel`) |
| 3 Brief | `POST /api/discovery/brief` (AI) with a deterministic template fallback. Mom Test rules enforced both in the prompt and by `sanitizeBrief` (automation-pitch questions dropped; carried-over backlog questions re-appended verbatim and last). Editable, downloadable as Markdown. | `server/core/sessionBrief.ts`, `src/lib/sessionBrief.ts`, `SessionBriefView` |
| 4 Guided Capture | Third input mode in the wizard (default): question checklist, per-question notes with tag chips and target selector, park-it, per-participant coverage meters, simultaneous recording. Serializes to `[Qn \| target \| intent]` blocks; the parse prompt treats that attribution as authoritative. | `src/lib/guidedCapture.ts`, `GuidedCaptureView`, `MappingSessionWizard` |
| 5 Feedback loop | On apply: question outcomes recorded, parser `open_questions` + unanswered/parked brief questions land in the backlog (grouped by person, auto-resolved by task linkage in later parses), plan re-adapts, coverage recalculates. Stale records inject confirmation questions into the next relevant brief. | `src/lib/questionBacklog.ts`, `App.onApplyMapping`, backlog panel in the Plan tab |

## Living Stack

After discovery, the stack is maintained by **signals, not sessions**. Both
signal sources (meetings and members) share one ledger, one durability model,
and the same apply path as Org Sync changesets — never forked.

- **Maintenance parse** — `POST /api/sync/maintenance` (AI) +
  `runMaintenanceParseDeterministic` fallback (`src/lib/maintenance.ts`).
  Never creates records; emits typed signals against compact stack state.
  One-off assignments emit nothing.
- **Meeting registry** — `src/lib/meetings.ts`, registered series in the
  Digest tab; unregistered transcripts still parse, with a register prompt.
- **Durability** (`src/lib/signalLedger.ts`) — confirmations apply silently
  (timestamps only); drift/retirement/feedback promote on first occurrence;
  new candidates need 2 distinct meetings, explicit recurrence language, or a
  member assertion; rule signals always promote at top priority; 30-day
  expiry for uncorroborated candidates.
- **Freshness** (`src/lib/freshness.ts`) — fresh/aging/stale per task (30d),
  responsibility (60d), agent (45d), authority profile (90d). Discovery
  apply stamps the first confirmation. An agent whose task went stale is
  itself flagged. Stale items surface in briefs and My Pedigree.
- **Digest** (`src/lib/digest.ts`, **Digest tab**) — rule changes &
  authority-expanding items first (red treatment; an explicit per-item
  confirmation checkbox; operator/governance-reviewer role required), then
  drift, ranked candidates with every corroborating quote, retirements,
  agent feedback, and the free-wins strip. Apply = the shared
  `applyStackProposals` path: audit record, stale marking, recompile stays a
  separate explicit action.
- **Optimizer** (`src/lib/optimizer.ts`, cards on the Agents tab) — build
  candidates (`corroborations × pain × class-fit × tool-coverage`, weights in
  one config object), adoption gaps, merge candidates, retirements, scope
  tunes. Every recommendation carries evidence and a score breakdown.
- **Member workspace** (“My Pedigree”, `MemberWorkspace`) — My Work (one-tap
  confirm / correct / gone), My Agents (plain-language cards via
  `src/lib/manifestPlain.ts`; every blocked task and approval gate rendered —
  tested), My Questions (inline answers become attributed parse evidence),
  Request an Agent (member provenance counts as corroboration), My Access
  self-attestation, manager team rollup. Roles in `src/lib/rbac.ts`; the
  production auth path is scaffolded in migration `006_users_roles.sql`
  (Supabase members table + RLS) and labeled in-UI as local-until-SSO.

## Authority Profile

An agent can only inherit authority its human owner actually holds — made
mechanical in `src/lib/authority.ts`:

- Trust order `csv < self_attested < discovery < rule_derived < operator <
  iam_sync`; lower trust never overwrites — it raises a discrepancy.
- Populated from: CSV `tool_scopes` column (`src/lib/csv.ts`), rule-derived
  approval authority on profile save (the free win), discovery
  `authority_assertions` (parse schema; land as `authority_change` digest
  proposals through the shared apply path), member self-attestation
  (always `asserted`, review-gated), and operator entry in the Drawer panel.
- Compile: `compileAgent` caps grants at
  `min(task needs, owner grant, library default)`; `admin` never flows;
  missing profile degrades to read_only with a warning. The registry hashes
  the capped grants, so authority changes register as ingredient drift.
- Validation gates (`validateCompiledAgent`): grant above owner's → fail;
  approve-class allowed action without reviewed approval authority → fail;
  preparer/approver SoD violation → fail; context document above the owner's
  data clearance → fail; asserted-only authority / missing profile → warn.
- Lifecycle: offboarding suspends every owned agent (`suspended` registry
  status, enforced continuously); transitioning flags `owner_role_changed`;
  reassignment candidates ranked by grant coverage. Export of an agent with
  an offboarded owner hard-fails.

## Invariants carried through

1. Maintenance parse and member actions emit signals; only the reviewed
   apply path mutates records. Confirmations touch timestamps only.
2. Blocked > approval > allowed, promotions only — unchanged, one shared
   apply path.
3. Every signal, grant, and change carries provenance and evidence; every
   applied change carries approver + timestamp.
4. Briefs never pitch automation to interviewees; carried-over questions are
   never dropped silently.
5. Deterministic fallbacks end-to-end with no API keys.
6. No member self-service path can expand any agent's authority without
   governance review; no agent grant ever exceeds its owner's.

> Naming discipline: authority attributes are access-control and
> segregation-of-duties evidence supporting a customer's compliance program
> (CC6 family). Never labeled "SOC compliance levels".

## Deferred (deliberately)

- Real SSO/OIDC + server-enforced sessions (migration 006 is the scaffold;
  the UI says "local roles, SSO on roadmap" everywhere it matters).
- Fireflies/Meet/Zoom live connectors (meeting registry models them;
  transcripts arrive by paste for now).
- Per-member email notifications (in-app nudges shipped; email needs infra).
- IAM sync (Okta/Entra) — designed as "a higher-trust source arrives".
