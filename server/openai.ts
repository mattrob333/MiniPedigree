import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
export const openaiEnabled = Boolean(apiKey);

export const openai = openaiEnabled ? new OpenAI({ apiKey }) : null;

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
export const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
export const TRANSCRIPTION_PROVIDER = (process.env.TRANSCRIPTION_PROVIDER || "openai").toLowerCase();
