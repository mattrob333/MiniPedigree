# Wesco Readiness — Direction, End State, and Demo Playbook

**Date:** 2026-07-02
**Context:** Prepared alongside the full-code audit on `claude/wesco-audit-tool-review-sdyr3k`.
Target customer: Wesco (Fortune 500 industrial/electrical distribution, SOX-regulated,
Anixter integration heritage). Requirement: SOC-compliant, SOD-violation-aware,
auditable agent workflows.

---

## 1. Where the product actually is today (honest baseline)

Pedigree today is a **governance compiler**: CSV → org map → responsibility discovery →
delegation classification → agent manifest + system prompt + deployment package. That is a
real and differentiated core. But three gaps matter for Wesco specifically:

1. **SOD is context, not enforcement.** *(Addressed — SOD engine v0 now ships:
   `src/lib/sod.ts` evaluates eight deterministic duty-pair rules at agent-creation time
   (red conflict panel in the Create Agent modal), embeds `sod_findings` + a
   `[SEGREGATION OF DUTIES CONSTRAINTS]` block into every manifest/prompt, and powers an
   org-wide **Compliance** tab. Next: parse customer SOD matrices into rules, and add
   a compliance-approval workflow for blocking findings.)*
2. **The audit trail is declared, not recorded.** *(Addressed — audit ledger v0 now ships:
   every governance action is appended to a hash-chained, per-workspace event log
   (`src/lib/audit.ts`) shown on the Compliance tab with a chain-integrity badge, and the
   **evidence pack** export zips the ledger + SOD findings + org snapshot + all manifests.
   Next: server-side SHA-256 ledger behind auth so the chain is enforced off-client.)*
3. **The persistence/auth layer is demo-grade.** No-password sign-in, permissive Supabase RLS
   (`anon_all`), unauthenticated API routes. Fine for demos; called out in DEPLOY.md and
   `.env.example` now, but it is the first thing Wesco's security review will ask about.

The audit fixed the correctness bugs underneath all of this (see the commit for the list:
agent/responsibility ID collisions, org-sync reassignments that duplicated instead of moved,
a workspace-switch race that could write an agent into the wrong company, CSV cycle handling,
stale-save races, error messages leaking provider details, etc.). The foundation is now solid
enough to build the compliance layer on.

## 2. End state to shoot for

**"The system of record for AI agent authority."** Wesco should be able to answer, at any
moment and for any auditor:

> *Which agents exist, who owns each one, what exactly is each allowed / forbidden to do,
> which SOD rules were checked when it was created, who approved it, what has it done since,
> and who reviewed that access last quarter?*

That decomposes into four pillars (in priority order):

| Pillar | What it means concretely |
| --- | --- |
| **1. SOD engine** | Machine-readable SOD rules (duty pairs + thresholds) evaluated at agent-creation time and on every org-sync change. Violations block or require a named compliance approver — same UX as the existing approval buckets. |
| **2. Immutable audit ledger** | Append-only event log (append-only table + hash chain is enough): CSV import, session applied, changeset approved/rejected, agent generated/modified/retired, SOD check results, exports. Every event: actor, timestamp, before/after. One-click "evidence pack" export per auditor request. |
| **3. Identity & access reviews** | Real auth (SSO via Entra ID — Wesco is a Microsoft shop), per-org RLS, and a quarterly *agent access review* workflow: each owner re-certifies their agents' scopes, with the review itself logged. Mirrors the user-access-review control auditors already know (CC6.x in SOC 2, ELC/ITGC in SOX). |
| **4. Runtime attestation** | Longer term (per the fleet vision doc): the manifest compiles to enforcement (Hermes profile / OpenShell policy), and runtime logs flow back against the manifest's `trace_id`, closing the loop from "declared authority" to "exercised authority". |

Positioning sentence for the room: *"Everyone else demos an agent. We demo the control
environment your auditors will ask for when agents touch your ERP."*

### About "SOC compliant"

SOC 2 certifies the **service organization**, so there are two tracks — be precise with
Wesco about which is which:

- **Pedigree-the-SaaS getting SOC 2 Type II** (what their vendor-risk team will require):
  auth/SSO, per-tenant RLS, encrypted storage, audit logging, change management, vendor
  management (OpenAI/Deepgram/Supabase as subprocessors), retention policy. The items in
  pillar 2–3 double as your own SOC 2 controls — build once, use twice.
- **Pedigree helping Wesco's own SOX/SOC control environment** (the sales story): SOD
  detection, approval gates, access reviews, evidence exports. This is pillar 1–3.

## 3. The SOD engine (v0 SHIPPED on this branch)

