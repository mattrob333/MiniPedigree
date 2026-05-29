import { useState } from "react";
import JSZip from "jszip";
import { Icon } from "./Icon";
import type { AgentRecord, McpRecommendation } from "@/types";
import { copyText, initials } from "@/lib/util";
import { downloadFile } from "@/lib/state";
import { slugify, buildDeploymentGuide } from "@/lib/agent";
import { recommendMcp } from "@/lib/mcpCatalog";

function highlight(str: string): string {
  const escaped = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/: ("(?:[^"\\]|\\.)*")/g, ': <span class="s">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="p">$1</span>');
}

interface Props {
  agent: AgentRecord | null;
  onBack: () => void;
  onSwitchToOrgMap: () => void;
  onToast: (t1: string, t2?: string, green?: boolean) => void;
}

export function ManifestScreen({ agent, onBack, onSwitchToOrgMap, onToast }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
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

  const exportPackage = async () => {
    const zip = new JSZip();
    const folder = zip.folder(slug) ?? zip;
    folder.file("system-prompt.txt", prompt);
    folder.file("manifest.json", json);
    folder.file("SETUP.md", setupGuide);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.deployment-package.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast("Deployment package exported", `${slug}.deployment-package.zip`, true);
  };

  const doCopy = async (text: string, label: string) => {
    if (await copyText(text)) {
      setCopied(label);
      onToast("Copied", label === "prompt" ? "System prompt copied to clipboard" : "Manifest JSON copied", true);
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
                <div className="v">{task.label}</div>
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
                  {tools.length ? tools.map((t) => <span key={t.name} className="tag cyan">{t.name} <span style={{ color: "var(--text-4)" }}>· {t.scope}</span></span>) : <span className="dim">none listed</span>}
                </div>
                <div className="k">Recommended MCP</div>
                <div className="v" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {mcpFallback.map((m) => <span key={m.name} className="tag">{m.name} <span style={{ color: "var(--text-4)" }}>· {m.recommended_scope.replace("_", "-")}</span></span>)}
                </div>
              </div>
            </div>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head">
              <Icon name="shield" size={11} style={{ marginRight: 6 }} /> Policy & Guardrails
              <span className="right"><span className="tag yellow">{riskLevel} risk</span></span>
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

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => doCopy(prompt, "prompt")}><Icon name="copy" size={12} /> Copy prompt</button>
            <button className="btn" onClick={() => downloadFile(`${slug}.prompt.txt`, prompt, "text/plain")}><Icon name="download" size={12} /> Export prompt</button>
            <button className="btn" onClick={() => downloadFile(`${slug}.manifest.json`, json, "application/json")}><Icon name="download" size={12} /> Export manifest</button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={exportPackage}><Icon name="download" size={12} /> Export Deployment Package</button>
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
                The <strong style={{ color: "var(--text-1)" }}>Export Deployment Package</strong> button downloads a <span className="mono">.zip</span> with <span className="mono">system-prompt.txt</span>, <span className="mono">manifest.json</span>, and <span className="mono">SETUP.md</span>.
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
    </div>
  );
}
