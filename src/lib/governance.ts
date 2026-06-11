import type {
  CompanyContext,
  CompanyContextDocument,
  GovernanceResolution,
  GovernanceRule,
  Person,
} from "@/types";

// ── Stage B: Governance compilation ────────────────────────────────────
// Turns policy text (SoD bucket, policy bucket, approvalRules) into enforced
// constraints. Deterministic first; an optional AI pass (server-side) may only
// ADD rules, never remove them. Application is monotonic: blocked > approval >
// allowed — rules promote items up this ladder, never down.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "from", "into", "onto", "over", "under",
  "above", "below", "must", "may", "not", "never", "all", "any", "every", "each", "this", "that",
  "these", "those", "their", "them", "they", "person", "same", "one", "be", "is", "are", "was",
  "were", "been", "being", "have", "has", "had", "will", "would", "shall", "should", "can",
  "cannot", "could", "than", "then", "when", "where", "which", "who", "whom", "without", "within",
  "before", "after", "required", "requires", "require", "approval", "approve", "approves",
  "approved", "sign", "signs", "off", "more", "less", "out", "our", "your", "its", "his", "her",
]);

const APPROVAL_PATTERNS: RegExp[] = [
  /\bmust\s+(?:be\s+)?approv\w*/i,
  /\bsigns?\s*[- ]?off\b/i,
  /\brequires?\s+(?:\w+\s+){0,3}approval\b/i,
  /\bapproval\s+(?:is\s+)?required\b/i,
  /\bneeds?\s+(?:\w+\s+){0,2}approval\b/i,
  /\bmust\s+authori[sz]e\b/i,
  /\bmust\s+review\b/i,
];

const PROHIBITION_PATTERNS: RegExp[] = [
  /\bnever\b/i,
  /\bmust\s+not\b/i,
  /\bmay\s+not\b/i,
  /\bcannot\b/i,
  /\bcan\s*not\b/i,
  /\bprohibited\b/i,
  /\bnot\s+(?:be\s+)?allowed\b/i,
  /\bforbidden\b/i,
  /\bno\s+(?:one|agent|ai)\s+(?:may|can|should)\b/i,
];

const SOD_PATTERNS: RegExp[] = [
  /\bsame\s+(?:person|individual|agent|user)\s+(?:may|can|must|should)\s*not\b/i,
  /\b(?:may|can|must|should)\s*not\s+both\b/i,
  /\bsegregat\w+\s+of\s+dut\w+/i,
  /\bseparate\s+(?:person|individual|approver)\b/i,
  /\bboth\s+prepare\s+and\s+approve\b/i,
];

const AUDIT_PATTERNS: RegExp[] = [
  /\bmust\s+be\s+(?:logged|recorded|documented)\b/i,
  /\baudit\s+(?:trail|log|record|evidence)\b/i,
  /\bretain\s+(?:records|logs|evidence)\b/i,
  /\bkeep\s+a\s+record\b/i,
];

const AMOUNT_PATTERN = /(?:above|over|exceed\w*|more\s+than|greater\s+than|>)\s*\$?\s*([\d][\d,]*(?:\.\d+)?)\s*([kKmM])?\b/;

const NAMED_APPROVER_PATTERN = /\b([\w.+-]+@[\w-]+\.[\w.]+)\b/;
const MANAGER_APPROVER_PATTERN = /\b(manager|supervisor|director|vp|vice president|cfo|ceo|head of|finance|leadership|exec\w*)\b/i;

export interface GovernanceRuleSource {
  contextDocuments?: CompanyContextDocument[];
  approvalRules?: string[];
  segregationOfDuties?: string[];
}

/** Significant tokens of a sentence — the deterministic matcher keywords. */
export function significantKeywords(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9$ ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  ));
}

/**
 * Shared fuzzy-match metric: fraction of significant tokens two texts share
 * (relative to the smaller set). Used for stack diffs, signal corroboration,
 * backlog resolution, and merge detection — one implementation so matching
 * behaves identically everywhere.
 */
