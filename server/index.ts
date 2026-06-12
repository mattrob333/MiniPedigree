import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { discoveryParseHandler } from "./routes/discoveryParse.js";
import { agentsGenerateHandler } from "./routes/agentsGenerate.js";
import { transcribeHandler } from "./routes/transcribe.js";
import { companyProfileParseHandler } from "./routes/companyProfileParse.js";
import { syncDiffHandler } from "./routes/syncDiff.js";
import { sessionBriefHandler } from "./routes/sessionBrief.js";
import { maintenanceParseHandler } from "./routes/maintenanceParse.js";
import { openaiEnabled, TRANSCRIPTION_PROVIDER } from "./openai.js";
import { emailInviteConfigured } from "./core/sessionInvite.js";
import { sessionInviteHandler } from "./routes/sessionInvite.js";
import { taskEnrichHandler } from "./routes/taskEnrich.js";

const app = express();
const PORT = Number(process.env.API_PORT || 8787);
const MAX_MB = Number(process.env.MAX_AUDIO_UPLOAD_MB || 25);

app.use(cors());
app.use(express.json({ limit: "4mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openai: openaiEnabled,
    email: emailInviteConfigured(),
    transcription_provider: TRANSCRIPTION_PROVIDER,
  });
});

app.post("/api/discovery/parse", discoveryParseHandler);
app.post("/api/agents/generate", agentsGenerateHandler);
app.post("/api/company/profile/parse", companyProfileParseHandler);
app.post("/api/sync/diff", syncDiffHandler);
app.post("/api/discovery/brief", sessionBriefHandler);
app.post("/api/sync/maintenance", maintenanceParseHandler);
app.post("/api/transcribe", upload.single("file"), transcribeHandler);
app.post("/api/sessions/invite", sessionInviteHandler);
app.post("/api/tasks/enrich", taskEnrichHandler);

const server = app.listen(PORT);

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
