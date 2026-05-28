import type { Request, Response } from "express";
import { toFile } from "openai";
import { openai, openaiEnabled, TRANSCRIPTION_MODEL, TRANSCRIPTION_PROVIDER } from "../openai.js";

export async function transcribeHandler(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).send("No audio file provided");

  if (TRANSCRIPTION_PROVIDER === "none") {
    return res.status(503).send("Transcription is disabled (TRANSCRIPTION_PROVIDER=none). Paste the transcript instead.");
  }

  if (TRANSCRIPTION_PROVIDER === "deepgram") {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return res.status(503).send("DEEPGRAM_API_KEY not configured.");
    try {
      const dgRes = await fetch("https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true", {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": file.mimetype || "audio/webm" },
        body: new Uint8Array(file.buffer),
      });
      const json = (await dgRes.json()) as any;
      const transcript = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) return res.status(502).send("Deepgram returned no transcript.");
      return res.json({ transcript, provider: "deepgram" });
    } catch (e) {
      return res.status(502).send(`Transcription failed: ${(e as Error).message}`);
    }
  }

  // default: openai
  if (!openaiEnabled || !openai) {
    return res.status(503).send("OPENAI_API_KEY not configured. Paste the transcript directly.");
  }
  try {
    const result = await openai.audio.transcriptions.create({
      file: await toFile(file.buffer, file.originalname || "audio.webm", { type: file.mimetype }),
      model: TRANSCRIPTION_MODEL,
    });
    return res.json({ transcript: result.text, provider: "openai" });
  } catch (e) {
    return res.status(502).send(`Transcription failed: ${(e as Error).message}. Try a smaller file or paste the transcript.`);
  }
}
