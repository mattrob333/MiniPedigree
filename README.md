# Pedigree Discover Lite — CSV-to-Agent Prompt MVP

> Map your org. Map their work. Generate the agents.

Upload a People CSV and Pedigree turns it into an editable **spreadsheet**, a visual
**React Flow org map**, and a per-person **responsibility canvas** — then compiles
**Pedigree-Standard AI agent prompts** anchored to a specific human owner, a specific
responsibility, and a specific delegatable task.

The core belief: **AI agents should not be created randomly from prompts. They should
be created from specific responsibilities owned by specific humans.**

```
Person → Responsibility → Task → Delegation Decision → Agent Candidate → Manifest → Standard System Prompt
```

The **org map is the primary workflow surface**: you walk the org top-down and "light it up"
layer by layer as responsibilities are discovered, reviewed, delegated, and turned into agents.

### Department-aware, progressive mapping workflow

```
Upload CSV → Org Map → Start Leadership Session (CEO + reports)
  → nodes light up → Next Recommended Sessions suggest department heads
  → run Department Sessions → responsibilities pass down to teams
  → identify delegatable tasks → generate Agent Manifest + System Prompt
```

- **Scoped mapping sessions** — a guided wizard (Scope → Participants → Input → Review) replaces
  one giant transcript. Session type is recommended from the node: *leadership* (no manager + reports),
  *department* (manager + reports), *individual role* (no reports), or *clarification* (blocked/unclear).
  Mentions outside the chosen scope are flagged, not silently applied. "Insert Demo Session" generates
  a realistic transcript from the actual selected people, so it works on any uploaded CSV.
- **Department color coding** — every node carries a department accent bar, pill, and dot (curated
  dark-mode palette; unknown departments get a deterministic hashed color). A department legend with
  per-dept mapped counts doubles as a **focus mode** (click a department to highlight it and dim the rest,
  keeping the parent chain visible). Status (rings/badges) is rendered independently of department color.
- **Next Recommended Sessions** panel guides you to the next department to map.
- **Lineage** — the drawer shows manager → person assignment and the session each responsibility came from,
  plus team-mapped progress (`Team 2/4`) on manager nodes.
- **Status state machine**: `Uploaded → Needs Discovery → Mapped → Agent Ready → Agent Generated`
  (plus *Needs Review* / *Needs Clarification*). Used consistently across stat cards, the Status
  column, and org-card badges.

### Discovery first, then Org Sync (orgs are dynamic)

Pedigree distinguishes the **first pass** from **ongoing updates**, because companies change:

- **Discovery** — the initial pass that maps each person. The primary CTA reads **"Map
  Responsibilities"** and the *Next Recommended Sessions* queue walks you CEO → department heads.
- Once a person is mapped, their session CTA flips to **"Update"** (Update Leadership/Department/
  Individual Session). When the whole org is mapped, the header shows **"Discovery complete"** and
  promotes **Org Sync** to the primary action.
- **Org Sync (Discovery Refresh)** — paste a fresh **Fireflies / meeting transcript** and Pedigree
  returns a **reviewed changeset** (new responsibilities, new tasks, ownership shifts). Nothing
  applies until you approve it, and approvals **merge** onto existing mappings — they never overwrite.
  This is the recurring loop that keeps the org map current as initiatives and ownership change.

### Sign in, persistence & company context

- **Lightweight sign-in** (email + name + company + "what your company does") — no password.
- **Session auto-resume**: refresh or come back later and your workspace (people, mappings, agents)
  is restored (Supabase when configured, otherwise localStorage), keyed by company.
- **Company context** is a first-class object injected into both discovery parsing and every
  generated manifest + system prompt (`[BUSINESS CONTEXT]`), so agents are grounded in the business,
  not just a role.
- **Context sources** can now be loaded from text files into explicit company buckets:
  segregation-of-duties documents, company policies, and company knowledge/goals/initiatives.
  The company profile dropdown shows what has been loaded so agent authors can see the grounding set.
- **Future connectors** for Saviant, Okta, and Microsoft Entra ID are shown as coming soon until
  real integrations are wired up.

### What you get per agent (the portable, governed manifest)

The defensible artifact is the **manifest**, not the prompt. Each generated agent includes:

- **Authority & guardrails** — human owner, parent responsibility, allowed / approval-required /
  blocked tasks.
- **`io_contract`** — declared `inputs[]` (human_upload / document / data_source / upstream_agent),
  `outputs[]` (→ owner_review_queue / downstream agent / Slack draft), and a `trigger`
  (human / schedule). This turns the flat chain into a directed graph of agents.
- **`lifecycle`** — `standing` (persistent) vs `task` (ephemeral, TTL, but still governed and
  audited — `teardown_policy: delete_agent_retain_log`). The Agents tab separates the two.
- **Company context document stores** — uploaded SOD, policy, and knowledge text files are emitted
  in `company_context.context_documents` and referenced as manifest inputs so a future runtime can
  pull the right grounding documents.
