import { openaiEnabled } from "../openai.js";
import { callStructured } from "./openaiCall.js";
import {
  extractGovernanceRulesDeterministic,
  governanceSourceHash,
  type GovernanceRuleSource,
} from "../../src/lib/governance.js";
import type { GovernanceRule } from "../../src/types.js";

const SYSTEM_PROMPT = `You are Pedigree's Governance Rule Extractor.

You read company policy text (segregation-of-duties documents, approval policies,
approval rules) and extract machine-applicable governance rules.

Rule types:
- "blocked": the action must never be performed by an agent.
- "approval": the action requires a named human's approval before completion.
- "audit": the action must emit audit evidence (logging, records, documentation).
- "sod_conflict": the same actor may not perform two conflicting actions
  (e.g. prepare AND approve a payment).

Rules:
1. Every rule must carry an exact evidence_quote copied from the source text.
2. approver is "owner", "owner_manager", or an explicit email found in the text.
3. matcher.keywords are the significant words an action must contain to match.
4. matcher.amount_threshold is the dollar threshold when the text states one.
5. You may ADD restrictions the deterministic pass missed. You must never
   weaken, soften, or contradict a restriction. When unsure, prefer the
   stricter rule type (blocked > approval > audit).
6. Do not invent policy that the text does not state.
7. Return only structured JSON matching the schema.`;

const responseSchema = {
  name: "governance_rules",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      rules: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["blocked", "approval", "audit", "sod_conflict"] },
            condition: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            amount_threshold: { type: ["number", "null"] },
            approver: { type: ["string", "null"] },
            source_doc: { type: "string" },
            evidence_quote: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["type", "condition", "keywords", "amount_threshold", "approver", "source_doc", "evidence_quote", "confidence"],
        },
      },
    },
    required: ["rules"],
  },
} as const;

interface AiRule {
  type: GovernanceRule["type"];
  condition: string;
  keywords: string[];
  amount_threshold: number | null;
  approver: string | null;
  source_doc: string;
  evidence_quote: string;
  confidence: number;
}

export interface ExtractResult {
  mode: "ai" | "deterministic";
  rules: GovernanceRule[];
  source_hash: string;
  reason?: string;
}

// Cache per source hash so repeated compiles don't re-call the model.
const cache = new Map<string, ExtractResult>();

/**
 * Stage B rule extraction: deterministic pass first, then an optional AI pass
 * that may only ADD rules. Deterministic rules are never deleted or altered.
 */
export async function extractGovernanceRules(source: GovernanceRuleSource): Promise<ExtractResult> {
  const sourceHash = governanceSourceHash(source);
  const cached = cache.get(sourceHash);
  if (cached) return cached;

  const deterministic = extractGovernanceRulesDeterministic(source);

  if (!openaiEnabled) {
    const out: ExtractResult = { mode: "deterministic", rules: deterministic, source_hash: sourceHash, reason: "OPENAI_API_KEY not configured" };
    cache.set(sourceHash, out);
    return out;
  }

  try {
    const docs = (source.contextDocuments ?? [])
      .filter((d) => d.bucket !== "knowledge" && d.text?.trim())
      .map((d) => `--- document ${d.id} (${d.bucket}) ---\n${d.text}`);
    const user = [
      docs.length ? `Policy & SoD documents:\n${docs.join("\n\n")}` : "",
      source.approvalRules?.length ? `Approval rules (source_doc: company_context.approvalRules):\n${source.approvalRules.join("\n")}` : "",
      source.segregationOfDuties?.length ? `Segregation of duties (source_doc: company_context.segregationOfDuties):\n${source.segregationOfDuties.join("\n")}` : "",
      `Rules already extracted deterministically (do not duplicate; you may only add):\n${JSON.stringify(deterministic.map((r) => ({ type: r.type, condition: r.condition })), null, 2)}`,
    ].filter(Boolean).join("\n\n");

    const parsed = await callStructured<{ rules: AiRule[] }>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: responseSchema.name,
      schema: responseSchema.schema as unknown as Record<string, unknown>,
    });

    const existing = new Set(deterministic.map((r) => r.condition.trim().toLowerCase()));
    const added: GovernanceRule[] = (parsed.rules ?? [])
      .filter((r) => r.condition && r.evidence_quote && !existing.has(r.condition.trim().toLowerCase()))
      .map((r, i) => ({
        rule_id: `GR-ai-${r.type}-${String(i + 1).padStart(3, "0")}`,
        type: r.type,
        condition: r.condition,
        matcher: {
          keywords: r.keywords?.map((k) => k.toLowerCase()).filter(Boolean) ?? [],
          ...(r.amount_threshold != null ? { amount_threshold: r.amount_threshold } : {}),
        },
        ...(r.approver ? { approver: r.approver } : {}),
        source_doc: r.source_doc || "company_context",
        evidence_quote: r.evidence_quote,
        extracted_at: new Date().toISOString(),
        confidence: Math.min(Math.max(r.confidence ?? 0.6, 0), 1),
      }));

    // AI may only add: deterministic rules always come through untouched.
    const out: ExtractResult = { mode: "ai", rules: [...deterministic, ...added], source_hash: sourceHash };
    cache.set(sourceHash, out);
    return out;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("governance rule extraction failed:", msg);
    const out: ExtractResult = { mode: "deterministic", rules: deterministic, source_hash: sourceHash, reason: "ai_error: " + msg.slice(0, 200) };
    cache.set(sourceHash, out);
    return out;
  }
}

export function clearGovernanceExtractionCache(): void {
  cache.clear();
}
