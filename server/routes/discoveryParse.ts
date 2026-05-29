import type { Request, Response } from "express";
import { runDiscoveryParse } from "../core/parse.js";

export async function discoveryParseHandler(req: Request, res: Response) {
  const { transcript, people } = req.body ?? {};
  const out = await runDiscoveryParse({ transcript, people });
  res.json(out);
}
