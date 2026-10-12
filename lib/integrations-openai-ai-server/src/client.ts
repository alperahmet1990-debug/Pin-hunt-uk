import OpenAI from "openai";

/**
 * Lazy OpenAI client — talks to the standard OpenAI API directly (no
 * Replit AI Integrations proxy).
 *
 * Credentials are checked only when a caller actually asks for the client
 * (isAiConfigured() / getOpenAIClient()), not at module import time — an
 * unconfigured AI integration must never prevent the server process itself
 * from starting.
 */

/** Hard cap per upstream call so a hung request can't hold a scan open. */
export const OPENAI_REQUEST_TIMEOUT_MS = 25_000;
/** SDK default is 2 retries; one is enough and keeps worst case bounded. */
export const OPENAI_MAX_RETRIES = 1;

let cachedClient: OpenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Throws only when actually called without configuration — never at import time. */
export function getOpenAIClient(): OpenAI {
  if (!isAiConfigured()) {
    throw new Error("OPENAI_API_KEY must be set.");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_REQUEST_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    });
  }
  return cachedClient;
}
