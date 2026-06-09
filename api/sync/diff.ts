import type { ApiRequest, ApiResponse } from "../_types.js";
import { runStackDiff } from "../../server/core/stackDiff.js";
import type { StackDiffInput } from "../../src/lib/stackSync.js";

// POST /api/sync/diff → { mode: "ai" | "deterministic", proposals }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const body = (req.body ?? {}) as Partial<StackDiffInput>;
  const out = await runStackDiff({
    parsed: body.parsed ?? {},
    transcript: typeof body.transcript === "string" ? body.transcript : "",
    transcriptId: body.transcriptId,
    people: body.people ?? [],
    pedigree: body.pedigree ?? {},
    registry: body.registry ?? [],
    rules: body.rules ?? [],
  });
  res.json(out);
}
