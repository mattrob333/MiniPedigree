import type { VercelRequest, VercelResponse } from "@vercel/node";
import formidable from "formidable";
import { readFile } from "node:fs/promises";
import { runTranscribe, TranscribeError } from "../server/core/transcribe.js";

// Vercel must not pre-parse the multipart body — let formidable read the stream.
export const config = { api: { bodyParser: false } };

// POST /api/transcribe  (multipart form, field "file")  → { transcript, provider }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const form = formidable({ maxFileSize: Number(process.env.MAX_AUDIO_UPLOAD_MB || 25) * 1024 * 1024 });

  form.parse(req, async (err, _fields, files) => {
    if (err) {
      res.status(400).send("Could not read the uploaded audio.");
      return;
    }
    const raw = (files as Record<string, unknown>).file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!file || typeof file !== "object" || !("filepath" in file)) {
      res.status(400).send("No audio file provided");
      return;
    }
    const f = file as { filepath: string; originalFilename?: string; mimetype?: string };
    try {
      const buffer = await readFile(f.filepath);
      const result = await runTranscribe(buffer, f.originalFilename || "audio.webm", f.mimetype || "audio/webm");
      res.json(result);
    } catch (e) {
      if (e instanceof TranscribeError) {
        res.status(e.status).send(e.message);
        return;
      }
      res.status(502).send(`Transcription failed: ${(e as Error).message}. Try a smaller file or paste the transcript.`);
    }
  });
}
