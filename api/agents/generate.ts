import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAgentAuthor } from "../../server/core/agentAuthor.js";

// POST /api/agents/generate → { mode: "ai", authored } | { mode: "demo", reason }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const out = await runAgentAuthor((req.body ?? {}) as Record<string, unknown>);
  res.json(out);
}
