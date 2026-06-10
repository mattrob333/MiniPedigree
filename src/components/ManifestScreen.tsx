import { useState } from "react";
import JSZip from "jszip";
import { Icon } from "./Icon";
import { BrandChip, BrandLogo } from "./BrandLogo";
import type { AgentRecord, AgentRegistryEntry, CompanyContext, CompanyMcpServer, ItemProvenance, McpRecommendation, PedigreeRow, UserRole, WorkspaceAuditEvent } from "@/types";
import { copyText, initials } from "@/lib/util";
import { downloadFile } from "@/lib/state";
import { slugify, buildDeploymentGuide, type AgentConstructionSpec } from "@/lib/agent";
import { buildHermesManifest } from "@/lib/hermesManifest";
import { recommendMcp } from "@/lib/mcpCatalog";
import { compileAgent, emitAllRuntimes, RUNTIME_ADAPTERS, type RuntimeAdapter, type RuntimeArtifact, type RuntimeTargetId } from "@/lib/runtimes";
import { governancePreservedChecks, preservationPassed, validateCompiledAgent } from "@/lib/validate";
import { findRegistryEntry, nextVersion, setRegistryStatus, upsertCompiledVersion } from "@/lib/registry";
import { enforcementProfile, enforcementSummary, ENFORCEMENT_LEGEND } from "@/lib/enforcement";
import { buildGovernanceSummaryHtml } from "@/lib/governanceSummary";
import { ProvenanceBadge, RiskBadge } from "./ProvenanceBadge";

function highlight(str: string): string {
  const escaped = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/: ("(?:[^"\\]|\\.)*")/g, ': <span class="s">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="p">$1</span>');
}

interface Props {
  agent: AgentRecord | null;
  row?: PedigreeRow | null;
  companyContext?: CompanyContext;
  mcpLibrary?: CompanyMcpServer[];
  registry?: AgentRegistryEntry[];
  role?: UserRole;
  currentUserEmail?: string;
  onRegistryChange?: (registry: AgentRegistryEntry[]) => void;
  onAuditEvents?: (events: WorkspaceAuditEvent[]) => void;
  onBack: () => void;
  onSwitchToOrgMap: () => void;
  onToast: (t1: string, t2?: string, green?: boolean) => void;
}

let eventSeq = 0;
function auditEvent(type: WorkspaceAuditEvent["type"], actor: string, summary: string, subjectId: string, details?: Record<string, unknown>): WorkspaceAuditEvent {
  eventSeq += 1;
  return { id: `EVT-${Date.now().toString(36)}-${eventSeq}`, type, actor, timestamp: new Date().toISOString(), summary, subject_id: subjectId, ...(details ? { details } : {}) };
}

const RUNTIME_BRANDS: Record<string, string> = {
  pedigree: "Pedigree",
  hermes: "NousResearch Hermes",
  openclaw: "OpenClaw",
  openai: "OpenAI",
  claude: "Claude",
  generic: "LangGraph",
};

