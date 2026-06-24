import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "../src/types";
import {
  newEvidenceId,
  createEvidenceRecord,
  filterEvidenceBySubject,
  filterEvidenceBySubjectType,
  filterEvidenceByType,
  filterEvidenceByActor,
  filterEvidenceByDateRange,
  generateAgentEvidencePacket,
  generateControlEvidencePacket,
  generateSystemEvidencePacket,
  exportEvidenceJson,
  exportEvidenceCsv,
} from "../src/lib/evidence";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A small set of fixed records for filtering/export tests. */
const sampleRecords: EvidenceRecord[] = [
  {
    id: "evt-001",
    type: "birth_certificate",
    subjectType: "agent",
    subjectId: "agent-alpha",
    actor: "system",
    timestamp: "2025-01-15T10:00:00.000Z",
    summary: "Agent Alpha birth certificate issued",
  },
  {
    id: "evt-002",
    type: "approval",
    subjectType: "agent",
    subjectId: "agent-alpha",
    actor: "alice@example.com",
    timestamp: "2025-01-16T14:30:00.000Z",
    summary: "Approved agent scope expansion",
  },
  {
    id: "evt-003",
    type: "control_mapping",
    subjectType: "control",
    subjectId: "ctrl-sox-42",
    actor: "bob@example.com",
    timestamp: "2025-01-17T09:15:00.000Z",
    summary: "Mapped SOX control 42 to revenue process",
  },
  {
    id: "evt-004",
    type: "drift_review",
    subjectType: "system",
    subjectId: "sys-finance",
    actor: "carol@example.com",
    timestamp: "2025-01-18T16:00:00.000Z",
    summary: "Quarterly drift review for finance system",
  },
  {
    id: "evt-005",
    type: "approval",
    subjectType: "control",
    subjectId: "ctrl-sox-42",
    actor: "alice@example.com",
    timestamp: "2025-01-19T11:45:00.000Z",
    summary: "Approved control remediation plan",
  },
  {
    id: "evt-006",
    type: "permission_scope",
    subjectType: "system",
    subjectId: "sys-hr",
    actor: "dave@example.com",
    timestamp: "2025-02-01T08:00:00.000Z",
    summary: "Updated HR system permission scope",
  },
];

/* ------------------------------------------------------------------ */
/*  Creation                                                           */
/* ------------------------------------------------------------------ */

describe("newEvidenceId", () => {
  it("returns a string starting with 'evt-'", () => {
    const id = newEvidenceId();
    expect(id).toMatch(/^evt-/);
  });

  it("includes a numeric timestamp portion", () => {
    const id = newEvidenceId();
    const parts = id.replace("evt-", "").split("-");
    expect(parts[0]).toMatch(/^\d+$/);
    expect(Number(parts[0])).toBeGreaterThan(0);
  });

  it("generates unique IDs on successive calls", () => {
    const a = newEvidenceId();
    const b = newEvidenceId();
    expect(a).not.toBe(b);
  });
});

describe("createEvidenceRecord", () => {
  const record = createEvidenceRecord(
    "approval",
    "control",
    "ctrl-sox-42",
    "alice@example.com",
    "Approved SOX control 42",
  );

  it("returns an EvidenceRecord with the correct shape", () => {
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("type", "approval");
    expect(record).toHaveProperty("subjectType", "control");
    expect(record).toHaveProperty("subjectId", "ctrl-sox-42");
    expect(record).toHaveProperty("actor", "alice@example.com");
    expect(record).toHaveProperty("summary", "Approved SOX control 42");
  });

  it("sets an auto-generated id starting with evt-", () => {
    expect(record.id).toMatch(/^evt-/);
  });

  it("sets timestamp to a valid ISO string", () => {
    expect(() => new Date(record.timestamp)).not.toThrow();
    expect(new Date(record.timestamp).getTime()).not.toBeNaN();
  });

  it("does not set optional source or details by default", () => {
    expect(record.source).toBeUndefined();
    expect(record.details).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Filtering                                                          */
/* ------------------------------------------------------------------ */

describe("filterEvidenceBySubject", () => {
  it("returns records matching the subjectId", () => {
    const result = filterEvidenceBySubject(sampleRecords, "agent-alpha");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.subjectId === "agent-alpha")).toBe(true);
  });

  it("returns an empty array when no records match", () => {
    expect(
      filterEvidenceBySubject(sampleRecords, "nonexistent"),
    ).toEqual([]);
  });
});

describe("filterEvidenceBySubjectType", () => {
  it("returns records matching the subjectType", () => {
    const result = filterEvidenceBySubjectType(sampleRecords, "system");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.subjectType === "system")).toBe(true);
  });

  it("returns an empty array when no records match", () => {
    expect(
      filterEvidenceBySubjectType(sampleRecords, "workspace"),
    ).toEqual([]);
  });
});

describe("filterEvidenceByType", () => {
  it("returns records matching the evidence type", () => {
    const result = filterEvidenceByType(sampleRecords, "approval");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === "approval")).toBe(true);
  });

  it("returns an empty array when no records match", () => {
    expect(
      filterEvidenceByType(sampleRecords, "risk_acceptance"),
    ).toEqual([]);
  });
});

