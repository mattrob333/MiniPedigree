import { useState } from "react";
import { Icon } from "./Icon";
import type { CompanyContext } from "@/types";

interface Props {
  context: CompanyContext;
  onSave: (ctx: CompanyContext) => void;
  onBack: () => void;
}

const FIELDS: { key: keyof CompanyContext; label: string; placeholder: string; long?: boolean }[] = [
  { key: "company", label: "Company name", placeholder: "Acme Health" },
  { key: "industry", label: "Industry", placeholder: "Outpatient healthcare network" },
  { key: "whatWeDo", label: "What the company does", placeholder: "What you do, for whom, and how — the 30,000-ft view.", long: true },
  { key: "market", label: "Market & customers served", placeholder: "Who you serve, segments, geography." },
  { key: "businessModel", label: "Business model", placeholder: "How the company makes money (e.g. fee-for-service, subscription, payer mix)." },
  { key: "mission", label: "Mission / vision", placeholder: "Why the company exists." },
  { key: "strategicGoals", label: "Strategic goals (CEO priorities)", placeholder: "The top goals/initiatives leadership has laid out this year.", long: true },
  { key: "products", label: "Key products / services", placeholder: "Core offerings the team works on." },
  { key: "competitors", label: "Competitors / positioning", placeholder: "Who you compete with and how you're different." },
  { key: "terminology", label: "Internal terms & systems", placeholder: "Product names, acronyms, systems (Epic, Waystar, 'the intake flow')." },
];

export function CompanyProfileScreen({ context, onSave, onBack }: Props) {
  const [form, setForm] = useState<CompanyContext>({ ...context });
  const set = (k: keyof CompanyContext, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filled = FIELDS.filter((f) => (form[f.key] ?? "").toString().trim()).length;
  const pct = Math.round((filled / FIELDS.length) * 100);

  return (
    <div className="profile-screen">
      <div className="profile-head">
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icon name="chevron-left" size={12} /> Back</button>
        <div className="profile-id"><span className="cur">Company Profile</span></div>
      </div>

      <div className="profile-body">
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="profile-hero" style={{ marginBottom: 14 }}>
            <div className="avatar-lg" style={{ borderColor: "var(--border-cyan)" }}><Icon name="build" size={24} stroke="var(--cyan)" /></div>
            <div className="who">
              <h1>{form.company || "Your company"}</h1>
              <div className="meta">The single source of truth your agents are grounded in</div>
              <div style={{ marginTop: 10 }}>
                <div className="map-progress" style={{ padding: 0, background: "transparent", border: 0 }}>
                  <div className="lbl"><span>Profile completeness</span><span className="mono">{filled}/{FIELDS.length}</span></div>
                  <div className="bar" style={{ width: 280 }}><span style={{ width: `${pct}%` }} /></div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "10px 12px", background: "var(--cyan-faint)", border: "1px solid var(--border-cyan)", borderRadius: 8, fontSize: 12, color: "var(--text-2)", marginBottom: 18, display: "flex", gap: 10 }}>
            <Icon name="info" size={14} stroke="var(--cyan)" />
            <span>This profile is injected into every discovery pass and every agent's prompt + manifest. The more complete it is, the more grounded and valuable the generated agents.</span>
          </div>

          <div className="profile-section">
            {FIELDS.map((f) => (
              <div className="form-field" key={f.key}>
                <div className="lbl">{f.label}</div>
                {f.long ? (
                  <textarea className="textarea" rows={3} value={(form[f.key] as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} style={{ minHeight: 64, fontFamily: "var(--font-sans)" }} />
                ) : (
                  <input className="input" value={(form[f.key] as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn" onClick={onBack}>Cancel</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={() => onSave(form)}><Icon name="checkmark" size={12} /> Save Company Profile</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
