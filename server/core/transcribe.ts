import { toFile } from "openai";
import { openai, openaiEnabled, TRANSCRIPTION_MODEL, TRANSCRIPTION_PROVIDER } from "../openai.js";

export class TranscribeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface TranscribeResult {
  transcript: string;
  provider: string;
}

/** Framework-agnostic transcription — takes a raw audio buffer. */
export async function runTranscribe(buffer: Buffer, filename: string, mimetype: string): Promise<TranscribeResult> {
  if (TRANSCRIPTION_PROVIDER === "none") {
    throw new TranscribeError(503, "Transcription is disabled (TRANSCRIPTION_PROVIDER=none). Paste the transcript instead.");
  }

  if (TRANSCRIPTION_PROVIDER === "deepgram") {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new TranscribeError(503, "DEEPGRAM_API_KEY not configured.");
    const dgRes = await fetch("https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": mimetype || "audio/webm" },
      body: new Uint8Array(buffer),
    });
    const json = (await dgRes.json()) as any;
    const transcript = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    if (!transcript) throw new TranscribeError(502, "Deepgram returned no transcript.");
    return { transcript, provider: "deepgram" };
  }

  // default: openai
  if (!openaiEnabled || !openai) {
    throw new TranscribeError(503, "OPENAI_API_KEY not configured. Paste the transcript directly.");
  }
  const result = await openai.audio.transcriptions.create({
    file: await toFile(buffer, filename || "audio.webm", { type: mimetype }),
    model: TRANSCRIPTION_MODEL,
  });
  return { transcript: result.text, provider: "openai" };
}
