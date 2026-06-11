import type {
  StackSignal,
  StackSignalSource,
} from "@/types";
import type { MaintenanceParseServerSignal } from "./api";
import { extractGovernanceRulesDeterministic, significantKeywords } from "./governance";
import type { CompactStackState } from "./meetings";

// ── Living Stack A.1: the maintenance parse (deterministic fallback) ───
// Team meetings are operational: ~5% of content is governance-relevant, and
// a one-off assignment is not an ownership transfer. The maintenance parse
// NEVER creates records — it emits classified signals against existing stack
// state. The deterministic path produces confirmations, obvious retirements,
// rule signals, recurrence-language candidates, agent feedback, and backlog
// resolutions; the optional AI pass (server-side) refines the rest.

let signalSeq = 0;
function nextSignalId(): string {
  signalSeq += 1;
  return `SIG-${Date.now().toString(36)}-${signalSeq}`;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(significantKeywords(a));
  const tb = new Set(significantKeywords(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const MATCH_THRESHOLD = 0.6;
const STOP_RE = /\bno longer\b|\bstopped\b|\bkilled\b|\bnot\s+doing\b.*\banymore\b|\bhanded\s+off\b|\bwent\s+away\b|\bretire[ds]?\b/i;
export const RECURRENCE_RE = /\bevery\s+(week|monday|tuesday|wednesday|thursday|friday|day|month|quarter|morning)\b|\bfrom\s+now\s+on\b|\bgoing\s+forward\b|\bweekly\b|\bdaily\b|\bmonthly\b|\bwill\s+own\b|\bnow\s+owns?\b/i;

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

export interface MaintenanceParseArgs {
  transcript: string;
  transcriptId?: string;
  meetingId?: string;
  participantIds: string[];
  stackState: CompactStackState;
}

function meetingSource(args: MaintenanceParseArgs): StackSignalSource {
  return { kind: "meeting", meeting_id: args.meetingId ?? "unregistered", transcript_id: args.transcriptId ?? `T-${Date.now().toString(36)}` };
}

function baseSignal(args: MaintenanceParseArgs, type: StackSignal["type"], evidence: string, confidence: number): StackSignal {
  return {
    id: nextSignalId(),
    type,
    source: meetingSource(args),
    evidence_quote: evidence,
    confidence,
    refs: { person_ids: [], task_ids: [], agent_ids: [], rule_ids: [], backlog_ids: [] },
    authority_expanding: false,
    captured_at: new Date().toISOString(),
    status: "ledgered",
  };
}

/**
 * Deterministic maintenance parse: keyword/keyOf matching produces
 * confirmations and obvious retirements only, plus rule-shaped sentences,
 * recurrence-language candidates, agent-name feedback, and backlog matches.
 * Never invents work; never proposes authority changes silently.
 */
export function runMaintenanceParseDeterministic(args: MaintenanceParseArgs): StackSignal[] {
  signalSeq = 0;
  const signals: StackSignal[] = [];
  const sentences = splitSentences(args.transcript);
  const { tasks, agents, open_questions, rules } = args.stackState;
  const matchedTaskIds = new Set<string>();

  for (const sentence of sentences) {
    const stops = STOP_RE.test(sentence);

    // Task matches → confirmation (or retirement on stop phrasing).
    for (const task of tasks) {
      if (matchedTaskIds.has(`${task.id}:${stops ? "r" : "c"}`)) continue;
      if (tokenOverlap(sentence, task.label) < MATCH_THRESHOLD) continue;
      matchedTaskIds.add(`${task.id}:${stops ? "r" : "c"}`);
      const signal = baseSignal(args, stops ? "retirement" : "confirmation", sentence, stops ? 0.6 : 0.75);
      signal.refs.person_ids = [task.person_id];
      signal.refs.task_ids = [task.id];
      const agent = agents.find((a) => a.task_id === task.id);
      if (agent) signal.refs.agent_ids = [agent.id];
      if (stops) signal.proposed_patch = { kind: "retirement", task_id: task.id, person_id: task.person_id, agent_ids: agent ? [agent.id] : [] };
      signals.push(signal);
    }

    // Agent feedback: a registered agent named in the meeting.
    for (const agent of agents) {
      if (!sentence.toLowerCase().includes(agent.name.toLowerCase())) continue;
      const signal = baseSignal(args, "agent_feedback", sentence, 0.6);
      signal.refs.agent_ids = [agent.id];
      signal.refs.person_ids = [agent.owner_person_id];
      signal.proposed_patch = { kind: "agent_feedback", agent_id: agent.id, note: sentence };
      signals.push(signal);
    }

    // Backlog resolution: the meeting incidentally answers an open question.
    for (const question of open_questions) {
      if (tokenOverlap(sentence, question.question) < 0.55) continue;
      const signal = baseSignal(args, "backlog_resolution", sentence, 0.6);
      signal.refs.person_ids = [question.person_id];
      signal.refs.backlog_ids = [question.id];
      signals.push(signal);
    }

    // New candidate: recurring work not in the map, only with recurrence/
    // ownership language (one-off assignments emit nothing).
    if (!stops && RECURRENCE_RE.test(sentence)) {
      const known = tasks.some((t) => tokenOverlap(sentence, t.label) >= MATCH_THRESHOLD);
      if (!known) {
        const signal = baseSignal(args, "new_candidate", sentence, 0.55);
        signal.proposed_patch = { kind: "new_candidate", label: candidateLabel(sentence), recurrence_language: true };
        signals.push(signal);
      }
    }
  }

  // Rule-shaped sentences → rule_signal (top of digest, always).
  const transcriptRules = extractGovernanceRulesDeterministic({
    contextDocuments: [{ id: "transcript:maintenance", bucket: "policy", fileName: "transcript", text: args.transcript, uploadedAt: new Date().toISOString() }],
  });
  for (const rule of transcriptRules) {
    const known = rules.some((r) => tokenOverlap(r.condition, rule.condition) >= 0.8);
    if (known) continue;
    const signal = baseSignal(args, "rule_signal", rule.evidence_quote, 0.7);
    signal.refs.rule_ids = [rule.rule_id];
    signal.authority_expanding = /\bno longer\b|\blifted\b|\brelax\w*\b|\bremoved?\b/i.test(rule.evidence_quote);
    signal.proposed_patch = { kind: "rule_signal", rule };
    signals.push(signal);
  }

  return signals;
}

/** Verb-phrase label for a candidate sentence (best-effort, reviewed before apply). */
function candidateLabel(sentence: string): string {
  const m = sentence.match(/\b(reviews?|cleans?|compares?|summari[sz]es?|drafts?|pulls?|compiles?|sends?|tracks?|prepares?|updates?|reconciles?|audits?|monitors?|exports?|builds?|reports?)\b\s+([^.;,]{4,70})/i);
  if (m) {
    const verb = m[1].replace(/s$/i, "");
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${m[2].trim()}`.replace(/\s+/g, " ");
  }
  const clean = sentence.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

/** Convert AI maintenance-parse output into ledger signals. */
export function serverSignalsToStackSignals(
  serverSignals: MaintenanceParseServerSignal[],
  args: Pick<MaintenanceParseArgs, "transcriptId" | "meetingId">,
): StackSignal[] {
  const source: StackSignalSource = {
    kind: "meeting",
    meeting_id: args.meetingId ?? "unregistered",
    transcript_id: args.transcriptId ?? `T-${Date.now().toString(36)}`,
  };
  return serverSignals
    .filter((s) => s.evidence_quote?.trim())
    .map((s) => ({
      id: nextSignalId(),
      type: s.type,
      source,
      evidence_quote: s.evidence_quote,
      confidence: Math.max(0, Math.min(1, s.confidence)),
      refs: {
        person_ids: s.person_ids ?? [],
        task_ids: s.task_ids ?? [],
        agent_ids: s.agent_ids ?? [],
        rule_ids: s.rule_ids ?? [],
        backlog_ids: s.backlog_ids ?? [],
      },
      ...(s.patch_summary || s.proposed_label || s.proposed_cadence || s.proposed_owner_person_id
        ? {
            proposed_patch: {
              kind: s.type,
              summary: s.patch_summary,
              label: s.proposed_label,
              cadence: s.proposed_cadence,
              owner_person_id: s.proposed_owner_person_id,
              recurrence_language: s.recurrence_language,
            },
          }
        : {}),
      authority_expanding: Boolean(s.authority_expanding),
      captured_at: new Date().toISOString(),
      status: "ledgered" as const,
    }));
}
