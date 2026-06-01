# Hermes Agent + OpenShell + Microsoft Security — Enterprise Product Reference

> Saved from conversation 2026-06-01. Context: Matt exploring building an enterprise
> AI workforce product on top of MiniPedigree + Hermes Agent runtime.
>
> Goal: Map humans in org → extract delegatable tasks → generate agent manifests →
> deploy as Hermes profile distributions → run on Hermes Agent → governed by
> Pedigree → secured by NVIDIA OpenShell + Microsoft Windows security primitives.

---

## 1. The Product Stack (Top to Bottom)

```
┌─────────────────────────────────────────────────────┐
│  PEDIGREE (your product — governance & policy)       │
│                                                       │
│  Human Manifest → Agent Manifest →                   │
│  → Authority Graph → KPI → Token Economics → ROI     │
│                                                       │
│  "This agent reports to Sarah in Finance,             │
│   can access Salesforce read-only, max spend          │
│   $10/day, escalate to VP if >$100"                  │
├─────────────────────────────────────────────────────┤
│  HERMES AGENT (runtime — orchestration layer)        │
│                                                       │
│  - /approve /deny via Slack/Telegram (HITL)          │
│  - Token & cost tracking per session                 │
│  - Session DB audit log + hook system                │
│  - Tool/terminal restrictions via Tirith scanner     │
│  - Profile distributions for agent deployment        │
├─────────────────────────────────────────────────────┤
│  NVIDIA OPENSHELL (sandboxed execution runtime)      │
│                                                       │
│  - Declarative YAML policies for:                    │
│    • Filesystem access (Landlock LSM)                │
│    • Network egress (per-binary, per-endpoint)       │
│    • Inference routing (credential injection)        │
│  - Seccomp syscall filtering                         │
│  - Policy proxy with L7 inspection                   │
│  - Live policy hot-reload (network only)             │
├─────────────────────────────────────────────────────┤
│  MICROSOFT WINDOWS SECURITY PRIMITIVES               │
│  (OS/kernel level — new, purpose-built for agents)   │
│                                                       │
│  - Kernel sandboxing (AppContainer/VBS/integrity)   │
│  - Policy engine (OS-enforced, not prompt-based)     │
│  - Intelligent Router + Data Masker                  │
│  - Identity controls (agent ≡ user identity)         │
│  - Mediated desktop access (controlled app calls)    │
└─────────────────────────────────────────────────────┘
```

---

## 2. What Hermes Agent Already Provides

### Human-in-the-Loop (Slack/Telegram)

- **`/approve`** — approves oldest pending dangerous command
- **`/approve all`** / `/approve always` / `/approve session` — variants
- **`/deny`** — blocks it
- Works on Telegram, Slack, Discord, WhatsApp, and 10+ other platforms
- Only **DM-paired users** can approve (pairing system)
- Concurrent approvals for parallel subagents
- **Source:** `tools/approval.py` + `gateway/run.py` lines 14170-14250

### Token Usage & Cost Tracking

- **Session DB** tracks per-session: `input_tokens`, `output_tokens`, `billing_provider`, `estimated_cost_usd`, `actual_cost_usd`, `cost_status`, `cost_source`
- **Pricing engine** (`agent/usage_pricing.py`) — knows model pricing for all major providers
- **Insights engine** (`agent/insights.py`) — `/insights` command gives breakdown by model, platform, time period
- **`/usage`** slash command for on-demand view

### Attestation / Audit Trail

1. **Session DB** — every message, tool call, token count per session (SQLite)
2. **Hook system** (`gateway/hooks.py`) — fires events at:
   - `session:start`, `session:end`, `session:reset`
   - `agent:start`, `agent:step`, `agent:end`
   - `command:*` — any slash command (approve/deny included)
   - Write custom hook handlers to pipe to external audit DB
3. **Session export** — `hermes sessions export` to JSONL

### Profile Distribution (Deployment Artifact)

Each agent maps to a Hermes Profile Distribution (GitHub repo):

```bash
hermes profile install github.com/your-org/pedigree-revenue-agent --alias rev-agent
hermes -p rev-agent    # agent runs
```

**Distribution repo layout:**
```
pedigree-revenue-agent/
├── distribution.yaml       # Metadata, env_requires, version
├── SOUL.md                 # System prompt (from Pedigree buildSystemPrompt())
├── config.yaml             # Tool restrictions, MCP servers, model
├── skills/                 # Agent-specific Hermes skills
├── cron/                   # Scheduled job definitions
└── README.md
```

---

## 3. NVIDIA OpenShell — Policy Format

OpenShell is open source: https://github.com/NVIDIA/OpenShell (Apache 2.0).

**Policies are declarative YAML** with static (sandbox creation) and dynamic (hot-reloadable) sections:

```yaml
version: 1

# === STATIC (set at sandbox creation, requires restart) ===

filesystem_policy:
  include_workdir: true
  read_only:
    - /usr
    - /lib
    - /proc
    - /dev/urandom
    - /app
    - /etc
    - /var/log
  read_write:
    - /sandbox
    - /tmp
    - /dev/null

landlock:
  compatibility: best_effort    # or hard_requirement

process:
  run_as_user: sandbox
  run_as_group: sandbox

# === DYNAMIC (hot-reloadable on running sandbox) ===

network_policies:
  github_api:
    name: github-api-readonly
    endpoints:
      - host: api.github.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-only     # or read-write, full; or custom rules[]
    binaries:
      - { path: /usr/bin/curl }
      - { path: /usr/bin/gh }
  salesforce_api:
    name: salesforce-api
    endpoints:
      - host: "*.salesforce.com"
        port: 443
        protocol: rest
        access: read-write
        allowed_ips:          # SSRF override for private IPs
          - 10.0.0.0/8
    binaries:
      - { path: /usr/bin/curl }
```

