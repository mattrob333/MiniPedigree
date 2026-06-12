export interface SessionInviteRecipient {
  name: string;
  email: string;
  prepSheetMarkdown: string;
}

export interface SessionInviteRequest {
  to: SessionInviteRecipient[];
  subject: string;
  icsContent: string;
}

export function emailInviteConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY || env.SMTP_URL);
}

export async function sendSessionInvites(_request: SessionInviteRequest): Promise<never> {
  // Phase 2 seam: send one personalized email per recipient with the .ics
  // content attached. Wire Resend or SMTP here without changing the modal.
  throw new Error("email_provider_not_implemented");
}
