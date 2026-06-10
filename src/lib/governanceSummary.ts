import type { CompiledAgent } from "./runtimes/types";
import { enforcementProfile, ENFORCEMENT_LEGEND } from "./enforcement";
import { provenanceLabel } from "./provenance";
import type { ItemProvenance } from "@/types";

// ── Non-technical governance one-pager (UX backlog P1-1 / P0.6) ────────
// The approver — GRC lead, department head, CISO delegate — never opens
// manifest.json. This is the page they read and sign off on: what the agent
// may and may not do, where that came from, and what is actually enforced.

export function buildGovernanceSummaryHtml(compiled: CompiledAgent): string {
  const gov = compiled.governance;
  const spec = compiled.construction_spec;
  const owner = compiled.owner;
  const manifest = compiled.manifest as Record<string, any>;
  const taskProvenance = (manifest.task?.provenance ?? compiled.task.provenance) as ItemProvenance | undefined;
  const enforcement = enforcementProfile(compiled.runtime);
  const enforceable = enforcement.filter((e) => e.status === "enforceable");
  const advisory = enforcement.filter((e) => e.status === "advisory");
  const notYet = enforcement.filter((e) => e.status === "not_yet");

  const li = (items: string[]) => (items.length ? items.map((i) => `<li>${esc(i)}</li>`).join("") : "<li><em>None</em></li>");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Governance Summary — ${esc(compiled.agent_name)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #111827; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.5; font-size: 14px; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-top: 26px; color: #374151; }
  .meta { color: #6b7280; font-size: 12.5px; }
  .cols { display: flex; gap: 28px; } .cols > div { flex: 1; }
  ul { margin: 6px 0; padding-left: 20px; }
  .blocked li { color: #991b1b; } .approval li { color: #92400e; } .allowed li { color: #065f46; }
  .pill { display: inline-block; border: 1px solid #9ca3af; border-radius: 10px; padding: 1px 8px; font-size: 11.5px; color: #374151; margin-left: 6px; }
  .evidence { background: #f9fafb; border-left: 3px solid #9ca3af; padding: 8px 12px; font-style: italic; margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; } td, th { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; vertical-align: top; }
  footer { margin-top: 32px; font-size: 11.5px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 10px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${esc(compiled.agent_name)}</h1>
  <div class="meta">Governance summary · version ${compiled.version} · compiled ${esc(compiled.provenance.compiled_at)} · trace ${esc(compiled.provenance.trace_id)}</div>

  <h2>Ownership &amp; scope</h2>
  <p><strong>Human owner:</strong> ${esc(owner.name)} — ${esc(owner.title)}, ${esc(owner.department)} (${esc(owner.email)})<br>
  <strong>Inherited responsibility:</strong> ${esc(compiled.responsibility.title)}<br>
  <strong>Delegated task:</strong> ${esc(compiled.task.label)}
  ${taskProvenance ? `<span class="pill">${esc(provenanceLabel(taskProvenance.state))}</span>` : ""}<br>
  <strong>Risk tier:</strong> ${esc(compiled.risk_level)} · <strong>Lifecycle:</strong> ${esc(String((manifest.lifecycle?.class as string) ?? "standing"))} · <strong>Runtime target:</strong> ${esc(compiled.runtime)}</p>
  ${taskProvenance?.evidence_quote ? `<div class="evidence">Discovery evidence: "${esc(taskProvenance.evidence_quote)}"${taskProvenance.source ? ` — ${esc(taskProvenance.source)}` : ""}</div>` : ""}

  <h2>What this agent may and may not do</h2>
  <div class="cols">
    <div><strong>Allowed (within scope)</strong><ul class="allowed">${li(gov.allowed)}</ul></div>
    <div><strong>Requires human approval</strong><ul class="approval">${li(gov.approval.map((a) => `${a.action} — approver: ${a.approver}`))}</ul></div>
  </div>
  <strong>Blocked — never performed, even with approval</strong>
  <ul class="blocked">${li(gov.blocked.map((b) => b.action))}</ul>
  ${gov.rule_provenance.length ? `<p><strong>Why (policy evidence):</strong></p><ul>${gov.rule_provenance.map((p) => `<li>${esc(p.rule_id)} (${esc(p.source_doc)}): "${esc(p.evidence_quote)}"</li>`).join("")}</ul>` : ""}

  <h2>Escalation</h2>
  <p>Escalates to ${esc(owner.name)} (${esc(owner.email)}) when:</p>
  <ul>${li(spec.escalation_rules)}</ul>

  <h2>What is and is not enforced at runtime</h2>
  <p class="meta">${enforceable.length} of ${enforcement.length} controls are runtime-enforceable on the ${esc(compiled.runtime)} path; ${advisory.length} are prompt-advisory; ${notYet.length} are not yet enforceable. ${esc(ENFORCEMENT_LEGEND.enforceable.description)}</p>
  <table>
    <tr><th>Control</th><th>Enforcement</th><th>Where</th></tr>
    ${enforcement.map((e) => `<tr><td>${esc(e.control)}</td><td>${esc(ENFORCEMENT_LEGEND[e.status].label)}</td><td>${esc(e.note)}</td></tr>`).join("")}
  </table>

  <h2>Tools &amp; data access</h2>
  <ul>${li(compiled.mcp_grants.map((g) => `${g.name} — ${g.scope.replace("_", "-")} (${g.source === "library" ? "company MCP library" : "catalog fallback — register the company library"})`))}</ul>

  <footer>
    Generated by Pedigree from the compiled agent manifest (compiler ${esc(compiled.provenance.compiler_version)}).
    Pedigree produces governance controls and audit evidence that support your compliance program; it does not confer certification.
    This agent authoring/export package does not execute agents.
  </footer>
</body>
</html>`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
