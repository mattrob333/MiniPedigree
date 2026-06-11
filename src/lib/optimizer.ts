import type {
  AgentRegistryEntry,
  CompanyMcpServer,
  PedigreeState,
  Person,
  StackSignal,
} from "@/types";
import { classifyTask } from "./parse";
import { tokenOverlap } from "./governance";
import { corroborationsFor } from "./signalLedger";
import { collectStaleItems } from "./freshness";
import type { FreshnessConfig } from "@/types";
import { DEFAULT_FRESHNESS_CONFIG } from "./freshness";

// ── Living Stack A.7: the inventory optimizer ──────────────────────────
// Signals compose into standing recommendations, recomputed after each
// digest application. Every recommendation carries its evidence and score
// breakdown — explainability is the audit story. Recommendations are
// advisory cards; acting on one routes through the normal flows.

export type RecommendationKind = "build_candidate" | "adoption_gap" | "merge_candidate" | "retirement" | "scope_tune";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  score: number;
  score_breakdown: Record<string, number>;
  evidence: string[];          // every supporting quote
  refs: { person_ids: string[]; agent_ids: string[]; signal_ids: string[] };
}

// Scoring weights in one config object (A.7).
export const OPTIMIZER_WEIGHTS = {
  pain_base: 1,
  pain_bonus: 1.5,            // pain language present
  class_fit: { delegatable: 1, human_approval_required: 0.7, not_delegatable: 0.3, unclear: 0.5 } as Record<string, number>,
  tool_coverage_default: 0.5, // no tools mentioned → neutral coverage
};

const PAIN_RE = /\btakes\s+forever\b|\bmanual(ly)?\b|\bevery\s+single\b|\btedious\b|\bpainful\b|\bhours\b|\bnightmare\b|\bby\s+hand\b/i;

function candidateLabel(signal: StackSignal): string {
  const patch = signal.proposed_patch as { label?: string | null } | undefined;
  return patch?.label || signal.evidence_quote.slice(0, 80);
}

export interface OptimizerInput {
  ledger: StackSignal[];
  registry: AgentRegistryEntry[];
  people: Person[];
  pedigree: PedigreeState;
  mcpLibrary: CompanyMcpServer[];
  freshnessConfig?: FreshnessConfig;
  now?: Date;
}