export function ManifestScreen({ agent, row, companyContext, mcpLibrary, registry, role, currentUserEmail, onRegistryChange, onAuditEvents, onBack, onSwitchToOrgMap, onToast }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [enforcementRuntime, setEnforcementRuntime] = useState<RuntimeTargetId>("hermes");
  if (!agent) return null;

  const { person, task, respTitle, respId, policy, riskLevel } = agent;
  const manifest = (agent.manifest ?? {}) as Record<string, any>;
  const json = JSON.stringify(manifest, null, 2);
  const prompt = agent.systemPrompt ?? "";
  const slug = slugify(agent.name);

  const allowed: string[] = manifest.allowed_tasks ?? [];
  const approval: string[] = manifest.human_approval_required ?? [];
  const blocked: string[] = manifest.blocked_tasks ?? [];
  const mcp: McpRecommendation[] = (manifest.recommended_mcp_servers ?? []).map((m: any) => ({
    name: m.name, reason: m.reason, recommended_scope: m.scope, risk_level: "medium",
  }));
  const mcpFallback = mcp.length ? mcp : recommendMcp([respTitle, ...allowed].join(" "), person.tools);
  const tools: { name: string; scope: string }[] = manifest.capabilities?.tools ?? person.tools.map((t) => ({ name: t, scope: "read" }));
  const io = manifest.io_contract ?? { inputs: [], outputs: [], trigger: "human" };
  const lifecycle = manifest.lifecycle ?? { class: agent.lifecycle ?? "standing" };
  const setupGuide = buildDeploymentGuide(manifest);
  const constructionSpec = (manifest.construction_spec ?? {}) as Partial<AgentConstructionSpec>;
  const hermes = buildHermesManifest(agent);
  const hermesJson = JSON.stringify(hermes.manifest, null, 2);
  const workflow = (constructionSpec.workflow_steps ?? manifest.workflow_steps ?? []) as string[];
  const outputs = (constructionSpec.output_artifacts ?? manifest.output_artifacts ?? []) as string[];
  const failures = (constructionSpec.failure_modes ?? manifest.failure_modes ?? []) as string[];
  const testPrompts = (constructionSpec.test_prompts ?? manifest.test_prompts ?? []) as string[];
  // Stage E: validation gates. Hard failures block export; warnings are shown.
  const previewCompiled = compileAgent({ agent, runtime: "pedigree", companyContext, mcpLibrary });
  const validation = validateCompiledAgent(previewCompiled, mcpLibrary ?? []);
  const registryEntry = registry ? findRegistryEntry(registry, previewCompiled.agent_id) : undefined;
  const validationWarnings = Array.from(new Set([...(manifest.validation_warnings ?? []), ...hermes.warnings, ...validation.warnings]));

  // "Governance preserved" pre-export checks (P0-4): visible, and gate the download.
  const preservation = governancePreservedChecks(agent, row ?? undefined);
  const exportOk = validation.ok && preservationPassed(preservation);
  const exportBlockReason = !validation.ok ? validation.failures[0] : preservation.find((c) => c.status === "fail")?.detail;

  // Enforcement reality (P0-2): per-control tags that change with runtime target.
  const enforcement = enforcementProfile(enforcementRuntime);
  const enfSummary = enforcementSummary(enforcement);

  // Provenance + approval (P0-1 / P0-5): an AI-inferred task cannot be approved.
  const taskProvenance = (manifest.task?.provenance ?? agent.task.provenance) as ItemProvenance | undefined;
  const canApprove = role === "reviewer" && (!agent.generatedBy || agent.generatedBy !== currentUserEmail);
  const approveBlockedByProvenance = (taskProvenance?.state ?? "ai_inferred") === "ai_inferred";
  const isApproved = registryEntry?.status === "approved" || registryEntry?.status === "deployed";

  const approveManifest = () => {
    if (!registry || !onRegistryChange || !registryEntry) return;
    onRegistryChange(setRegistryStatus(registry, previewCompiled.agent_id, "approved"));
    onAuditEvents?.([auditEvent("manifest_approved", currentUserEmail ?? "unknown", `Approved manifest for ${agent.name} (v${Math.max(...registryEntry.versions.map((v) => v.version))}).`, previewCompiled.agent_id)]);
    onToast("Manifest approved", `${agent.name} approved by ${currentUserEmail}`, true);
  };

  const downloadZip = async (filename: string, artifacts: RuntimeArtifact[], extra?: { path: string; content: string }[]) => {
    const zip = new JSZip();
    const folder = zip.folder(slug) ?? zip;
    for (const artifact of artifacts) folder.file(artifact.path, artifact.content);
    for (const file of extra ?? []) folder.file(file.path, file.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const guardExport = (): boolean => {
    if (exportOk) return true;
    onToast("Export blocked by validation", exportBlockReason, false);
    return false;
  };

  const validationEvent = () => auditEvent(
    "export_validated",
    currentUserEmail ?? "unknown",
    `Pre-export validation for ${agent.name}: ${preservation.filter((c) => c.status === "pass").length}/${preservation.length} governance checks passed, ${validation.failures.length} failures, ${validation.warnings.length} warnings.`,
    previewCompiled.agent_id,
    { checks: preservation.map((c) => ({ id: c.id, status: c.status })) },
  );

  // Stage D + F: all adapters render from the same CompiledAgent; the full
  // package export also writes the registry entry with a version bump.
  const exportPackage = async () => {
    if (!guardExport()) return;
    const version = registry ? nextVersion(registry, previewCompiled.agent_id) : 1;
    const compiled = compileAgent({ agent, runtime: "pedigree", companyContext, mcpLibrary, version });
    const { artifacts } = emitAllRuntimes(compiled);
    const extras = [
      { path: "SETUP.md", content: setupGuide },
      { path: "GOVERNANCE-SUMMARY.html", content: buildGovernanceSummaryHtml(compiled) },
    ];
    await downloadZip(`${slug}.deployment-package.zip`, artifacts, extras);
    if (registry && onRegistryChange) {
      onRegistryChange(upsertCompiledVersion(registry, compiled, artifacts));
    }
    onAuditEvents?.([
      validationEvent(),
      auditEvent("package_exported", currentUserEmail ?? "unknown", `Exported deployment package for ${agent.name} (registry v${version}, all runtimes).`, previewCompiled.agent_id, { version }),
    ]);
    onToast("Deployment package exported", `${slug}.deployment-package.zip — all runtimes · registry v${version}`, true);
  };

  const exportAgentFormat = async (adapter: RuntimeAdapter) => {
    if (!guardExport()) return;
    const compiled = compileAgent({ agent, runtime: adapter.id, companyContext, mcpLibrary });
    const artifacts = adapter.emit(compiled);
    const warnings = adapter.validate(compiled);
    if (artifacts.length === 1) {
      downloadFile(`${slug}.${adapter.id}.${artifacts[0].path}`, artifacts[0].content, artifacts[0].mime);
    } else {
      await downloadZip(`${slug}.${adapter.id}-package.zip`, artifacts, [
        { path: "SETUP.md", content: setupGuide },
        { path: "GOVERNANCE-SUMMARY.html", content: buildGovernanceSummaryHtml(compiled) },
      ]);
    }
    onAuditEvents?.([
      validationEvent(),
      auditEvent("package_exported", currentUserEmail ?? "unknown", `Exported ${adapter.label} package for ${agent.name}.`, previewCompiled.agent_id, { runtime: adapter.id }),
    ]);
    onToast(
      "Agent format exported",
      warnings.length ? `${adapter.label} downloaded · ${warnings[0].message}` : `${adapter.label} downloaded`,
      true,
    );
  };

  const exportGovernanceSummary = () => {
    const compiled = compileAgent({ agent, runtime: enforcementRuntime, companyContext, mcpLibrary });
    downloadFile(`${slug}.governance-summary.html`, buildGovernanceSummaryHtml(compiled), "text/html");
    onToast("Governance summary exported", "One-page approver summary (print-ready HTML)", true);
  };

  const doCopy = async (text: string, label: string) => {
    if (await copyText(text)) {
      setCopied(label);
      const detail: Record<string, string> = {
        prompt: "System prompt copied to clipboard",
        manifest: "Manifest JSON copied",
        guide: "SETUP.md copied",
        hermes: "Hermes Markdown copied",
      };
      onToast("Copied", detail[label] ?? "Copied to clipboard", true);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div className="manifest-screen">
      {/* LEFT: structured manifest */}
      <div className="manifest-pane">
        <div className="manifest-head">
          <Icon name="robot" size={14} stroke="var(--cyan)" />
          <div className="title">{agent.name}</div>
          <span className="badge generated"><span className="dot" />Agent generated</span>
          <span className="tag" title="Agent lifecycle class">{lifecycle.class === "task" ? "Task agent" : "Standing agent"}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={11} /> Back</button>
          <span className="sub" style={{ marginLeft: 8 }}>{agent.id}</span>
        </div>
        <div className="manifest-body">
          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="users" size={11} style={{ marginRight: 6 }} /> Pedigree
              <span className="right"><span className="tag cyan">{respId}</span></span>
            </div>
            <div className="manifest-card-body">
              <div className="manifest-kv">
                <div className="k">Human Owner</div>
                <div className="v">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, var(--avatar-from), var(--avatar-to))", border: "1px solid var(--border-2)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>{initials(person.name)}</span>
                    <div>
                      <div>{person.name} · <span className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>{person.id}</span></div>
                      <div className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>{person.title} · {person.department}</div>
                    </div>
                  </div>
                </div>
                <div className="k">Parent Responsibility</div>
                <div className="v">{respTitle} <span className="tag cyan" style={{ marginLeft: 6 }}>{respId}</span></div>
                <div className="k">Task</div>
                <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>{task.label} <ProvenanceBadge provenance={taskProvenance} /></div>
                <div className="k">Org Unit</div>
                <div className="v"><span className="mono">{person.department}</span></div>
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head"><Icon name="build" size={11} style={{ marginRight: 6 }} /> Capabilities</div>
            <div className="manifest-card-body">
              <div className="manifest-kv">
                <div className="k">Tools</div>
                <div className="v" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {tools.length ? tools.map((t) => (
                    <BrandChip key={t.name} name={t.name} tone="cyan" suffix={t.scope}>{t.name}</BrandChip>
                  )) : <span className="dim">none listed</span>}
                </div>
                <div className="k">Recommended MCP</div>
                <div className="v" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {mcpFallback.map((m) => (
                    <BrandChip key={m.name} name={m.name} suffix={m.recommended_scope.replace("_", "-")}>{m.name}</BrandChip>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="shield" size={11} style={{ marginRight: 6 }} /> Policy & Guardrails
              <span className="right"><RiskBadge level={riskLevel} /></span>
            </div>
            <div className="manifest-card-body">
              <div className="manifest-kv">
                <div className="k">Policy tier</div>
                <div className="v">{policy}</div>
                <div className="k">Approval from</div>
                <div className="v">{person.name}</div>
                <div className="k">Allowed</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {allowed.map((a) => <div key={a} style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="checkmark" size={11} stroke="var(--green)" /><span style={{ fontSize: 12 }}>{a}</span></div>)}
                </div>
                {approval.length > 0 && <>
                  <div className="k">Approval req.</div>
                  <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {approval.map((a) => <div key={a} style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="warning" size={11} stroke="var(--yellow)" /><span style={{ fontSize: 12 }}>{a}</span></div>)}
                  </div>
                </>}
                <div className="k">Blocked actions</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {blocked.map((a) => <div key={a} style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" size={11} stroke="var(--red)" /><span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{a}</span></div>)}
                </div>
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="branch" size={11} style={{ marginRight: 6 }} /> I/O Contract & Lifecycle
              <span className="right"><span className="tag">{lifecycle.class === "task" ? `task · ${lifecycle.ttl ?? "ttl"}` : "standing"}</span></span>
            </div>
            <div className="manifest-card-body">
              <div className="manifest-kv">
                <div className="k">Inputs</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {io.inputs.length ? io.inputs.map((i: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12 }}>
                      <span className="tag cyan" style={{ marginRight: 6 }}>{i.type}</span>{i.name}
                      <span className="mono" style={{ color: "var(--text-4)", fontSize: 10.5 }}> ← {i.source}{i.required ? "" : " (optional)"}</span>
                    </div>
                  )) : <span className="dim">none</span>}
                </div>
                <div className="k">Outputs</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {io.outputs.length ? io.outputs.map((o: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12 }}>
                      <span className="tag" style={{ marginRight: 6 }}>{o.type}</span>{o.name}
                      <span className="mono" style={{ color: "var(--text-4)", fontSize: 10.5 }}> → {o.destination}</span>
                    </div>
                  )) : <span className="dim">none</span>}
                </div>
                <div className="k">Trigger</div>
                <div className="v"><span className="mono">{io.trigger}</span></div>
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="sparkles" size={11} style={{ marginRight: 6 }} /> Construction Spec
              <span className="right"><span className="tag cyan">{String(constructionSpec.operating_mode ?? manifest.operating_mode ?? "on_demand").replace("_", "-")}</span></span>
            </div>
            <div className="manifest-card-body">
              <div className="manifest-kv">
                <div className="k">Goal</div>
                <div className="v">{constructionSpec.goal ?? manifest.goal ?? manifest.purpose}</div>
                <div className="k">Workflow</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {workflow.length ? workflow.slice(0, 5).map((step, idx) => <div key={idx} style={{ fontSize: 12 }}>{idx + 1}. {step}</div>) : <span className="dim">none</span>}
                </div>
                <div className="k">Outputs</div>
                <div className="v" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {outputs.length ? outputs.map((o) => <span key={o} className="tag">{o}</span>) : <span className="dim">none</span>}
                </div>
                <div className="k">Failure modes</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {failures.length ? failures.slice(0, 4).map((f) => <div key={f} style={{ fontSize: 11.5, color: "var(--text-2)" }}><Icon name="warning" size={10} stroke="var(--yellow)" /> {f}</div>) : <span className="dim">none</span>}
                </div>
                <div className="k">Test prompts</div>
                <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {testPrompts.length ? testPrompts.slice(0, 3).map((t) => <div key={t} style={{ fontSize: 11.5 }}>{t}</div>) : <span className="dim">none</span>}
                </div>
                {validationWarnings.length > 0 && <>
                  <div className="k">Draft warnings</div>
                  <div className="v" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {validationWarnings.slice(0, 4).map((w) => <div key={w} style={{ fontSize: 11.5, color: "var(--yellow)" }}><Icon name="warning" size={10} stroke="var(--yellow)" /> {w}</div>)}
                  </div>
                </>}
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="code" size={11} style={{ marginRight: 6 }} /> manifest.json
              <span className="right">
                <button className="btn btn-sm btn-ghost" onClick={() => doCopy(json, "manifest")}><Icon name="copy" size={11} /> {copied === "manifest" ? "Copied" : "Copy"}</button>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: 4 }} onClick={() => downloadFile(`${slug}.manifest.json`, json, "application/json")}><Icon name="download" size={11} /> Download</button>
              </span>
            </div>
            <div className="manifest-card-body" style={{ padding: 0 }}>
              <pre className="codeblock" style={{ borderRadius: 0, border: 0, margin: 0, maxHeight: 320, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: highlight(json) }} />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: system prompt */}
      <div className="manifest-pane prompt-pane">
        <div className="manifest-head">
          <Icon name="sparkles" size={14} stroke="var(--cyan)" />
          <div className="title">Pedigree Standard System Prompt</div>
          <span className="sub">v1.0</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={() => doCopy(prompt, "prompt")}><Icon name="copy" size={11} /> {copied === "prompt" ? "Copied" : "Copy"}</button>
          <button className="btn btn-sm" onClick={onSwitchToOrgMap}><Icon name="network" size={11} /> Back to Org Map</button>
        </div>
        <div className="manifest-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 12px", background: "var(--cyan-faint)", border: "1px solid var(--border-cyan)", borderRadius: 8, fontSize: 12, color: "var(--text-2)" }}>
            <Icon name="info" size={14} stroke="var(--cyan)" />
            <span>This prompt encodes the pedigree chain: <strong style={{ color: "var(--text-1)" }}>{person.name}</strong> → <strong style={{ color: "var(--text-1)" }}>{respTitle}</strong> → <strong style={{ color: "var(--text-1)" }}>{task.label}</strong>. The agent inherits no broader authority.</span>
          </div>

          <pre className="codeblock" style={{ fontSize: 12.5 }}>{prompt}</pre>

          {/* P0-4: "Governance preserved" — the invariant made a visible step. */}
          <div className="manifest-card" style={{ marginTop: 14 }}>
            <div className="manifest-card-head">
              <Icon name="shield" size={11} style={{ marginRight: 6 }} /> Governance preserved — pre-export checks
              <span className="right">
                <span className={`tag ${exportOk ? "" : "yellow"}`} style={exportOk ? { color: "var(--green)", borderColor: "var(--green)" } : {}}>
                  {preservation.filter((c) => c.status === "pass").length}/{preservation.length} passed
                </span>
              </span>
            </div>
            <div className="manifest-card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {preservation.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5 }}>
                  <Icon
                    name={c.status === "pass" ? "checkmark" : c.status === "fail" ? "close" : "warning"}
                    size={12}
                    stroke={c.status === "pass" ? "var(--green)" : c.status === "fail" ? "var(--red)" : "var(--yellow)"}
                  />
                  <span style={{ color: c.status === "fail" ? "var(--red)" : "var(--text-1)" }}>{c.label}</span>
                  {c.detail && <span style={{ fontSize: 12, color: c.status === "fail" ? "var(--red)" : "var(--text-4)" }}>— {c.detail}</span>}
                </div>
              ))}
              {validation.failures.map((f) => (
                <div key={f} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5 }}>
                  <Icon name="close" size={12} stroke="var(--red)" />
                  <span style={{ color: "var(--red)" }}>{f}</span>
                </div>
              ))}
              {!exportOk && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--red)" }}>
                  Export is blocked until the failed checks above are resolved. The validation result is recorded as an audit event on every export attempt.
                </div>
              )}
            </div>
          </div>

          {/* P0-2: Enforcement reality — which controls are enforced where. */}
          <div className="manifest-card" style={{ marginTop: 12 }}>
            <div className="manifest-card-head">
              <Icon name="lock" size={11} style={{ marginRight: 6 }} /> Enforcement reality
              <span className="right" style={{ display: "flex", gap: 4 }}>
                {RUNTIME_ADAPTERS.map((a) => (
                  <button key={a.id} className={`btn btn-sm ${enforcementRuntime === a.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setEnforcementRuntime(a.id)}>{a.label}</button>
                ))}
              </span>
            </div>
            <div className="manifest-card-body">
              <div style={{ fontSize: 12.5, marginBottom: 8, color: "var(--text-2)" }}>
                <strong style={{ color: "var(--text-1)" }}>{enfSummary.enforceable} of {enfSummary.total}</strong> controls in this manifest are runtime-enforceable on the <span className="mono">{enforcementRuntime}</span> path · {enfSummary.advisory} prompt-advisory · {enfSummary.notYet} not yet enforceable.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {enforcement.map((e) => (
                  <div key={e.control} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5 }}>
                    <span style={{ width: 130, flexShrink: 0 }}>{e.control}</span>
                    <span
                      className="tag"
                      style={{
                        color: e.status === "enforceable" ? "var(--green)" : e.status === "advisory" ? "var(--yellow)" : "var(--text-4)",
                        borderColor: e.status === "enforceable" ? "var(--green)" : e.status === "advisory" ? "var(--yellow)" : "var(--border-2)",
                        flexShrink: 0,
                      }}
                    >{ENFORCEMENT_LEGEND[e.status].label}</span>
                    <span style={{ fontSize: 12, color: "var(--text-4)" }}>{e.note}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-4)", borderTop: "1px solid var(--border-1)", paddingTop: 8 }}>
                {Object.values(ENFORCEMENT_LEGEND).map((l) => (
                  <div key={l.label} style={{ marginTop: 2 }}><strong style={{ color: "var(--text-3)" }}>{l.label}:</strong> {l.description}</div>
                ))}
              </div>
            </div>
          </div>

          {registryEntry && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-3)" }}>
              <Icon name="history" size={11} />
              Registry: v{Math.max(...registryEntry.versions.map((v) => v.version))} · status {registryEntry.status}
              {registryEntry.stale && <span className="tag yellow">stale — ingredients changed, recompile recommended</span>}
              <span style={{ flex: 1 }} />
              {!isApproved && (
                <button
                  className="btn btn-sm btn-outline-cyan"
                  disabled={!canApprove || approveBlockedByProvenance}
                  title={
                    !canApprove
                      ? (role !== "reviewer" ? "Approval requires the Reviewer role" : "An editor cannot approve their own manifest")
                      : approveBlockedByProvenance
                        ? "The anchored task is still AI-inferred — confirm its provenance in the Review inbox first"
                        : "Approve this manifest version"
                  }
                  onClick={approveManifest}
                >
                  <Icon name="checkmark" size={11} /> Approve manifest
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => doCopy(prompt, "prompt")}><Icon name="copy" size={12} /> Copy prompt</button>
            <button className="btn" onClick={() => downloadFile(`${slug}.prompt.txt`, prompt, "text/plain")}><Icon name="download" size={12} /> Export prompt</button>
            <button className="btn" onClick={() => downloadFile(`${slug}.manifest.json`, json, "application/json")}><Icon name="download" size={12} /> Export manifest</button>
            <button className="btn" onClick={() => downloadFile(`${slug}.hermes.md`, hermes.markdown, "text/markdown")}><Icon name="download" size={12} /> Export Hermes Agent</button>
            <button className="btn" onClick={exportGovernanceSummary} title="One-page, print-ready summary for the non-technical approver"><Icon name="doc" size={12} /> Governance Summary</button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={!exportOk} onClick={exportPackage} title={exportOk ? "Export all runtime artifacts and write the registry version" : exportBlockReason}><Icon name="download" size={12} /> Export Deployment Package</button>
          </div>

          {/* Deployment Package (P1.2) */}
          <div className="manifest-card" style={{ marginTop: 16 }}>
            <div className="manifest-card-head">
              <Icon name="build" size={11} style={{ marginRight: 6 }} /> Deployment Package
              <span className="right" style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => doCopy(setupGuide, "guide")}><Icon name="copy" size={11} /> {copied === "guide" ? "Copied" : "Copy SETUP.md"}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowGuide((v) => !v)}><Icon name={showGuide ? "chevron-down" : "chevron-right"} size={11} /> {showGuide ? "Hide" : "Preview"}</button>
              </span>
            </div>
            <div className="manifest-card-body">
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: showGuide ? 12 : 0 }}>
                Everything needed to stand this agent up elsewhere: system prompt, manifest, the documents to load,
                the MCP servers/scopes + data sources to connect, guardrails, and numbered setup steps for OpenAI, Claude, and a generic runtime.
                The <strong style={{ color: "var(--text-1)" }}>Export Deployment Package</strong> button downloads a <span className="mono">.zip</span> with every runtime's artifacts (Pedigree, Hermes <span className="mono">SOUL.md</span> + skills, OpenClaw workspace, OpenAI, Claude, generic) plus <span className="mono">SETUP.md</span> — all rendered from one compiled agent.
              </div>
              {showGuide && (
                <pre className="codeblock" style={{ fontSize: 11.5, maxHeight: 360, overflow: "auto" }}>{setupGuide}</pre>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={onSwitchToOrgMap}><Icon name="checkmark" size={12} /> Done — back to Org Map</button>
          </div>
        </div>
      </div>

      <div className="manifest-format-dock" aria-label="Choose your output format" data-tour="agent-runtime-selector">
        <div className="manifest-format-copy">
          <div className="manifest-format-eyebrow">Choose your output format</div>
          <div className="manifest-format-title">Export this manifest as a runtime-ready agent</div>
        </div>
        <div className="manifest-format-actions">
          {RUNTIME_ADAPTERS.map((adapter) => (
            <button
              key={adapter.id}
              className={`manifest-format-button ${adapter.id === "hermes" ? "primary" : ""}`}
              disabled={!exportOk}
              onClick={() => void exportAgentFormat(adapter)}
              title={exportOk ? adapter.description : exportBlockReason}
            >
              <BrandLogo name={RUNTIME_BRANDS[adapter.id] ?? adapter.label} size={26} />
              <span className="manifest-format-label">{adapter.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
