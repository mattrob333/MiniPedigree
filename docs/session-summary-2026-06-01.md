# Mini Pedigree — Session Summary & Research Brief

> Date: 2026-06-01
> Purpose: Summary of product architecture discussion for downstream AI research and planning.
> Related docs: `docs/hermes-openshell-enterprise-product.md`, `docs/soul-agent-operator-contract.md`
> Repo: https://github.com/mattrob333/MiniPedigree

---

## 1. Product Vision (Mini Pedigree)

An enterprise product that maps humans in an organization → extracts delegatable tasks → generates governed AI agents → deploys them on a secure runtime.

### Core Flow

```
Org Chart → Human Responsibilities → Delegatable Tasks → Agent Manifest → Hermes Profile Distribution → Running Agent
```

Each agent is:
- Tied to a specific human owner (accountability)
- Scoped to a bounded toolset (security)
- Governed by approval gates (HITL)
- Tracked for cost and tokens (economics)
- Auditable via session logs (compliance)

### Target Enterprise Clients
Companies like Wesco/Anixter or any Fortune 500 needing AI workforce governance. The NVIDIA RTX Spark + OpenShell announcement (Computex 2026) validates the thesis — secure on-device agents are the direction the industry is moving.

---

## 2. The Full Technology Stack

```
┌─────────────────────────────────────────────┐
│  PEDIGREE (your product — governance layer)  │
│  - Human Manifest → Agent Manifest           │
│  - Authority Graph                           │
│  - KPI → Token Economics → ROI              │
│  - Deployment dashboard                      │
├─────────────────────────────────────────────┤
│  HERMES AGENT (runtime — by Nous Research)   │
│  - Open source, MIT license                  │
│  - Slack/Telegram HITL (/approve, /deny)    │
│  - Per-session cost tracking (SQLite)        │
│  - Session DB + hook system (audit trail)    │
│  - Profile distribution install mechanism    │
│  - Platform adapters (15+ messaging apps)    │
├─────────────────────────────────────────────┤
│  NVIDIA OPENSHELL (sandboxed execution)      │
│  - Declarative YAML policies                 │
│  - Filesystem (Landlock), network (proxy),   │
│    process (seccomp) isolation               │
│  - Hot-reloadable network policies           │
│  - Policy advisor with Z3 prover             │
│  - Credential injection for inference        │
├─────────────────────────────────────────────┤
│  MICROSOFT WINDOWS SECURITY PRIMITIVES       │
│  - Kernel sandboxing (AppContainer/VBS)      │
│  - Policy engine (OS-enforced)               │
│  - Intelligent Router + Data Masker          │
│  - Identity controls (agent ≡ user)          │
│  - Mediated desktop access                   │
├─────────────────────────────────────────────┤
│  NVIDIA RTX SPARK HARDWARE                   │
│  - ~1 petaflop AI, 128GB unified memory     │
│  - Runs 120B models locally, 1M ctx         │
│  - Ships Fall 2026 in ASUS, Dell, HP,       │
│    Lenovo, Microsoft Surface, MSI laptops    │
└─────────────────────────────────────────────┘
```

---

## 3. Key Integration Points (What to Build)

### 3.1 Policy Translation Layer
When Pedigree generates an Agent Manifest, translate it into OpenShell YAML policies:

| Pedigree Manifest Field | OpenShell Policy |
|---|---|
| `allowed_tools` (file: true) | `filesystem_policy.read_write` paths |
| `data_context.sources[].path` | `network_policies[].endpoints[].host` |
| `data_context.sources[].access` | `network_policies[].access` (read-only / read-write / full) |
| `blocked_tasks` | Default-deny policy — only allowed rules are written |
| `human_owner` | `process.run_as_user` |
| `risk.tier` | `landlock.compatibility` (best_effort vs hard_requirement) |

### 3.2 Attestation Bridge
Hermes hook system fires events at every lifecycle point:
- `session:start`, `agent:step`, `command:/approve`, `command:/deny`
- Build a hook handler that pipes these to an external audit DB
- Capture: who approved what, when, which agent, cost incurred, tokens burned

### 3.3 Cost Dashboard
Hermes already records per-session:
- `input_tokens`, `output_tokens`, `billing_provider`
- `estimated_cost_usd`, `actual_cost_usd`
- Insights engine in `agent/insights.py`
- Build an admin view aggregating cost per agent, per department, per owner

### 3.4 Deployment Portal
UI workflow:
1. Import org chart / human roster
2. For each human, define their responsibilities
3. Extract delegatable tasks
4. Generate Agent Manifest (tools, data sources, approval rules, owner)
5. Generate Hermes Profile Distribution (SOUL.md + config.yaml + distribution.yaml)
6. Push to private GitHub repo
7. Install command: `hermes profile install github.com/org/agent-name --alias alias`
8. Agent is live on the Windows fleet via OpenShell