What exists now, all deterministic — no AI required, so it can never be prompt-injected:

1. **Rule model** — `src/lib/sod.ts` ships `DEFAULT_SOD_RULES`: eight duty-pair rules
   (SOD-01…08) seeded from the bundled Granite Ridge policy — vendor master × payment
   approval, PO × goods receipt, receipt × invoice processing, credit × order release,
   pricing × rebate approval, provisioning × certification, JE creation × approval,
   RMA creation × approval. Each rule carries `block` or `flag` severity and keyword
   matchers that are quoted back in findings ("matched *vendor bank* in task X") so every
   flag is explainable to an auditor.
2. **Checkpoints (live):**
   - **Agent creation** — `checkAgentSod` runs inside `buildAgentArtifacts`: conflicts inside
     the proposed agent's task set AND agent-vs-owner conflicts (the owner is the accountable
     actor, so an agent handing them the other side of a duty pair is flagged too).
   - Findings land in the manifest (`sod_findings` with resolution guidance),
     `validation_warnings`, and a hard `[SEGREGATION OF DUTIES CONSTRAINTS]` section in the
     generated system prompt instructing the agent to refuse-and-escalate.
   - **Create Agent modal** shows a red conflict panel before generation; blocking findings
     change the button to "Generate with SOD findings (logged)".
   - **Compliance tab** (keyboard: `4`) — org-wide scan of every person's mapped duties plus
     every generated agent's authority; click-through to the person or manifest.
3. **Org-sync changesets are SOD-checked too** — `computeChangeset` runs the engine on
   each person's prospective duty set (existing + incoming); only conflicts the handoff
   would *create* are flagged (pre-existing ones live on the Compliance tab). Conflicted
   deltas show a red panel + chip in the review modal and start **unapproved**; approving
   anyway is recorded in the audit ledger as an override.
4. **Next (v1):** parse the customer's own SOD matrix into rules (human-reviewed, like org
   sync), and require a named compliance approver to acknowledge blocking findings.

## 4. Demo playbook for Wesco

A **Granite Ridge Distribution** demo org (28 people) is now bundled — an industrial
distributor modeled on a Wesco branch network, with deliberately SOD-sensitive roles:
vendor master data analyst, AP manager/specialist, procurement director/buyer, warehouse
receiving, credit manager, pricing analyst, IT access manager, internal audit, CCO.
Load it from the home screen like the other demo companies.

**Setup (10 min before the call):** sign in, open Granite Ridge, upload
`granite-ridge-sod-policy.txt` into the **SOD documents** bucket of the company profile,
and pre-run the leadership session so the map is partially lit.

**Long transcripts are safe to demo live.** Raw 30–60+ minute Teams/Google Meet/Zoom/VTT
exports are normalized client-side (timestamps, cue numbers, and voice tags stripped —
typically a 2–4× size reduction), and anything still long is split on speaker boundaries,
parsed in parallel, and merged server-side. There is no size rejection anywhere in the
pipeline, so pasting a full raw meeting export into a session or Org Sync is a good
flex, not a risk.

### Scenario A — "Map the org before you automate it" (the opener, ~5 min)
Upload the CSV live → org map renders the branch structure → run a Department Session on
Susan Hale (VP Supply Chain) using **Insert Demo Session** → nodes light up, tasks get
classified delegatable / approval-required / not-delegatable with the governance-first
default. **Line:** "Nobody at Wesco can tell you today which of your 20,000 people's tasks
are already being quietly delegated to ChatGPT. This is the inventory step."

### Scenario B — "The SOD catch" (the money demo, ~7 min)
Run an Individual Role session on **Sam Ortiz (Vendor Master Data Analyst)** and paste this
transcript (verified end-to-end — it produces the conflict deterministically, no API key
needed):

> Tom: Sam owns vendor master record maintenance in SAP, and he maintains vendor bank
> details when suppliers change accounts. To speed things up, Sam also drafts payment run
> approval packets for Priya every Friday. Sam reviews duplicate vendor entries monthly.

