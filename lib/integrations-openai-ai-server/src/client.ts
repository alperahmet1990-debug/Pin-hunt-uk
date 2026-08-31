import OpenAI from "openai";

/**
 * Lazy OpenAI client for the Replit AI Integrations proxy.
 *
 * Credentials are checked only when a caller actually asks for the client
 * (isAiConfigured() / getOpenAIClient()), not at module import time — an
 * unconfigured AI integration must never prevent the server process itself
 * from starting.
 */

let cachedClient: OpenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

/** Throws only when actually called without configuration — never at import time. */
export function getOpenAIClient(): OpenAI {
  if (!isAiConfigured()) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return cachedClient;
}
