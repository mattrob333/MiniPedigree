import { describe, it, expect } from "vitest";
import { addMcpServer, removeMcpServer, resolveMcpGrants, seedLibraryProposals, updateMcpServer } from "../src/lib/mcpLibrary";
import type { CompanyMcpServer, Person, TaskItem } from "../src/types";

const task: TaskItem = {
  id: "R-001-d-0",
  label: "Clean stale forecast records",
  respId: "R-001",
  respTitle: "Forecast hygiene",
  completion: {
    trigger: "weekly",
    inputs: ["Salesforce opportunity export"],
    outputs: ["Cleaned forecast list"],
    tools_mentioned: ["Salesforce"],
    definition_of_done: null,
    readiness: "ready",
    open_questions: null,
    candidate_pattern: "record-hygiene",
  },
};

function makeLibrary(): CompanyMcpServer[] {
  let lib: CompanyMcpServer[] = [];
  lib = addMcpServer(lib, {
    name: "Salesforce",
    approved_scopes: ["read_only", "draft_only"],
    default_scope: "read_only",
    owner_email: "it@x.co",
    systems_matched: ["Salesforce", "CRM"],
  });
  lib = addMcpServer(lib, {
    name: "Slack",
    approved_scopes: ["draft_only"],
    default_scope: "draft_only",
    owner_email: "it@x.co",
    systems_matched: ["Slack"],
  });
  return lib;
}

describe("mcp library CRUD", () => {
  it("adds, updates, and removes servers", () => {
    let lib = makeLibrary();
    expect(lib).toHaveLength(2);
    const sf = lib[0];
    lib = updateMcpServer(lib, sf.id, { notes: "approved by CISO" });
    expect(lib.find((s) => s.id === sf.id)?.notes).toBe("approved by CISO");
    lib = removeMcpServer(lib, sf.id);
    expect(lib).toHaveLength(1);
  });

  it("keeps default_scope inside approved_scopes", () => {
    const lib = addMcpServer([], {
      name: "Looker",
      approved_scopes: ["read_write"],
      default_scope: "read_only",
      owner_email: "it@x.co",
    });
    expect(lib[0].approved_scopes).toContain("read_only");
  });
});

describe("resolveMcpGrants", () => {
  it("resolves grants from the library, tagged source: library", () => {
    const grants = resolveMcpGrants(task, makeLibrary());
    expect(grants.length).toBeGreaterThan(0);
    const sf = grants.find((g) => g.name === "Salesforce");
    expect(sf).toBeDefined();
    expect(sf!.source).toBe("library");
    expect(sf!.scope).toBe("read_only");
  });

  it("grant scope never exceeds approved_scopes and is never wider than default", () => {
    const lib = makeLibrary();
    const grants = resolveMcpGrants(task, lib);
    for (const grant of grants) {
      const server = lib.find((s) => s.id === grant.server_id)!;
      expect(server.approved_scopes).toContain(grant.scope);
      expect(grant.scope).toBe(server.default_scope);
      expect(grant.scope).not.toBe("read_write");
    }
  });

  it("falls back to the static catalog tagged catalog_fallback when the library is empty", () => {
    const grants = resolveMcpGrants(task, [], ["Salesforce"]);
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant.source).toBe("catalog_fallback");
      expect(["read_only", "draft_only"]).toContain(grant.scope);
    }
  });

  it("returns no library grants when nothing matches (does not guess)", () => {
    const lib = addMcpServer([], { name: "Zendesk", owner_email: "it@x.co", systems_matched: ["Zendesk"] });
    const unrelated: TaskItem = { id: "t", label: "Reconcile monthly ledgers", respId: "R", respTitle: "Financial reporting" };
    expect(resolveMcpGrants(unrelated, lib)).toHaveLength(0);
  });
});

describe("seedLibraryProposals", () => {
  const people: Person[] = [{
    id: "P-001", name: "Jane", email: "jane@x.co", title: "Sales Ops", department: "Revenue Ops",
    managerId: null, tools: ["Salesforce"],
  }];

  it("proposes entries from company systems and known tools via the catalog", () => {
    const proposals = seedLibraryProposals({ company: "X", whatWeDo: "", systems: ["Slack", "Looker"] }, people, [], "it@x.co");
    const names = proposals.map((p) => p.draft.name);
    expect(names).toContain("Slack MCP");
    expect(names).toContain("Salesforce MCP");
    for (const p of proposals) {
      expect(["read_only", "draft_only"]).toContain(p.draft.default_scope);
    }
  });

  it("skips servers already in the library", () => {
    const existing = addMcpServer([], { name: "Slack MCP", owner_email: "it@x.co" });
    const proposals = seedLibraryProposals({ company: "X", whatWeDo: "", systems: ["Slack"] }, [], existing, "it@x.co");
    expect(proposals.map((p) => p.draft.name)).not.toContain("Slack MCP");
  });
});
