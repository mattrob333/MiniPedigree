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

1. **SOD is context, not enforcement.** Uploaded SOD documents are injected into prompts and
   manifests (`company_context.segregation_of_duties`, the SOD document bucket) — the agent is
   *told* about SOD. Nothing in the product *checks* an agent's allowed-task set against SOD
   rules and flags a violation. For Wesco, detection is the product.
2. **The audit trail is declared, not recorded.** Manifests carry `audit.trace_id`,
   `audit_events`, and retention fields — but the app itself doesn't yet write an immutable
   event log of who mapped what, who approved which changeset, and who generated which agent.
   SOC 2 evidence is exactly that log.
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

## 3. The SOD engine (build this before the demo if anything)

Smallest credible version, all deterministic — no AI required:

1. **Rule model** (`src/lib/sod.ts`):
   ```ts
   interface SodRule {
     id: string;            // "SOD-01"
     name: string;          // "Vendor master vs. payment approval"
     dutyA: string[];       // keyword/phrase matchers: ["vendor master", "vendor record", "bank detail"]
     dutyB: string[];       // ["approve invoice", "payment run", "release payment"]
     severity: "block" | "flag";
   }
   ```
2. **Checkpoints:**
   - `checkAgentSod(allowed, approval, personRow, rules)` → violations when one agent's task
     set (or the agent + its owner's other agents) spans dutyA and dutyB.
   - Run it inside `buildAgentArtifacts` → violations land in `validation_warnings` (already
     rendered) and a new `sod_findings` manifest block.
   - Run it on org-sync changesets → "this reassignment gives Priya both sides of SOD-03."
3. **UI:** red "SOD conflict" chip in the Create Agent modal + a Compliance panel listing all
   findings across the org (that panel *is* the auditor demo).
4. **Seed rules** ship from the bundled policy file (`public/samples/granite-ridge-sod-policy.txt`,
   added in this branch) so the demo needs zero setup; real deployments parse the customer's
   SOD matrix into rules with the existing company-profile AI parse (human-reviewed, like
   org sync).

## 4. Demo playbook for Wesco

A **Granite Ridge Distribution** demo org (28 people) is now bundled — an industrial
distributor modeled on a Wesco branch network, with deliberately SOD-sensitive roles:
vendor master data analyst, AP manager/specialist, procurement director/buyer, warehouse
receiving, credit manager, pricing analyst, IT access manager, internal audit, CCO.
Load it from the home screen like the other demo companies.

**Setup (10 min before the call):** sign in, open Granite Ridge, upload
`granite-ridge-sod-policy.txt` into the **SOD documents** bucket of the company profile,
and pre-run the leadership session so the map is partially lit.

### Scenario A — "Map the org before you automate it" (the opener, ~5 min)
Upload the CSV live → org map renders the branch structure → run a Department Session on
Susan Hale (VP Supply Chain) using **Insert Demo Session** → nodes light up, tasks get
classified delegatable / approval-required / not-delegatable with the governance-first
default. **Line:** "Nobody at Wesco can tell you today which of your 20,000 people's tasks
are already being quietly delegated to ChatGPT. This is the inventory step."

### Scenario B — "The SOD catch" (the money demo, ~7 min)
Create an agent for **Kevin Doyle (AP Specialist)** on his 3-way-match task. Show in the
manifest: vendor-master work is **not** in allowed tasks, payment-run approval is
**blocked**, exceptions route to **Priya Nair** for approval, and the SOD policy text is
embedded in `company_context` + the `[BUSINESS CONTEXT]` block of the system prompt. Then
attempt the violation: try to give one agent both "maintain vendor bank details" and
"approve payment runs." With the SOD engine built, this throws a red SOD-01 conflict
requiring CCO sign-off; until then, narrate it over the blocked/approval buckets.
**Line:** "Your auditors test this exact control for humans every year. We apply it to
agents at design time — before the agent exists, not after the finding."

### Scenario C — "Every agent has a pedigree" (the compliance close, ~5 min)
Open the generated manifest and walk the governance fields: human owner, parent
responsibility, allowed/approval/blocked, MCP scopes (read-only/draft-only, `full` is
auto-downgraded), `io_contract`, lifecycle with teardown-but-retain-logs, `audit.trace_id`,
retention. Export the Deployment Package zip and the enriched CSV. **Line:** "When your
auditor asks 'what can this thing actually do and who said so' — this is the artifact.
Portable across OpenAI, Claude, or your internal runtime."

### Scenario D — "Orgs change; authority follows" (org sync, ~4 min)
Paste a short org-sync transcript: *"Angela is handing release of blocked orders to Tasha
while she covers the Anixter systems migration; Rosa now owns cycle-count reconciliation."*
Show the reviewed changeset — nothing applies without approval, reassignments **move**
ownership (fixed in this branch), and (with the SOD engine) the Angela→Tasha handoff flags
SOD-04, since Tasha already enters sales orders. **Line:** "SOD violations are born in
reorgs and coverage handoffs. We catch them in the change review, and the approval itself
becomes audit evidence."

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

1. **SOD engine v0** (section 3) — deterministic rules + Create-Agent conflict chip +
   compliance findings panel.
2. **Audit event ledger v0** — append-only `audit_events` table (or localStorage ring in
   demo mode) + "Audit Log" screen + CSV export. Cheap, hugely demo-visible.
3. **Demo hardening** — rehearse on Granite Ridge with no API keys (deterministic path),
   then with keys; both must look good. (The fallback engine makes this reliable.)
4. **Auth + RLS** — Supabase Auth (magic link now, Entra ID SSO for the pilot), per-owner
   RLS policies replacing `anon_all`, API routes verifying the session JWT + rate limits.
5. **Prompt-injection hardening** — uploaded docs/transcripts are interpolated into prompts
   verbatim today; wrap untrusted content in delimited data blocks and instruct models to
   treat it as data, and clamp model-proposed scopes server-side (client already downgrades
   `full`).
6. **Evidence pack export** — one click: org snapshot + all manifests + SOD findings +
   audit log for a date range, zipped. This is the artifact a Wesco internal-audit champion
   forwards internally; it sells for you.
