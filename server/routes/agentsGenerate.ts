import type { Request, Response } from "express";
import { runAgentAuthor } from "../core/agentAuthor.js";

export async function agentsGenerateHandler(req: Request, res: Response) {
  const out = await runAgentAuthor(req.body ?? {});
  res.json(out);
}
