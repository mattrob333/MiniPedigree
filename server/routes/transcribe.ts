import type { Request, Response } from "express";
import { runTranscribe, TranscribeError } from "../core/transcribe.js";

export async function transcribeHandler(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).send("No audio file provided");
  try {
    const result = await runTranscribe(file.buffer, file.originalname || "audio.webm", file.mimetype);
    res.json(result);
  } catch (e) {
    if (e instanceof TranscribeError) return res.status(e.status).send(e.message);
    res.status(502).send(`Transcription failed: ${(e as Error).message}. Try a smaller file or paste the transcript.`);
  }
}