export function buildRecommendations(input: OptimizerInput): Recommendation[] {
  const { ledger, registry, people, pedigree, mcpLibrary } = input;
  const now = input.now ?? new Date();
  const recommendations: Recommendation[] = [];
  let seq = 0;
  const nextId = () => `REC-${++seq}`;
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const activeEntries = registry.filter((e) => e.status !== "retired" && e.status !== "suspended");
  const agentName = (entry: AgentRegistryEntry) =>
    String((entry.versions[entry.versions.length - 1]?.compiled as Record<string, unknown> | undefined)?.agent_name ?? entry.agent_id);

  // ── Build candidates (ranked): corroborations × pain × class fit × tool coverage ──
  const seen = new Set<string>();
  for (const signal of ledger) {
    if (signal.type !== "new_candidate" || (signal.status !== "proposed" && signal.status !== "ledgered")) continue;
    const label = candidateLabel(signal);
    const key = label.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);

    const corroborating = corroborationsFor(ledger, signal);
    const corroborations = 1 + corroborating.length;
    const allQuotes = [signal.evidence_quote, ...corroborating.map((s) => s.evidence_quote)];
    const painWeight = allQuotes.some((quote) => PAIN_RE.test(quote)) ? OPTIMIZER_WEIGHTS.pain_bonus : OPTIMIZER_WEIGHTS.pain_base;
    const { cls } = classifyTask(label);
    const classFit = OPTIMIZER_WEIGHTS.class_fit[cls] ?? 0.5;
    const mentionedTools = mcpLibrary.filter((server) =>
      allQuotes.some((quote) => quote.toLowerCase().includes(server.name.toLowerCase())),
    );
    const toolCoverage = mentionedTools.length ? 1 : OPTIMIZER_WEIGHTS.tool_coverage_default;
    const score = corroborations * painWeight * classFit * toolCoverage;

    recommendations.push({
      id: nextId(),
      kind: "build_candidate",
      title: `Build: ${label}`,
      detail: `${corroborations} corroborating mention${corroborations === 1 ? "" : "s"} · class ${cls}${mentionedTools.length ? ` · tools covered by library (${mentionedTools.map((t) => t.name).join(", ")})` : ""}`,
      score,
      score_breakdown: { corroborations, pain_weight: painWeight, class_fit: classFit, tool_coverage: toolCoverage },
      evidence: allQuotes,
      refs: { person_ids: signal.refs.person_ids, agent_ids: [], signal_ids: [signal.id, ...corroborating.map((s) => s.id)] },
    });
  }

  // ── Adoption gaps: deployed agent + continued confirmations of the human doing the work ──
  for (const entry of activeEntries) {
    if (entry.status !== "deployed") continue;
    const manualConfirmations = ledger.filter(
      (s) => s.type === "confirmation" && s.status === "applied" && s.refs.task_ids.includes(entry.task_id),
    );
    if (manualConfirmations.length >= 2) {
      recommendations.push({
        id: nextId(),
        kind: "adoption_gap",
        title: `Adoption gap: ${agentName(entry)}`,
        detail: `${personName(entry.owner_person_id)} is still doing this work manually (${manualConfirmations.length} confirmations since deployment). The problem is rollout, not tech — suggest an owner check-in.`,
        score: manualConfirmations.length,
        score_breakdown: { manual_confirmations: manualConfirmations.length },
        evidence: manualConfirmations.map((s) => s.evidence_quote),
        refs: { person_ids: [entry.owner_person_id], agent_ids: [entry.agent_id], signal_ids: manualConfirmations.map((s) => s.id) },
      });
    }
  }

  // ── Merge candidates: two agents with overlapping confirmed tasks, same owner ──
  for (let i = 0; i < activeEntries.length; i++) {
    for (let j = i + 1; j < activeEntries.length; j++) {
      const a = activeEntries[i];
      const b = activeEntries[j];
      if (a.owner_person_id !== b.owner_person_id) continue;
      const rowTasks = (entry: AgentRegistryEntry) => {
        const row = pedigree[entry.owner_person_id];
        const all = row ? [...row.tasks.delegatable, ...row.tasks.approval, ...row.tasks.not_delegatable] : [];
        return all.find((t) => t.id === entry.task_id)?.label ?? "";
      };
      const la = rowTasks(a);
      const lb = rowTasks(b);
      if (la && lb && tokenOverlap(la, lb) >= 0.6) {
        recommendations.push({
          id: nextId(),
          kind: "merge_candidate",
          title: `Merge: ${agentName(a)} + ${agentName(b)}`,
          detail: `Both owned by ${personName(a.owner_person_id)} with overlapping tasks ("${la}" / "${lb}") — propose a consolidation review.`,
          score: 1,
          score_breakdown: { task_overlap: tokenOverlap(la, lb) },
          evidence: [la, lb],
          refs: { person_ids: [a.owner_person_id], agent_ids: [a.agent_id, b.agent_id], signal_ids: [] },
        });
      }
    }
  }

  // ── Retirements: retirement signal, or sustained staleness on the agent's task ──
  const staleItems = collectStaleItems(people, pedigree, registry, input.freshnessConfig ?? DEFAULT_FRESHNESS_CONFIG, now);
  for (const entry of activeEntries) {
    const retirementSignals = ledger.filter(
      (s) => s.type === "retirement" && s.status !== "rejected" && (s.refs.agent_ids.includes(entry.agent_id) || s.refs.task_ids.includes(entry.task_id)),
    );
    const taskStale = staleItems.some((i) => i.kind === "task" && i.id === entry.task_id && i.state === "stale");
    if (retirementSignals.length || (entry.stale && taskStale)) {
      recommendations.push({
        id: nextId(),
        kind: "retirement",
        title: `Retire: ${agentName(entry)}`,
        detail: retirementSignals.length
          ? "The underlying work is reported as no longer performed."
          : "The underlying task has gone stale with no confirmations — its work may no longer exist.",
        score: retirementSignals.length || 0.5,
        score_breakdown: { retirement_signals: retirementSignals.length, stale: taskStale ? 1 : 0 },
        evidence: retirementSignals.map((s) => s.evidence_quote),
        refs: { person_ids: [entry.owner_person_id], agent_ids: [entry.agent_id], signal_ids: retirementSignals.map((s) => s.id) },
      });
    }
  }

  // ── Scope tunes: repeated feedback with the same failure mode ──
  const feedbackByAgent = new Map<string, StackSignal[]>();
  for (const signal of ledger) {
    if (signal.type !== "agent_feedback" || signal.status === "rejected") continue;
    for (const agentId of signal.refs.agent_ids) {
      const list = feedbackByAgent.get(agentId) ?? [];
      list.push(signal);
      feedbackByAgent.set(agentId, list);
    }
  }
  for (const [agentId, signals] of feedbackByAgent) {
    if (signals.length < 2) continue;
    const entry = registry.find((e) => e.agent_id === agentId);
    recommendations.push({
      id: nextId(),
      kind: "scope_tune",
      title: `Tune: ${entry ? agentName(entry) : agentId}`,
      detail: `${signals.length} feedback mentions across meetings — propose a construction-spec edit (never an authority change without review).`,
      score: signals.length,
      score_breakdown: { feedback_count: signals.length },
      evidence: signals.map((s) => s.evidence_quote),
      refs: { person_ids: entry ? [entry.owner_person_id] : [], agent_ids: [agentId], signal_ids: signals.map((s) => s.id) },
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}
