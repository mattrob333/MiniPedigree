import { describe, expect, it } from "vitest";
import type { Workspace } from "../src/types";
import { assertContextMatchesCompany, safeHeaderDescription, sanitizeWorkspaceContext } from "../src/lib/contextGuard";

const baseWorkspace: Workspace = {
  id: "northstar-123",
  name: "Northstar SaaS",
  people: [],
  pedigree: {},
  createdAt: "2026-06-12T00:00:00.000Z",
};

describe("contextGuard", () => {
  it("throws when saving a mismatched company id", () => {
    expect(() =>
      assertContextMatchesCompany(
        { companyId: "lumen-bay-456", company: "Lumen Bay", whatWeDo: "Lumen Bay builds analytics." },
        baseWorkspace.id,
        baseWorkspace.name,
      ),
    ).toThrow(/does not match active company/);
  });

  it("quarantines a legacy leaked context and returns an empty context for the active workspace", () => {
    const sanitized = sanitizeWorkspaceContext({
      ...baseWorkspace,
      companyContext: { company: "Lumen Bay", whatWeDo: "Lumen Bay builds analytics." },
    });

    expect(sanitized.companyContext?.companyId).toBe(baseWorkspace.id);
    expect(sanitized.companyContext?.company).toBe(baseWorkspace.name);
    expect(sanitized.companyContext?.whatWeDo).toBe("");
    expect(sanitized.quarantinedContext?.company).toBe("Lumen Bay");
    expect(sanitized.contextWarning).toContain("removed from this company");
  });

  it("passes through and binds matching legacy context", () => {
    const sanitized = sanitizeWorkspaceContext({
      ...baseWorkspace,
      companyContext: { company: "Northstar SaaS", whatWeDo: "Revenue ops software." },
    });

    expect(sanitized.companyContext?.companyId).toBe(baseWorkspace.id);
    expect(sanitized.companyContext?.whatWeDo).toBe("Revenue ops software.");
    expect(sanitized.quarantinedContext).toBeUndefined();
  });

  it("does not surface quarantined or mismatched descriptions in the header", () => {
    expect(
      safeHeaderDescription(
        { companyId: "lumen-bay-456", company: "Lumen Bay", whatWeDo: "Leaked context." },
        baseWorkspace.id,
        baseWorkspace.name,
      ),
    ).toBe("");
  });
});
