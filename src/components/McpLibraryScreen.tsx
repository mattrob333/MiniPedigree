import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { BrandChip } from "./BrandLogo";
import type { CompanyContext, CompanyMcpServer, McpScope, Person } from "@/types";
import { addMcpServer, removeMcpServer, seedLibraryProposals, updateMcpServer, type McpLibraryProposal } from "@/lib/mcpLibrary";

interface Props {
  library: CompanyMcpServer[];
  companyContext?: CompanyContext;
  people: Person[];
  ownerEmail: string;
  onChange: (library: CompanyMcpServer[]) => void;
  onBack: () => void;
  onToast: (t1: string, t2?: string, green?: boolean) => void;
}

const ALL_SCOPES: McpScope[] = ["read_only", "draft_only", "read_write"];

export function McpLibraryScreen({ library, companyContext, people, ownerEmail, onChange, onBack, onToast }: Props) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [systems, setSystems] = useState("");
  const [approvedScopes, setApprovedScopes] = useState<McpScope[]>(["read_only"]);
  const [defaultScope, setDefaultScope] = useState<"read_only" | "draft_only">("read_only");
  const [proposals, setProposals] = useState<McpLibraryProposal[] | null>(null);

  const seedable = useMemo(
    () => seedLibraryProposals(companyContext, people, library, ownerEmail),
    [companyContext, people, library, ownerEmail],
  );

  const toggleScope = (scope: McpScope) =>
    setApprovedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const add = () => {
    if (!name.trim()) return;
    onChange(addMcpServer(library, {
      name,
      endpoint: endpoint || undefined,
      approved_scopes: approvedScopes,
      default_scope: defaultScope,
      owner_email: ownerEmail,
      systems_matched: systems.split(",").map((s) => s.trim()).filter(Boolean),
    }));
    setName(""); setEndpoint(""); setSystems(""); setApprovedScopes(["read_only"]); setDefaultScope("read_only");
    onToast("MCP server registered", `${name} added to the company library`, true);
  };

  const acceptProposal = (proposal: McpLibraryProposal) => {
    onChange(addMcpServer(library, proposal.draft));
    setProposals((prev) => (prev ?? []).filter((p) => p !== proposal));
    onToast("MCP server registered", `${proposal.draft.name} added from proposal`, true);
  };

  return (
    <div className="manifest-screen" style={{ gridTemplateColumns: "1fr" }}>
      <div className="manifest-pane">
        <div className="manifest-head">
          <Icon name="build" size={14} stroke="var(--cyan)" />
          <div className="title">Sources &amp; Tools <span className="dim" style={{ fontSize: 12, fontWeight: 400 }}>(the company MCP library)</span></div>
          <span className="sub">{library.length} approved server{library.length === 1 ? "" : "s"}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={11} /> Back</button>
        </div>
        <div className="manifest-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 12px", background: "var(--cyan-faint)", border: "1px solid var(--border-cyan)", borderRadius: 8, fontSize: 12, color: "var(--text-2)" }}>
            <Icon name="shield" size={14} stroke="var(--cyan)" />
            <span>The library is this company's approved tool surface. Agent MCP grants are resolved from it at compile time — a grant is never wider than the registered default scope, and <strong style={{ color: "var(--text-1)" }}>read_write is never a default</strong>.</span>
          </div>

          <div className="manifest-card">
            <div className="manifest-card-head"><Icon name="plus" size={11} style={{ marginRight: 6 }} /> Register MCP server</div>
            <div className="manifest-card-body">
              <div className="form-row">
                <div className="form-field" style={{ marginBottom: 8 }}>
                  <div className="lbl">Server name</div>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Salesforce" />
                </div>
                <div className="form-field" style={{ marginBottom: 8 }}>
                  <div className="lbl">Endpoint (optional)</div>
                  <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://mcp.example.com/salesforce" />
                </div>
              </div>
              <div className="form-field" style={{ marginBottom: 8 }}>
                <div className="lbl">Systems matched (comma-separated company-context system names)</div>
                <input className="input" value={systems} onChange={(e) => setSystems(e.target.value)} placeholder="Salesforce, CRM" />
              </div>
              <div className="form-row">
                <div className="form-field" style={{ marginBottom: 8 }}>
                  <div className="lbl">Approved scopes</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {ALL_SCOPES.map((scope) => (
                      <button
                        key={scope}
                        className={`btn btn-sm ${approvedScopes.includes(scope) ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => toggleScope(scope)}
                        title={scope === "read_write" ? "read_write can be approved, but is never a default scope" : undefined}
                      >{scope.replace("_", "-")}</button>
                    ))}
                  </div>
                </div>
                <div className="form-field" style={{ marginBottom: 8 }}>
                  <div className="lbl">Default scope (grants use this; never wider)</div>
                  <select className="select" value={defaultScope} onChange={(e) => setDefaultScope(e.target.value as "read_only" | "draft_only")}>
                    <option value="read_only">read-only</option>
                    <option value="draft_only">draft-only</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" disabled={!name.trim()} onClick={add}><Icon name="plus" size={12} /> Add to library</button>
              </div>
            </div>
          </div>

          {seedable.length > 0 && (
            <div className="manifest-card">
              <div className="manifest-card-head">
                <Icon name="sparkles" size={11} style={{ marginRight: 6 }} /> Proposed from company systems & known tools
                <span className="right">
                  <button className="btn btn-sm btn-ghost" onClick={() => setProposals(proposals ? null : seedable)}>
                    <Icon name={proposals ? "chevron-down" : "chevron-right"} size={11} /> {proposals ? "Hide" : `Review ${seedable.length} proposal${seedable.length === 1 ? "" : "s"}`}
                  </button>
                </span>
              </div>
              {proposals && (
                <div className="manifest-card-body">
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 8 }}>Proposals require your confirmation before becoming library entries.</div>
                  {proposals.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i ? "1px solid var(--border-1)" : "none" }}>
                      <BrandChip name={p.draft.name} tone="cyan" suffix={p.draft.default_scope?.replace("_", "-")}>{p.draft.name}</BrandChip>
                      <span style={{ fontSize: 11.5, color: "var(--text-3)", flex: 1 }}>{p.reason}</span>
                      <button className="btn btn-sm btn-primary" onClick={() => acceptProposal(p)}><Icon name="checkmark" size={11} /> Confirm</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="manifest-card">
            <div className="manifest-card-head"><Icon name="lock" size={11} style={{ marginRight: 6 }} /> Approved servers</div>
            <div className="manifest-card-body">
              {library.length === 0 ? (
                <div className="drawer-empty">No MCP servers registered yet. Agents will fall back to the generic catalog (flagged as <span className="mono">catalog_fallback</span>) until the library is populated.</div>
              ) : library.map((server) => (
                <div key={server.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--border-1)" }}>
                  <BrandChip name={server.name} tone="cyan" suffix={server.default_scope.replace("_", "-")}>{server.name}</BrandChip>
                  <span style={{ fontSize: 11, color: "var(--text-4)", flex: 1 }}>
                    scopes: {server.approved_scopes.map((s) => s.replace("_", "-")).join(", ")}
                    {server.systems_matched.length ? ` · systems: ${server.systems_matched.join(", ")}` : ""}
                    {server.owner_email ? ` · approved by ${server.owner_email}` : ""}
                  </span>
                  <select
                    className="select"
                    style={{ width: 120 }}
                    value={server.default_scope}
                    onChange={(e) => onChange(updateMcpServer(library, server.id, { default_scope: e.target.value as "read_only" | "draft_only" }))}
                    title="Default grant scope"
                  >
                    <option value="read_only">read-only</option>
                    <option value="draft_only">draft-only</option>
                  </select>
                  <button className="btn btn-sm btn-ghost" onClick={() => { onChange(removeMcpServer(library, server.id)); onToast("MCP server removed", server.name); }}>
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
