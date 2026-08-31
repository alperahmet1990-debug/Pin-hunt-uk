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
    });
  }
  return cachedClient;
}
