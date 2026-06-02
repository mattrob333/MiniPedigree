import type { ApiRequest, ApiResponse } from "../_types.js";
import { runAgentAuthor } from "../../server/core/agentAuthor.js";

// POST /api/agents/generate → { mode: "ai", authored } | { mode: "demo", reason }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const out = await runAgentAuthor((req.body ?? {}) as Record<string, unknown>);
  res.json(out);
}
