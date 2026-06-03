export function ExportManifestTourArt() {
  return (
    <div className="onboarding-export-art" aria-hidden>
      <div className="tour-manifest-file">
        <div className="tour-manifest-title">agent-manifest.yaml</div>
        <div className="tour-code-line strong">agent:</div>
        <div className="tour-code-line">name: Renewal Analyst</div>
        <div className="tour-code-line">runtime: pedigree-standard</div>
        <div className="tour-code-line">policy: governed</div>
        <div className="tour-code-line strong">tools:</div>
        <div className="tour-code-line">- crm</div>
        <div className="tour-code-line">- spreadsheet</div>
        <div className="tour-code-line">- search</div>
      </div>
      <div className="tour-runtime-panel">
        <div className="tour-runtime-title">Choose Runtime</div>
        <div className="tour-runtime-grid">
          <div className="tour-runtime-card selected">
            <span className="tour-logo-frame">
              <img src="/brand-logos/nousresearch-hermes.svg" alt="" draggable={false} />
            </span>
            <span>Hermes</span>
          </div>
          <div className="tour-runtime-card active">
            <span className="tour-pedigree-logo">P</span>
            <span>Pedigree</span>
            <small>Standard</small>
          </div>
          <div className="tour-runtime-card">
            <img src="/brand-logos/openai.svg" alt="" draggable={false} />
            <span>OpenAI</span>
          </div>
          <div className="tour-runtime-card">
            <img src="/brand-logos/claude.svg" alt="" draggable={false} />
            <span>Claude</span>
          </div>
          <div className="tour-runtime-card generic">
            <span>◇</span>
            <span>Generic</span>
          </div>
        </div>
      </div>
      <div className="tour-export-options">
        <div><strong>Tools</strong><span>CRM, search, sheets</span></div>
        <div><strong>Approvals</strong><span>Governed release</span></div>
        <div><strong>Delivery</strong><span>Slack and email</span></div>
      </div>
    </div>
  );
}
