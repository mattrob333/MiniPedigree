# Pedigree Agent Compiler — Implementation Map

Implementation of the discovery-to-deployment compilation pipeline and the
transcript-driven stack sync loop. Every stage preserves the deterministic
no-API-key fallback; all AI calls go through `callStructured` in
`server/core/openaiCall.ts` and may only *add* restrictions, never remove them.

## Pipeline stages → code

| Stage | What | Where |
|---|---|---|
| 0 | Enriched parse (completion context per task, nullable; classification rules unchanged and stated first) | `server/core/parse.ts`, `src/lib/schemas.ts`, `src/lib/parse.ts` |
| A | Ingredient resolution (human manifest, task record, company context, MCP library, runtime target) | `src/lib/runtimes/index.ts` (`compileAgent`), `src/lib/mcpLibrary.ts` (`resolveMcpGrants`) |
| B | Governance compilation (deterministic rule extraction + monotonic merge: blocked > approval > allowed, promotions only) | `src/lib/governance.ts`, `server/core/governanceRules.ts` (optional AI pass, add-only) |
| C | Construction spec authoring (existing `agentAuthor`, re-merged through the same monotonic merge) | `server/core/agentAuthor.ts`, `src/lib/agent.ts` |
| D | Runtime emission — six adapters render from one `CompiledAgent`; adapters format, never decide policy | `src/lib/runtimes/` (`pedigree`, `hermes`, `openclaw`, `openai`, `claude`, `generic`) |
| E | Validation gates (hard failures block export; warnings shown) | `src/lib/validate.ts`, surfaced in `src/components/ManifestScreen.tsx` |
| F | Package, provenance (SHA-256 ingredient hashes), append-only Agent Registry | `src/lib/hash.ts`, `src/lib/registry.ts`, migration `004_agent_registry.sql` |

## Sync loop

`src/lib/stackSync.ts` diffs a new transcript parse against the responsibility
map, the registry, and the governance rules, producing typed
`StackChangeProposal`s with evidence quotes and an `authority_expanding` flag.
`server/core/stackDiff.ts` / `api/sync/diff.ts` add an optional AI pass that
may only refine confidence and evidence selection. The review UI lives in
`src/components/OrgSyncModal.tsx`: authority-expanding proposals get red-flag
treatment, are never pre-approved, and require explicit per-proposal
confirmation. `applyStackProposals` writes an audit record for every applied
change, patches the underlying object, and marks affected registry entries
stale — recompiling (version bump) is a separate explicit action per agent in
the Manifest screen.

## Company MCP Library

`src/lib/mcpLibrary.ts` + `src/components/McpLibraryScreen.tsx` + migration
`003_company_mcp_library.sql`. Grants are resolved from the library at compile
time; the grant scope is the registered default and never wider, `read_write`
is never a default, and the static catalog is only a tagged
`catalog_fallback` when the library is empty.

## Invariants enforced in code and tests

1. Blocked > approval > allowed; promotions only (`tests/governance.test.ts`).
2. No MCP grant wider than the library's approved scope (`tests/mcpLibrary.test.ts`, `tests/validate.test.ts`).
3. AI proposes; deterministic code disposes (merge/validation paths in `agent.ts`, `governanceRules.ts`, `stackDiff.ts`).
4. Every constraint, grant, and change carries provenance (`rule_id` + `evidence_quote`, audit records).
5. Deterministic fallback end-to-end with no API keys; nulls and catalog fallback, never invented data (`tests/parse.test.ts`).
6. Registry history is append-only (`tests/validate.test.ts`).

> Naming discipline: this is the "Governance Overlay" internally. Externally,
> say "governance controls and audit evidence" — it supports a customer's
> SOC 2 program; it does not confer certification.
