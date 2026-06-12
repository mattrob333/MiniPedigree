import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { BrandChip } from "../BrandLogo";
import type { AgentLifecycleClass, RiskLevel } from "@/types";
import type { CreateAgentCtx } from "../Drawer";
import { suggestedAgentName } from "@/lib/parse";
import { deriveOperationalState, missingBirthCertificateFields } from "@/lib/taskState";

export interface GenerateCtx extends CreateAgentCtx {
  agentName: string;
  policy: string;
  riskLevel: RiskLevel;
  lifecycleClass: AgentLifecycleClass;
  aiAuthored: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ctx: CreateAgentCtx | null;
  onGenerate: (ctx: GenerateCtx) => void;
}

export function CreateAgentModal({ open, onClose, ctx, onGenerate }: Props) {
  const suggested = ctx ? suggestedAgentName(ctx.task.label) : "";
  const [agentName, setAgentName] = useState(suggested);
  const [policy, setPolicy] = useState("auto-write-with-approval");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [lifecycleClass, setLifecycleClass] = useState<AgentLifecycleClass>("standing");
  const [aiAuthored, setAiAuthored] = useState(true);

  useEffect(() => {
    if (ctx) setAgentName(suggestedAgentName(ctx.task.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.task.id]);

  if (!open || !ctx) return null;
  const operationalState = deriveOperationalState(ctx.task);
  const missing = missingBirthCertificateFields(ctx.task);
  const ready = operationalState === "agent_ready";

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="h">
            <h3><Icon name="robot" size={16} stroke="var(--cyan)" /> Create Agent</h3>
            <div className="sub">An agent is born from a human owner, a responsibility, a task, and a reviewed workflow.</div>
          </div>
          <button className="close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div className="form-readout">
              <div><div className="k">Human Owner</div><div style={{ marginTop: 4 }}>{ctx.person.name}</div></div>
              <Icon name="user" size={14} stroke="var(--text-4)" />
            </div>
            <div className="form-readout">
              <div><div className="k">Parent Responsibility</div><div style={{ marginTop: 4 }}>{ctx.respTitle}</div></div>
              <Icon name="branch" size={14} stroke="var(--text-4)" />
            </div>
            <div className="form-readout" style={{ gridColumn: "1 / -1" }}>
              <div><div className="k">Selected Task</div><div style={{ marginTop: 4 }}>{ctx.task.label}</div></div>
              <span className="tag cyan">{ctx.task.respId}</span>
            </div>
          </div>

          {!ready && (
            <div className="manifest-card" style={{ border: "1px solid var(--yellow)", marginBottom: 14 }}>
              <div className="manifest-card-body">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Workflow incomplete</div>
                <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>
                  Pedigree found a delegation candidate, but this task does not yet have the full birth certificate required to generate an agent.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {missing.map((field) => <span className="tag yellow" key={field}>{field}</span>)}
                </div>
              </div>
            </div>
          )}

          <div className="manifest-card" style={{ marginBottom: 14 }}>
            <div className="manifest-card-body">
              <div className="k" style={{ marginBottom: 4 }}>What this agent will do</div>
              <div style={{ color: "var(--text-2)", fontSize: 13.5 }}>
                {ready
                  ? `${ctx.task.label} for ${ctx.person.name} under ${ctx.respTitle}.`
                  : "Complete the workflow spec first: input sources, required tools, output format, definition of done, approval boundary, evidence, and a test case."}
              </div>
              {ctx.task.missingSpecFields?.length ? (
                <div className="hint" style={{ marginTop: 8 }}>Missing: {ctx.task.missingSpecFields.join(", ")}</div>
              ) : null}
            </div>
          </div>

          <div className="form-field">
            <div className="lbl">Suggested Agent Name</div>
            <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Operating mode</div>
              <select className="select" value={policy} onChange={(e) => setPolicy(e.target.value)}>
                <option value="read-only">Read-only — surface findings, no writes</option>
                <option value="auto-write-with-approval">Auto-write with human approval</option>
                <option value="auto-write">Auto-write (low-risk only)</option>
              </select>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Risk tier</div>
              <select className="select" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
                <option value="low">Low — reversible, scoped</option>
                <option value="medium">Medium — material impact</option>
                <option value="high">High — financial / external comms</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <div className="lbl">Agent lifecycle</div>
            <select className="select" value={lifecycleClass} onChange={(e) => setLifecycleClass(e.target.value as AgentLifecycleClass)}>
              <option value="standing">Standing — persistent, tied to a recurring responsibility</option>
              <option value="task">Task — one-off, torn down on completion (audit log retained)</option>
            </select>
            <div className="hint" style={{ fontSize: 11, color: "var(--text-4)" }}>
              <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Both inherit {ctx.person.name}'s authority ceiling. Task agents are ephemeral but still governed and audited.
            </div>
          </div>

          <div className="form-field">
            <div className="lbl">Construction method</div>
            <div className="view-toggle" style={{ width: "100%" }}>
              <button style={{ flex: 1 }} data-active={aiAuthored} onClick={() => setAiAuthored(true)}>AI construction (GPT-5.5)</button>
              <button style={{ flex: 1 }} data-active={!aiAuthored} onClick={() => setAiAuthored(false)}>Standard template</button>
            </div>
            <div className="hint" style={{ fontSize: 11, color: "var(--text-4)" }}>
              <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              {aiAuthored
                ? "GPT-5.5 designs the governed construction spec: workflow, tools, approvals, audit, failure modes, and test prompts. Guardrails are never weakened."
                : "Instant, deterministic Pedigree Standard construction spec (no AI call)."}
            </div>
          </div>

          <div className="form-field">
            <div className="lbl">Tool access (derived from {ctx.person.name}'s known tools)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {ctx.person.tools.length ? ctx.person.tools.map((t) => <BrandChip key={t} name={t} tone="cyan">{t}</BrandChip>) : <span className="dim" style={{ fontSize: 12 }}>No tools listed in CSV</span>}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="left"><Icon name="shield" size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> Pedigree manifest, system prompt, construction spec, test pack, and evidence packet are required.</span>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!ready} title={!ready ? `Workflow incomplete: ${missing.join(", ")}` : undefined} onClick={() => onGenerate({ ...ctx, agentName, policy, riskLevel, lifecycleClass, aiAuthored })}>
              <Icon name="sparkles" size={12} /> Generate Agent Manifest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
