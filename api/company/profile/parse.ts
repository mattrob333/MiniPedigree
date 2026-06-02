import type { ApiRequest, ApiResponse } from "../../_types.js";
import { runCompanyProfileParse } from "../../../server/core/companyProfile.js";

// POST /api/company/profile/parse -> { mode: "ai", profile } | { mode: "demo", profile, reason }
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const out = await runCompanyProfileParse((req.body ?? {}) as Record<string, unknown>);
  res.json(out);
}
