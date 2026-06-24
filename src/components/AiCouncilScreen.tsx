import { useState } from "react";
import { Icon } from "./Icon";
import type { AiCouncilRequest } from "@/types";
import { submitRequest } from "@/lib/aiCouncil";
import { demoWescoAiCouncilRequests } from "@/lib/wescoDemoData";
import { AiCouncilQueue } from "./AiCouncilQueue";

interface Props {
  requests?: AiCouncilRequest[];
  onAddRequest?: (request: AiCouncilRequest) => void;
  onUpdateRequest?: (id: string, patch: Partial<AiCouncilRequest>) => void;
}

const PRIORITY_ORDER = ["urgent", "high", "medium", "low"] as const;
const STATUS_SECTIONS = [
  { title: "Submitted", status: "submitted" },
  { title: "Under Review", status: "under_review" },
  { title: "Needs More Info", status: "needs_more_info" },
  { title: "Approved", status: "approved" },
  { title: "Rejected", status: "rejected" },
  { title: "Draft", status: "draft" },
] as const;

export function AiCouncilScreen({
  requests,
  onAddRequest,
  onUpdateRequest,
}: Props) {
  const actualRequests = requests ?? demoWescoAiCouncilRequests();
  const [activeTab, setActiveTab] = useState<"queue" | "new">("queue");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  // Form state
  const [formDept, setFormDept] = useState("");
  const [formProblem, setFormProblem] = useState("");
  const [formTask, setFormTask] = useState("");
  const [formBenefit, setFormBenefit] = useState("");
  const [formSystems, setFormSystems] = useState("");
  const [formSensitivity, setFormSensitivity] = useState("internal");
  const [formSox, setFormSox] = useState(false);
  const [formPriority, setFormPriority] = useState("medium");
  const [formOwner, setFormOwner] = useState("");

  const filtered = actualRequests.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (priorityFilter && r.priority !== priorityFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.businessProblem.toLowerCase().includes(q) ||
        r.proposedTask.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const priorityColor = (p: string): string => {
    switch (p) {
      case "urgent": return "var(--red, #e53e3e)";
      case "high": return "var(--orange, #ed8936)";
      case "medium": return "var(--yellow, #ecc94b)";
      case "low": return "var(--green, #48bb78)";
      default: return "var(--muted, #a0aec0)";
    }
  };

  const handleSubmitForm = () => {
    if (!formProblem.trim() || !formTask.trim()) return;
    const req = {
      id: `aic-req-${Date.now()}`,
      requesterId: formOwner || "anonymous",
      department: formDept || "Unspecified",
      businessProblem: formProblem.trim(),
      proposedTask: formTask.trim(),
      expectedBenefit: formBenefit.trim() || undefined,
      systemsTouched: formSystems.split(",").map((s) => s.trim()).filter(Boolean),
      dataSensitivity: formSensitivity as any,
      soxRelevant: formSox,
      humanOwnerId: formOwner || undefined,
      priority: formPriority as any,
      status: "submitted" as const,
      reviewerIds: [],
      approvalRequirements: [],
      evidenceIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const submitted = submitRequest(req as AiCouncilRequest);
    onAddRequest?.(submitted);
    // Reset form
    setFormDept("");
    setFormProblem("");
    setFormTask("");
    setFormBenefit("");
    setFormSystems("");
    setFormSensitivity("internal");
    setFormSox(false);
    setFormPriority("medium");
    setFormOwner("");
    setActiveTab("queue");
  };

  if (activeTab === "new") {
    return (
      <div className="screen-panel ai-council-screen">
        <div className="panel-header">
          <div className="panel-title-row">
            <h2>
              <Icon name="users" size={16} /> New AI Council Request
            </h2>
            <button className="link-btn" onClick={() => setActiveTab("queue")}>
              ← Back to queue
            </button>
          </div>
        </div>
        <div className="request-form-body">
          <div className="form-grid">
            <div className="form-field">
              <label>Department *</label>
              <input
                type="text"
                placeholder="e.g. Finance, Sales, HR"
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Priority</label>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)}>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="form-field full-width">
              <label>Business Problem *</label>
              <textarea
                placeholder="Describe the business problem this agent would solve..."
                value={formProblem}
                onChange={(e) => setFormProblem(e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-field full-width">
              <label>Proposed Task *</label>
              <textarea
                placeholder="Describe the specific task the agent would perform..."
                value={formTask}
                onChange={(e) => setFormTask(e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-field full-width">
              <label>Expected Benefit</label>
              <textarea
                placeholder="Time savings, error reduction, compliance improvement..."
                value={formBenefit}
                onChange={(e) => setFormBenefit(e.target.value)}
                rows={2}
              />
            </div>
            <div className="form-field">
              <label>Systems Touched</label>
              <input
                type="text"
                placeholder="Comma-separated: Oracle, Salesforce..."
                value={formSystems}
                onChange={(e) => setFormSystems(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Data Sensitivity</label>
              <select value={formSensitivity} onChange={(e) => setFormSensitivity(e.target.value)}>
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="regulated">Regulated</option>
              </select>
            </div>
            <div className="form-field">
              <label>Proposed Human Owner</label>
              <input
                type="text"
                placeholder="Email or person ID"
                value={formOwner}
                onChange={(e) => setFormOwner(e.target.value)}
              />
            </div>
            <div className="form-field checkbox-field">
              <label>
                <input type="checkbox" checked={formSox} onChange={(e) => setFormSox(e.target.checked)} />
                SOX relevant (touches financial systems)
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSubmitForm}
              disabled={!formProblem.trim() || !formTask.trim()}
            >
              Submit for Review
            </button>
            <button className="btn" onClick={() => setActiveTab("queue")}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-panel ai-council-screen">
      <div className="panel-header">
        <div className="panel-title-row">
          <h2>
            <Icon name="users" size={16} /> AI Council
          </h2>
          <span className="count">{filtered.length} requests</span>
          <div className="panel-actions">
            <button className="btn btn-sm btn-primary" onClick={() => setActiveTab("new")}>
              <Icon name="plus" size={12} /> New Request
            </button>
          </div>
        </div>
      </div>

      {/* Status section tabs */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Problem, task, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {STATUS_SECTIONS.map((s) => (
                <option key={s.status} value={s.status}>{s.title}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Priority</label>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All</option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name="users" size={32} stroke="var(--muted, #a0aec0)" />
          <h3>No council requests found</h3>
          {actualRequests.length === 0 ? (
            <>
              <p>The AI Council governs which agents get approved, what systems they can access, and who owns them. Submit a request to start the governance process.</p>
              <p className="empty-hint">Why this matters: The AI Council ensures every agent has accountable human ownership and appropriate system access before deployment.</p>
              <p className="empty-hint">What to do: Click "New Request" above to submit a proposal for a new agent.</p>
            </>
          ) : (
            <>
              <p>No requests match the current filter criteria.</p>
              <button className="link-btn" onClick={() => { setSearch(""); setStatusFilter(""); setPriorityFilter(""); }}>
                Clear all filters
              </button>
            </>
          )}
        </div>
      ) : (
        <AiCouncilQueue
          requests={filtered}
          onUpdateRequest={onUpdateRequest}
          priorityColor={priorityColor}
        />
      )}
    </div>
  );
}