- **Hermes-ready execution fields** — manifests include operating mode, schedule guidance, workflow
  steps, input requirements, output artifacts, tool permissions, delivery targets, memory policy,
  audit events, failure modes, and test prompts.
- **Deployment Package** — one click exports a `.zip` (`system-prompt.txt`, `manifest.json`,
  `SETUP.md`) with the exact documents to load, MCP servers + scopes, data sources, guardrail notes,
  and numbered setup steps for **OpenAI**, **Claude**, and a **generic** runtime.

### Compliance: SOD engine, audit ledger, evidence pack

Built for enterprise / SOX-style review (see `docs/wesco-demo-and-roadmap.md`):

- **Segregation-of-duties engine** (`src/lib/sod.ts`) — eight deterministic duty-pair rules
  (vendor master × payment approval, PO × goods receipt, receipt × invoice processing,
  credit × order release, pricing × rebates, provisioning × certification, JE creation ×
  approval, RMA × approval). Checked when an agent is authored (within the agent AND
  agent-vs-owner) and org-wide on the **Compliance** tab. Findings quote the matching tasks,
  land in the manifest as `sod_findings`, and add a refuse-and-escalate
  `[SEGREGATION OF DUTIES CONSTRAINTS]` section to the system prompt.
- **Audit ledger** (`src/lib/audit.ts`) — append-only, hash-chained event log per workspace
  covering imports, sessions, org syncs, agent generations, uploads, and exports, with a
  live chain-integrity badge. Tamper-evident: any edited/deleted/reordered event breaks
  the chain.
- **Evidence pack** (`src/lib/evidence.ts`) — one-click zip from the Compliance tab:
  `audit-log.json/csv`, `sod-findings.json`, `org-snapshot.csv`, `company-profile.json`,
  and `manifests/*.json`.
- **Long transcripts** (`src/lib/transcript.ts`) — 30–60+ minute Teams/Meet/Zoom/VTT
  exports normalize (2–4× smaller), chunk on speaker boundaries, parse in parallel, and
  merge. No size caps anywhere in the pipeline.

### Full-screen profiles

Clicking a person opens a quick-peek drawer; **"Open full profile"** opens a roomy page with the
reports-to chain, responsibilities (delegatable/approval/blocked), agent inventory (standing vs task),
tools & permitted MCP scopes, and a delegated-task-feed placeholder.

## What it does

1. **Upload** a people CSV (`name, email, title, manager_email, department, known_tools, notes`).
   The app validates columns, resolves `manager_email` references into a reporting tree,
   de-dupes, and flags issues.
2. **Spreadsheet view** — every person with empty Pedigree columns (responsibilities,
   delegatable / approval / not-delegatable tasks, agent candidates, status).
