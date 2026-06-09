import type { Request, Response } from "express";
import { runStackDiff } from "../core/stackDiff.js";

export async function syncDiffHandler(req: Request, res: Response) {
  const body = req.body ?? {};
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
