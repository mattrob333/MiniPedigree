import { openai, openaiEnabled, MODEL } from "../openai.js";

// gpt-5.x / o-series are reasoning models on the Responses API: they take
// reasoning.effort and reject temperature. Older models (gpt-4o, gpt-4.1) accept temperature.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

export interface StructuredCallOpts {
  system: string;
  user: string;
  schemaName: string;
  /** JSON schema body (the object under "schema"), strict-compatible. */
  schema: Record<string, unknown>;
  model?: string;
}

/**
 * Single structured-output call via the Responses API (works for gpt-5.5 and gpt-4o).
 * Returns the parsed JSON, with one automatic repair attempt. Throws on hard failure.
 */
export async function callStructured<T = unknown>(opts: StructuredCallOpts): Promise<T> {
  if (!openaiEnabled || !openai) throw new Error("OPENAI_API_KEY not configured");
  const model = opts.model || MODEL;
  const reasoning = isReasoningModel(model);

  const base: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    text: {
      format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true },
    },
  };
  if (reasoning) {
    base.reasoning = { effort: process.env.OPENAI_REASONING_EFFORT || "medium" };
  } else {
    base.temperature = 0.2;
  }

  const res = await (openai as any).responses.create(base);
  const raw: string = res.output_text ?? "";
  try {
    return JSON.parse(raw) as T;
  } catch {
    // one repair attempt
    const repair = await (openai as any).responses.create({
      ...base,
      input: [
        { role: "system", content: "Return ONLY valid JSON matching the requested schema. No prose." },
        { role: "user", content: raw },
      ],
    });
    return JSON.parse(repair.output_text ?? "{}") as T;
  }
}
