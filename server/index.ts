import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { discoveryParseHandler } from "./routes/discoveryParse.js";
import { agentsGenerateHandler } from "./routes/agentsGenerate.js";
import { transcribeHandler } from "./routes/transcribe.js";
import { companyProfileParseHandler } from "./routes/companyProfileParse.js";
import { openaiEnabled, TRANSCRIPTION_PROVIDER } from "./openai.js";

const app = express();
const PORT = Number(process.env.API_PORT || 8787);
const MAX_MB = Number(process.env.MAX_AUDIO_UPLOAD_MB || 25);

// Local dev server: only the Vite client may call it cross-origin, and it
// should not be reachable from other machines on the LAN.
const DEV_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",");
app.use(cors({ origin: DEV_ORIGINS }));
app.use(express.json({ limit: "4mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openai: openaiEnabled,
    transcription_provider: TRANSCRIPTION_PROVIDER,
  });
});

// Express 4 doesn't catch async handler rejections — wrap so an unexpected
// throw becomes a 500 JSON response instead of a hung request.
type Handler = (req: express.Request, res: express.Response) => unknown;
const safe = (handler: Handler): express.RequestHandler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    console.error("[pedigree] handler error", e);
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  }
};

app.post("/api/discovery/parse", safe(discoveryParseHandler));
app.post("/api/agents/generate", safe(agentsGenerateHandler));
app.post("/api/company/profile/parse", safe(companyProfileParseHandler));
app.post("/api/transcribe", upload.single("file"), safe(transcribeHandler));

// Map multer's oversize error to a 413 with a friendly message.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && typeof err === "object" && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `Audio file is too large (max ${MAX_MB} MB).` });
    return;
  }
  next(err);
});

const HOST = process.env.API_HOST || "127.0.0.1";
const server = app.listen(PORT, HOST);

server.on("listening", () => {
  console.log(`[pedigree] API server on http://localhost:${PORT}`);
  console.log(`[pedigree] OpenAI: ${openaiEnabled ? "enabled" : "disabled (demo fallback)"} · transcription: ${TRANSCRIPTION_PROVIDER}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE" && process.env.NODE_ENV !== "production") {
    console.warn(`[pedigree] API port ${PORT} is already in use; keeping the existing local server.`);
    process.exit(0);
  }
  throw err;
});
