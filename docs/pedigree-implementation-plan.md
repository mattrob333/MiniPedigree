# Pedigree Enterprise Fleet — Implementation Plan

**Date:** 2026-06-02
**Based on:** Fleet Vision Document + Matt Van Horn's "Every Agentic Engineering Hack I Know (June 2026)"

---

## What Already Exists (Don't Rebuild)

| File | What It Does | Status |
|---|---|---|
| `src/lib/agent.ts` | `AgentConstructionSpec`, `DeliveryTarget`, operating modes, workflow steps, input/output, skills, memory policy, audit events, failure modes, test prompts | ✅ Complete |
| `src/lib/hermesManifest.ts` | `buildHermesManifest()`, `buildHermesMarkdownPackage()`, `buildHermesYamlFrontMatter()` — converts Pedigree manifest to Hermes-compatible YAML frontmatter + markdown | ✅ Complete |
| `ManifestScreen.tsx` | Per-agent manifest view, .zip export with system-prompt.txt + manifest.json + SETUP.md | ✅ Works |
| Company Profile | Business context injected into every agent | ✅ Works |
| Org Sync | Fireflies diff → reviewed changeset → merge | ✅ Works |

**The heavy lifting for P1 is already done.** `buildHermesMarkdownPackage()` produces a full YAML-frontmatter markdown file with delivery targets, schedule, tools, MCP servers, data sources, and system prompt. The gap is: there's no **profile distribution tarball generator** that packages this into a `hermes profile import`-compatible format.

---

## Phase 1 — Hermes Profile Distribution Generator (P1)

**Goal:** Generate a `tar.gz` that `hermes profile import` can consume, one per agent.

### What to build

New file: `src/lib/hermesProfileDistribution.ts`

```ts
export interface HermesProfileDistribution {
  agent: HermesAgentManifest;
  profileDir: string; // temporary directory path
  tarball: Blob;
}

export function buildHermesProfileDistribution(
  agent: HermesAgentManifest,
  systemPrompt: string,
  companyContext?: CompanyContext
): Promise<HermesProfileDistribution>
```

Generates this directory structure:

```
.pedigree-profiles/<agent-id>/
├── distribution.yaml           # Metadata: agent_id, version, env_requires, display_name
├── config.yaml                 # Hermes config: model, tools, MCP servers, delivery
├── skills/
│   ├── pedigree-manifest.skill.md      # The manifest (JSON embedded in skill frontmatter)
│   └── pedigree-owner-context.skill.md # Company context + owner profile
├── cron/
│   └── (if recurring) schedule.yaml    # Cron definition for hermes cron create
└── README.md                   # Install instructions
```

### Key file templates

**distribution.yaml:**
```yaml
manifest_version: "1.0"
runtime: hermes
agent_id: revenue-brief-agent
agent_name: Revenue Brief Agent
version: 1.0.0
owner:
  name: Nadia Bennett
  email: nadia@company.com
env_requires: []
install_instructions: |
  1. hermes profile import ./revenue-brief-agent.tar.gz
  2. Set TELEGRAM_BOT_TOKEN / SLACK_BOT_TOKEN in .env if using gateway delivery
```

**config.yaml (per agent):**
```yaml
model:
  default: anthropic/claude-sonnet-4
  provider: anthropic
agent:
  max_turns: 30
tools:
  enabled: [terminal, file, web]
  blocked: [browser, gmail]
terminal:
  timeout: 120
```

**skills/pedigree-manifest.skill.md:**
```markdown
---
name: pedigree-manifest-revenue-brief
description: "Pedigree agent manifest: allowed tasks, approval gates, IO contract, escalation rules"
---

# Pedigree Manifest: Revenue Brief Agent

## Identity
You are Revenue Brief Agent. You work for Nadia Bennett, Chief Revenue Officer.

## Allowed Tasks
- Pull daily Salesforce pipeline data
- Format revenue summary from CRM

## Approval Required
- Sending output to external recipients

## Blocked Tasks
- Approve final decisions
- Commit company resources

## Escalation Rules
- Request exceeds approved scope
- Required source data is missing
```

### UI change

In `ManifestScreen.tsx`, add a runtime selector + export button:

```
Runtime: [Hermes Agent ▼]  [OpenAI]  [Claude]  [Generic]

[Export Profile Distribution.tar.gz]
```

The existing `.zip` export stays for backward compatibility. The new button produces the `.tar.gz`.

### Verification (the /ce-work test)

