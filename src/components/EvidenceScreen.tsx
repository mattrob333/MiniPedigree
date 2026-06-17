import { AuditTrail } from "./AuditTrail";
import { Icon } from "./Icon";
import type { AgentBirthCertificate, AgentRecord, ControlManifest, EvidenceArtifact, PedigreeState, Person, RiskFinding, StackAuditRecord, SystemManifest, WorkspaceAuditEvent } from "@/types";
import { buildEvidenceArtifact, inferAgentSystems, isSoxRelevantAgent, renderBirthCertificateMarkdown, renderInventoryCsv } from "@/lib/wescoGovernance";
import { downloadFile } from "@/lib/state";

interface Props {
  people: Person[];
  pedigree: PedigreeState;
  controls: ControlManifest[];
  systems: SystemManifest[];
  birthCertificates: AgentBirthCertificate[];
  findings: RiskFinding[];
  events: WorkspaceAuditEvent[];
  stackAuditLog: StackAuditRecord[];
  workspaceName: string;
  currentUserEmail: string;
  onArtifact: (artifact: EvidenceArtifact) => void;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "evidence";
}

function findingsMarkdown(findings: RiskFinding[]): string {
  if (!findings.length) return "# Risk Findings\n\nNo findings.";
  return [
    "# Risk Findings",
    "",
    ...findings.map((finding) => [
      `## ${finding.title}`,
      "",
      `- Type: ${finding.type}`,
      `- Severity: ${finding.severity}`,
      `- Status: ${finding.status}`,
      "",
      `**What happened:** ${finding.whatHappened}`,
      "",
      `**Why it matters:** ${finding.whyItMatters}`,
      "",
      `**Recommended action:** ${finding.recommendedAction}`,
    ].join("\n")),
  ].join("\n\n");
}

function lifecycleMarkdown(people: Person[], findings: RiskFinding[]): string {
  const inactive = people.filter((person) => person.lifecycle === "offboarded" || person.lifecycle === "transitioning");
  return [
    "# Lifecycle Review",
    "",
    `Inactive or transitioning people: ${inactive.length}`,
    "",
    inactive.length ? inactive.map((person) => `- ${person.name} (${person.lifecycle})`).join("\n") : "- None",
    "",
    "## Related Findings",
    findings.filter((finding) => finding.type === "owner_inactive" || finding.type === "owner_missing").map((finding) => `- ${finding.title}: ${finding.recommendedAction}`).join("\n") || "- None",
  ].join("\n");
}

function filterPedigreeAgents(pedigree: PedigreeState, keep: (agent: AgentRecord) => boolean): PedigreeState {
  return Object.fromEntries(
    Object.entries(pedigree).map(([personId, row]) => [personId, { ...row, agents: row.agents.filter(keep) }]),
  );
}

export function EvidenceScreen({ people, pedigree, controls, systems, birthCertificates, findings, events, stackAuditLog, workspaceName, currentUserEmail, onArtifact }: Props) {
  const createAndDownload = (artifact: EvidenceArtifact) => {
    onArtifact(artifact);
    const ext = artifact.format === "markdown" ? "md" : artifact.format;
    const mime = artifact.format === "json" ? "application/json" : artifact.format === "csv" ? "text/csv" : "text/markdown";
    downloadFile(`${slug(workspaceName)}-${slug(artifact.title)}.${ext}`, artifact.content, mime);
  };

  const exportInventory = (type: EvidenceArtifact["type"], title: string, filter?: "sox" | "oracle") => {
    const filteredPedigree = filter === "sox"
      ? filterPedigreeAgents(pedigree, (agent) => isSoxRelevantAgent(agent, controls, systems))
      : filter === "oracle"
        ? filterPedigreeAgents(pedigree, (agent) => inferAgentSystems(agent, systems).some((system) => /oracle/i.test(system)))
        : pedigree;
    const csv = renderInventoryCsv({ people, pedigree: filteredPedigree, controls, systems, birthCertificates });
    createAndDownload(buildEvidenceArtifact({ type, title, generatedBy: currentUserEmail, content: csv, format: "csv" }));
  };

  const exportBirthCertificates = () => {
    const content = birthCertificates.length
      ? birthCertificates.map((cert) => renderBirthCertificateMarkdown(cert, controls, systems)).join("\n\n---\n\n")
      : "# Agent Birth Certificates\n\nNo Birth Certificates recorded yet.";
    createAndDownload(buildEvidenceArtifact({ type: "birth_certificate", title: "Birth Certificate packet", generatedBy: currentUserEmail, content }));
  };

  const exportFindings = () => {
    createAndDownload(buildEvidenceArtifact({ type: "risk_findings", title: "Risk findings", generatedBy: currentUserEmail, content: findingsMarkdown(findings) }));
  };

  const exportLifecycle = () => {
    createAndDownload(buildEvidenceArtifact({ type: "lifecycle_review", title: "Lifecycle review", generatedBy: currentUserEmail, content: lifecycleMarkdown(people, findings) }));
  };

  return (
    <div className="evidence-screen">
      <section className="sheet-wrap evidence-panel">
        <div className="governance-head">
          <div>
            <div className="eyebrow"><Icon name="history" size={12} /> Evidence Ledger</div>
            <h2>Evidence</h2>
            <p>Export audit-ready populations and creation records. Every package is generated from the current workspace state and logged in the evidence artifact list.</p>
          </div>
        </div>
        <div className="evidence-grid">
          <button className="manifest-card evidence-export-card" onClick={() => exportInventory("agent_inventory", "Full agent inventory")}>
            <Icon name="robot" size={14} /><strong>Full inventory</strong><span>All registered agents, owners, systems, controls, SOX flag, and Birth Certificate status.</span>
          </button>
          <button className="manifest-card evidence-export-card" onClick={() => exportInventory("sox_population", "SOX agent population", "sox")}>
            <Icon name="shield" size={14} /><strong>SOX population</strong><span>Population report for SOX-relevant agents.</span>
          </button>
          <button className="manifest-card evidence-export-card" onClick={() => exportInventory("system_population", "Oracle system population", "oracle")}>
            <Icon name="build" size={14} /><strong>Oracle population</strong><span>Agents touching Oracle-style in-scope systems.</span>
          </button>
          <button className="manifest-card evidence-export-card" onClick={exportBirthCertificates}>
            <Icon name="doc" size={14} /><strong>Birth Certificates</strong><span>Approved creation records with ownership, scope, controls, and evidence obligations.</span>
          </button>
          <button className="manifest-card evidence-export-card" onClick={exportFindings}>
            <Icon name="warning" size={14} /><strong>Risk findings</strong><span>Explainable findings with what happened, why it matters, and next action.</span>
          </button>
          <button className="manifest-card evidence-export-card" onClick={exportLifecycle}>
            <Icon name="users" size={14} /><strong>Lifecycle review</strong><span>Inactive owners and orphan/inactive-owner findings.</span>
          </button>
        </div>
      </section>

      <AuditTrail events={events} stackAuditLog={stackAuditLog} workspaceName={workspaceName} />
    </div>
  );
}
