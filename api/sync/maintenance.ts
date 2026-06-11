import type { ApiRequest, ApiResponse } from "../_types.js";
import { runMaintenanceParse, type MaintenanceParseInput } from "../../server/core/maintenanceParse.js";

// POST /api/sync/maintenance → { mode: "ai", signals } | { mode: "demo", reason }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const body = (req.body ?? {}) as MaintenanceParseInput;
  const out = await runMaintenanceParse(body);
  res.json(out);
}
