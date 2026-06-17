import { useState } from "react";
import { Icon } from "./Icon";
import { RiskBadge } from "./ProvenanceBadge";
import type { AiRequestStatus, AiUseCaseRequest, Person, RiskLevel, SystemManifest } from "@/types";
import { transitionAiRequest } from "@/lib/wescoGovernance";

interface Props {
  requests: AiUseCaseRequest[];
  people: Person[];
  systems: SystemManifest[];
  currentUserEmail: string;
  onChange: (requests: AiUseCaseRequest[]) => void;
  onCreateWorkUnit: (request: AiUseCaseRequest) => void;
  onToast: (title: string, detail?: string, green?: boolean) => void;
}

const STATUS_LABEL: Record<AiRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  needs_info: "Needs info",
  in_review: "In review",
  approved_for_design: "Approved for design",
  rejected: "Rejected",
  converted_to_agent: "Converted",
};

function nextId(): string {
  return `REQ-${Date.now().toString(36)}`;
}

export function RequestsScreen({ requests, people, systems, currentUserEmail, onChange, onCreateWorkUnit, onToast }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(people[0]?.id ?? "");
  const [purpose, setPurpose] = useState("");
  const [workUnit, setWorkUnit] = useState("");
  const [systemName, setSystemName] = useState(systems[0]?.name ?? "");
  const [riskTier, setRiskTier] = useState<RiskLevel>("medium");
  const [soxRelevant, setSoxRelevant] = useState(false);

  const createRequest = () => {
    const owner = people.find((person) => person.id === ownerId);
    if (!title.trim() || !purpose.trim() || !workUnit.trim()) {
      onToast("Request incomplete", "Add a title, purpose, and work unit before saving.");
      return;
    }
    const stamped = new Date().toISOString();
    const request: AiUseCaseRequest = {
      id: nextId(),
      title: title.trim(),
      requesterEmail: currentUserEmail,
      businessOwnerPersonId: owner?.id,
      department: owner?.department ?? "",
      purpose: purpose.trim(),
      workUnit: workUnit.trim(),
      systems: systemName ? [systemName] : [],
      dataSensitivity: soxRelevant ? "regulated" : "internal",
      soxRelevant,
      riskTier,
      status: "draft",
      decisionHistory: [{ status: "draft", by: currentUserEmail, at: stamped, note: "Request drafted in Pedigree." }],
      createdAt: stamped,
      updatedAt: stamped,
    };
    onChange([request, ...requests]);
    setTitle("");
    setPurpose("");
    setWorkUnit("");
    setShowForm(false);
    onToast("Request created", request.title, true);
  };

  const move = (request: AiUseCaseRequest, status: AiRequestStatus, note?: string) => {
    try {
      const updated = transitionAiRequest(request, status, currentUserEmail, note);
      onChange(requests.map((item) => (item.id === request.id ? updated : item)));
      onToast("Request updated", `${request.title} -> ${STATUS_LABEL[status]}`, true);
    } catch (error) {
      onToast("Transition blocked", (error as Error).message);
    }
  };

  const counts = {
    pending: requests.filter((request) => ["submitted", "needs_info", "in_review"].includes(request.status)).length,
    high: requests.filter((request) => request.riskTier === "high" || request.riskTier === "critical").length,
    sox: requests.filter((request) => request.soxRelevant).length,
    approved: requests.filter((request) => request.status === "approved_for_design").length,
  };

  return (
    <div className="sheet-wrap governance-screen">
      <div className="governance-head">
        <div>
          <div className="eyebrow"><Icon name="target" size={12} /> AI Council Intake</div>
          <h2>Requests</h2>
          <p>Describe the work AI should help with. Pedigree classifies risk, links owners and systems, and routes the request for review before agent design.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((open) => !open)}><Icon name="sparkles" size={12} /> Create AI Use Case Request</button>
      </div>

      <div className="governance-stats">
        <div><b>{requests.length}</b><span>Total requests</span></div>
        <div><b>{counts.pending}</b><span>Pending review</span></div>
        <div><b>{counts.high}</b><span>High risk</span></div>
        <div><b>{counts.sox}</b><span>SOX relevant</span></div>
        <div><b>{counts.approved}</b><span>Ready to design</span></div>
      </div>

      {showForm && (
        <section className="manifest-card request-form">
          <div className="manifest-card-head"><Icon name="doc" size={11} /> New request</div>
          <div className="governance-form-grid">
            <label><span className="lbl">Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oracle billing exception helper" /></label>
            <label><span className="lbl">Business owner</span><select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.department}</option>)}</select></label>
            <label><span className="lbl">Primary system</span><select className="select" value={systemName} onChange={(e) => setSystemName(e.target.value)}>{systems.map((system) => <option key={system.id} value={system.name}>{system.name}{system.soxInScope ? " (SOX)" : ""}</option>)}</select></label>
            <label><span className="lbl">Risk tier</span><select className="select" value={riskTier} onChange={(e) => setRiskTier(e.target.value as RiskLevel)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label className="wide"><span className="lbl">Purpose</span><textarea className="textarea" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What outcome should this AI worker support?" /></label>
            <label className="wide"><span className="lbl">Work unit</span><input className="input" value={workUnit} onChange={(e) => setWorkUnit(e.target.value)} placeholder="Specific task or recurring work to delegate" /></label>
            <label className="check-row"><input type="checkbox" checked={soxRelevant} onChange={(e) => setSoxRelevant(e.target.checked)} /> Touches SOX, financial reporting, controlled data, or an in-scope system</label>
          </div>
          <div className="actions"><button className="btn btn-primary" onClick={createRequest}>Save request</button><button className="btn" onClick={() => setShowForm(false)}>Cancel</button></div>
        </section>
      )}

      {!requests.length ? (
        <div className="empty-state">
          <h3>No AI requests yet.</h3>
          <p>Start by describing a work process where AI could help. Pedigree will classify risk and route it for review.</p>
        </div>
      ) : (
        <div className="request-grid">
          {requests.map((request) => {
            const owner = people.find((person) => person.id === request.businessOwnerPersonId);
            return (
              <article className="manifest-card request-card" key={request.id}>
                <div className="manifest-card-head">
                  <Icon name={request.soxRelevant ? "shield" : "doc"} size={11} /> {request.title}
                  <span className="right"><span className="tag cyan">{STATUS_LABEL[request.status]}</span></span>
                </div>
                <div className="manifest-card-body">
                  <div className="request-meta"><span>Owner: <strong>{owner?.name ?? "Unassigned"}</strong></span><span>{request.department || owner?.department}</span><RiskBadge level={request.riskTier} />{request.soxRelevant && <span className="tag yellow">SOX review</span>}</div>
                  <p>{request.purpose}</p>
                  <div className="request-work-unit"><span className="k">Work unit</span><span>{request.workUnit}</span></div>
                  <div className="chip-row">{request.systems.map((system) => <span className="tag" key={system}>{system}</span>)}</div>
                  {request.councilNotes && <blockquote>{request.councilNotes}</blockquote>}
                  <div className="request-actions">
                    {request.status === "draft" && <button className="btn btn-sm" onClick={() => move(request, "submitted")}>Submit</button>}
                    {request.status === "submitted" && <button className="btn btn-sm" onClick={() => move(request, "in_review")}>Start review</button>}
                    {["submitted", "in_review"].includes(request.status) && <button className="btn btn-sm" onClick={() => move(request, "needs_info", "More detail needed before approval.")}>Needs info</button>}
                    {request.status === "needs_info" && <button className="btn btn-sm" onClick={() => move(request, "in_review", "Information received.")}>Resume review</button>}
                    {request.status === "in_review" && <button className="btn btn-sm btn-outline-cyan" onClick={() => move(request, "approved_for_design", "Approved for draft agent design.")}>Approve for design</button>}
                    {request.status === "approved_for_design" && <button className="btn btn-sm btn-primary" onClick={() => onCreateWorkUnit(request)}><Icon name="robot" size={11} /> Create work unit</button>}
                    {request.status !== "rejected" && request.status !== "converted_to_agent" && <button className="btn btn-sm btn-ghost" onClick={() => move(request, "rejected", "Rejected by AI Council.")}>Reject</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