After generating:
```bash
hermes profile import ./revenue-brief-agent.tar.gz
hermes -p revenue-brief-agent    # agent should load with correct tools, skills, system prompt
```

---

## Phase 2 — Orchestrator Profile (P2) + Deploy Fleet UI (P4)

**Goal:** Generate the org-level Hermes instance that routes work to all workers.

### What to build

New file: `src/lib/hermesOrchestrator.ts`

```ts
export interface FleetPackage {
  orchestrator: HermesProfileDistribution;
  workers: HermesProfileDistribution[];
  gateway: { telegram: string; slack: string }; // setup guides
  timestamp: string;
}

export function buildFleetPackage(workspace: Workspace): Promise<FleetPackage>
```

Generates:

```
pedigree-fleet-<company>/
├── README.md
├── install.sh / install.ps1
│
├── orchestrator/                      # ← The org's main Hermes instance
│   ├── distribution.yaml
│   ├── config.yaml                    # Gateway enabled, Telegram + Slack
│   ├── .env.example                   # TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN
│   ├── skills/
│   │   ├── pedigree-org-map.skill.md         # Full org structure
│   │   ├── pedigree-company-context.skill.md # Business context
│   │   └── pedigree-agent-router.skill.md    # Routes requests → correct worker
│   └── cron/
│       └── daily-org-sync.yaml
│
├── workers/                           # One per agent
│   ├── revenue-brief-agent.tar.gz
│   ├── procurement-agent.tar.gz
│   └── vendor-screening-agent.tar.gz
│
├── gateway/
│   ├── telegram-bot-setup.md          # "Talk to @BotFather, create bot, paste token"
│   ├── slack-app-setup.md             # "Create Slack app, enable events, paste token"
│   └── shared-channel-setup.md        # "Create #hermes-fleet, invite bot"
│
└── ssot/
    └── sync-fleet.sh                  # Re-run after Org Sync → re-export changed agents
```

### The orchestrator's agent-router skill

This is the key piece — how the orchestrator knows which worker handles what:

```markdown
---
name: pedigree-agent-router
description: "Routes incoming requests to the correct worker agent profile"
---

# Agent Router — <Company Name>

## Worker Registry
| Trigger Keywords | Agent Profile | Human Owner |
|---|---|---|
| revenue, pipeline, forecast | revenue-brief-agent | Nadia Bennett (nadia@...) |
| procurement, PO, vendor | procurement-agent | Mark Chen (mark@...) |
| vendor screening, due diligence | vendor-screening-agent | Lisa Park (lisa@...) |

## Routing Logic
1. Parse the incoming request for trigger keywords
2. If a match is found: delegate_task to <agent-profile> with the full request context
3. If no match: ask the human to clarify which area this belongs to
4. Always CC the human owner on completion
```

### The "Deploy Fleet" button (P4)

In the workspace home screen, when discovery is complete and at least one agent has been generated:

```
┌────────────────────────────────────┐
│  Org: Northstar SaaS               │
│  20 people · 12 responsibilities   │
│  5 agents generated                │
│                                    │
│  [Deploy Fleet ─►]                 │
│    ↳ Full deployment tar.gz        │
│    ↳ Quick start README included   │
│    ↳ One file per worker agent     │
└────────────────────────────────────┘
```

---

## Phase 3 — OpenShell Policy Generator (P3)

**Goal:** Translate a Pedigree Agent Manifest into an OpenShell-compatible YAML policy file.

### What to build

New file: `src/lib/openshellPolicy.ts`

```ts
export interface OpenShellPolicy {
  version: number;
  filesystem_policy: {...};
  network_policies: {...}[];
  process: {...};
  landlock: {...};
}

export function manifestToOpenShellPolicy(
  manifest: HermesAgentManifest,
  owner: { name: string }
): string // YAML output
```

### Policy translation table

| Pedigree Manifest | OpenShell Policy |
|---|---|
| `tools.enabled` includes file/directory tools | `filesystem_policy.read_write: [/sandbox, /tmp]` |
| `data_sources[].type = "api"` | `network_policies[].endpoints[].host` from endpoint URL |
| `data_sources[].access = "read"` | `network_policies[].access: read-only` |
| `data_sources[].access = "read_write"` | `network_policies[].access: read-write` |
| All unsourced paths | `filesystem_policy.read_only: [/usr, /lib, /etc]` |
| `risk_level = "critical"` | `landlock.compatibility: hard_requirement` |
| `risk_level = "low"` | `landlock.compatibility: best_effort` |
| `blocked_tasks` | Default-deny — only allowed rules are written |
| `owner.name` | `process.run_as_user: <sanitized>` |