### Key Policy Points for Pedigree Integration

| OpenShell Policy Area | Pedigree Manifest Field |
|---|---|
| `filesystem_policy.read_write` | `manifest.allowed_tools` (needs file write) |
| `network_policies[].endpoints[].host` | `manifest.data_context.sources[].path` |
| `network_policies[].access` | `manifest.data_context.sources[].access` (read/read_write) |
| `network_policies[].binaries` | Inferred from `manifest.allowed_tools` |
| `process.run_as_user` | Derived from `manifest.human_owner` |
| Denied-by-default fallthrough | Mirrors Pedigree's `manifest.blocked_tasks` |

### Policy Advisor (AI-Assisted Policy Generation)

OpenShell has a built-in **policy advisor** pipeline:
- When an action is denied, a `DenialEvent` is emitted
- The denial aggregator batches these and proposes narrow allow rules
- Two proposers: **mechanistic mapper** (L4 denials → host:port rules) and **agent-authored** (via `policy.local` hook)
- A **Z3 prover** validates proposed changes for safety (checks for `credential_reach_expansion`, `capability_expansion`, `link_local_reach`, `l7_bypass_credentialed`)
- Auto-approval gate for zero-finding proposals (opt-in)

This is relevant: Pedigree could feed into the policy advisor loop, generating initial policy proposals from the Agent Manifest rather than starting from full-deny.

---

## 4. Microsoft Security Primitives (Windows-Specific)

These are **new OS-level features** developed by Microsoft for agent workloads — not existing Entra ID / Defender / Purview. They ship with RTX Spark PCs (Fall 2026) and require OpenShell.

| Primitive | What It Does | Pedigree Relevance |
|---|---|---|
| **Kernel sandboxing** | OS-isolated process container. Even compromised agent can't escape. | Makes "agent on daily driver" trustable for enterprise. |
| **Policy engine** | Admin-defined filesystem/network/process rules at kernel level. | Pedigree manifest → Windows policies via OpenShell. |
| **Intelligent Router + Data Masker** | Decides local vs. cloud; masks PII before egress. | Compliance. Pedigree's `manifest.policy.risk_level` drives routing. |
| **Identity controls** | Agent actions tied to Windows identity. Captured in Windows audit events. | Attestation chain: Windows SID → Agent → Action. |
| **Mediated desktop access** | Controlled app interactions (no blind GUI automation). | Agent can use Excel/Office through mediated calls. |

---

## 5. Pedigree → OpenShell Policy Translation

The key integration surface: when Pedigree generates an Agent Manifest,
translate it into OpenShell policies:

```yaml
# Pedigree Agent Manifest (pseudocode)
agent_manifest:
  name: "revenue-summary-agent"
  owner: "Nadia Bennett"
  allowed_tools:
    terminal: true
    file: true
    web: false
  data_context:
    sources:
      - name: "salesforce"
        type: "api"
        path: "https://*.salesforce.com"
        access: "read_only"
      - name: "weekly_reports"
        type: "file"
        path: "/shared/finance/"
        access: "read_only"
  blocked:
    - "Any outgoing payment"
    - "Modify production data"
  approval_required:
    tier: "auto-write-with-approval"
    triggers:
      - "Any external-facing send"
```

```yaml
# Generated OpenShell Policy
version: 1

filesystem_policy:
  include_workdir: true
  read_only:
    - /shared/finance
  read_write:
    - /sandbox
    - /tmp

process:
  run_as_user: nadia_bennett

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
      - { path: /usr/local/bin/agent-runner }
```

The Hermes `/approve` gate sits **above** OpenShell — it blocks at the agent-loop
level before any tool executes. OpenShell enforces at the OS/kernel level
even if the agent proceeds. Two layers of defense.

---

## 6. Enterprise Pitch (Updated)

> **"Most agent vendors give you a chat interface. We give you an AI workforce governance system."**
>
> Pedigree maps your org chart to accountable agents with defined KPIs and cost tracking.
> Hermes runs those agents with visible cost, human oversight via Slack/Telegram, and
> a full attestation trail.
>
> NVIDIA OpenShell sandboxes each agent with kernel-level isolation and declarative
> YAML policies — filesystem, network, inference — enforced by Landlock, seccomp,
> and a policy proxy.
>
> On Windows RTX Spark PCs, Microsoft's new security primitives add kernel sandboxing,
> identity controls, and data masking for regulatory compliance.
>
> **Your security team doesn't have to trust the LLM. They trust the kernel.**

---

## 7. Key Repos & Resources

| Resource | URL |
|---|---|
| OpenShell (Apache 2.0) | https://github.com/NVIDIA/OpenShell |
| OpenShell docs | https://docs.nvidia.com/openshell/latest/ |
| OpenShell policy schema | `docs/reference/policy-schema.mdx` in the repo |
| Hermes Agent | https://github.com/NousResearch/hermes-agent |
| Hermes docs | https://hermes-agent.nousresearch.com/docs/ |
| This conversation | `docs/reference/hermes-openshell-enterprise-product.md` |

---

## 8. Open Questions (for next pass)

- OpenShell's Windows RTX Spark integration timeline — is it alpha like Linux or shipping?
- Does OpenShell's `agent-driven-policy-management` example show Pedigree manifest → policy generation?
- What's the exact minimum Hermes + OpenShell setup flow for an enterprise PoC?
- Can Pedigree serve as the OpenShell gateway auth provider (identity + policy)?
- Hermes hook → audit DB pipeline: what format should attestation events take?