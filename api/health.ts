import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    transcription_provider: (process.env.TRANSCRIPTION_PROVIDER || "openai").toLowerCase(),
    runtime: "vercel",
  });
}
