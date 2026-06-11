import type { Request, Response } from "express";
import { runMaintenanceParse } from "../core/maintenanceParse.js";

export async function maintenanceParseHandler(req: Request, res: Response) {
  const out = await runMaintenanceParse(req.body ?? {});
  res.json(out);
}
