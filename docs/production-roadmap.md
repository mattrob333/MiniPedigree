# Pedigree — Production Roadmap

Where the product stands: the flow is solid from roster → context → guided
discovery → review → matrix → agent manifests, with the living stack
(digest, freshness, My Pedigree) behind it. This doc walks the flow as a
meticulous user, names what's still missing at each step, and phases the
build to a production pilot.

## Where SOPs, SOD rules, and guardrails live TODAY

They enter at **Company Context** and flow automatically from there:

```
Company Context
 ├─ Approval rules (typed list)        ──┐
 ├─ Segregation of duties (typed list) ──┤
 ├─ SOD documents (upload bucket)      ──┼─► extractGovernanceRules (deterministic
 ├─ Policy documents (upload bucket)   ──┘   + optional AI pass, add-only)
 └─ SOPs (typed list)                        │
                                             ▼
                              GovernanceRule[] (rule_id + evidence quote)
                                             │
        ┌────────────────────────────────────┼─────────────────────────┐
        ▼                                    ▼                         ▼
  Discovery parse                    Agent compile (Stage B)     Digest rule_signals
  (classification cites rules)       blocked > approval > allowed  ("from now on…"
                                     merge, monotonic;             changes review at
                                     rule-derived authority        top of digest)
                                     grants on people
        ▼                                    ▼
  Review Queue evidence              Manifest constraint lists cite the policy
                                     verbatim; validation gates hard-fail
                                     violations; one-pager exports the table
```

So the *data path* is complete. What's missing is the **surface**: guardrails
are write-only today. You type a rule, and it works, but you can't *see* the
rule library, test a rule, or trace which agents it touches. That's Phase A.

---

## The meticulous user walk (what I'd want at each step)

**1. People & Roles** — ✅ validation panel, data quality, next action.
Missing: inline cell editing (fix a typo'd manager without re-uploading);
roster re-import diff ("3 joined, 1 left" → lifecycle suggestions). *Phase C.*

**2. Company Context** — ✅ readiness rubric, KPI table, upload buckets.
Missing as a user: when I upload an SOD doc, **show me what Pedigree
extracted from it** — "we found 4 rules in this document" with the quotes —
right there, not silently. And let me correct a bad extraction. *Phase A.*

**3. Discovery → Session → Review** — ✅ strongest part of the product now.
Missing: transcript upload from Fireflies (file/integration, not paste);
speaker attribution surfaced in Review ("Camila said this about herself" vs
hearsay). *Phase D for integration; speaker labels Phase B.*

**4. Responsibility Matrix** — ✅. Missing: reclassify a task from the matrix
(drag delegatable → approval-required with a reason, audited). Right now
classification changes require a re-parse or digest proposal. *Phase B.*

**5. Agent Plan → Manifest** — ✅ grouped candidates, capped grants, gates.
Missing as a user, in order of pain:
   a. **A guardrails check I can SEE before generating** — "this candidate
      will hit 2 approval gates and 1 blocked rule" preview on the card.
   b. **Approval workflow with teeth** — draft → in-review → approved →
      deployed as explicit transitions with who/when (statuses exist in the
      registry; the Agent Plan should drive them, batch-approve with the
      reviewer-separation rule).
   c. **Deploy, not download** — after export I'm left holding a ZIP. The
      product should push: OpenAI Assistant via API, Claude Project files,
      webhook to Hermes. *(a, b → Phase B; c → Phase E.)*

**6. Digest / My Pedigree / Evidence** — ✅ engine + surfaces. Missing:
real auth so members actually log in (today it's preview-as), email nudges,
Fireflies auto-routing into the meeting registry. *Phases C, D.*

---

## Build phases

### Phase A — Guardrails Studio (the SOP/SOD surface) ~1 sprint
The governance pipeline gets a first-class, *visible* home: a "Guardrails"
section inside Company Context (or its own tab once populated):
- **Rule library**: every extracted GovernanceRule as a card — type
  (blocked/approval/audit/SoD), the verbatim evidence quote, source document,
  confidence; enable/disable with audit; manual rule authoring with the same
  schema.
- **Doc → rule traceability**: open an uploaded SOD/policy doc and see the
  rules extracted from it highlighted; "re-extract" after edits.
- **Blast radius**: per rule, which tasks/agents it currently touches
  (matcher dry-run over the pedigree) — answers "what happens if I add this
  rule?" *before* it lands.
- **Rule test bench**: paste a hypothetical task label → see how it would
  classify and which rules fire.
- **SOP attachment**: link an SOP doc to a responsibility/task so the agent
  author grounds workflow steps in the actual procedure (SOPs today are
  context strings; they should become first-class workflow ground truth).

### Phase B — Approve → Export pipeline completion ~1 sprint
- Guardrails preview on Agent Plan candidate cards (gates/blocks the
  candidate will inherit, before generating).
- Registry status workflow on Agent Plan: draft → in-review → approved →
  deployed/retired, with reviewer-separation enforced (generator ≠ approver),
  batch operations, and status filters. Export buttons light up at approved.
- Matrix-level reclassification (move a task between classes with reason +
  audit; authority-expanding moves require the governance role).
- Evidence packet v2: one ZIP per company — all manifests + governance
  one-pagers + audit trail CSV + rule library snapshot.
- Speaker attribution carried from guided-capture into Review item metadata.

### Phase C — Production backend ~1–2 sprints (the long pole)
- Supabase Auth wired to migration 006 (workspace_members, roles, RLS);
  invite flow; members log into My Pedigree as themselves; client role
  checks become server-enforced.
- Workspace persistence moves Supabase-first (localStorage becomes cache);
  optimistic concurrency on the snapshot; per-table writes already exist for
  registry/signals/meetings/docs.
- Server hardening: API auth, rate limits on AI endpoints, model-cost caps,
  structured logging; deploy target (Vercel for client+api or a small box).
- CI: typecheck + vitest + the Playwright smoke (it exists — promote it into
  the repo at `e2e/` and run headless in CI).
- Roster re-import diff → joiner/mover/leaver suggestions wired to the
  lifecycle handlers that already exist.

### Phase D — Live intake ~1 sprint
- **Fireflies**: webhook/API pull → transcripts auto-route to the matching
  registered meeting series → maintenance parse runs → digest accumulates.
  (The meeting registry already models `source: fireflies` + `source_ref`.)
- Transcript file upload (.vtt/.txt) on Session Workspace and Digest intake.
- HRIS CSV-by-email ingestion as the first "connector" (scheduled re-import
  + diff), honest about what it is.
- Per-member weekly nudge emails (digest-per-person exists in lib).

### Phase E — Deploy bridge + pilot hardening ~1 sprint
- "Deploy" on an approved manifest: OpenAI Assistants API create/update,
  Claude Project file bundle, Hermes webhook handoff — registry status flips
  to deployed with the runtime's resource id stamped into provenance.
- Agent feedback loop closes: deployed agent ids match digest
  agent_feedback signals by resource id.
- Pilot polish: error boundaries, slow-network states, workspace size
  guards, telemetry events on the funnel (upload → first agent), and a
  scripted onboarding for the first design partner.

### Continuous
- Demo kit upkeep (`src/lib/demoKit.ts`, `docs/demo-script.md`) — every new
  surface ships with a demo beat.

## Sequencing rationale
A before B because the guardrails surface makes every demo and every approval
decision legible — it's also the thing buyers ask to see ("where do my
policies go?"). B before C because the approve→export loop completes the
story with zero backend risk. C is the long pole and gates D's webhooks and
E's deploy bridge (both need server-side auth + persistence).