Apply the mapping, then click **Create Agent** on any of Sam's vendor tasks. The modal
throws the red panel: **SOD-01 (blocking) — vendor master data vs. invoice/payment
approval**, quoting the exact conflicting tasks. Generate anyway ("Generate with SOD
findings (logged)") and show the manifest's `sod_findings` block with resolution guidance,
the `[SEGREGATION OF DUTIES CONSTRAINTS]` refuse-and-escalate section in the system prompt,
and the finding sitting on the **Compliance** tab next to Sam's person-level SOD-01.
**Line:** "Your auditors test this exact control for humans every year. We apply it to
agents at design time — before the agent exists, not after the finding. And the check is
deterministic code, not a model opinion — it can't be talked out of it."

### Scenario C — "Every agent has a pedigree" (the compliance close, ~5 min)
Open the generated manifest and walk the governance fields: human owner, parent
responsibility, allowed/approval/blocked, MCP scopes (read-only/draft-only, `full` is
auto-downgraded), `io_contract`, lifecycle with teardown-but-retain-logs, `audit.trace_id`,
retention. Then switch to the **Compliance** tab: the **audit trail** shows every action of
the demo so far (workspace created → session applied → agent generated with its SOD
findings), each hash-chained, with the live "chain intact" badge. Click **Export evidence
pack** and open the zip: audit log (JSON + CSV), SOD findings, org snapshot, company
profile, every manifest. **Line:** "When your auditor asks 'what can this thing do, who
said so, and prove nobody edited the record' — this zip is the answer. Portable across
OpenAI, Claude, or your internal runtime."

### Scenario D — "Orgs change; authority follows" (org sync, ~4 min)
Open **Org Sync** and paste this transcript (verified end-to-end, fires deterministically
with no API key):

> Marcus: Tasha enters sales orders for the branch every day. Angela is covering the
> Anixter systems migration, so Tasha now owns releasing blocked orders for the Northeast
> branch. Rosa owns cycle-count reconciliation going forward.

The reviewed changeset shows Tasha's card with a red **"1 SOD conflict"** chip and the
panel: *accepting this handoff gives Tasha both sides of SOD-04 (credit functions vs.
sales order entry)* — and her delta starts **unapproved** while clean deltas default on.
Approving anyway is recorded in the audit ledger as an explicit override. **Line:** "SOD
violations are born in reorgs and coverage handoffs — this is exactly where your auditors
find them a year later. We catch them in the change review, before the authority moves,
and the approval itself becomes audit evidence."

### Scenario E — "Access reviews for agents" (the vision beat, ~3 min)
Open Victor Sokolov (IT Security & Access Manager) and create his "quarterly user access
review prep" agent — an agent whose job is compliance itself (compile ERP role/HR-feed
diffs, draft the review packet; certification stays human). Then the roadmap slide:
SSO/Entra ID, immutable event ledger, quarterly *agent* re-certification, runtime
enforcement via the Hermes/OpenShell path. **Line:** "Phase one inventories and governs
agent creation. Phase two makes the runtime prove it obeyed the manifest."

**Suggested order:** A → B → C → D → E, ~25 min plus questions. If cut to 10 minutes,
run B and C only, on the pre-loaded workspace.

## 5. Pre-Wesco engineering checklist

Priority-ordered; 1–3 are demo-critical, 4–6 are pilot-critical:

1. ~~**SOD engine v0**~~ ✅ shipped (section 3) — deterministic rules + Create-Agent conflict
   panel + Compliance tab + manifest/prompt embedding.
2. ~~**Audit event ledger v0**~~ ✅ shipped — append-only, hash-chained per-workspace ledger
   (`src/lib/audit.ts`) covering imports, sessions, org syncs, agent generations (with SOD
   findings), uploads, and exports; audit trail + chain-integrity badge on the Compliance
   tab; **evidence pack** zip export (`src/lib/evidence.ts`: audit log JSON/CSV, SOD
   findings, org snapshot, company profile, all manifests). v1: server-side SHA-256 ledger
   behind auth.
3. **Demo hardening** — rehearse on Granite Ridge with no API keys (deterministic path),
   then with keys; both must look good. (The fallback engine makes this reliable.)
4. **Auth + RLS** — Supabase Auth (magic link now, Entra ID SSO for the pilot), per-owner
   RLS policies replacing `anon_all`, API routes verifying the session JWT + rate limits.
5. ~~**Prompt-injection hardening**~~ ✅ shipped — transcripts, user notes, and company
   profiles (incl. web-researched content) are wrapped in explicit
   `[BEGIN/END UNTRUSTED ... DATA]` blocks with a standing ignore-embedded-instructions
   rule in every system prompt (`server/core/untrusted.ts`), and the server now
   deterministically clamps model-requested `full` MCP scopes to `draft_only`
   (`clampAuthoredSpec`) in addition to the client-side downgrade.
6. ~~**Evidence pack export**~~ ✅ shipped with the ledger — one click on the Compliance tab:
   org snapshot + all manifests + SOD findings + hash-verified audit log, zipped. This is
   the artifact a Wesco internal-audit champion forwards internally; it sells for you.
