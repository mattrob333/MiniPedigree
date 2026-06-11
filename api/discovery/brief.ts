import type { ApiRequest, ApiResponse } from "../_types.js";
import { runSessionBrief, type BriefInput } from "../../server/core/sessionBrief.js";

// POST /api/discovery/brief → { mode: "ai", brief } | { mode: "demo", reason }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const body = (req.body ?? {}) as BriefInput;
  const out = await runSessionBrief(body);
  res.json(out);
}