export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(significantKeywords(a));
  const tb = new Set(significantKeywords(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function classifySentence(sentence: string): GovernanceRule["type"] | null {
  // SoD beats prohibition (SoD sentences usually contain "may not").
  if (SOD_PATTERNS.some((re) => re.test(sentence))) return "sod_conflict";
  if (PROHIBITION_PATTERNS.some((re) => re.test(sentence))) return "blocked";
  if (APPROVAL_PATTERNS.some((re) => re.test(sentence)) || AMOUNT_PATTERN.test(sentence)) return "approval";
  if (AUDIT_PATTERNS.some((re) => re.test(sentence))) return "audit";
  return null;
}

function approverFor(sentence: string): GovernanceRule["approver"] {
  const named = sentence.match(NAMED_APPROVER_PATTERN);
  if (named) return named[1];
  if (MANAGER_APPROVER_PATTERN.test(sentence)) return "owner_manager";
  return "owner";
}

function amountThreshold(sentence: string): number | undefined {
  const m = sentence.match(AMOUNT_PATTERN);
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  return base * mult;
}

let ruleSeq = 0;
function nextRuleId(type: string): string {
  ruleSeq += 1;
  return `GR-${type}-${ruleSeq.toString().padStart(3, "0")}`;
}

function sentenceToRule(sentence: string, sourceDoc: string): GovernanceRule | null {
  const type = classifySentence(sentence);
  if (!type) return null;
  const rule: GovernanceRule = {
    rule_id: nextRuleId(type),
    type,
    condition: sentence.length > 160 ? sentence.slice(0, 157) + "…" : sentence,
    matcher: { keywords: significantKeywords(sentence) },
    source_doc: sourceDoc,
    evidence_quote: sentence,
    extracted_at: new Date().toISOString(),
    confidence: 0.9, // deterministic extraction: pattern-matched, human-readable
  };
  const threshold = amountThreshold(sentence);
  if (threshold !== undefined) rule.matcher.amount_threshold = threshold;
  if (type === "approval") rule.approver = approverFor(sentence);
  return rule;
}

/**
 * Deterministic rule extraction from the SoD bucket, policy bucket, and
 * approvalRules/segregationOfDuties lists. No AI involved — this is the
 * no-API-key path and the floor the optional AI pass may only add to.
 */
export function extractGovernanceRulesDeterministic(source: GovernanceRuleSource): GovernanceRule[] {
  ruleSeq = 0;
  const rules: GovernanceRule[] = [];
  const seen = new Set<string>();

  const push = (sentence: string, sourceDoc: string) => {
    const key = sentence.trim().toLowerCase();
    if (seen.has(key)) return;
    const rule = sentenceToRule(sentence, sourceDoc);
    if (rule) {
      seen.add(key);
      rules.push(rule);
    }
  };

  for (const ruleText of source.approvalRules ?? []) {
    push(ruleText, "company_context.approvalRules");
  }
  for (const sodText of source.segregationOfDuties ?? []) {
    push(sodText, "company_context.segregationOfDuties");
  }
  for (const doc of source.contextDocuments ?? []) {
    if (doc.bucket === "knowledge" || !doc.text?.trim()) continue;
    for (const sentence of splitSentences(doc.text)) {
      push(sentence, doc.id);
    }
  }
  return rules;
}

// ── Per-workspace cache keyed on a hash of the governance source ───────

const ruleCache = new Map<string, GovernanceRule[]>();

function djb2(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function governanceSourceHash(source: GovernanceRuleSource): string {
  return djb2(JSON.stringify({
    docs: (source.contextDocuments ?? []).filter((d) => d.bucket !== "knowledge").map((d) => [d.id, d.text]),
    approval: source.approvalRules ?? [],
    sod: source.segregationOfDuties ?? [],
  }));
}

/** Cached deterministic rules for a company context; re-extracts when documents change. */
export function getGovernanceRules(companyContext?: CompanyContext): GovernanceRule[] {
  if (!companyContext) return [];
  const source: GovernanceRuleSource = {
    contextDocuments: companyContext.contextDocuments,
    approvalRules: companyContext.approvalRules,
    segregationOfDuties: companyContext.segregationOfDuties,
  };
  const key = governanceSourceHash(source);
  const cached = ruleCache.get(key);
  if (cached) return cached;
  const rules = extractGovernanceRulesDeterministic(source);
  ruleCache.set(key, rules);
  return rules;
}

export function clearGovernanceRuleCache(): void {
  ruleCache.clear();
}

// ── Rule application: monotonic constraint merge ───────────────────────

export interface GovernanceSeeds {
  allowed: string[];
  approval: string[];
  blocked: string[];
}

export interface GovernanceOwnerCtx {
  owner: Pick<Person, "name" | "email">;
  managerEmail?: string | null;
  managerName?: string | null;
}

function matchesRule(action: string, rule: GovernanceRule): boolean {
  const hay = action.toLowerCase();
  const keywords = rule.matcher.keywords ?? [];
  return keywords.some((k) => hay.includes(k));
}

function resolveApprover(rule: GovernanceRule, ctx: GovernanceOwnerCtx): string {
  if (!rule.approver || rule.approver === "owner") return ctx.owner.email || ctx.owner.name;
  if (rule.approver === "owner_manager") {
    return ctx.managerEmail || ctx.managerName || ctx.owner.email || ctx.owner.name;
  }
  return rule.approver; // named email
}

// SoD verb groups: an sod_conflict rule fires when an action carries verbs from
// both sides (single action) or two actions split the sides (pair).
const SOD_PREPARE_VERBS = ["prepare", "create", "draft", "submit", "initiate", "enter", "request", "compile"];
const SOD_APPROVE_VERBS = ["approve", "authorize", "authorise", "sign", "release", "finalize", "finalise"];

/**
 * Apply governance rules to seed constraint lists. Monotonic: rules may promote
 * an action up the ladder (allowed → approval → blocked) and append audit
 * events; they never demote. Every applied rule is recorded in rule_provenance.
 */
export function applyGovernance(
  rules: GovernanceRule[],
  seeds: GovernanceSeeds,
  ctx: GovernanceOwnerCtx,
): GovernanceResolution {
  const blocked: GovernanceResolution["blocked"] = seeds.blocked.map((action) => ({ action }));
  const approval: GovernanceResolution["approval"] = seeds.approval.map((action) => ({
    action,
    approver: ctx.owner.email || ctx.owner.name,
  }));
  const allowed: string[] = [];
  const auditEvents: string[] = [];
  const sodFindings: GovernanceResolution["sod_findings"] = [];
  const provenance = new Map<string, { rule_id: string; source_doc: string; evidence_quote: string }>();

  const record = (rule: GovernanceRule) => {
    provenance.set(rule.rule_id, { rule_id: rule.rule_id, source_doc: rule.source_doc, evidence_quote: rule.evidence_quote });
  };

  const blockedKeys = new Set(blocked.map((b) => keyOf(b.action)));
  const approvalKeys = new Set(approval.map((a) => keyOf(a.action)));

  const promoteToBlocked = (action: string, rule: GovernanceRule) => {
    if (blockedKeys.has(keyOf(action))) return;
    blocked.push({ action, rule_id: rule.rule_id });
    blockedKeys.add(keyOf(action));
    record(rule);
  };
  const promoteToApproval = (action: string, rule: GovernanceRule) => {
    if (blockedKeys.has(keyOf(action)) || approvalKeys.has(keyOf(action))) return;
    approval.push({ action, approver: resolveApprover(rule, ctx), rule_id: rule.rule_id });
    approvalKeys.add(keyOf(action));
    record(rule);
  };

  const blockedRules = rules.filter((r) => r.type === "blocked");
  const approvalRules = rules.filter((r) => r.type === "approval");
  const auditRules = rules.filter((r) => r.type === "audit");
  const sodRules = rules.filter((r) => r.type === "sod_conflict");

  // 1) Promote seed-approval items to blocked when a blocked rule matches.
  for (const item of [...approval]) {
    const rule = blockedRules.find((r) => matchesRule(item.action, r));
    if (rule) {
      promoteToBlocked(item.action, rule);
    }
  }
  // Drop approval entries that were promoted to blocked.
  for (let i = approval.length - 1; i >= 0; i--) {
    if (blockedKeys.has(keyOf(approval[i].action))) approval.splice(i, 1);
  }

  // 2) Route each allowed seed: blocked > approval > allowed.
  for (const action of seeds.allowed) {
    if (blockedKeys.has(keyOf(action)) || approvalKeys.has(keyOf(action))) continue;
    const blockRule = blockedRules.find((r) => matchesRule(action, r));
    if (blockRule) {
      promoteToBlocked(action, blockRule);
      continue;
    }
    const approvalRule = approvalRules.find((r) => matchesRule(action, r));
    if (approvalRule) {
      promoteToApproval(action, approvalRule);
      continue;
    }
    allowed.push(action);
  }

  // 3) SoD conflicts across the still-actionable surface (allowed + approval).
  const actionable = [...allowed, ...approval.map((a) => a.action)];
  for (const rule of sodRules) {
    const matching = actionable.filter((action) => matchesRule(action, rule));
    if (!matching.length) continue;
    const preparing = matching.filter((a) => hasVerb(a, SOD_PREPARE_VERBS));
    const approving = matching.filter((a) => hasVerb(a, SOD_APPROVE_VERBS));

    for (const action of matching) {
      // Single action covering both sides of the conflict is blocked outright.
      if (hasVerb(action, SOD_PREPARE_VERBS) && hasVerb(action, SOD_APPROVE_VERBS)) {
        removeFromAllowedOrApproval(action);
        promoteToBlocked(action, rule);
        sodFindings.push({ description: `"${action}" both prepares and approves; blocked per segregation of duties.`, rule_id: rule.rule_id, resolution: "blocked" });
      }
    }
    if (preparing.length && approving.length) {
      // Split: the preparing side stays; the approving side is blocked for this agent.
      for (const action of approving) {
        if (hasVerb(action, SOD_PREPARE_VERBS)) continue; // already handled above
        removeFromAllowedOrApproval(action);
        promoteToBlocked(action, rule);
      }
      sodFindings.push({
        description: `Agent both prepares (${preparing.join("; ")}) and approves (${approving.join("; ")}); the approving side was split out and blocked.`,
        rule_id: rule.rule_id,
        resolution: "split",
      });
      record(rule);
    } else if (matching.length && !sodFindings.some((f) => f.rule_id === rule.rule_id)) {
      sodFindings.push({ description: `Actions touch a segregation-of-duties area: ${matching.join("; ")}.`, rule_id: rule.rule_id, resolution: "warned" });
      record(rule);
    }
  }

  // 4) Audit rules append required audit events for any matching action.
  for (const rule of auditRules) {
    if (actionable.some((action) => matchesRule(action, rule))) {
      auditEvents.push(`policy_audit:${rule.rule_id}:${truncate(rule.condition, 80)}`);
      record(rule);
    }
  }

  function removeFromAllowedOrApproval(action: string) {
    const k = keyOf(action);
    const ai = allowed.findIndex((a) => keyOf(a) === k);
    if (ai >= 0) allowed.splice(ai, 1);
    const pi = approval.findIndex((a) => keyOf(a.action) === k);
    if (pi >= 0) {
      approval.splice(pi, 1);
      approvalKeys.delete(k);
    }
  }

  return {
    allowed,
    approval,
    blocked,
    audit_events: Array.from(new Set(auditEvents)),
    sod_findings: sodFindings,
    rule_provenance: Array.from(provenance.values()),
  };
}

function hasVerb(action: string, verbs: string[]): boolean {
  const hay = action.toLowerCase();
  return verbs.some((v) => hay.includes(v));
}

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