### Example output

```yaml
version: 1
filesystem_policy:
  include_workdir: true
  read_only:
    - /usr
    - /lib
    - /proc
    - /etc
  read_write:
    - /sandbox
    - /tmp
landlock:
  compatibility: best_effort
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
```

### Inclusion in fleet package

Add to the deployment tarball:

```
pedigree-fleet-<company>/
├── policies/
│   ├── revenue-brief-agent-policy.yaml
│   ├── procurement-agent-policy.yaml
│   └── vendor-screening-policy.yaml
```

---

## Phase 4 — Pedigree MCP Server (P5)

**Goal:** A lightweight shared-state server that acts as the single source of truth for the agent fleet.

### What to build

New repo or directory: `pedigree-mcp-server/`

**State it holds in SQLite:**
- `org_map` — current people + responsibilities (synced from Pedigree)
- `agent_registry` — what agents exist, their status (active/paused/deprecated)
- `task_queue` — pending handoffs between agents
- `coordination_log` — agent → agent messages for visibility

**MCP tools it exposes:**

| Tool | Read/Write | What It Does |
|---|---|---|
| `org_lookup_person(name)` | Read | Returns person, responsibilities, agent |
| `org_lookup_agent(task)` | Read | Returns the agent profile that handles this task |
| `queue_push(agent_id, task)` | Write | Push a handoff to another agent's queue |
| `queue_poll(agent_id)` | Write | Pop the next pending handoff |
| `coordination_log(msg)` | Write | Log a coordination event (for human visibility) |

**SSOT sync loop:** When the Pedigree admin runs Org Sync and approves changes, the sync script pushes updated manifests to the MCP server. Agents check for updates on their next cron tick.

**How agents connect:**
```bash
hermes mcp add pedigree-ssot --command 'pedigree-mcp-server --db /shared/fleet.db'
```

**How the orchestrator routes using it:**
```
Human: "@orchestrator run vendor screening on Acme Corp"

Orchestrator:
1. Calls org_lookup_agent("vendor screening")
   → Returns: "vendor-screening-agent"
2. Calls queue_push("vendor-screening-agent", "Screening Acme Corp...")
3. The vendor screening agent polls on its next tick, picks up the task
4. Completes → writes result to coordination_log
```

---

## Incorporating Matt Van Horn's Hacks

| Hack | Connection to Pedigree | Actionable |
|---|---|---|
| **/ce-plan first** | Pedigree already does this — mapping sessions ARE the plan. The org map is the plan.md for the fleet. | ✅ Already built |
| **Don't read the plan** | Plans are for agents, not humans. Pedigree manifests are for the agents. The human skims, approves, moves on. | ✅ Already the philosophy |
| **Skills compound** | Pedigree generates per-agent skills. The `pedigree-manifest.skill.md` IS a compounding skill. | Add to profile distribution (P1) |
| **AgentMail to agent** | Matt Van Horn's `agentmail-to-claude-code` is the pattern for Pedigree's inter-agent bus. Email → fresh session → work. | Borrow pattern for P5 MCP server |
| **Two models** | Claude plans, Codex builds. Pedigree does: orchestrator plans (routes), workers build (execute). | Room for multi-model later |
| **Granola raw transcripts** | Pedigree's Org Sync already drops raw Fireflies transcripts in. "Don't summarize first." | ✅ Already built |
| **last30days research** | Pedigree's company profile research step. Research before planning. | Add URL research toggle to company profile |
| **Hermes in the wild** | Matt Van Horn explicitly runs Hermes + OpenClaw for autonomous remote work. | External validation of the runtime choice |
| **Printing Press CLIs** | Same concept as Pedigree's agent profile distributions — fleet of purpose-built executables. | Validates the architecture |
| **YOLO permissions** | For a single developer on their own machine. For Pedigree's enterprise use case, the `/approve` / `/deny` HITL loop is the opposite — deliberate, governed, audited. | Know when to YOLO vs. gate |

The single most actionable hack from the article: **AgentMail-to-Claude**. His exact project at `github.com/mvanhorn/agentmail-to-claude-code` shows how to spawn an agent session from an email. Pedigree's MCP server (P5) could use the same pattern: email the fleet → the orchestrator routes it to the right worker → a session spawns and works on it. No need to SSH or open the app.

---

## Build Order & Dependencies

