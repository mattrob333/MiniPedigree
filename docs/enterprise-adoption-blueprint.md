# Enterprise Adoption Blueprint — Agent Lifecycle Management

**Date:** 2026-07-02
**Status:** Product direction / build plan
**Companion docs:** `wesco-demo-and-roadmap.md` (demo playbook), `dev-log-2026-07-02.md` (what shipped)

---

## 1. The reframe

Today Pedigree is a **single-player, top-down mapping tool**: one operator uploads the org,
maps responsibilities, and generates agents. That's the right wedge for discovery and the
demo — but enterprises don't adopt tools, they adopt **workflows with owners**.

The product enterprises will actually buy is **Agent Lifecycle Management (ALM)**: the same
request → check → approve → provision → operate → recertify → retire loop that IAM teams
already run for human access in SailPoint / ServiceNow / Entra — applied to AI agents.

> **Positioning:** "SailPoint for agents." An agent request is an access request. IAM and
> compliance teams already trust this mental model; we don't have to teach them a new one.

Pedigree already has the hard artifacts: the governed manifest, the deterministic SOD
engine, the hash-chained audit ledger, the evidence pack. What's missing is the
**multi-player shell** around them.

## 2. The flow that has to be easy

### 2.1 Team member: "I need an agent" (target: < 5 minutes)

1. **Entry point where they already work** — a Teams tab / Slack home ("My Pedigree"),
   not another URL to remember. Button: **Request an agent**.
2. **Never a blank prompt.** The requester picks from:
   - **their own mapped tasks** (their pedigree row already exists), or
   - an **agent catalog** of pre-approved templates ("Quote follow-up drafter",
     "Report summarizer", "3-way-match exception prep") with pre-vetted scopes.
   Catalog picks should be ~80% of volume — that is what makes this scale.
3. **Plain-language capability preview** before submission:
   *"This agent WILL be able to: read Salesforce, draft Slack messages.
   It will NEVER: send external email, approve anything, commit pricing."*
   One-line business justification. Submit.
4. **Checks run at request time, not review time.** SOD engine + policy checks execute
   instantly. A conflicted request tells the requester immediately, with the suggested
   resolution ("route credit release to Angela") — a fast *no with a reason* builds more
   trust than a slow silent queue. Clean requests show "routed to Monica for approval."

### 2.2 Manager: one-tap approval

5. Manager receives an **actionable card in Teams/email**: agent name, owner, capability
   summary, checks passed. Approve / deny / ask-a-question inline. SLA timer; delegation
   when OOO.

### 2.3 IAM / AI lead: the console

6. **Review queue** — only what needs a human: custom scopes, sensitive data classes,
   SOD findings. Catalog-template requests with clean checks **auto-approve by policy**
   (with notification, everything still logged).
7. Each queue item shows: the drafted manifest (diff vs. template), which checks ran and
   their results, the requester's entitlements from the IdP, cost estimate. One-click
   approve / deny / needs-info.
8. **Exception management done like real GRC**: a blocking SOD finding can only be
   overridden as a **time-boxed exception with a named approver and an expiry date** —
   never a permanent silent override. Expiry re-opens the review.
9. **Kill switch.** Suspend one agent, all of an owner's agents, or everything — now.
   First question every security reviewer asks; it should be a button, not a runbook.

### 2.4 Provision, operate, recertify, retire

10. On approval: deployment package to the chosen runtime (Copilot Studio / Claude /
    OpenAI / Hermes), **agent registered with its own directory identity** (Entra Agent
    ID — agents as first-class identities is where the IAM world is going, and Wesco is
    a Microsoft shop), credentials **brokered, never pasted**.
11. **Hard invariant:** an agent's scopes ⊆ its human owner's entitlements, verified
    against the IdP (Entra groups / app roles), not a CSV column.
12. Requester gets "your agent is live" + its test prompts. Usage and cost accrue to the
    manifest `trace_id`.
13. **Recertification campaigns** (quarterly): every owner re-attests each agent — still
    needed? scope still right? Un-recertified agents auto-suspend. Mirrors user access
    reviews (SOC 2 CC6.x / SOX ITGC), so auditors recognize it on sight.