describe("filterEvidenceByActor", () => {
  it("returns records matching the actor", () => {
    const result = filterEvidenceByActor(
      sampleRecords,
      "alice@example.com",
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.actor === "alice@example.com")).toBe(true);
  });

  it("returns an empty array when no records match", () => {
    expect(
      filterEvidenceByActor(sampleRecords, "nobody@example.com"),
    ).toEqual([]);
  });
});

describe("filterEvidenceByDateRange", () => {
  it("returns records within the inclusive range", () => {
    const result = filterEvidenceByDateRange(
      sampleRecords,
      "2025-01-15T00:00:00.000Z",
      "2025-01-17T23:59:59.000Z",
    );
    expect(result).toHaveLength(3); // evt-001, evt-002, evt-003
  });

  it("returns empty when range matches no records", () => {
    const result = filterEvidenceByDateRange(
      sampleRecords,
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T23:59:59.000Z",
    );
    expect(result).toEqual([]);
  });

  it("treats a single-day range correctly", () => {
    const result = filterEvidenceByDateRange(
      sampleRecords,
      "2025-01-15T00:00:00.000Z",
      "2025-01-15T23:59:59.000Z",
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("evt-001");
  });
});

/* ------------------------------------------------------------------ */
/*  Packets (agent / control / system)                                 */
/* ------------------------------------------------------------------ */

describe("generateAgentEvidencePacket", () => {
  it("returns records where subjectId and subjectType='agent' match", () => {
    const result = generateAgentEvidencePacket(
      sampleRecords,
      "agent-alpha",
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.subjectType === "agent")).toBe(true);
    expect(result.every((r) => r.subjectId === "agent-alpha")).toBe(true);
  });

  it("returns empty array when no matching agent records exist", () => {
    const result = generateAgentEvidencePacket(
      sampleRecords,
      "agent-ghost",
    );
    expect(result).toEqual([]);
  });
});

describe("generateControlEvidencePacket", () => {
  it("returns records where subjectId and subjectType='control' match", () => {
    const result = generateControlEvidencePacket(
      sampleRecords,
      "ctrl-sox-42",
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.subjectType === "control")).toBe(true);
    expect(result.every((r) => r.subjectId === "ctrl-sox-42")).toBe(true);
  });

  it("returns empty array when no matching control records exist", () => {
    const result = generateControlEvidencePacket(
      sampleRecords,
      "ctrl-none",
    );
    expect(result).toEqual([]);
  });
});

describe("generateSystemEvidencePacket", () => {
  it("returns records where subjectId and subjectType='system' match", () => {
    const result = generateSystemEvidencePacket(
      sampleRecords,
      "sys-finance",
    );
    expect(result).toHaveLength(1);
    expect(result.every((r) => r.subjectType === "system")).toBe(true);
    expect(result.every((r) => r.subjectId === "sys-finance")).toBe(true);
  });

  it("returns empty array when no matching system records exist", () => {
    const result = generateSystemEvidencePacket(
      sampleRecords,
      "sys-nobody",
    );
    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

describe("exportEvidenceJson", () => {
  it("returns a valid JSON string", () => {
    const json = exportEvidenceJson(sampleRecords);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(sampleRecords.length);
  });

  it("pretty-prints with 2-space indent", () => {
    const json = exportEvidenceJson([sampleRecords[0]]);
    const lines = json.split("\n");
    // Line 0: [, Line 1:   {, Line 2:     "id": ... — first key at depth 1
    expect(lines[0]).toBe("[");
    expect(lines[1]).toBe("  {");
    expect(lines[2]).toMatch(/^    "/); // 4-space indentation for first key
  });

  it("round-trips correctly", () => {
    const json = exportEvidenceJson(sampleRecords);
    const parsed: EvidenceRecord[] = JSON.parse(json);
    expect(parsed[0].id).toBe("evt-001");
    expect(parsed[0].type).toBe("birth_certificate");
  });

  it("handles an empty array", () => {
    expect(exportEvidenceJson([])).toBe("[]");
  });
});

describe("exportEvidenceCsv", () => {
  it("includes the expected header row", () => {
    const csv = exportEvidenceCsv([]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "id,type,subjectType,subjectId,actor,timestamp,summary",
    );
  });

  it("includes one data row per record", () => {
    const csv = exportEvidenceCsv(sampleRecords);
    const lines = csv.trim().split("\n");
    // header + 6 records = 7 lines
    expect(lines).toHaveLength(sampleRecords.length + 1);
  });

  it("renders the first record correctly", () => {
    const csv = exportEvidenceCsv([sampleRecords[0]]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe(
      "evt-001,birth_certificate,agent,agent-alpha,system,2025-01-15T10:00:00.000Z,Agent Alpha birth certificate issued",
    );
  });

  it("escapes commas and quotes in summary values", () => {
    const records: EvidenceRecord[] = [
      {
        id: "evt-esc",
        type: "approval",
        subjectType: "agent",
        subjectId: "a1",
        actor: "user@example.com",
        timestamp: "2025-06-01T12:00:00.000Z",
        summary: 'Approved "risk", classification & transfer',
      },
    ];
    const csv = exportEvidenceCsv(records);
    const lines = csv.trim().split("\n");
    // The summary should be wrapped in double-quotes with inner quotes escaped
    expect(lines[1]).toContain('"Approved ""risk"", classification & transfer"');
  });

  it("handles an empty array", () => {
    const csv = exportEvidenceCsv([]);
    expect(csv.trim()).toBe(
      "id,type,subjectType,subjectId,actor,timestamp,summary",
    );
  });
});
