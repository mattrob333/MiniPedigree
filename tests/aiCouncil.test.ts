import { describe, expect, it } from "vitest";
import type { AiCouncilRequest } from "../src/types";
import {
  newAiCouncilRequestId,
  createAiCouncilRequest,
  submitRequest,
  approveRequest,
  rejectRequest,
  requestMoreInfo,
  filterRequestsByStatus,
  filterRequestsByPriority,
  autoSuggestFields,
} from "../src/lib/aiCouncil";

// ── Helpers ────────────────────────────────────────────────────────────

/** A minimal valid AiCouncilRequest for use in tests that require one. */
function makeDraftRequest(
  overrides: Partial<AiCouncilRequest> = {},
): AiCouncilRequest {
  return createAiCouncilRequest({
    requesterId: "user-1",
    department: "Revenue",
    businessProblem: "Too many manual refund approvals",
    proposedTask: "Auto-approve refunds under $500",
    dataSensitivity: "internal",
    ...overrides,
  });
}

// ── newAiCouncilRequestId ──────────────────────────────────────────────

describe("newAiCouncilRequestId", () => {
  it("generates an ID with the aic-req- prefix", () => {
    const id = newAiCouncilRequestId();
    expect(id).toMatch(/^aic-req-\d+-[a-z0-9]{6}$/);
  });

  it("includes a random suffix for uniqueness", () => {
    const id = newAiCouncilRequestId();
    expect(id).toMatch(/^aic-req-\d+-[a-z0-9]{6}$/);
  });
});

// ── createAiCouncilRequest ─────────────────────────────────────────────

describe("createAiCouncilRequest", () => {
  it("returns a request with all defaults when called with no args", () => {
    const req = createAiCouncilRequest();
    expect(req.status).toBe("draft");
    expect(req.priority).toBe("medium");
    expect(req.systemsTouched).toEqual([]);
    expect(req.approvalRequirements).toEqual([]);
    expect(req.reviewerIds).toEqual([]);
    expect(req.evidenceIds).toEqual([]);
    expect(req.id).toMatch(/^aic-req-\d+-[a-z0-9]{6}$/);
    expect(req.createdAt).toBeTruthy();
    expect(req.updatedAt).toBeTruthy();
    // empty string defaults for required text fields
    expect(req.requesterId).toBe("");
    expect(req.department).toBe("");
    expect(req.businessProblem).toBe("");
    expect(req.proposedTask).toBe("");
    expect(req.dataSensitivity).toBe("internal");
    expect(req.soxRelevant).toBe(false);
  });

  it("merges partial overrides on top of defaults", () => {
    const req = createAiCouncilRequest({
      requesterId: "u-99",
      priority: "high",
    });
    expect(req.requesterId).toBe("u-99");
    expect(req.priority).toBe("high");
    // other defaults still intact
    expect(req.status).toBe("draft");
    expect(req.systemsTouched).toEqual([]);
  });

  it("sets createdAt and updatedAt to the same timestamp on creation", () => {
    const req = createAiCouncilRequest();
    expect(req.createdAt).toBe(req.updatedAt);
  });
});

// ── submitRequest ──────────────────────────────────────────────────────

describe("submitRequest", () => {
  it("changes status to submitted and refreshes updatedAt", () => {
    const draft = makeDraftRequest();
    const submitted = submitRequest(draft);

    expect(submitted.status).toBe("submitted");
    expect(submitted.updatedAt).toBeDefined();
    // unchanged fields
    expect(submitted.requesterId).toBe(draft.requesterId);
  });
});

// ── approveRequest ─────────────────────────────────────────────────────

describe("approveRequest", () => {
  it("sets status to approved and records the decision", () => {
    const draft = makeDraftRequest();
    const { request, evidenceId } = approveRequest(draft, "alice@co.com");

    expect(request.status).toBe("approved");
    expect(request.decision).toBeDefined();
    expect(request.decision!.outcome).toBe("approved");
    expect(request.decision!.by).toBe("alice@co.com");
    expect(request.decision!.at).toBeTruthy();
    expect(request.updatedAt).toBeTruthy();
  });

  it("generates an evidenceId and appends it to evidenceIds", () => {
    const draft = makeDraftRequest({ evidenceIds: ["ev-existing"] });
    const { request, evidenceId } = approveRequest(draft, "bob@co.com");

    expect(evidenceId).toMatch(/^ev-aic-\d+-[a-z0-9]{6}$/);
    expect(request.evidenceIds).toContain(evidenceId);
    expect(request.evidenceIds).toContain("ev-existing"); // previous preserved
    expect(request.evidenceIds).toHaveLength(2);
  });

  it("returns both the mutated request and the evidence id", () => {
    const draft = makeDraftRequest();
    const result = approveRequest(draft, "carol@co.com");

    expect(result).toHaveProperty("request");
    expect(result).toHaveProperty("evidenceId");
    expect(typeof result.evidenceId).toBe("string");
  });
});

// ── rejectRequest ──────────────────────────────────────────────────────