```
Phase 1: Hermes Profile Distribution Generator
  ├── src/lib/hermesProfileDistribution.ts
  ├── distribution.yaml template
  ├── config.yaml generator per manifest
  ├── skills/ generator (manifest skill + context skill)
  ├── cron/ generator (if recurring)
  ├── tar.gz packaging (JSZip for Blob, or server-side tar)
  └── "Export Hermes Profile" button in ManifestScreen.tsx
  └── Dependencies: hermesManifest.ts ✅ (already exists)

Phase 2: Orchestrator + Fleet UI
  ├── src/lib/hermesOrchestrator.ts
  ├── orchestrator profile generator
  ├── agent-router skill generator
  ├── gateway setup guide generator
  ├── "Deploy Fleet" button in WorkspacesHome
  └── Full tarball packaging
  └── Dependencies: Phase 1 (worker profiles)

Phase 3: OpenShell Policy Generator
  ├── src/lib/openshellPolicy.ts
  ├── manifestToOpenShellPolicy()
  └── Included in fleet package under policies/
  └── Dependencies: none (standalone, pure translation)

Phase 4: Pedigree MCP Server
  ├── pedigree-mcp-server/ (new directory)
  ├── SQLite schema (org_map, agent_registry, task_queue, coordination_log)
  ├── MCP tool definitions (org_lookup, queue_push/poll, coordination_log)
  ├── SSOT sync script
  └── Included in fleet package under mcp/
  └── Dependencies: Phase 2 (uses the org map + agent registry)
```

### Recommended start order

1. **Phase 1 first** — `hermesProfileDistribution.ts` is the highest-impact, lowest-dependency piece. The agent engine (`hermesManifest.ts`) already exists. This just wraps it in a deployable package.

2. **Phase 2 second** — Once per-agent profiles work, the orchestrator wraps them into a fleet. The gateway setup guides are static templates; the router skill is a template with the agent registry filled in.

3. **Phase 3 anytime** — OpenShell policy is a pure YAML translation. Standalone, can be written in parallel with anything else.

4. **Phase 4 last** — The MCP server needs the agent registry from Phase 2 and a running Hermes instance to test against.

---

## Verification Criteria

**Phase 1 done when:**
```bash
hermes profile import ./revenue-brief-agent.tar.gz
hermes -p revenue-brief-agent --skills pedigree-manifest-revenue-brief -q "What are my allowed tasks?"
# → Responds with the correct allowed tasks from the manifest, not generic "helpful assistant"
```

**Phase 2 done when:**
```bash
hermes profile import ./pedigree-orchestrator.tar.gz
hermes -p pedigree-orchestrator -q "Run the revenue brief for this week"
# → Routes to the revenue-brief-agent subagent, returns a revenue summary
```

**Phase 3 done when:**
```bash
pedigree-manifest-to-openshell --manifest revenue-brief-manifest.json --output policy.yaml
openshell-validate policy.yaml
# → Validates against OpenShell schema
```

**Phase 4 done when:**
```bash
# Agent A writes:
pedigree-mcp queue-push procurement-agent "{task: 'Screen vendor X', priority: high}"

# Agent B (next cron tick) reads:
pedigree-mcp queue-poll procurement-agent
# → Returns the pending task
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **`hermes profile import` format not documented** | Read the Hermes source at `~/.hermes/hermes-agent/hermes_cli/commands.py` to find the exact profile directory structure. Alternatively, build the tarball, test it, iterate. |
| **Profile doesn't load skills correctly** | The skill format is documented: YAML frontmatter + markdown body. Use `skill_view()` format as the template. |
| **OpenShell not available on WSL/local** | Write the policy generator anyway. Validation can be manual until OpenShell is running. The policy format is well-documented. |
| **Dual maintenance burden** | Keep the old `.zip` export working. Add the new `.tar.gz` export alongside it. Both use the same `buildHermesManifest()` function. |
| **MCP server scope creep** | Start with just `org_lookup_agent` and `queue_push/poll`. Don't build a full RAG system. The wire format is simple JSON over stdio. |

---

## Immediate Next Actions

1. Read `~/.hermes/hermes-agent/hermes_cli/commands.py` to find the `profile import` format spec
2. Read an existing skill in `~/.hermes/skills/` to confirm the YAML frontmatter format
3. Build `src/lib/hermesProfileDistribution.ts` with `buildHermesProfileDistribution()`
4. Wire it into `ManifestScreen.tsx` as an export option
5. Test: generate a profile, `hermes profile import` it, verify the agent runs with correct scope
