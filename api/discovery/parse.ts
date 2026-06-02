import type { ApiRequest, ApiResponse } from "../_types.js";
import { runDiscoveryParse } from "../../server/core/parse.js";

// POST /api/discovery/parse  → { mode: "ai", discovery } | { mode: "demo", reason }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const body = (req.body ?? {}) as { transcript?: unknown; people?: unknown; company_context?: unknown };
  const out = await runDiscoveryParse({ transcript: body.transcript, people: body.people, company_context: body.company_context });
  res.json(out);
}