### 3.5 SOUL.md Generation
Pedigree's `buildSystemPrompt()` should produce a structured SOUL.md with sections:

```
## [HUMAN OWNER AND AUTHORITY CEILING]
## [BUSINESS CONTEXT]
## [ALLOWED TASKS]
## [BLOCKED TASKS]
## [HUMAN APPROVAL REQUIRED]
## [ESCALATION RULES]
## [AUTONOMY BOUNDARIES]
## [ACCOUNTABILITY & OUTPUT RULES]
```

Reference template at `docs/soul-agent-operator-contract.md`.

---

## 4. OpenShell Policy Format (For Implementation)

OpenShell is at https://github.com/NVIDIA/OpenShell (Apache 2.0).

### Static policy (set at sandbox creation):
```yaml
version: 1
filesystem_policy:
  include_workdir: true
  read_only: [/usr, /lib, /etc]
  read_write: [/sandbox, /tmp]
landlock:
  compatibility: best_effort
process:
  run_as_user: sandbox
  run_as_group: sandbox
```

### Dynamic policy (hot-reloadable on running sandbox):
```yaml
network_policies:
  salesforce_read:
    name: salesforce-readonly
    endpoints:
      - host: "*.salesforce.com"
        port: 443
        protocol: rest
        access: read-only
    binaries:
      - { path: /usr/bin/curl }
```

### Policy Advisor
OpenShell has a built-in policy advisor that auto-generates narrow allow rules from denials. Pedigree could seed this with initial manifest-derived proposals instead of starting from full-deny. The Z3 prover validates against credential reach expansion, capability expansion, and SSRF risks.

---

## 5. Research Questions for Deep Dive

### OpenShell
- Windows RTX Spark integration: is it alpha like Linux or further along?
- Can Pedigree serve as the OpenShell gateway auth provider (identity → policy)?
- How does `agent-driven-policy-management` example work? Is it a direct match for Pedigree manifest → policy generation?
- What's the minimum Hermes + OpenShell setup for an enterprise PoC?

### Hermes
- Can we run multiple profile-distribution agents simultaneously on one Hermes instance?
- How does the hook system route audit events — best practice for external SIEM pipe?
- Is there a native way to aggregate cost across all profiles for an admin dashboard?
- Does the `delegation` toolset let Pedigree-deployed agents spawn sub-agents safely?

### Microsoft Security Primitives
- Are these shipping at RTX Spark launch (Fall 2026) or later?
- Can we start building with OpenShell on WSL today and swap to Windows primitives later?
- What's the on-ramp for enterprise IT to configure agent policies via Group Policy?

### Enterprise Compliance
- SOC 2 Type II, ISO 27001 — what does OpenShell currently certify?
- Can Pedigree fill the compliance documentation gap?
- What's the data residency story for OpenShell + Microsoft primitives?

---

## 6. Reference Material Collected

| Topic | Source | File |
|---|---|---|
| Full product stack architecture | This conversation | `docs/hermes-openshell-enterprise-product.md` |
| SOUL.md operator contract | @tonysimons_ tweet | `docs/soul-agent-operator-contract.md` |
| OpenShell policy schema | NVIDIA docs | Referenced in stack doc |
| OpenShell README + sandbox design | GitHub | Referenced in stack doc |
| Hermes approval system | Hermes source (`gateway/run.py`, `tools/approval.py`) | Referenced |
| Hermes cost tracking | Hermes source (`agent/usage_pricing.py`, `agent/insights.py`, `hermes_state.py`) | Referenced |

---

## 7. Key Insights from Supporting Material

### @0xJeff — 60-day Hermes field report
- "~90% architecture, 10% model" — validates Pedigree's governance-first approach
- Tools fighting each other is the top failure source → Pedigree's scoped toolset per agent
- Memory and personalization (SOUL.md) are critical → Pedigree generates this
- Skills as directories (SKILL.md + references/ + scripts/) → keep context lean (~500 tokens)

### Perplexity Search as Code
- Filed as good-to-know, not urgent
- Relevant if MiniPedigree agents need research capabilities
- Generates Python search pipelines in sandbox — parallel fan-out, dedup, ranking
- Massive efficiency gain over sequential tool-calling

---

## 8. Immediate Next Steps

1. [ ] Clone MiniPedigree repo and review current agent generation code
2. [ ] Research OpenShell's `agent-driven-policy-management` example
3. [ ] Design the Pedigree → OpenShell manifest→policy translator
4. [ ] Build a Hermes hook handler for audit event piping
5. [ ] Explore RTX Spark developer preview / early access program
6. [ ] Contact Ryan at Wesco/Anixter for enterprise design partner
7. [ ] Prototype: one human → one agent manifest → one running agent

---

*Generated by AI assistant. This document is a research brief to seed deeper investigation.*