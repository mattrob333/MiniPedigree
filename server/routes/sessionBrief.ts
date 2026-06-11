import type { Request, Response } from "express";
import { runSessionBrief } from "../core/sessionBrief.js";

export async function sessionBriefHandler(req: Request, res: Response) {
  const out = await runSessionBrief(req.body ?? {});
  res.json(out);
}
