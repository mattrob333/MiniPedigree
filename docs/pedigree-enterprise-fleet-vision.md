# Pedigree Enterprise Fleet Vision

**Date:** 2026-06-02
**Author:** Matt (via Hermes Agent)
**Status:** Vision / Architecture Reference

---

## Table of Contents

1. [The Thesis](#1-the-thesis)
2. [The Stack (Updated)](#2-the-stack-updated)
3. [What Each Tool Is & Why It Exists](#3-what-each-tool-is--why-it-exists)
   - 3.1 Mini Pedigree
   - 3.2 Hermes Agent & Hermes Desktop
   - 3.3 NVIDIA OpenShell
   - 3.4 Microsoft Windows Security Primitives
4. [How They Fit Together](#4-how-they-fit-together)
5. [What This Means for the Pedigree Build](#5-what-this-means-for-the-pedigree-build)
   - 5.1 Gap Analysis: Current vs. Target
   - 5.2 New Build Items
6. [How This Makes Pedigree Better](#6-how-this-makes-pedigree-better)
   - 6.1 From CSV-to-Prompt to Fleet-to-Deployment
   - 6.2 The Deployment Package
   - 6.3 Single Source of Truth
   - 6.4 Inter-Agent Coordination
   - 6.5 Enterprise-Grade Governance
7. [Architecture Decisions](#7-architecture-decisions)
   - 7.1 Two-Tier Model: Orchestrator + Workers
   - 7.2 Profile Distribution as the Deployment Vehicle
   - 7.3 Hermes Desktop as the End-User Target
8. [Open Questions](#8-open-questions)
9. [Next Steps](#9-next-steps)

---

## 1. The Thesis

**"Most agent vendors give you a chat interface. We give you an AI workforce governance system."**

The core belief driving Pedigree:

> AI agents should not be created randomly from prompts. They should be created from specific responsibilities owned by specific humans — governed, scoped, auditable, and deployable to a runtime that enforces policy at the OS level.

The product flow is:

```
Org Chart → Human Responsibilities → Delegatable Tasks
  → Agent Manifest → OpenShell Policy → Hermes Profile Distribution
  → Deployed Agent (Desktop / Telegram / Slack)
```

Each agent is:
- **Tied to a specific human owner** (accountability)
- **Scoped to a bounded toolset** (security)
- **Governed by approval gates** (human-in-the-loop via `/approve` / `/deny`)
- **Tracked for cost and tokens** (economics)
- **Auditable via session logs** (compliance)
- **Sandboxed at the OS/kernel level** (defense-in-depth)

The market is **Fortune 500s** — companies like Wesco/Anixter that need to deploy AI agents across departments without losing control. The NVIDIA RTX Spark + OpenShell announcement at Computex 2026 validates the thesis: hardware is shipping with agent security baked in, and Pedigree should be the governance layer that sits on top.

---

## 2. The Stack (Updated)

```
┌──────────────────────────────────────────────────────────────────┐
│  PEDIGREE (governance & policy layer — YOUR product)             │
│                                                                  │
│  - Org chart → responsibility discovery → task decomposition     │
│  - "This agent reports to Sarah in Finance, can access           │
│    Salesforce read-only, max spend $10/day, escalate to VP       │
│    if >$100"                                                     │
│  - Agent Manifest + System Prompt + OpenShell policy generation  │
│  - Org Sync (Fireflies diff → reviewed changeset)                │
│  - Company Profile (grounding business context)                  │
│  - Deployment package export (Hermes, OpenAI, Claude, Generic)   │
├──────────────────────────────────────────────────────────────────┤
│  HERMES AGENT / HERMES DESKTOP (runtime — by Nous Research)      │
│                                                                  │
│  - v0.15.2 — native apps for macOS, Windows, Linux               │
│  - Gateway: Telegram, Discord, Slack, WhatsApp, Signal, Email    │
│  - HITL: /approve /deny on any gateway platform                 │
│  - Cost tracking per session (SQLite)                             │
│  - Session DB + hook system (audit event pipeline)               │
│  - Profile distribution install (hermes profile install)        │
│  - Subagent delegation (delegate_task)                           │
│  - Cron scheduling, skills system, persistent memory             │
│  - 5 sandbox backends: local, Docker, SSH, Singularity, Modal    │
├──────────────────────────────────────────────────────────────────┤
│  NVIDIA OPENSHELL (sandboxed execution runtime — Apache 2.0)     │
│                                                                  │
│  - Declarative YAML policies for:                                │
│    • Filesystem access (Landlock LSM)                            │
│    • Network egress (per-binary, per-endpoint, L7 inspection)    │
│    • Process execution (seccomp syscall filtering)               │
│    • Inference routing (credential injection)                    │
│  - Policy advisor with Z3 prover (auto-generates rules from     │
│    denials; validates against credential/capability expansion)   │
│  - Live policy hot-reload (network policies only)                │
│  - Requires NVIDIA GPU or RTX Spark hardware                     │
├──────────────────────────────────────────────────────────────────┤
│  MICROSOFT WINDOWS SECURITY PRIMITIVES (OS-level, new)           │
│                                                                  │
│  - Kernel sandboxing (AppContainer / VBS / integrity levels)    │
│  - Policy engine (OS-enforced, not prompt-based)                 │
│  - Intelligent Router + Data Masker (local vs. cloud routing,   │
│    PII masking before egress)                                    │
│  - Identity controls (agent ≡ Windows identity, audit events)   │
│  - Mediated desktop access (controlled app calls, no blind GUI) │
│  - Ships with RTX Spark PCs (Fall 2026) — ASUS, Dell, HP,       │
│    Lenovo, Microsoft Surface, MSI                                │
├──────────────────────────────────────────────────────────────────┤
│  NVIDIA RTX SPARK (hardware)                                     │
│                                                                  │
│  - ~1 petaflop AI, 128GB unified memory                          │
│  - Runs 120B-parameter models locally, 1M token context         │
│  - Ships Fall 2026 in consumer/professional laptops              │
│  - Makes local agent execution practical without cloud API costs │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. What Each Tool Is & Why It Exists

### 3.1 Mini Pedigree

**What it is:** A web application (React + Vite + Supabase) that maps an organization's people to their responsibilities, extracts delegatable tasks, and generates governed AI agent manifests.

**What it does today:**

- Upload a CSV of people → generates an org chart (React Flow) with department color coding
- Guided mapping sessions (leadership → department → individual) that walk you CEO-down through the org
- Org Sync that diffs a Fireflies/meeting transcript against existing state and presents a reviewed changeset that merges (never overwrites)
- Per-agent manifest generation with:
  - Human owner (name, email, title, department)
  - Parent responsibility
  - Allowed / approval-required / blocked tasks
  - IO contract (inputs, outputs, trigger)
  - Lifecycle class (standing vs. task)
  - MCP server recommendations
  - Audit trace ID
- System prompt generation with authority ceiling, escalation rules, business context, output style
- Deployment guide for OpenAI Custom GPT, Claude Project, and Generic runtime
- Per-agent .zip export (manifest.json + system-prompt.txt + SETUP.md)
- Company Profile (business context injected into every agent — what we do, mission, initiatives, terminology)

**What it's missing (the gaps this vision doc addresses):**

- No Hermes-specific deployment output
- No profile distribution generation
- No org-level orchestrator config
- No pre-wired Telegram/Slack gateway config
- No inter-agent delegation framework
- No single-source-of-truth bus for agent coordination
- No OpenShell policy translation

### 3.2 Hermes Agent & Hermes Desktop

**What it is:** An open-source (MIT) AI agent framework by Nous Research. Runs in the terminal, as a desktop app, or as a gateway connected to messaging platforms. Belongs to the same category as Claude Code and OpenAI Codex but is provider-agnostic and multi-platform.

**Hermes Desktop (v0.15.2) — the key new piece:**

A native desktop application for macOS (.dmg), Windows (.exe), and Linux (terminal install). It's the same Hermes Agent you run from CLI, packaged with a familiar install experience. This is critical because it means:

- **A non-technical end user can install Hermes** — download the .exe, run the installer, the agent lives on their taskbar
- **The Desktop app IS the deployment target** for Pedigree-generated agents
- **One Hermes instance supports multiple profiles** — you import a profile distribution and the agent for that specific persona activates

**Key Hermes capabilities relevant to Pedigree:**

| Capability | What It Means for Pedigree |
|---|---|
| **Gateway** (Telegram/Discord/Slack) | Human-in-the-loop approval routing, agent output delivery, shared fleet channel |
| **Profiles** | Import a Pedigree-generated profile → instant agent with correct config, skills, memory |
| **delegate_task** | Orchestrator spawns worker agents with the right manifest context |
| **Cron scheduling** | Recurring agents (weekly briefs, daily reports, monthly variance checks) |
| **Skills** | Load the Pedigree manifest + company context as a skill (~500 tokens, composable) |
| **Memory** | Per-agent persistent memory (sessions don't forget context between runs) |
| **Hook system** | Pipe audit events to external SIEM/database for compliance |
| **Cost tracking** | Per-session token/cost accounting (aggregatable by agent, department, owner) |
| **MCP servers** | Shared state bus for inter-agent coordination |
| **Sandbox backends** | Local, Docker, SSH, Singularity, Modal — pick isolation level per agent |

### 3.3 NVIDIA OpenShell

**What it is:** An open-source (Apache 2.0) sandboxed execution runtime by NVIDIA. Wraps agent processes in kernel-level isolation using Landlock LSM, seccomp, and a network policy proxy. Policies are declarative YAML — filesystem access, network egress per binary per endpoint, process execution rules.

**Why it exists in the stack:**

Prompt-level governance is not enough. A sufficiently capable agent can be instructed "don't access this" and still do it. OpenShell enforces at the OS level — even if the agent tries, the kernel blocks it. This is the difference between "the agent was nice enough to follow its prompt" and "the agent literally cannot."

**What it does:**

- **Filesystem isolation** — declare read-only vs. read-write paths. Landlock enforces this at the kernel level.
- **Network egress control** — per-binary, per-endpoint, with L7 protocol inspection. Hot-reloadable without restarting the sandbox.
- **Process control** — seccomp syscall filtering. Even compromised agent can't escape the sandbox.
- **Policy advisor** — when an action is denied, the system can propose narrow allow rules. A Z3 prover validates each proposal against credential reach expansion, capability expansion, link-local reach, and L7 bypass risk. Auto-approves zero-finding proposals.
- **Credential injection** — routes inference calls through a policy proxy that injects credentials without the agent ever seeing the raw key.

**Integration with Pedigree:**

| Pedigree Manifest Field | OpenShell Policy |
|---|---|
| `allowed_tools` (file write needed) | `filesystem_policy.read_write` paths |
| `data_context.sources[].path` | `network_policies[].endpoints[].host` |
| `data_context.sources[].access` | `network_policies[].access` (read-only / read-write / full) |
| `blocked_tasks` | Default-deny — only allowed rules are written |
| `human_owner` | `process.run_as_user` / identity binding |
| `risk.tier` / `policy.tier` | `landlock.compatibility` (best_effort vs. hard_requirement) |

### 3.4 Microsoft Windows Security Primitives

**What they are:** New OS-level security features developed by Microsoft specifically for AI agent workloads. These are not existing Entra ID / Defender / Purview capabilities — they are purpose-built for the agent era and ship with RTX Spark PCs.

**The five primitives:**

1. **Kernel sandboxing** — OS-isolated process container (AppContainer / Virtualization-Based Security). Even a compromised agent cannot escape to the host OS. This makes "running an agent on your daily driver" trustable for enterprise IT.

2. **Policy engine** — Admin-defined filesystem, network, and process rules enforced at the kernel level. Pedigree manifests → Windows Group Policy objects → enforced at the OS. The chain is: Pedigree defines what the agent can do → Windows enforces it.

3. **Intelligent Router + Data Masker** — Decides whether a request should go to a local model (RTX Spark) or the cloud. Masks PII before any data egresses. Pedigree's `manifest.policy.risk_level` drives the routing decision.

4. **Identity controls** — Every agent action is tied to a Windows identity (SID). Captured in Windows audit events. Full attestation chain: Windows SID → Pedigree Manifest → Agent Action → Audit Log.

5. **Mediated desktop access** — Agents interact with desktop applications (Excel, Outlook, CRM) through controlled, mediated calls instead of blind GUI automation. Audit logs every application interaction.

**Why this matters for Pedigree:**

This is the enterprise trust story. "Your security team doesn't have to trust the LLM. They trust the kernel." Pedigree defines what the agent is allowed to do, OpenShell enforces at the Linux layer, and Windows primitives enforce at the OS layer on the corporate fleet. Three layers of defense, two of them kernel-level.

---

## 4. How They Fit Together

The complete data flow through all four layers:

```
                ┌─────────────────────────────────┐
                │       HUMAN DECISION MAKER       │
                │  (CEO, department head, manager) │
                └────────┬────────────────────────┘
                         │ "I own revenue forecasting.
                         │  This weekly report takes
                         │  4 hours. Can an agent do it?"
                         ▼
    ┌─────────────────────────────────────────────────┐
    │               PEDIGREE (Web App)                  │
    │                                                    │
    │  1. Upload CSV → Org Chart                         │
    │  2. Leadership Session → Responsibilities          │
    │  3. Task decomposition → Delegatable/Approval/     │
    │     Blocked classification                         │
    │  4. Agent Manifest:                                │
    │     • Owner: Nadia Bennett, CRO                    │
    │     • Task: Deliver daily revenue brief            │
    │     • Allowed: Salesforce (read-only), Excel       │
    │     • Approval: External send to CFO               │
    │     • Blocked: Modify production data, commit $$$  │
    │     • Lifecycle: Standing, cron 0 8 * * 1-5       │
    │     • IO contract: Inputs (Salesforce, Excel),     │
    │       Output (Slack draft → owner approves)        │
    │  5. Generate Hermes Profile Distribution           │
    │  6. Generate OpenShell YAML Policy                 │
    └────────────────────┬──────────────────────────────┘
                         │ Export: pedigree-deployment-<company>.tar.gz
                         ▼
    ┌─────────────────────────────────────────────────┐
    │          HERMES DESKTOP (Runtime — Org PC)        │
    │                                                    │
    │  Installed on the org's Windows laptop via .exe    │
    │  Profiles imported via `hermes profile import`     │
    │                                                    │
    │  ┌─ Orchestrator Profile ──────────────────────┐  │
    │  │  • Gateway: Telegram + Slack connected        │  │
    │  │  • Skills: Org map, company context           │  │
    │  │  • Routes: Receives requests, delegates       │  │
    │  │    to worker profiles via delegate_task       │  │
    │  │  • HITL: /approve /deny in #hermes-fleet     │  │
    │  └──────────────────────────────────────────────┘  │
    │                                                    │
    │  ┌─ Worker Profile: Revenue Brief Agent ────────┐  │
    │  │  • Skills: Pedigree manifest + system prompt   │  │
    │  │  • Cron: 8 AM daily                            │  │
    │  │  • Tools: Salesforce MCP (read-only), file    │  │
    │  │  • Delivery: Telegram DM to Nadia              │  │
    │  └──────────────────────────────────────────────┘  │
    │                                                    │
    │  ┌─ Worker Profile: Procurement Agent ─────────┐  │
    │  │  • Skills: Pedigree manifest + PO rules       │  │
    │  │  • Event-driven: trigger on new PO request    │  │
    │  │  • Tools: ERP MCP (read+approval flow)       │  │
    │  │  • Delivery: Slack #procurement channel       │  │
    │  └──────────────────────────────────────────────┘  │
    └────────────────────┬──────────────────────────────┘
                         │ Each agent runs in:
                         ▼
    ┌─────────────────────────────────────────────────┐
    │          NVIDIA OPENSHELL (Sandbox)               │
    │                                                    │
    │  Per-agent YAML policy derived from manifest:     │
    │                                                    │
    │  Revenue Brief Agent policy:                       │
    │  • fs: read-only /sandbox, /tmp RW                │
    │  • net: api.salesforce.com (GET only)              │
    │  • proc: curl, python (restricted)                 │
    │  • inference: local RTX Spark model                │
    │                                                    │
    │  Procurement Agent policy:                         │
    │  • fs: read-only /shared/procurement               │
    │  • net: erp.company.com (read+write w/ approval)  │
    │  • proc: curl, python, gmail-draft                 │
    │  • inference: cloud API (OpenRouter, GPT-4)       │
    └────────────────────┬──────────────────────────────┘
                         │ On RTX Spark Windows PCs:
                         ▼
    ┌─────────────────────────────────────────────────┐
    │  MICROSOFT WINDOWS SECURITY PRIMITIVES (OS)      │
    │                                                    │
    │  • Kernel sandbox: agent processes in container   │
    │  • Policy engine: Pedigree policies → Group Policy│
    │  • Intelligent Router: "Revenue brief → local    │
    │    RTX Spark model. Procurement → cloud API."    │
    │  • Data Masker: Strip PII before egress          │
    │  • Identity: Agent action logged as Nadia's SID  │
    │  • Mediated desktop: Agent calls Excel via       │
    │    mediated API, not blind GUI automation        │
    └─────────────────────────────────────────────────┘
```

---

## 5. What This Means for the Pedigree Build

### 5.1 Gap Analysis: Current vs. Target

| Capability | Current State | Target State | Gap |
|---|---|---|---|
| Agent Manifest | ✅ JSON with owner, tasks, IO contract, lifecycle, audit | ✅ Same, + OpenShell policy fields | Add policy translation fields |
| System Prompt | ✅ Deterministic + AI-authored sections | ✅ Same, + Hermes-specific instructions | Minor: add Hermes runtime hints |
| Deployment Guide | ✅ OpenAI, Claude, Generic | ✅ + Hermes + OpenShell + Windows | **Big gap** |
| Hermes Profile Export | ❌ Not implemented | ✅ `hermes profile import`-compatible tarball | **New build** |
| Orchestrator Config | ❌ Not implemented | ✅ Gateway config, org skills, agent router | **New build** |
| Gateway Pre-Config | ❌ Not implemented | ✅ Template Telegram + Slack configs | **New build** |
| Inter-Agent Bus | ❌ Not implemented | ✅ MCP server for coordination state | **New build** |
| OpenShell Policy Gen | ❌ Not implemented | ✅ Manifest → YAML policy translation | **New build** |
| SSOT Sync Loop | ✅ Org Sync (Fireflies diff) | ✅ + auto-redeploy changed manifests | Enhancement |
| Company Profile | ✅ Basic fields | ✅ + research from URL, goals, bottlenecks | Enhancement |
| Onboarding Walkthrough | ❌ (planned in docs) | ✅ 4-step guided tour | **Planned build** |

### 5.2 New Build Items

**P1 — Hermes Profile Distribution Generator**

The single most impactful new feature. Take the existing per-agent manifest export and produce a Hermes-compatible profile distribution tarball:

```
pedigree-revenue-brief/
├── distribution.yaml        # Metadata: agent_id, owner, version, env_requires
├── config.yaml              # Tool restrictions, MCP servers, delivery target
├── skills/
│   ├── pedigree-manifest.skill.md     # The manifest as a skill
│   └── pedigree-system-prompt.skill.md # The full system prompt
├── cron/
│   └── morning-brief.yaml   # If recurring: schedule, prompt, delivery
└── README.md                # "Install with: hermes profile import <archive>"
```

New file: `src/lib/hermesProfile.ts`
- `buildHermesDistribution(ctx: AgentBuildCtx): Promise<{ tarball: Blob }>`
- Generates the directory structure above
- Wraps it in a `.tar.gz` that `hermes profile import` can consume

**P2 — Orchestrator Profile Generator**

Generate the profile for the org-level Hermes instance that routes work.

- Gateway config template (Telegram bot token, Slack app token slots)
- Org map skill (the company's people, departments, and agent assignments)
- Company context skill (business context, terminology, initiatives)
- Agent router skill (knows which profile to spawn for which request)
- Shared channel setup (create `#hermes-fleet`, invite the bot)

New file: `src/lib/hermesOrchestrator.ts`
- `buildOrchestratorDistribution(workspace: Workspace): Promise<{ tarball: Blob }>`

**P3 — OpenShell Policy Generator**

Translate a Pedigree Agent Manifest into an OpenShell-compatible YAML policy file.

New file: `src/lib/openshellPolicy.ts`
- `manifestToOpenShellPolicy(manifest: AgentManifest): string` — returns YAML
- Maps: `allowed_tasks` → filesystem rules, `data_sources` → network rules, `risk_level` → landlock compatibility
- Policy advisor seed: initial minimal allow rules instead of full-deny (faster startup)

**P4 — "Deploy Fleet" Button in the UI**

One-command generation of the full deployment package:

```
pedigree-deployment-<company>/
├── README.md
├── install.sh / install.ps1
├── orchestrator/
│   ├── config.yaml
│   ├── .env.example
│   ├── skills/
│   └── cron/
├── agents/
│   ├── <agent-1>/
│   │   ├── config.yaml
│   │   ├── skills/
│   │   └── cron/
│   └── <agent-n>/
├── policies/
│   ├── <agent-1>-policy.yaml
│   └── <agent-n>-policy.yaml
├── manifests/
│   ├── org-manifest.json
│   └── <agent-n>-manifest.json
├── gateway/
│   ├── telegram-bot-setup.md
│   ├── slack-app-setup.md
│   └── shared-channel-setup.md
└── ssot/
    └── update-org.sh
```

Export as `.tar.gz` or `.zip`. The end user:
1. Downloads Hermes Desktop → installs
2. Unpacks the tarball → follows README
3. Imports profiles → `hermes profile import <agent-name>.tar.gz`
4. Adds Telegram/Slack tokens → done

**P5 — Pedigree MCP Server (Inter-Agent Bus)**

A lightweight MCP server that acts as the single source of truth for the agent fleet:

State it holds:
- Current org map (people + responsibilities)
- Active agent registry (what agents exist, their status)
- Task queue (pending handoffs between agents)
- Coordination channel (agent → agent messages)

Each agent connects via Hermes' MCP client, reads its scope, writes its outputs, and checks for handoffs.

New repo: `pedigree-mcp-server/` (or embedded in the deployment package)
- MCP protocol (stdio or HTTP)
- SQLite or Supabase backend
- Read-only for non-owned agents, read-write for the owning agent
- Could live as a `hermes mcp add pedigree-bus --command 'pedigree-mcp-server'`

---

## 6. How This Makes Pedigree Better

### 6.1 From CSV-to-Prompt to Fleet-to-Deployment

Today, Pedigree is a **governance authoring tool** — it helps an analyst think through who should have what agent, and outputs a prompt + manifest file.

After this vision, Pedigree becomes a **fleet management platform** — it outputs a complete, deployable package that an organization can install on day one and have a running AI workforce by day two.

The difference:

| Before | After |
|---|---|
| You get a .zip with manifest.json + prompt.txt | You get a tarball with profiles, config, cron, skills |
| You manually set up the runtime | The runtime config is pre-generated |
| You manually wire Telegram/Slack | The gateway config is templated — just add tokens |
| Each agent is a silo | Agents know about each other, can delegate |
| No policy enforcement at the OS level | OpenShell policies are generated from the manifest |
| No audit trail beyond the prompt | Full attestation chain from Windows SID → agent action |
| No recurring sync | Org Sync keeps the fleet current as the company changes |

### 6.2 The Deployment Package

The deployment package is the **deliverable artifact** — the thing Pedigree creates that has real value independent of the web app. It means:

- **You can sell Pedigree without requiring a subscription to a cloud service.** The export is a self-contained package. The customer installs it on their own hardware. No data ever leaves their network.
- **You can version-control the fleet.** Every deployment package pinned to a git tag. Roll back by reverting the tag.
- **You can audit what went out.** The package is the contract between Pedigree and the runtime. Compare two packages to see what changed.

### 6.3 Single Source of Truth

The SSOT is the intersection of three things:

1. **The Pedigree Web App** — where the org map lives and gets updated via Org Sync
2. **The Pedigree MCP Server** (the inter-agent bus) — the live state that running agents read from
3. **The Hermes profiles** — the immutable deployment artifacts derived from the SSOT

The flow for keeping things in sync:

```
Fireflies transcript → Org Sync (diff) → reviewed changeset → approved
  → Pedigree updates SSOT
  → Re-generates affected Hermes profiles
  → Pushes to deployment repo
  → Agents pick up new config on next run / cron tick
```

This means the loop is: **discover → review → approve → deploy**. Nothing changes in production without explicit human approval. This is the enterprise trust model.

### 6.4 Inter-Agent Coordination

Three mechanisms, each for different needs:

**1. Shared Gateway Channel (#hermes-fleet)**

A Telegram or Slack channel where:
- The orchestrator posts: "Revenue brief delivered to Nadia ✅"
- Agents post: "Procurement request #1023 requires approval from Mark"
- Humans post: "@orchestrator run the vendor screening for Acme Corp"
- The orchestrator routes it to the right subagent

**2. Orchestrator delegate_task**

The Hermes routing agent receives a request, looks up the org map skill to find the right agent profile, and spawns a subagent via `delegate_task` with the worker's manifest + system prompt loaded as context. The worker runs, returns results, orchestrator delivers them to the right channel.

**3. Pedigree MCP Bus**

Agents that need to coordinate asynchronously (e.g., Agent A finishes a task and Agent B needs the output to start its work) write/read from a shared MCP server:

```yaml
# Agent A writes its output
write_file(path: "/mcp/task-queue/revenue-brief-2026-06-02.md", ...)

# Agent B (scheduled cron) checks the queue
pedigree-mcp get queue:revenue-brief-2026-06-02
# → "Revenue brief complete, attachments: [sales_raw.json, forecast.xlsx]"
# Agent B picks up and runs its forecasting step
```

### 6.5 Enterprise-Grade Governance

This is the headline feature. The combined stack gives:

| Requirement | How It's Met |
|---|---|
| **Least privilege** | Pedigree manifest defines exactly what each agent can do. OpenShell + Windows enforce it at the kernel. |
| **Human-in-the-loop** | Hermes `/approve` / `/deny` on Telegram/Slack before any write or external communication. |
| **Audit trail** | Hermes session DB + hook system + Windows audit events = every action logged with trace ID. |
| **Cost control** | Per-agent cost tracking with `/usage` and `/insights`. Budget caps per agent/department. |
| **Compliance** | Data Masker (PII stripping), Intelligent Router (local vs. cloud), kernel sandbox (even compromised agent can't escape). |
| **Change management** | Org Sync shows a reviewed changeset before anything applies. Nothing changes in production without approval. |
| **On-prem capable** | The whole stack runs on the customer's own RTX Spark hardware. No cloud dependency for core operations. |

---

## 7. Architecture Decisions

### 7.1 Two-Tier Model: Orchestrator + Workers

**Why not one Hermes instance per agent?**

- Each Hermes instance needs its own gateway connection (Telegram bot token, etc.)
- Managing 20 separate bots for a 20-person department is a nightmare
- No centralized view of what all agents are doing
- No shared channel for coordination

**Why not one Hermes instance doing everything in a single session?**

- Context window fills up with unrelated work
- Security boundaries are soft (all tools in one session)
- One agent impersonating another is impossible to detect
- Scalability ceiling (max_turns, tool contention)

**Two-tier solves both:**

The orchestrator is the **front door** — one Telegram bot, one Slack app, one channel. It's lightweight (routes requests, doesn't do heavy work). Workers are **fire-and-forget subagents** — spawned with the right context, run their bounded task, return results, clean up. Each gets a fresh context, isolated tools, and the manifest as its constitution.

### 7.2 Profile Distribution as the Deployment Vehicle

Hermes already has `hermes profile install github.com/org/repo --alias name`. This is the distribution mechanism we should use.

Each worker agent = one profile distribution. The distribution contains:
- The system prompt (as a skill)
- The manifest (as a skill)
- The config.yaml (tool restrictions, MCP servers, model)
- The cron schedule (if recurring)

This means:
- The profile IS the agent. Install it → agent exists. Remove it → agent goes away.
- Update the profile → agent gets new instructions on next run.
- Profiles are versionable (each distribution is a git repo with tags).
- No manual config editing. No SSH into a server. Just `hermes profile install`.

### 7.3 Hermes Desktop as the End-User Target

Hermes Desktop is the **on-ramp for non-technical users**. The org's IT admin:

1. Downloads Hermes Desktop for Windows from nousresearch.com
2. Runs the installer (Setup.exe)
3. Opens the app, sees a clean chat interface
4. Runs: `hermes profile import pedigree-deployment.tar.gz`
5. Adds Telegram bot token via the settings UI
6. Done — the entire org fleet is running

This is infinitely better than "install Python, clone the repo, set up API keys, edit config.yaml, install systemd service." The Desktop app makes Hermes accessible to the same audience that uses Slack and Zoom.

---

## 8. Open Questions

**OpenShell:**
- OpenShell on Windows RTX Spark — is it alpha like Linux, or further along?
- Can Pedigree serve as the OpenShell gateway auth provider (identity → policy)?
- What's the minimum Hermes + OpenShell setup for an enterprise PoC?
- Does OpenShell require the agent to run inside its sandbox, or can Hermes run outside and delegate into it?

**Hermes:**
- Can `delegate_task` accept an entire profile distribution as the child context, or only a prompt?
- What's the max number of concurrently-running subagent profiles?
- Does the hook system support reliable delivery (retry queue) or is it fire-and-forget?
- How do we aggregate cost across all profiles for an admin dashboard?

**Microsoft Windows Primitives:**
- Are these shipping at RTX Spark launch (Fall 2026) or later?
- Can we start building with OpenShell on WSL today and swap to Windows primitives later?
- What's the on-ramp for enterprise IT to configure agent policies via Group Policy?
- Do the primitives require OpenShell to be present, or do they work standalone?

**Pedigree Product:**
- Should the deployment package be a downloadable tarball, or should Pedigree push directly to the customer's Hermes instance?
- Do we need a Pedigree Desktop app, or is the web app + Hermes Desktop pairing sufficient?
- What's the minimum viable enterprise customer size? 10 agents? 50?
- Pricing: per-agent subscription? One-time deployment package fee? Per-seat for the web app?

---

## 9. Next Steps

**Immediate (this week):**
1. [ ] Build `src/lib/hermesProfile.ts` — Hermes profile distribution generator (P1)
2. [ ] Add "Export Hermes Profile" button to the ManifestScreen UI
3. [ ] Test: generate a profile, import it with `hermes profile import`, verify the agent runs
4. [ ] Save the full deployment package concept as a skill for future use

**Short-term (next 2 weeks):**
5. [ ] Build `src/lib/hermesOrchestrator.ts` — orchestrator profile generator (P2)
6. [ ] Build `src/lib/openshellPolicy.ts` — manifest-to-policy translator (P3)
7. [ ] Add the "Deploy Fleet" flow to the workspace home screen (P4)
8. [ ] Prototype with one human → one agent manifest → one running Hermes agent

**Medium-term (next 1-2 months):**
9. [ ] Build the Pedigree MCP server (P5)
10. [ ] Wire Org Sync → auto-redeploy changed manifests
11. [ ] Add per-agent cost dashboard
12. [ ] Start enterprise design partner conversations (Wesco/Anixter, Ryan contact)
13. [ ] Explore RTX Spark developer preview / early access

**Research:**
14. [ ] Clone OpenShell repo, test policy generation from a sample manifest
15. [ ] Investigate Hermes hook system for audit event piping
16. [ ] Reach out to Nous Research about Hermes Desktop distribution partnerships

---

*Generated by Hermes Agent · Session 2026-06-02*
