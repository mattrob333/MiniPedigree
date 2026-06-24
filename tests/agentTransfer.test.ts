import { describe, expect, it } from "vitest";
import type { AgentRegistryEntry, Person } from "../src/types";
import {
  compareTransferAuthority,
  executeTransfer,
  findReassignmentCandidates,
} from "../src/lib/agentTransfer";

// ── Helpers ─────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> & { id: string; name: string; email: string; department: string }): Person {
  return {
    id: overrides.id,
    name: overrides.name,
    email: overrides.email,
    title: overrides.title ?? "Engineer",
    managerId: overrides.managerId ?? null,
    department: overrides.department,
    tools: overrides.tools ?? [],
    authority: overrides.authority,
    lifecycle: overrides.lifecycle,
  };
}

function makeRegistryEntry(overrides?: Partial<AgentRegistryEntry>): AgentRegistryEntry {
  return {
    agent_id: overrides?.agent_id ?? "agent-001",
    owner_person_id: overrides?.owner_person_id ?? "owner-old",
    task_id: overrides?.task_id ?? "task-001",
    resp_id: overrides?.resp_id ?? "resp-001",
    runtime: overrides?.runtime ?? "hermes",
    status: overrides?.status ?? "deployed",
    stale: overrides?.stale ?? false,
    ingredient_hashes: overrides?.ingredient_hashes ?? {},
    versions: overrides?.versions ?? [],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("compareTransferAuthority", () => {
  it("detects reduced authority when new owner has fewer grants", () => {
    const oldOwner = makePerson({
      id: "owner-old",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          { system: "Slack", scope: "admin", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const newOwner = makePerson({
      id: "owner-new",
      name: "Bob",
      email: "bob@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          // Slack is missing entirely
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const result = compareTransferAuthority(
      { owner_person_id: "owner-old" },
      oldOwner,
      newOwner,
    );

    expect(result.authorityChange).toBe("reduced");
    expect(result.requiresApproval).toBe(false);
    expect(result.systemMismatches.length).toBe(2);

    // Slack dropped entirely
    const slackMismatch = result.systemMismatches.find((m) => m.system === "Slack");
    expect(slackMismatch).toBeDefined();
    expect(slackMismatch!.oldScope).toBe("admin");
    expect(slackMismatch!.newScope).toBe("none");

    // Salesforce scope down
    const sfMismatch = result.systemMismatches.find((m) => m.system === "Salesforce");
    expect(sfMismatch).toBeDefined();
    expect(sfMismatch!.oldScope).toBe("read_write");
    expect(sfMismatch!.newScope).toBe("read_only");
  });

  it("detects expanded authority and requires approval", () => {
    const oldOwner = makePerson({
      id: "owner-old",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const newOwner = makePerson({
      id: "owner-new",
      name: "Bob",
      email: "bob@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          { system: "NetSuite", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const result = compareTransferAuthority(
      { owner_person_id: "owner-old" },
      oldOwner,
      newOwner,
    );

    expect(result.authorityChange).toBe("expanded");
    expect(result.requiresApproval).toBe(true);
    // Salesforce scope up + NetSuite newly present
    expect(result.systemMismatches.length).toBe(2);

    const sfMismatch = result.systemMismatches.find((m) => m.system === "Salesforce");
    expect(sfMismatch).toBeDefined();
    expect(sfMismatch!.oldScope).toBe("read_only");
    expect(sfMismatch!.newScope).toBe("read_write");

    const nsMismatch = result.systemMismatches.find((m) => m.system === "NetSuite");
    expect(nsMismatch).toBeDefined();
    expect(nsMismatch!.oldScope).toBe("none");
    expect(nsMismatch!.newScope).toBe("read_only");
  });

  it("returns 'none' when both owners have identical grants", () => {
    const oldOwner = makePerson({
      id: "owner-old",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const newOwner = makePerson({
      id: "owner-new",
      name: "Charlie",
      email: "charlie@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const result = compareTransferAuthority(
      { owner_person_id: "owner-old" },
      oldOwner,
      newOwner,
    );

    expect(result.authorityChange).toBe("none");
    expect(result.requiresApproval).toBe(false);
    expect(result.systemMismatches).toEqual([]);
  });

  it("returns 'none' when neither owner has authority profiles", () => {
    const oldOwner = makePerson({
      id: "owner-old", name: "Alice", email: "alice@co.com", department: "Finance",
    });
    const newOwner = makePerson({
      id: "owner-new", name: "Bob", email: "bob@co.com", department: "Finance",
    });

    const result = compareTransferAuthority(
      { owner_person_id: "owner-old" },
      oldOwner,
      newOwner,
    );

    expect(result.authorityChange).toBe("none");
    expect(result.requiresApproval).toBe(false);
    expect(result.systemMismatches).toEqual([]);
  });
});

describe("executeTransfer", () => {
  it("updates owner_person_id and sets stale:true", () => {
    const entry = makeRegistryEntry({
      agent_id: "agent-007",
      owner_person_id: "old-owner-id",
    });
    const newOwner = makePerson({
      id: "new-owner-id",
      name: "Diana",
      email: "diana@co.com",
      department: "Engineering",
    });

    const { updatedEntry, evidence } = executeTransfer({
      agentRegistryEntry: entry,
      newOwner,
      actor: "admin@co.com",
      approved: true,
    });

    expect(updatedEntry.owner_person_id).toBe("new-owner-id");
    expect(updatedEntry.stale).toBe(true);
    expect(updatedEntry.stale_reason).toBe("ownership_transferred");
    // Original fields preserved
    expect(updatedEntry.agent_id).toBe("agent-007");
    expect(updatedEntry.task_id).toBe("task-001");
  });

  it("creates a transfer EvidenceRecord", () => {
    const entry = makeRegistryEntry({ agent_id: "agent-007" });
    const newOwner = makePerson({
      id: "new-owner-id",
      name: "Diana",
      email: "diana@co.com",
      department: "Engineering",
    });

    const { evidence } = executeTransfer({
      agentRegistryEntry: entry,
      newOwner,
      actor: "admin@co.com",
      approved: true,
    });

    expect(evidence.type).toBe("transfer");
    expect(evidence.subjectType).toBe("agent");
    expect(evidence.subjectId).toBe("agent-007");
    expect(evidence.actor).toBe("admin@co.com");
    expect(evidence.summary).toContain("transferred");
    expect(evidence.summary).toContain("Diana");
    expect(evidence.timestamp).toBeTruthy();
    expect(evidence.details).toEqual({
      previous_owner_id: "owner-old",
      new_owner_id: "new-owner-id",
      new_owner_name: "Diana",
      new_owner_email: "diana@co.com",
      approved: true,
    });
  });

  it("records pending status when not approved", () => {
    const entry = makeRegistryEntry({ agent_id: "agent-007" });
    const newOwner = makePerson({
      id: "new-owner-id",
      name: "Eve",
      email: "eve@co.com",
      department: "Engineering",
    });

    const { updatedEntry, evidence } = executeTransfer({
      agentRegistryEntry: entry,
      newOwner,
      actor: "admin@co.com",
      approved: false,
    });

    expect(updatedEntry.stale).toBe(true);
    expect(updatedEntry.stale_reason).toBe("ownership_transfer_pending_approval");
    expect(evidence.summary).toContain("pending approval");
    expect(evidence.details?.approved).toBe(false);
  });
});

describe("findReassignmentCandidates", () => {
  it("finds people in the same department", () => {
    const owner = makePerson({
      id: "owner-id",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const bob = makePerson({
      id: "bob-id",
      name: "Bob",
      email: "bob@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const charlie = makePerson({
      id: "charlie-id",
      name: "Charlie",
      email: "charlie@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const dave = makePerson({
      id: "dave-id",
      name: "Dave",
      email: "dave@co.com",
      department: "Engineering", // different department
    });

    const people = [owner, bob, charlie, dave];
    const entry = makeRegistryEntry({ owner_person_id: "owner-id" });

    const candidates = findReassignmentCandidates(entry, people);

    expect(candidates.length).toBe(2);
    expect(candidates.every((c) => c.person.department === "Finance")).toBe(true);
    expect(candidates.find((c) => c.person.id === "dave-id")).toBeUndefined();
  });

  it("marks candidates that cover all grants", () => {
    const owner = makePerson({
      id: "owner-id",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          { system: "Slack", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const bob = makePerson({
      id: "bob-id",
      name: "Bob",
      email: "bob@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          { system: "Slack", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const charlie = makePerson({
      id: "charlie-id",
      name: "Charlie",
      email: "charlie@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_only", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
          // No Slack grant
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const entry = makeRegistryEntry({ owner_person_id: "owner-id" });
    const candidates = findReassignmentCandidates(entry, [owner, bob, charlie]);

    expect(candidates.length).toBe(2);
    const bobResult = candidates.find((c) => c.person.id === "bob-id");
    expect(bobResult?.coversGrants).toBe(true);

    const charlieResult = candidates.find((c) => c.person.id === "charlie-id");
    expect(charlieResult?.coversGrants).toBe(false);
  });

  it("sorts candidates with coversGrants first", () => {
    const owner = makePerson({
      id: "owner-id",
      name: "Alice",
      email: "alice@co.com",
      department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const bob = makePerson({
      id: "bob-id", name: "Bob", email: "bob@co.com", department: "Finance",
      authority: { system_grants: [], approval_authority: [], sod_roles: [], updated_at: "2026-06-01T00:00:00.000Z" },
    });

    const charlie = makePerson({
      id: "charlie-id", name: "Charlie", email: "charlie@co.com", department: "Finance",
      authority: {
        system_grants: [
          { system: "Salesforce", scope: "read_write", provenance: { source: "operator", operator_id: "op1" }, status: "reviewed" },
        ],
        approval_authority: [],
        sod_roles: [],
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    });

    const entry = makeRegistryEntry({ owner_person_id: "owner-id" });
    const candidates = findReassignmentCandidates(entry, [owner, bob, charlie]);

    expect(candidates[0].coversGrants).toBe(true);
    expect(candidates[1].coversGrants).toBe(false);
  });

  it("returns empty array when the owner is not found in people list", () => {
    const entry = makeRegistryEntry({ owner_person_id: "nonexistent" });
    const people = [
      makePerson({ id: "someone", name: "Someone", email: "s@co.com", department: "Finance" }),
    ];
    expect(findReassignmentCandidates(entry, people)).toEqual([]);
  });

  it("excludes offboarded people from candidates", () => {
    const owner = makePerson({
      id: "owner-id", name: "Alice", email: "alice@co.com", department: "Finance",
    });
    const offboarded = makePerson({
      id: "offboarded-id", name: "Bob", email: "bob@co.com", department: "Finance",
      lifecycle: "offboarded",
    });

    const entry = makeRegistryEntry({ owner_person_id: "owner-id" });
    const candidates = findReassignmentCandidates(entry, [owner, offboarded]);
    expect(candidates.length).toBe(0);
  });
});
