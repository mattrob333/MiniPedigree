import type { ApiRequest, ApiResponse } from "./_types.js";

export default function handler(_req: ApiRequest, res: ApiResponse) {
  res.json({
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    transcription_provider: (process.env.TRANSCRIPTION_PROVIDER || "openai").toLowerCase(),
    runtime: "vercel",
  });
}
