# Test Drive: Harbor Peak Supply Co.

A complete fictional company for walking Pedigree end to end as a **new** customer —
no demo shortcuts, every step exercised. Files are numbered in the order you use them.

> **API key note:** with `OPENAI_API_KEY` set, the transcripts below are actually parsed
> (deep extraction: descriptions, inputs/outputs, dependencies, definitions of done).
> Without a key you'll get the local template engine — clearly labeled, items unchecked —
> which is itself worth verifying, but the transcripts only earn their keep on the AI path.

## The company

Harbor Peak Supply Co. — outdoor gear, DTC + wholesale, 10 people, 3 levels:
Dana (CEO) → Marcus (Revenue: Jake, Emily), Sofia (Operations: Tom, Lena),
Priya (CX: Ryan), Maya (Finance). The transcripts deliberately exercise: recurring
cadences, named tools, approval ceilings ("up to $5,000"), segregation of duties
(Lena prepares / Sofia approves), cross-person dependencies (Jake waits on Marcus's
summary; Lena waits on Tom's digest), boundaries ("nothing writes to NetSuite
automatically"), and parked open questions (vendor scorecards, wholesale portal owner).

## The walkthrough

**1 · Upload the roster.** Home screen → "Upload a new company CSV" → `01_roster_harbor_peak.csv`.
- Verify: workspace named from the file; 10 people; org chart preview renders 3 levels
  with Dana at the top; chart pans and zooms; data quality "clean" on every row.

**2 · Validate the roster.** Click "Roster looks right — continue."
- Verify: you land on Company Context (step 2 of the checklist lights up).

**3 · Add company context.** Paste all of `02_company_context.txt` into "Raw company context"
→ Parse Notes → review the parsed panel (goals, systems, SOPs, approval rules, SOD, KPIs)
→ Save Company Context.
- Verify: readiness score climbs; KPI table populated; the "Insert demo context (Lumen Bay)"
  button is **blocked** for this company; header shows the Harbor Peak description (never
  another company's).

**4 · Run the leadership session.** Discovery tab → "Up next: Leadership Session — Dana
Whitfield" → Open session brief.
- Verify on the brief page: rounds numbered with one heading style; grouped questions with
  ask-each chips; Schedule & invite bar at top (try a platform — calendar compose should
  prefill 5 attendees); participants list shows Dana + 4 directs, all "unmapped."
- Transcript tab → paste `03_transcript_leadership_session.txt` → Parse transcript.

**5 · Review findings.** Review tab inside the session.
- Verify: responsibilities grouped by person with evidence quotes; task cards show
  name → description → action items (expand one); evidence opens the wide drawer, text
  wrapped; "Ask later" on anything you're unsure of (try flagging one — it should become
  a follow-up, not block you); agenda coverage line present.
- Confirm & apply.
- Verify: **no dead-end screen** — you land on the Discovery tab, toast reports counts,
  the org map shows the leadership cohort green, next session is the hero card.

**6 · Run the three department sessions** the same way, in any order:
- Revenue (Marcus) → `04_transcript_revenue_department.txt`
- Operations (Sofia) → `05_transcript_operations_department.txt`
- Customer Experience (Priya) → `06_transcript_customer_experience_department.txt`
- Verify after the last one: "Discovery complete" toast; Discovery tab shows the completion
  card with a working "Review findings" door; all 10 people mapped/green on the map.

**7 · Clear follow-ups.** Follow-ups tab.
- Verify: only flagged/low-confidence items + open questions (the parked items: vendor
  scorecard owner, wholesale portal owner, drop-calendar sync) — NOT a re-review of
  everything you confirmed; confirm buttons enabled (reviewer role by default); per-person
  "Confirm N evidenced" labels honest about counts.

**8 · Design an agent.** Agent Plan tab → expand a candidate (e.g. Sofia's stock-cover
report or Tom's exception digest) → check inputs/outputs/tools/definition of done →
**Design agent**.
- Verify: no modal, no workflow forms — you land directly on the manifest; the Pedigree
  chain reads owner → responsibility → task; policy shows approval boundaries from the
  transcripts (e.g. Sofia's $5,000 ceiling); blocked actions include the "nothing writes
  to NetSuite" boundary.

**9 · Manifest review and export.** On the manifest page:
- Verify: Export package section sits at the **bottom** of the page (nothing floats over
  content); test pack present; approve flow gated by role; export download produces the
  zip; "Done — back to Agent Plan" returns you to the plan with the agent listed as built.

**10 · Round trip.** Click into a built agent from Agent Plan ("Open"), back out, check the
person's profile (People tab → View) shows the agent under its responsibility, and the
Evidence tab shows the generation/confirmation events.

## Resetting

Local-only mode persists per browser (localStorage). To rerun clean: delete the Harbor Peak
company card from the home screen (× on the card), or use a fresh browser profile.
