import type { EvidenceRecord } from "../types";

let _idCounter = 0;
let _lastTs = 0;

/**
 * Generate a new evidence ID in the format evt-<timestamp>.
 * Uses Date.now() for millisecond-precision ordering.
 * A monotonic counter ensures uniqueness across calls in the same millisecond.
 */
export function newEvidenceId(): string {
  const ts = Date.now();
  if (ts === _lastTs) {
    _idCounter++;
  } else {
    _lastTs = ts;
    _idCounter = 0;
  }
  return `evt-${ts}-${_idCounter}`;
}

/**
 * Create a new EvidenceRecord with sensible defaults and the current timestamp.
 */
export function createEvidenceRecord(
  type: EvidenceRecord["type"],
  subjectType: EvidenceRecord["subjectType"],
  subjectId: string,
  actor: string,
  summary: string,
): EvidenceRecord {
  return {
    id: newEvidenceId(),
    type,
    subjectType,
    subjectId,
    actor,
    timestamp: new Date().toISOString(),
    summary,
  };
}

/**
 * Filter evidence records by subject ID.
 */
export function filterEvidenceBySubject(
  records: EvidenceRecord[],
  subjectId: string,
): EvidenceRecord[] {
  return records.filter((r) => r.subjectId === subjectId);
}

/**
 * Filter evidence records by subject type.
 */
export function filterEvidenceBySubjectType(
  records: EvidenceRecord[],
  subjectType: EvidenceRecord["subjectType"],
): EvidenceRecord[] {
  return records.filter((r) => r.subjectType === subjectType);
}

/**
 * Filter evidence records by evidence type.
 */
export function filterEvidenceByType(
  records: EvidenceRecord[],
  type: EvidenceRecord["type"],
): EvidenceRecord[] {
  return records.filter((r) => r.type === type);
}

/**
 * Filter evidence records by actor.
 */
export function filterEvidenceByActor(
  records: EvidenceRecord[],
  actor: string,
): EvidenceRecord[] {
  return records.filter((r) => r.actor === actor);
}

/**
 * Filter evidence records by a date range (inclusive).
 * Both `from` and `to` are ISO date strings. Records whose timestamp
 * falls within [from, to] (inclusive) are returned.
 */
export function filterEvidenceByDateRange(
  records: EvidenceRecord[],
  from: string,
  to: string,
): EvidenceRecord[] {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  return records.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return t >= fromMs && t <= toMs;
  });
}

/**
 * Generate an agent evidence packet: all records where subjectId === agentId
 * AND subjectType === "agent".
 */
export function generateAgentEvidencePacket(
  records: EvidenceRecord[],
  agentId: string,
): EvidenceRecord[] {
  return records.filter(
    (r) => r.subjectId === agentId && r.subjectType === "agent",
  );
}

/**
 * Generate a control evidence packet: all records where subjectId === controlId
 * AND subjectType === "control".
 */
export function generateControlEvidencePacket(
  records: EvidenceRecord[],
  controlId: string,
): EvidenceRecord[] {
  return records.filter(
    (r) => r.subjectId === controlId && r.subjectType === "control",
  );
}

/**
 * Generate a system evidence packet: all records where subjectId === systemId
 * AND subjectType === "system".
 */
export function generateSystemEvidencePacket(
  records: EvidenceRecord[],
  systemId: string,
): EvidenceRecord[] {
  return records.filter(
    (r) => r.subjectId === systemId && r.subjectType === "system",
  );
}

/**
 * Export evidence records as a JSON string (pretty-printed with 2-space indent).
 */
export function exportEvidenceJson(records: EvidenceRecord[]): string {
  return JSON.stringify(records, null, 2);
}

/**
 * Export evidence records as a CSV string with header row:
 * id,type,subjectType,subjectId,actor,timestamp,summary
 *
 * Values containing commas, double-quotes, or newlines are properly escaped.
 */
export function exportEvidenceCsv(records: EvidenceRecord[]): string {
  const header = "id,type,subjectType,subjectId,actor,timestamp,summary";

  const rows = records.map((r) => {
    const fields = [
      r.id,
      r.type,
      r.subjectType,
      r.subjectId,
      r.actor,
      r.timestamp,
      r.summary,
    ];
    return fields
      .map((f) => {
        const s = String(f);
        // Escape if the value contains a comma, double-quote, or newline
        if (/[",\n\r]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(",");
  });

  return [header, ...rows].join("\n");
}
