# Pedigree Demo Script — Lumen Bay walkthrough

Every input in the flow has curated demo data wired into the UI (no copy-paste
needed). This script is the presenter's beat sheet: what to click, what to say,
and what each beat proves. Total runtime ~12 minutes; cut beats from the end.
Works fully offline (deterministic engine) — with an `OPENAI_API_KEY` on the
server the parses get richer, but every beat below works without one.

> Demo data lives in `src/lib/demoKit.ts`. The org is **Lumen Bay** (8-person
> e-commerce analytics startup) — open it from the home screen's demo cards.

---

## Beat 0 — Sign in (30s)
- Sign in with any email. Pick role **Operator** (you'll need it for the
  digest's authority items later).
- *Say:* "Pedigree turns a roster and discovery conversations into governed
  AI agents — every agent anchored to a human owner, a responsibility, and
  evidence."

## Beat 1 — Upload → validate (1 min)
- Home screen → demo card **Lumen Bay** (or upload the CSV from
  `public/samples/01_lumen_bay_startup_8_people.csv` for the real motion).
- You land on **People & Roles** — point at the validation panel ("8 people
  imported cleanly"), the **Data Quality** column, and the **setup checklist**
  across the top.
- *Say:* "The app always knows what's next. No org chart yet — that's the
  payoff, not the start."
- Click **Roster looks right — continue**.

## Beat 2 — Company context: SOPs, SOD, guardrails in (1.5 min)
- You land on **Company Context**. Click **Insert demo context**, scroll the
  readiness panel: **16/16** — goals with timeframes, per-department KPIs,
  bottlenecks, terminology.
- Point at **Approval rules** ("Discounts above 15% require Head of Revenue
  approval…") and the **SOD / policy documents** — this is where company
  guardrails enter, and everything downstream cites them.
- Click **Save Company Context**.
- *Say:* "Discovery quality is the ceiling on everything downstream — and
  these policies will reappear, verbatim, inside the agent manifests."

## Beat 3 — Discovery Plan (45s)
- Header CTA now reads the next step. Open the **Discovery** tab: the
  campaign cascades from the CEO down, ordered by the bottlenecks the context
  named. Each card shows purpose, why-now, expected output.
- Click **Open session brief** on **Leadership — Avery Collins**.

## Beat 4 — Session Workspace: Brief → Transcript → Review (3 min)
- **Brief**: the facilitator's agenda — the "How to run this meeting" steps,
  the grouped round-robin and core topics, KPI follow-ups collapsed below.
  Point at a KPI question using *Lumen Bay's own vocabulary* and the "why"
  under each question. Click **Copy agenda** ("paste this into your meeting
  doc — the app stays out of the call").
- *Say:* "You run the meeting in Google Meet like a normal conversation.
  Pedigree's job starts when the transcript comes back."
- Click **Upload transcript** → the Transcript surface ("Transcript
  needed"). Click **Insert demo transcript** (a realistic leadership
  conversation: approval ceilings, SoD statements, pain language, an open
  question) → **Parse transcript**.
- **Review**: the **agenda coverage strip** ("12 answered · 1 unanswered —
  carried into open questions") then extracted findings with evidence
  quotes and confidence. **Uncheck one task** ("this one's wrong") — *say:*
  "rejected items never enter the map; this is the trust layer." Click
  **Apply**.
- Optional aside: **Use native capture** on the Brief shows the per-question
  cockpit for teams that want Pedigree taking the notes — it's an option,
  never the default.

## Beat 5 — Run the Revenue session (1 min, optional)
- Discovery tab → **Open session brief** on **Priya Shah** → Upload
  transcript → Insert demo transcript → Parse → Apply.
- This transcript carries the juicy governance content: Lucas's 15% discount
  ceiling, Priya's 15–25% band, preparer/approver separation, Camila's
  renewal-handoff open question — watch it land in the **question backlog**.

## Beat 6 — Responsibility Matrix (1 min)
- **Responsibilities** tab: the matrix — owner × responsibility with
  per-class counts and evidence badges. Expand **Priya / pipeline** rows:
  tasks with cadence, tools, provenance, freshness.
- Toggle to **Responsibility Map** for the org-chart payoff moment.

## Beat 7 — Agent Plan → manifest (2 min)
- **Agent Plan** tab: candidates grouped under their human owners with the
  approval boundary shown per group. Click **Plan this agent** on a Lucas
  pipeline-hygiene task → Generate.
- On the manifest screen point at: allowed / approval-required / blocked
  lists **citing the policy text from Beat 2**, the MCP grants capped at the
  owner's authority, validation gates, and the enforcement-reality table.
- *Say:* "Runtime is chosen here, at export — planning decided whether the
  agent should exist and under whose authority."

## Beat 8 — The living stack: Digest (2 min)
- **Digest** tab → **Insert demo standup (Monday)** → **Process transcript**.
  - Toast: confirmations applied silently; the churn-digest mention is
    *ledgered, not surfaced* — single mentions are noise.
  - The refund rule change sits in the red **Rule changes** section.
- **Insert demo standup (Friday)** → Process.
  - The churn digest is now **corroborated + has recurrence language** → it
    appears as a durable candidate with *both quotes*. Drift (Camila's
    Thursday change), agent feedback, and a retirement land in their
    sections.
- Apply an item; point at the audit trail note and "recompile is a separate
  step."

## Beat 9 — My Pedigree (1 min)
- Header → **My Pedigree** (preview-as picker if your email isn't in the
  roster — pick Lucas).
- One-tap **Confirm** a task (freshness flips green), **Correct** one with a
  new tool ("flagged authority-expanding — goes to governance review"),
  answer an open question, submit **Request an Agent**.

## Beat 10 — Governance finale (1 min)
- **Evidence** tab: the append-only trail — who confirmed, approved,
  applied, with quotes.
- Drawer on any person → **Authority profile** + lifecycle. Set someone to
  **offboarded**: every agent they own suspends instantly.
- *Say:* "No agent survives its owner. That's the pedigree."

## Reset between demos
Account menu → sign out, or delete the company card on the home screen
(workspaces are per-browser localStorage in demo mode).

## Other inputs on hand
- **Org refresh** (Digest → Full discovery refresh → **Insert demo refresh**):
  ownership transfer (renewals Camila → Lucas) + a rule tightening — shows
  the changeset review with the red authority treatment.
- **Bigger orgs**: `03_summit_clinic_network_34_people.csv` (healthcare) and
  `04_atlas_channel_group_52_people.csv` for org-map scale; curated
  transcripts fall back to the generated ones there.
- **tool_scopes CSV column**: add e.g. `HubSpot:read_write` to a roster row
  to show CSV-sourced authority grants in the person drawer.
