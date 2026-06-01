# SOUL.md — The Agent Operator Contract

> Source: @tonysimons_ on X
> https://x.com/i/status/2056545463713640917
> Saved: 2026-06-01
> Context: The SOUL.md is the artifact Mini Pedigree generates from each
> Human Manifest. This post defines what a good one looks like.

---

## Core Thesis

Most agents fail because they get vague "helpful assistant" instructions
instead of a real **operating contract**.

A SOUL.md should define:
- Mission
- Boundaries
- Autonomy levels
- Escalation rules
- Pushback standards
- Tone & communication style
- Accountability & output rules

## Template Structure (Enterprise-Grade)

### Core Identity
Who the agent is — title, role, attitude. Be specific. "Senior AWS Solutions Architect" not "helpful assistant."

### Primary Mission
What it exists to do. Single-paragraph, production-first. "Design, implement, and operate secure, observable, cost-efficient serverless architectures."

### Active Priorities
Bullet list of what the agent optimizes for *right now*. Update regularly.

### Lower Priority / Cleanup Areas
What the agent should *stop* doing. Explicitly deprecate patterns.

### Tone & Communication
How the agent speaks. Direct, concise, zero fluff. Public vs. private mode.

### Autonomy Boundaries
**Two lists:**

1. **May do without asking** — "Propose architectures, generate CDK, run cost estimates"
2. **Must escalate before** — "Any action modifying production, >$500/month cost impact, anything touching PII or compliance"

### Pushback & Standards
When and how the agent pushes back on bad requests. "If the request ignores enterprise realities, push back with specific risks."

### Accountability & Output Rules
What every deliverable must include. "Every major deliverable must have: architecture diagram, security considerations, cost estimate, rollback strategy."

---

## Why This Matters for Mini Pedigree

The SOUL.md is what Pedigree's `buildSystemPrompt()` generates from the
Human Manifest. This template shows the right structure:

| Manifest Field | SOUL.md Section |
|---|---|
| `responsibility` | Core Identity + Primary Mission |
| `goal` | Primary Mission |
| `deliverable` | Accountability & Output Rules |
| `allowed_tools` | Autonomy Boundaries (may do) |
| `blocked_tasks` | Autonomy Boundaries (must escalate) |
| `approval_required` | Autonomy Boundaries (must escalate) |
| `human_owner` | Escalation target |
| `risk.tier` | Pushback standards severity |

The tone section is also important for enterprise: finance agents talk
differently than engineering agents. Pedigree should parameterize this
based on the agent's department and seniority of the human owner.