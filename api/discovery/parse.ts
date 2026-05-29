import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runDiscoveryParse } from "../../server/core/parse.js";

// POST /api/discovery/parse  → { mode: "ai", discovery } | { mode: "demo", reason }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const body = (req.body ?? {}) as { transcript?: unknown; people?: unknown; company_context?: unknown };
  const out = await runDiscoveryParse({ transcript: body.transcript, people: body.people, company_context: body.company_context });
  res.json(out);
}
