import type { Request, Response } from "express";
import { runCompanyProfileParse } from "../core/companyProfile.js";

export async function companyProfileParseHandler(req: Request, res: Response) {
  const out = await runCompanyProfileParse(req.body ?? {});
  res.json(out);
}
