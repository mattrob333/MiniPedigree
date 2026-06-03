import { useState } from "react";
import { Icon } from "./Icon";
import type { UserProfile } from "@/types";

interface Props {
  onSignIn: (profile: UserProfile) => void;
  existingProfile?: UserProfile | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ onSignIn, existingProfile }: Props) {
  const [email, setEmail] = useState(existingProfile?.email ?? "");
  const [name, setName] = useState(existingProfile?.name ?? "");
  const [company, setCompany] = useState(existingProfile?.company ?? "");
  const [whatWeDo, setWhatWeDo] = useState(existingProfile?.companyContext.whatWeDo ?? "");
  const [showMore, setShowMore] = useState(false);
  const [mission, setMission] = useState(existingProfile?.companyContext.mission ?? "");
  const [initiatives, setInitiatives] = useState(existingProfile?.companyContext.initiatives ?? "");
  const [terminology, setTerminology] = useState(existingProfile?.companyContext.terminology ?? "");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!EMAIL_RE.test(email)) { setErr("Enter a valid email."); return; }
    if (!name.trim()) { setErr("Enter your name."); return; }
    if (!company.trim()) { setErr("Enter your company name."); return; }
    onSignIn({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      company: company.trim(),
      companyContext: {
        company: company.trim(),
        whatWeDo: whatWeDo.trim(),
        mission: mission.trim() || undefined,
        initiatives: initiatives.trim() || undefined,
        terminology: terminology.trim() || undefined,
      },
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="login-split-screen">
      <section className="login-story">
        <div className="login-story-bg" />
        <div className="login-brand-lockup">
          <div className="brand-mark">PD</div>
          <span>Pedigree</span>
          <span className="mono">Discover Lite</span>
        </div>
        <div className="login-story-copy">
          <h1>Map the business before you <span>automate it</span></h1>
          <p>Pedigree turns company context, org ownership, and responsibility mapping into governed AI agents.</p>
        </div>
        <img className="login-hero-art" src="/onboarding/login-hero.png" alt="" draggable={false} />
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="eyebrow"><Icon name="shield" size={12} stroke="var(--cyan)" /> Sign in to Pedigree</div>
          <h2>Welcome to Pedigree</h2>
          <p className="lead">
            Sign in and tell Pedigree about your company once. That business context flows into every
            discovery pass and every agent you generate, so agents are grounded in your business, not just a role.
          </p>

          <div className="form-field">
            <div className="lbl">Work email</div>
            <input className="input" type="email" value={email} placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div className="form-row">
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Your name</div>
              <input className="input" value={name} placeholder="Jane Smith" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <div className="lbl">Company</div>
              <input className="input" value={company} placeholder="Acme Health" onChange={(e) => setCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
          </div>
          <div className="form-field">
            <div className="lbl">What does your company do?</div>
            <textarea className="textarea" rows={3} value={whatWeDo} placeholder="e.g. A multi-site outpatient clinic network handling claims, scheduling, and patient care across 12 locations." onChange={(e) => setWhatWeDo(e.target.value)} style={{ minHeight: 70, fontFamily: "var(--font-sans)" }} />
          </div>

          <button className="btn btn-sm btn-ghost" style={{ marginBottom: 8 }} onClick={() => setShowMore((v) => !v)}>
            <Icon name={showMore ? "chevron-down" : "chevron-right"} size={12} /> {showMore ? "Hide" : "Add"} more business context (optional)
          </button>
          {showMore && (
            <>
              <div className="form-field"><div className="lbl">Mission</div><input className="input" value={mission} onChange={(e) => setMission(e.target.value)} /></div>
              <div className="form-field"><div className="lbl">Key initiatives</div><input className="input" value={initiatives} placeholder="e.g. Reduce claim denials, launch telehealth" onChange={(e) => setInitiatives(e.target.value)} /></div>
              <div className="form-field"><div className="lbl">Internal terms / products</div><input className="input" value={terminology} placeholder="e.g. Epic, Waystar, 'the intake flow'" onChange={(e) => setTerminology(e.target.value)} /></div>
            </>
          )}

          {err && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}><Icon name="warning" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{err}</div>}

          <div className="upload-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={submit}><Icon name="arrow-right" size={12} /> Continue</button>
            <span style={{ flex: 1 }} />
            <span className="mono login-mode-note">Lightweight sign-in - no password</span>
          </div>
        </div>
      </section>
    </div>
  );
}