14. **JML integration:** the HR joiner-mover-leaver feed flags agents whose owner moved
    or left → reassign or teardown (teardown retains logs, per the manifest's
    `delete_agent_retain_log` policy).

## 3. Personas and their surfaces

| Persona | Surface | What they see |
| --- | --- | --- |
| Employee | "My Pedigree" (Teams tab) | My agents, request new, status of requests, recert asks |
| Manager | Approval cards + team view | Team's agents, pending approvals, team SOD posture |
| IAM / AI lead | Admin console | Queue, catalog admin, policy editor, kill switch, integrations |
| Compliance | Compliance tab (exists) + campaigns | SOD findings, exceptions with expiries, audit ledger, evidence pack, recert campaigns |
| Executive | Dashboard | Agents by dept, adoption, risk distribution, time-to-approve, est. hours saved |

RBAC inside Pedigree itself is a prerequisite — today every signed-in user is the same
superuser.

## 4. Capability gaps, prioritized

### Phase 1 — makes a pilot real (the biggest gaps)
1. **SSO + roles** (Entra ID / Okta OIDC; requester / manager / admin / compliance).
2. **Request → approval workflow**: request object, states
   (`draft → checked → pending_approval → approved/denied → provisioned → live →
   recert_due → suspended → retired`), queue UI, all transitions in the audit ledger.
3. **Real multi-tenant backend**: Postgres with per-tenant RLS, **server-side SHA-256
   ledger** (client chain is v0), authenticated + rate-limited APIs.
4. **Notifications**: Teams actionable cards + email. Approvals happen where people live.
5. **Catalog v0**: 10–15 curated templates per department with pre-vetted scopes.

### Phase 2 — makes it stick
6. **HRIS / IdP org sync** (Workday, Entra) replacing CSV upload — the CSV is a demo
   crutch; orgs are live data. (The UI stubs for these connectors already exist.)
7. **SOD matrix import** from the customer's SAP GRC / SailPoint export + rule editor,
   layered on the built-in rules.
8. **Recertification campaigns** + JML feed.
9. **Exception management** (time-boxed, named approver, auto-expiry).
10. **Risk scoring per agent** (scopes × data classification × autonomy × lifecycle) to
    drive routing: low risk auto-approves, high risk gets human eyes.
11. **Data-classification policy checks** (agent touching PII/financial data ⇒ extra
    approval lane) alongside SOD.

### Phase 3 — makes it defensible (the moat)
12. **Runtime telemetry loop**: runtime logs ingested against the manifest `trace_id` —
    *declared* authority vs. *exercised* authority, with drift alerts ("agent attempted
    an out-of-manifest action"). Nobody else can show this; it closes the loop the
    fleet-vision doc describes.
13. **Agent identity integration** (Entra Agent ID / service principals per agent).
14. **SIEM export** (Sentinel, Splunk) + webhooks; spend caps and cost dashboards.
15. **SOC 2 Type II for Pedigree itself** — the Phase 1–2 controls (SSO, RLS, ledger,
    change management) double as our own compliance evidence. Build once, use twice.

## 5. Success metrics (say these in the room)

- **Idea → governed running agent in under one day** (vs. weeks of ad-hoc security
  review — or the actual current state: employees using ChatGPT ungoverned).
- **Any auditor question answered in under one hour** via the evidence pack.
- **Zero ungoverned agents**: the governed path is *easier* than the shadow path. That's
  the pitch to the IAM lead — this doesn't add governance burden, it removes the
  shadow-AI problem by making compliance the path of least resistance.

## 6. What NOT to build (yet)

- **Our own runtime.** Pedigree is the control plane; Hermes/Copilot/Claude/OpenAI are
  the data plane. Staying runtime-neutral is the differentiator.
- **Full workflow-automation builder.** Adjacent products (Power Automate, n8n) own it;
  we govern what those workflows' agents may do.
- **Model hosting / fine-tuning.** Out of scope; policy references model allowlists only.

## 7. Sequencing note

Phase 1 items 1–3 are also the prerequisites already flagged in DEPLOY.md before real
client data (auth, RLS, endpoint hardening). The pilot-readiness work and the
enterprise-adoption work are the same work — there is no detour.
