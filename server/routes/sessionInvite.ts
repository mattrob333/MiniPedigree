import type { Request, Response } from "express";
import { emailInviteConfigured, sendSessionInvites, type SessionInviteRequest } from "../core/sessionInvite.js";

export async function sessionInviteHandler(req: Request, res: Response) {
  if (!emailInviteConfigured()) {
    res.status(501).json({ error: "email_not_configured" });
    return;
  }

  const body = req.body as Partial<SessionInviteRequest>;
  if (!Array.isArray(body.to) || !body.subject || !body.icsContent) {
    res.status(400).json({ error: "invalid_invite_request" });
    return;
  }

  try {
    await sendSessionInvites(body as SessionInviteRequest);
    res.json({ ok: true });
  } catch {
    res.status(501).json({ error: "email_provider_not_implemented" });
  }
}
