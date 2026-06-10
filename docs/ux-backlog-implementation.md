# UX Backlog — Implementation Status

Source backlogs: `18-ux-backlog-prioritized.md` and `pedigree-ux-backlog.md` (2026-06-09).
Branch: `claude/pedigree-ux-backlog-g7sdrh` (stacked on the agent-compiler branch — it
consumes the registry, validation, and audit data introduced there).

## Shipped in this cycle

| Item | Where | Notes |
|---|---|---|
| P0-1 Provenance badges | `src/lib/provenance.ts`, `src/components/ProvenanceBadge.tsx`, Drawer, ManifestScreen | Three-state badge (`Evidenced` / `AI-inferred` / `Human-confirmed`) on every responsibility and task; click-through opens the source excerpt + session reference; confidence shown on inferences; state derived in `applyParsed`/Org Sync/Stack Sync and carried into manifest JSON (`task.provenance`, `parent_responsibility.provenance`). An AI-inferred task blocks manifest approval until confirmed. |
| P0-2 Enforcement-reality indicator | `src/lib/enforcement.ts`, ManifestScreen | Per-control `Prompt-advisory` / `Runtime-enforceable (requires compatible runtime)` / `Not yet enforceable` tags, a summary strip ("X of Y controls enforceable"), a plain-language legend, and a runtime selector that changes the states. The table is intentionally honest: no runtime path claims full enforcement, and "enforceable" never means Pedigree executes anything. |
| P0-3 Review inbox | `src/components/ReviewInbox.tsx`, `buildReviewQueue` in `src/lib/provenance.ts` | New workspace tab: single org-wide queue, filters (department, risk, provenance, classification), sorted highest-risk/lowest-confidence first. Bulk-confirm is restricted to evidenced + delegatable items; approval-required/blocked and AI-inferred items are reviewed individually; bulk actions cannot change a classification. |
| P0-4 Governance-preserved export check | `governancePreservedChecks` in `src/lib/validate.ts`, ManifestScreen | Visible pre-export checklist: blocked tasks preserved, approval gates retained, no demotion, no silent authority expansion (warn), owner populated, escalation path present. Hard failures disable every export button with the diff shown; the validation result is recorded as an `export_validated` audit event on each export. |
| P0-5 Auth/RBAC (minimum) | `UserRole` in types, LoginScreen, ReviewInbox, ManifestScreen | Local `Editor` / `Reviewer` roles gate confirming provenance and approving manifests; an editor cannot approve their own manifest (`generatedBy` recorded). **Honest boundary:** these are local roles, labeled "SSO/SAML on roadmap" in the UI. Real OIDC/SAML + server-enforced sessions need an identity backend and remain the long-pole roadmap item — no screen pretends otherwise. |
| P0-6 Typography/contrast | `src/styles.css` tokens, `src/styles.v2.css` floor block | `--text-3`/`--text-4` raised to clear WCAG 2.1 AA on their primary surfaces (both themes); body base 14px; 12px metadata floor across review/drawer/sheet/manifest/modal surfaces. |
| P0-7 HRIS cards | `src/components/WorkspacesHome.tsx` | Both cards labeled `Roadmap` with planned-tense copy; click is a "request this connector" interest capture, not a connection flow. |
| P1-1 Governance one-pager | `src/lib/governanceSummary.ts` | Print-ready `GOVERNANCE-SUMMARY.html` in every export ZIP + standalone download: owner, inherited responsibility, allowed/approval/blocked in plain language, evidence quotes, policy provenance, escalation, tool scopes, and the enforcement-reality table. |
| P1-2 Org Sync manifest impact | AgentsList badges in `App.tsx`, apply toast | Agents whose ingredients drifted show `needs re-review`; an owner missing from the org map shows `orphaned owner`. The Org Sync apply toast reports how many agents were impacted. |
| P1-3 Audit trail surface | `WorkspaceAuditEvent` in types, `src/components/AuditTrail.tsx` | Append-only timeline (generated / provenance confirmed / approved / validated / exported / stack changes / retired) merged with the stack-sync audit log; filterable; CSV/JSON export; persisted in the workspace snapshot. Local-first, schema mirrors the planned production pipeline. |
| P1-5 Risk-tier visual language | `RiskBadge` in `src/components/ProvenanceBadge.tsx` | One component (color + icon + label) used in the review inbox, manifest header, and agent cards. |

## Deliberately deferred (per the backlogs' own guidance)

- **Real SSO/OIDC/SAML + server-side session enforcement** (P0-5 full scope) — requires an
  identity backend; the docs themselves call it the long pole and say not to let it block
  demo work. The local role model ships the approval-separation acceptance criterion.
- **P1-4 CSV column mapping + row-level validation report** — a self-contained project;
  next in line after pilot feedback.
- **P1-5/P2 sample manifest gallery, P1-6 empty states, P2 dashboard/tour/a11y/mobile** —
  roadmap; "do not pull forward without customer pull."

## Boundary protection

Nothing added implies runtime execution, live connectors, fleet orchestration, or
telemetry. The enforcement-reality table and the one-pager both state explicitly that
enforcement happens in a compatible runtime, not in Pedigree, and that the product
supports a compliance program rather than conferring certification.
