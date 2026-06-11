import type { StackSignal } from "@/types";
import { significantKeywords } from "./governance";
import { RECURRENCE_RE } from "./maintenance";

// ── Living Stack A.4: durability and corroboration ─────────────────────
// Single mentions are noise. The ledger accumulates signals and promotes
// them to proposals only when durable:
//  - confirmation        → applies immediately, silently (timestamps only)
//  - drift / retirement / agent_feedback → proposed on first occurrence
//  - new_candidate       → proposed when corroborated in ≥2 distinct meetings,
//                          OR a single mention carries recurrence/ownership
//                          language, OR a member asserts it directly
//  - rule_signal         → proposed immediately, max priority
//  - backlog_resolution  → auto-links; surfaced in the digest as a free win

export const DEFAULT_CANDIDATE_EXPIRY_DAYS = 30;

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(significantKeywords(a));
  const tb = new Set(significantKeywords(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const CORROBORATION_THRESHOLD = 0.6;

function candidateText(signal: StackSignal): string {
  const patch = signal.proposed_patch as { label?: string | null } | undefined;
  return patch?.label || signal.evidence_quote;
}

function meetingOf(signal: StackSignal): string | null {
  return signal.source.kind === "meeting" ? signal.source.transcript_id : null;
}

function hasRecurrenceLanguage(signal: StackSignal): boolean {
  const patch = signal.proposed_patch as { recurrence_language?: boolean } | undefined;
  return Boolean(patch?.recurrence_language) || RECURRENCE_RE.test(signal.evidence_quote);
}

/** Two new_candidate signals describe the same work. */
export function corroborates(a: StackSignal, b: StackSignal): boolean {
  const samePerson =
    !a.refs.person_ids.length || !b.refs.person_ids.length ||
    a.refs.person_ids.some((id) => b.refs.person_ids.includes(id));
  return samePerson && tokenOverlap(candidateText(a), candidateText(b)) >= CORROBORATION_THRESHOLD;
}

export interface IngestResult {
  ledger: StackSignal[];
  promoted: StackSignal[];       // newly proposed (review queue will see them)
  confirmations: StackSignal[];  // applied silently — caller updates freshness
  resolutions: StackSignal[];    // backlog auto-links — caller resolves items
}

/**
 * Ingest freshly parsed signals into the ledger, applying the durability
 * rules. Confirmations and backlog resolutions return separately so the
 * caller can perform their (timestamp-only / link-only) side effects.
 */
export function ingestSignals(ledger: StackSignal[], incoming: StackSignal[]): IngestResult {
  let next = [...ledger];
  const promoted: StackSignal[] = [];
  const confirmations: StackSignal[] = [];
  const resolutions: StackSignal[] = [];

  for (const raw of incoming) {
    const signal = { ...raw };
    switch (signal.type) {
      case "confirmation": {
        signal.status = "applied";
        confirmations.push(signal);
        next.push(signal);
        break;
      }
      case "backlog_resolution": {
        signal.status = "applied";
        resolutions.push(signal);
        next.push(signal);
        break;
      }
      case "drift":
      case "retirement":
      case "agent_feedback": {
        // Known-record references: low false-positive cost, review catches errors.
        signal.status = "proposed";
        promoted.push(signal);
        next.push(signal);
        break;
      }
      case "rule_signal": {
        signal.status = "proposed"; // top of digest, always
        promoted.push(signal);
        next.push(signal);
        break;
      }
      case "new_candidate": {
        const memberAsserted = signal.source.kind === "member";
        const recurrence = hasRecurrenceLanguage(signal);
        const thisMeeting = meetingOf(signal);
        const corroborating = next.filter(
          (s) =>
            s.type === "new_candidate" &&
            (s.status === "ledgered" || s.status === "proposed") &&
            corroborates(s, signal) &&
            // distinct source: another meeting's transcript, or a member assertion
            (s.source.kind === "member" || meetingOf(s) !== thisMeeting),
        );
        if (memberAsserted || recurrence || corroborating.length >= 1) {
          signal.status = "proposed";
          promoted.push(signal);
          // Corroborating ledgered mentions ride along into review.
          next = next.map((s) =>
            corroborating.includes(s) && s.status === "ledgered" ? { ...s, status: "proposed" as const } : s,
          );
        } else {
          signal.status = "ledgered";
        }
        next.push(signal);
        break;
      }
    }
  }

  return { ledger: next, promoted, confirmations, resolutions };
}

/** Corroborating evidence for a candidate — every quote, for the digest. */
export function corroborationsFor(ledger: StackSignal[], signal: StackSignal): StackSignal[] {
  if (signal.type !== "new_candidate") return [];
  return ledger.filter((s) => s.id !== signal.id && s.type === "new_candidate" && corroborates(s, signal));
}

/** Expiry sweep: uncorroborated ledgered candidates expire after the window. */
export function sweepExpired(ledger: StackSignal[], now = new Date(), windowDays = DEFAULT_CANDIDATE_EXPIRY_DAYS): StackSignal[] {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return ledger.map((signal) => {
    if (signal.type !== "new_candidate" || signal.status !== "ledgered") return signal;
    if (new Date(signal.captured_at).getTime() < cutoff) {
      return { ...signal, status: "expired" as const };
    }
    return signal;
  });
}

export function setSignalStatus(ledger: StackSignal[], signalId: string, status: StackSignal["status"], by?: string): StackSignal[] {
  return ledger.map((s) =>
    s.id === signalId
      ? { ...s, status, ...(by ? { decision: { by, at: new Date().toISOString() } } : {}) }
      : s,
  );
}

export function pendingSignals(ledger: StackSignal[]): StackSignal[] {
  return ledger.filter((s) => s.status === "proposed");
}