describe("rejectRequest", () => {
  it("sets status to rejected and records the decision", () => {
    const draft = makeDraftRequest();
    const rejected = rejectRequest(draft, "dave@co.com");

    expect(rejected.status).toBe("rejected");
    expect(rejected.decision).toBeDefined();
    expect(rejected.decision!.outcome).toBe("rejected");
    expect(rejected.decision!.by).toBe("dave@co.com");
  });

  it("includes a reason when provided", () => {
    const draft = makeDraftRequest();
    const rejected = rejectRequest(draft, "dave@co.com", "Missing security assessment");

    expect(rejected.decision!.reason).toBe("Missing security assessment");
  });

  it("omits reason when not provided", () => {
    const draft = makeDraftRequest();
    const rejected = rejectRequest(draft, "dave@co.com");

    expect(rejected.decision!.reason).toBeUndefined();
  });
});

// ── requestMoreInfo ────────────────────────────────────────────────────

describe("requestMoreInfo", () => {
  it("sets status to needs_more_info and refreshes updatedAt", () => {
    const draft = makeDraftRequest();
    const moreInfo = requestMoreInfo(draft);

    expect(moreInfo.status).toBe("needs_more_info");
    expect(moreInfo.updatedAt).toBeDefined();
  });
});

// ── filterRequestsByStatus ─────────────────────────────────────────────

describe("filterRequestsByStatus", () => {
  const r1 = makeDraftRequest({ id: "r1", status: "draft" });
  const r2 = makeDraftRequest({ id: "r2", status: "submitted" });
  const r3 = makeDraftRequest({ id: "r3", status: "draft" });
  const r4 = makeDraftRequest({ id: "r4", status: "approved" });
  const all = [r1, r2, r3, r4];

  it("returns only requests with the matching status", () => {
    expect(filterRequestsByStatus(all, "draft")).toHaveLength(2);
    expect(filterRequestsByStatus(all, "submitted")).toHaveLength(1);
    expect(filterRequestsByStatus(all, "rejected")).toHaveLength(0);
  });

  it("preserves the original request objects", () => {
    const filtered = filterRequestsByStatus(all, "draft");
    expect(filtered[0].id).toBe("r1");
    expect(filtered[1].id).toBe("r3");
  });
});

// ── filterRequestsByPriority ───────────────────────────────────────────

describe("filterRequestsByPriority", () => {
  const r1 = makeDraftRequest({ id: "r1", priority: "low" });
  const r2 = makeDraftRequest({ id: "r2", priority: "medium" });
  const r3 = makeDraftRequest({ id: "r3", priority: "high" });
  const r4 = makeDraftRequest({ id: "r4", priority: "medium" });
  const all = [r1, r2, r3, r4];

  it("returns only requests with the matching priority", () => {
    expect(filterRequestsByPriority(all, "medium")).toHaveLength(2);
    expect(filterRequestsByPriority(all, "high")).toHaveLength(1);
    expect(filterRequestsByPriority(all, "urgent")).toHaveLength(0);
  });
});

// ── autoSuggestFields ──────────────────────────────────────────────────

describe("autoSuggestFields", () => {
  it("flags soxRelevant when a system matches a known SOX keyword", () => {
    const req = makeDraftRequest({ systemsTouched: ["Salesforce"] });
    const result = autoSuggestFields(req);
    expect(result.soxRelevant).toBe(true);
  });

  it("does not flag soxRelevant for non-SOX systems", () => {
    const req = makeDraftRequest({ systemsTouched: ["Slack", "Zoom"] });
    const result = autoSuggestFields(req);
    expect(result.soxRelevant).toBeUndefined();
  });

  it("sets riskTier to high for regulated data", () => {
    const req = makeDraftRequest({ dataSensitivity: "regulated" });
    const result = autoSuggestFields(req);
    expect(result.riskTier).toBe("high");
  });

  it("sets riskTier to medium for confidential data", () => {
    const req = makeDraftRequest({ dataSensitivity: "confidential" });
    const result = autoSuggestFields(req);
    expect(result.riskTier).toBe("medium");
  });

  it("does not set riskTier for internal or public data", () => {
    const internal = autoSuggestFields(makeDraftRequest({ dataSensitivity: "internal" }));
    const pub = autoSuggestFields(makeDraftRequest({ dataSensitivity: "public" }));
    expect(internal.riskTier).toBeUndefined();
    expect(pub.riskTier).toBeUndefined();
  });

  it("matches knownSystems passed as additional SOX-relevant names", () => {
    const req = makeDraftRequest({ systemsTouched: ["CustomERP"] });
    // Without knownSystems — no match
    expect(autoSuggestFields(req).soxRelevant).toBeUndefined();
    // With knownSystems — match
    expect(autoSuggestFields(req, ["CustomERP"]).soxRelevant).toBe(true);
  });

  it("combines built-in keywords with knownSystems", () => {
    const req = makeDraftRequest({ systemsTouched: ["SAP", "MyApp"] });
    const result = autoSuggestFields(req, ["MyApp"]);
    expect(result.soxRelevant).toBe(true);
  });

  it("returns an empty object when no heuristics fire", () => {
    const req = makeDraftRequest({
      systemsTouched: ["Fidget Spinner Tracker"],
      dataSensitivity: "public",
    });
    const result = autoSuggestFields(req);
    expect(Object.keys(result)).toHaveLength(0);
  });
});