3. **Org Map** — a dynamic, pan/zoom, clickable [React Flow](https://reactflow.dev) chart
   built from the CSV's reporting lines. Handles any org size (tested 8 → 52+ people),
   compact/detailed density, search, minimap, and status colouring.
4. **Responsibility Input** — paste a transcript, record audio in-browser, or upload an
   audio file. Audio is transcribed server-side (OpenAI / Deepgram). Raw meeting exports of
   any length are supported: Teams/Meet/Zoom/VTT transcripts are normalized (timestamps,
   cues, and voice tags stripped) and long meetings are chunked on speaker boundaries,
   parsed in parallel, and merged — never rejected for size.
5. **Parse** — the transcript is turned into structured responsibilities + tasks, with each
   task classified **delegatable / human-approval-required / not-delegatable** (governance-first:
   uncertain tasks default to approval-required). Uses OpenAI Structured Outputs when a key is
   configured, otherwise a deterministic local engine so it always works.
6. **Review** — inspect the proposed mapping before applying it.
   A deterministic **segregation-of-duties engine** (`src/lib/sod.ts`) then watches the
   result: the **Compliance** tab scans every person's duties and every agent's authority
   against duty-pair rules (vendor master × payment approval, PO × goods receipt, credit ×
   order release, provisioning × certification, …), and the Create Agent modal flags SOD
   conflicts in red before a manifest is generated. Findings are embedded in the manifest
   (`sod_findings`) and as hard constraints in the system prompt.
7. **Audit trail** — every governance action (CSV import, applied session, org sync
   approval, agent generation with its SOD findings, document upload, export) is appended
   to a per-workspace, hash-chained **audit ledger** (`src/lib/audit.ts`); editing or
   deleting any past event breaks the chain. The Compliance tab shows the ledger with a
   live chain-integrity check and a one-click **Evidence Pack** export — a zip with the
   audit log (JSON + CSV), all SOD findings, the org snapshot, the company profile, and
   every agent manifest.
8. **Create Agent** — from any delegatable task, generate an **Agent Manifest** (JSON) and a
   **Pedigree Standard System Prompt** with `[ROLE]`, `[ALLOWED TASKS]`, `[BLOCKED TASKS]`,
   `[HUMAN APPROVAL REQUIRED]`, `[TOOLS AND MCP SERVERS]`, `[ESCALATION RULES]`, etc.
9. **Export** — copy the prompt, download the manifest JSON, export the enriched CSV, or
   pull the full **Evidence Pack** from the Compliance tab.

## Tech stack

- **Vite + React 18 + TypeScript** (SPA client)
- **@xyflow/react** (React Flow) for the org chart
- **PapaParse** for CSV, **Zod** for validating all AI structured output
- **Express** API server for OpenAI parsing + audio transcription
- **OpenAI** (Structured Outputs) for transcript → responsibilities, with a deterministic fallback
- **Supabase** (optional) for persistence; falls back to `localStorage`
- Hand-authored dark/light enterprise theme (charcoal / navy / slate / cyan / teal)

## Going live

To host on Vercel with a custom domain, real OpenAI, and optional Supabase, follow
[**DEPLOY.md**](./DEPLOY.md) — step-by-step for keys, env vars, and DNS. The frontend is served
statically and the API runs as Vercel serverless functions in `api/` (sharing the core logic in
`server/core/`); the Express server in `server/` is used for local dev.

## Getting started

```bash
npm install
cp .env.example .env      # optional — the app runs fully without keys
npm run dev               # starts the Vite client (5173) + API server (8787)
```

Open http://localhost:5173. Click **Use Demo CSV**, or one of the five bundled mock
organizations (8 / 20 / 28 / 34 / 52 people) in `public/samples/`, or drop in your own CSV.

### Without API keys (default)
Everything works: CSV import, org map, spreadsheet, a deterministic role-aware parser, and
full agent manifest + prompt generation.

### With OpenAI (real parsing + transcription)
Set `OPENAI_API_KEY` in `.env`. The server then uses GPT Structured Outputs for transcript
parsing (the Parse Review modal shows a **GPT** badge) and OpenAI/Deepgram for audio
transcription. If a call fails, the client transparently falls back to the local engine.

### With Supabase (real persistence)
Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and run the migrations in
`supabase/migrations/`:

- `001_initial_schema.sql` for workspaces and workspace snapshots.
- `002_company_context_documents.sql` for uploaded company context document buckets.

Otherwise the workspace persists to `localStorage`.

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | client + API server (concurrently) |
| `npm run dev:client` | Vite client only |
| `npm run build` | typecheck + production build |
| `npm run server` | API server only (`tsx watch`) |
| `npm test` | unit tests (Vitest) |
| `npm run typecheck` | `tsc -b --noEmit` |

## Project layout

```
app/
  index.html
  vite.config.ts            # /api proxied to the Express server
  src/
    App.tsx                 # screen/state orchestration
    styles.css              # design tokens + dark/light themes
    types.ts
    components/             # Topbar, UploadScreen, Spreadsheet, OrgMap, OrgNode,
                            # Drawer, ManifestScreen, modals/, …
    lib/
      csv.ts                # PapaParse import + manager_email → tree
      layout.ts             # recursive tidy-tree layout for the org chart
      parse.ts              # deterministic transcript → responsibilities/tasks
      transcript.ts         # meeting-transcript normalizer + chunker + merge
      sod.ts                # segregation-of-duties rules engine (SOD-01…08)
      audit.ts              # append-only hash-chained audit ledger
      evidence.ts           # evidence pack zip (audit log, SOD, snapshot, manifests)
      agent.ts              # manifest JSON + Pedigree Standard System Prompt
      hermesManifest.ts     # Hermes-ready execution manifest adapter
      mcpCatalog.ts         # static MCP recommendation catalog (read/draft only)
      schemas.ts            # Zod schemas for AI structured output
      api.ts                # client API wrappers w/ local fallback
      demoData.ts, state.ts, persist.ts, supabase.ts, util.ts, useTheme.ts
  server/
    index.ts                # Express app
    openai.ts
    core/companyProfile.ts    # company profile parsing + deterministic fallback
    routes/discoveryParse.ts  # OpenAI Structured Outputs
    routes/companyProfileParse.ts
    routes/transcribe.ts      # OpenAI / Deepgram speech-to-text
  supabase/migrations/       # workspace + company context document tables
  public/samples/           # five mock-organization CSVs
  tests/                    # Vitest: csv, parse/classification, agent manifest
```

## Mock organizations (in `public/samples/`)

| file | org | people |
| --- | --- | --- |
| `01_lumen_bay_startup_8_people.csv` | early startup | 8 |
| `02_northstar_saas_20_people.csv` | B2B SaaS | 20 |
| `03_summit_clinic_network_34_people.csv` | healthcare network | 34 |
| `04_atlas_channel_group_52_people.csv` | channel partner group | 52 |
| `05_granite_ridge_distribution_28_people.csv` | industrial distribution (SOD-heavy demo org) | 28 |

## Safety notes (MVP)

- API keys live only in environment variables; OpenAI is never called from the browser.
- MCP servers are **recommendations only** — read-only / draft-only scopes, never write.
- Saviant, Okta, and Microsoft Entra ID are visible as future connectors only. Text uploads are
  the current supported company-context source.
- No real tool connections, deployments, or credential brokering. This is a prompt and
  manifest **compiler**, not a runtime.
- Don't paste regulated/sensitive data into the prototype without proper controls.
