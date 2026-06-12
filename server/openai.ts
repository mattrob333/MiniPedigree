import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
export const openaiEnabled = Boolean(apiKey);

export const openai = openaiEnabled ? new OpenAI({ apiKey }) : null;

// OpenAI model slugs are lowercase and case-sensitive (e.g. "gpt-5.5"). Normalize
// so a mis-cased env var like "GPT-5.5" still resolves instead of 400-ing.
export const MODEL = (process.env.OPENAI_MODEL || "gpt-5.5").trim().toLowerCase();
export const ENRICH_MODEL = (process.env.OPENAI_ENRICH_MODEL || MODEL).trim().toLowerCase();
export const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
export const TRANSCRIPTION_PROVIDER = (process.env.TRANSCRIPTION_PROVIDER || "openai").toLowerCase();
