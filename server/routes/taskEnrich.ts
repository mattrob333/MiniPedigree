import type { Request, Response } from "express";
import { runTaskEnrich } from "../core/taskEnrich.js";

export async function taskEnrichHandler(req: Request, res: Response) {
  const out = await runTaskEnrich(req.body ?? {});
  if (out.mode === "unavailable") {
    res.status(503).json(out);
    return;
  }
  res.json(out);
}
