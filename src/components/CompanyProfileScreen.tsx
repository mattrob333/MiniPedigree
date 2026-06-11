import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { BrandChip } from "./BrandLogo";
import type { CompanyContext, CompanyKpi, CompanyResearchSource, Person } from "@/types";
import { parseCompanyProfile } from "@/lib/api";
import { companyContextSchema } from "@/lib/schemas";
import { computeReadiness, READINESS_DIMENSION_LABEL, READINESS_DIMENSION_WHY, READINESS_MAX, readinessTier } from "@/lib/readiness";
import { demoCompanyContext } from "@/lib/demoKit";

interface Props {
  context: CompanyContext;
  people?: Person[];
  onSave: (ctx: CompanyContext) => void;
  onBack: () => void;
}

const PROMPTS = [
  "Talk about your current market, customers, and competitors.",
  "Mention goals, initiatives, bottlenecks, and current operating state.",
  "List software you use: HRIS, CRM, ERP, helpdesk, finance, analytics, and collaboration tools.",
  "Paste SOPs, approval rules, segregation of duties, compliance notes, and anything agents must not do.",
];

function normalizeContext(context: CompanyContext): CompanyContext {
  return companyContextSchema.parse(context) as CompanyContext;
}

function notesFromContext(context: CompanyContext): string {
  if (context.rawNotes?.trim()) return context.rawNotes;
  const lines = [
    context.whatWeDo && `What we do: ${context.whatWeDo}`,
    context.market && `Market: ${context.market}`,
    context.competitors && `Competitors: ${context.competitors}`,
    context.strategicGoals && `Goals: ${context.strategicGoals}`,
    context.initiatives && `Initiatives: ${context.initiatives}`,
    context.bottlenecks && `Bottlenecks: ${context.bottlenecks}`,
    context.systems?.length && `Systems: ${context.systems.join(", ")}`,
    context.terminology && `Terminology: ${context.terminology}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function firstNotesLine(notes: string): string {
  return notes.replace(/\s+/g, " ").trim().slice(0, 260);
}

function listText(items?: string[]): string {
  return (items ?? []).filter(Boolean).join(", ");
}

function saveableProfile(profile: CompanyContext, url: string, notes: string): CompanyContext {
  const now = new Date().toISOString();
  return {
    ...profile,
    company: profile.company.trim() || "Your company",
    url: url.trim() || profile.url,
    rawNotes: notes,
    whatWeDo: profile.whatWeDo?.trim() || firstNotesLine(notes),
    updatedAt: now,
  };
}

export function CompanyProfileScreen({ context, people = [], onSave, onBack }: Props) {
  const initial = useMemo(() => normalizeContext(context), [context]);
  const [url, setUrl] = useState(initial.url ?? "");
  const [notes, setNotes] = useState(notesFromContext(initial));
  const [profile, setProfile] = useState<CompanyContext>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "demo" | "manual" >(initial.researchedAt ? "ai" : "manual");
  const readiness = useMemo(
    () => computeReadiness(profile, profile.contextDocuments ?? [], people),
    [profile, people],
  );

  const filled = [
    profile.whatWeDo,
    profile.market,
    profile.strategicGoals,
    profile.bottlenecks,
    listText(profile.systems),
    listText(profile.approvalRules),
    listText(profile.segregationOfDuties),
    listText(profile.governanceRisks),
    listText(profile.researchSources?.map((s) => s.url)),
  ].filter((v) => v && v.toString().trim()).length;
  const pct = Math.round((filled / 9) * 100);

  const runParse = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await parseCompanyProfile({
        company: profile.company || context.company,
        url,
        notes,
        researchUrl: Boolean(url.trim()),
      });
      setProfile(result.profile);
      setUrl(result.profile.url ?? url);
      setMode(result.source);
      setMessage(result.source === "ai" ? "Profile researched and parsed." : result.reason ?? "Saved a draft profile from your notes.");
    } catch (e) {
      setMessage((e as Error).message || "Company profile parsing failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = () => onSave(saveableProfile(profile, url, notes));

  return (
    <div className="profile-screen">
      <div className="profile-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={12} /> Back</button>
        <div className="profile-id"><span className="cur">Company Context</span></div>
      </div>

      <div className="profile-body">
        <div className="company-profile-layout">
          <section className="company-profile-editor">
            <div className="profile-hero" style={{ marginBottom: 14 }}>
              <div className="avatar-lg" style={{ borderColor: "var(--border-cyan)" }}><Icon name="build" size={24} stroke="var(--cyan)" /></div>
              <div className="who">
                <h1>{profile.company || "Your company"}</h1>
                <div className="meta">URL and raw context in, agent grounding context out</div>
                <div style={{ marginTop: 10 }}>
                  <div className="map-progress" style={{ padding: 0, background: "transparent", border: 0 }}>
                    <div className="lbl"><span>Profile completeness</span><span className="mono">{filled}/9</span></div>
                    <div className="bar" style={{ width: 280 }}><span style={{ width: `${pct}%` }} /></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="profile-section company-loader">
              <div className="form-field">
                <div className="lbl">Company URL</div>
                <input className="input" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} />
              </div>

              <div className="company-prompts">
                {PROMPTS.map((prompt) => (
                  <div className="company-prompt" key={prompt}><Icon name="checkmark" size={11} /> {prompt}</div>
                ))}
              </div>

              <div className="form-field">
                <div className="lbl">Raw company context</div>
                <textarea
                  className="textarea company-notes"
                  rows={13}
                  value={notes}
                  placeholder="Paste notes in any format. Messy is fine."
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {message && (
                <div className={"company-profile-message " + (mode === "ai" ? "ok" : "warn")}>
                  <Icon name={mode === "ai" ? "check-circle" : "info"} size={13} />
                  <span>{message}</span>
                </div>
              )}

              <div className="company-profile-actions">
                <button className="btn" onClick={onBack}>Cancel</button>
                {/* Trust guard: demo context belongs to Lumen Bay. Never let one
                    company's context land in another company's workspace. */}
                {(() => {
                  const activeName = profile.company || context.company || "";
                  const isDemoCompany = /lumen\s*bay/i.test(activeName);
                  return (
                    <button
                      className="btn btn-ghost"
                      disabled={!isDemoCompany}
                      title={isDemoCompany
                        ? "Load the curated Lumen Bay demo context: goals, KPIs, systems, SOPs, approval rules, SOD docs — readiness 16/16"
                        : `Blocked: this demo context belongs to "Lumen Bay", but the active company is "${activeName}". Open the Lumen Bay demo company to use it — mixing client context is never allowed.`}
                      onClick={() => {
                        const demo = demoCompanyContext(activeName);
                        setProfile(demo);
                        setNotes(notesFromContext(demo));
                        setUrl(demo.url ?? "");
                        setMode("manual");
                        setMessage("Demo context loaded (source: Lumen Bay) — goals, KPIs, systems, approval rules, and SOD/policy documents. Save to apply.");
                      }}
                    >
                      <Icon name="play" size={12} /> Insert demo context (Lumen Bay)
                    </button>
                  );
                })()}
                <span style={{ flex: 1 }} />
                <button className="btn btn-outline-cyan" onClick={runParse} disabled={busy || (!url.trim() && !notes.trim())}>
                  <Icon name="sparkles" size={12} /> {busy ? "Researching..." : url.trim() ? "Research + Parse" : "Parse Notes"}
                </button>
                <button className="btn btn-primary" onClick={saveProfile}><Icon name="checkmark" size={12} /> Save Company Context</button>
              </div>
            </div>

            <KpiEditor kpis={profile.kpis ?? []} departments={[...new Set(people.map((p) => p.department).filter((d) => d && d !== "—"))]} onChange={(kpis) => setProfile((p) => ({ ...p, kpis }))} />

            <ReadinessPanel readiness={readiness} />
          </section>

          <CompanyProfilePreview profile={profile} mode={mode} />
        </div>
      </div>
    </div>
  );
}

// ── KPI editor (guided discovery: "who owns the number?" probes) ───────
function KpiEditor({ kpis, departments, onChange }: { kpis: CompanyKpi[]; departments: string[]; onChange: (kpis: CompanyKpi[]) => void }) {
  const [draft, setDraft] = useState<CompanyKpi>({ department: departments[0] ?? "", metric: "", cadence: "" });
  const addKpi = () => {
    if (!draft.metric.trim() || !draft.department.trim()) return;
    onChange([...kpis, { ...draft, metric: draft.metric.trim() }]);
    setDraft({ department: draft.department, metric: "", cadence: "" });
  };
  return (
    <div className="profile-section" style={{ marginTop: 14 }}>
      <div className="ps-head"><Icon name="target" size={13} stroke="var(--cyan)" /> KPIs <span className="tag">{kpis.length}</span>
        <span className="dim" style={{ fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>per-department metrics leadership actually tracks — KPI ownership is responsibility ownership</span>
      </div>
      {kpis.length > 0 && (
        <table className="kpi-table">
          <thead><tr><th>Department</th><th>Metric</th><th>Cadence</th><th /></tr></thead>
          <tbody>
            {kpis.map((kpi, i) => (
              <tr key={`${kpi.department}-${kpi.metric}-${i}`}>
                <td>{kpi.department}</td>
                <td>{kpi.metric}</td>
                <td>{kpi.cadence || "—"}</td>
                <td><button className="btn btn-sm btn-ghost" aria-label={`Remove ${kpi.metric}`} onClick={() => onChange(kpis.filter((_, idx) => idx !== i))}><Icon name="close" size={11} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="kpi-add-row">
        {departments.length ? (
          <select className="select" value={draft.department} onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : (
          <input className="input" placeholder="Department" value={draft.department} onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))} />
        )}
        <input className="input" placeholder='Metric, e.g. "Pipeline coverage"' value={draft.metric} onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addKpi()} />
        <input className="input" placeholder="Cadence (weekly...)" style={{ maxWidth: 140 }} value={draft.cadence} onChange={(e) => setDraft((d) => ({ ...d, cadence: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addKpi()} />
        <button className="btn btn-sm btn-outline-cyan" onClick={addKpi} disabled={!draft.metric.trim() || !draft.department.trim()}>Add KPI</button>
      </div>
    </div>
  );
}

// ── Context readiness: what good context is, operationally ─────────────
export function ReadinessPanel({ readiness, compact }: { readiness: ReturnType<typeof computeReadiness>; compact?: boolean }) {
  const tier = readinessTier(readiness);
  const tierColor = tier === "high" ? "var(--green)" : tier === "medium" ? "var(--yellow)" : "var(--red)";
  const gaps = readiness.dimensions.filter((d) => d.score < 2 && d.gap);
  if (compact) {
    return (
      <div className="readiness-banner" role="status">
        <span className="readiness-score" style={{ color: tierColor }}>Readiness {readiness.overall}/{READINESS_MAX}</span>
        {gaps.length > 0 ? (
          <span className="readiness-gap-hint">
            {tier === "low" ? "Questions will be generic — " : ""}filling {Math.min(gaps.length, 3)} gap{gaps.length === 1 ? "" : "s"} will materially improve extraction: {gaps.slice(0, 3).map((g) => READINESS_DIMENSION_LABEL[g.id]).join(", ")}
          </span>
        ) : (
          <span className="readiness-gap-hint">Context is in great shape — session questions will be specific to this company.</span>
        )}
      </div>
    );
  }
  return (
    <div className="profile-section" style={{ marginTop: 14 }}>
      <div className="ps-head">
        <Icon name="check-circle" size={13} stroke={tierColor} /> Context readiness
        <span className="tag" style={{ color: tierColor, borderColor: tierColor }}>{readiness.overall}/{READINESS_MAX}</span>
        <span className="dim" style={{ fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>discovery quality is the ceiling on everything downstream</span>
      </div>
      <div className="readiness-grid">
        {readiness.dimensions.map((d) => (
          <div className={`readiness-dim s${d.score}`} key={d.id} title={READINESS_DIMENSION_WHY[d.id]}>
            <div className="readiness-dim-head">
              <span className="readiness-dim-label">{READINESS_DIMENSION_LABEL[d.id]}</span>
              <span className="readiness-dots" aria-label={`score ${d.score} of 2`}>
                {[0, 1].map((i) => <span key={i} className={"dot" + (d.score > i ? " on" : "")} />)}
              </span>
            </div>
            {d.gap && <div className="readiness-gap">{d.gap}</div>}
            {d.fix_hint && <div className="readiness-fix"><Icon name="arrow-right" size={10} /> {d.fix_hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyProfilePreview({ profile, mode }: { profile: CompanyContext; mode: "ai" | "demo" | "manual" }) {
  return (
    <aside className="profile-section company-profile-preview">
      <div className="ps-head">
        <Icon name="doc" size={13} stroke="var(--cyan)" />
        Parsed profile
        <span className="tag">{mode}</span>
        {typeof profile.confidence === "number" && <span className="tag cyan">{Math.round(profile.confidence * 100)}%</span>}
      </div>
      <PreviewText label="What the company does" value={profile.whatWeDo} />
      <PreviewText label="Market" value={profile.market} />
      <PreviewText label="Products / services" value={profile.products} />
      <PreviewText label="Competitors" value={profile.competitors} />
      <PreviewText label="Goals / initiatives" value={profile.strategicGoals || profile.initiatives} />
      <PreviewText label="Current state" value={profile.currentState} />
      <PreviewText label="Bottlenecks" value={profile.bottlenecks} />
      <PreviewList label="Systems" values={profile.systems} />
      <PreviewList label="SOPs" values={profile.sops} />
      <PreviewList label="Approval rules" values={profile.approvalRules} />
      <PreviewList label="Segregation of duties" values={profile.segregationOfDuties} />
      <PreviewList label="Risks / compliance" values={[...(profile.complianceNotes ?? []), ...(profile.governanceRisks ?? [])]} />
      <PreviewContextDocs label="Uploaded SOD docs" values={profile.contextDocuments?.filter((doc) => doc.bucket === "segregation_of_duties")} />
      <PreviewContextDocs label="Uploaded policy docs" values={profile.contextDocuments?.filter((doc) => doc.bucket === "policy")} />
      <PreviewContextDocs label="Uploaded knowledge" values={profile.contextDocuments?.filter((doc) => doc.bucket === "knowledge")} />
      <PreviewList label="Unknowns" values={profile.unknowns} />
      <SourceList sources={profile.researchSources} />
    </aside>
  );
}

function PreviewText({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="company-preview-block">
      <div className="lbl">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function PreviewList({ label, values }: { label: string; values?: string[] }) {
  const clean = (values ?? []).filter((v) => v.trim());
  if (!clean.length) return null;
  return (
    <div className="company-preview-block">
      <div className="lbl">{label}</div>
      <div className="company-chip-list">
        {clean.map((value) => <BrandChip name={value} key={value}>{value}</BrandChip>)}
      </div>
    </div>
  );
}

function PreviewContextDocs({ label, values }: { label: string; values?: CompanyContext["contextDocuments"] }) {
  const clean = (values ?? []).filter((doc) => doc.text.trim());
  if (!clean.length) return null;
  return (
    <div className="company-preview-block">
      <div className="lbl">{label}</div>
      <div className="company-chip-list">
        {clean.map((doc) => (
          <span className="brand-chip" key={doc.id}>
            <Icon name="doc" size={12} />
            <span className="brand-chip-label">{doc.title || doc.fileName}</span>
            <span className="brand-chip-suffix">{doc.text.length.toLocaleString()} chars</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources?: CompanyResearchSource[] }) {
  const clean = (sources ?? []).filter((source) => source.url && !source.url.startsWith("connected-context:"));
  if (!clean.length) return null;
  return (
    <div className="company-preview-block">
      <div className="lbl">Sources</div>
      <div className="company-source-list">
        {clean.slice(0, 5).map((source) => {
          const isLocal = source.url === "user-provided-notes" || source.url.startsWith("uploaded-context:");
          const content = (
            <>
              <Icon name={isLocal ? "doc" : "external"} size={11} />
              <span>{source.title || source.url}</span>
            </>
          );
          return isLocal ? (
            <span key={`${source.source_type}-${source.url}`}>{content}</span>
          ) : (
            <a href={source.url} target="_blank" rel="noreferrer" key={`${source.source_type}-${source.url}`}>{content}</a>
          );
        })}
      </div>
    </div>
  );
}
