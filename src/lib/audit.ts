import type { AuditEvent, AuditEventType } from "@/types";

// ── Append-only audit ledger (v0) ──────────────────────────────────────
// Every governance-relevant action (CSV import, session applied, org sync
// approved, agent generated, documents uploaded, exports) is appended as an
// event whose hash covers its content plus the previous event's hash. Editing
// or deleting any past event breaks every hash after it, so tampering is
// detectable with verifyAuditChain.
//
// v0 uses a synchronous FNV-1a 64-bit chain — tamper-EVIDENT for the demo and
// local storage, not cryptographically strong. The production path (see
// docs/wesco-demo-and-roadmap.md) moves the ledger server-side behind auth
// with SHA-256 and an immutable table.

export const GENESIS_HASH = "0000000000000000";

// FNV-1a 64-bit over a canonical event string.
function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonical(e: Omit<AuditEvent, "hash">): string {
  return [e.seq, e.ts, e.actor, e.type, e.summary, JSON.stringify(e.details ?? {}), e.prevHash].join("|");
}

export interface AuditEventInput {
  type: AuditEventType;
  summary: string;
  actor: string;
  details?: Record<string, unknown>;
}

/** Append an event, returning a NEW array (the input log is never mutated). */
export function appendAuditEvent(log: AuditEvent[], input: AuditEventInput): AuditEvent[] {
  const prev = log.length ? log[log.length - 1] : null;
  const seq = (prev?.seq ?? 0) + 1;
  const ts = new Date().toISOString();
  const withoutHash: Omit<AuditEvent, "hash"> = {
    seq,
    id: `E-${seq}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    ts,
    actor: input.actor || "anon",
    type: input.type,
    summary: input.summary,
    details: input.details,
    prevHash: prev?.hash ?? GENESIS_HASH,
  };
  return [...log, { ...withoutHash, hash: fnv1a64(canonical(withoutHash)) }];
}

export interface ChainVerification {
  ok: boolean;
  /** seq of the first event whose hash or linkage fails (when !ok). */
  brokenAtSeq?: number;
  length: number;
}

/** Recompute the chain; any edited, deleted, or reordered event breaks it. */
export function verifyAuditChain(log: AuditEvent[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  let prevSeq = 0;
  for (const e of log) {
    const { hash, ...rest } = e;
    if (e.seq !== prevSeq + 1 || e.prevHash !== prevHash || fnv1a64(canonical(rest)) !== hash) {
      return { ok: false, brokenAtSeq: e.seq, length: log.length };
    }
    prevHash = hash;
    prevSeq = e.seq;
  }
  return { ok: true, length: log.length };
}

export const AUDIT_TYPE_LABEL: Record<AuditEventType, string> = {
  workspace_created: "Workspace created",
  session_applied: "Session applied",
  org_sync_applied: "Org sync applied",
  agent_generated: "Agent generated",
  context_documents_uploaded: "Documents uploaded",
  company_profile_saved: "Profile saved",
  export_performed: "Export",
};

/** Flatten the log to CSV-friendly rows (for the evidence pack). */
export function auditLogRows(log: AuditEvent[]): Array<Record<string, string | number>> {
  return log.map((e) => ({
    seq: e.seq,
    timestamp: e.ts,
    actor: e.actor,
    type: e.type,
    summary: e.summary,
    details: JSON.stringify(e.details ?? {}),
    prev_hash: e.prevHash,
    hash: e.hash,
  }));
}
