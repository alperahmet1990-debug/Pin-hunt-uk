import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOpenAIClient,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
} from "../../../lib/integrations-openai-ai-server/src/client";

describe("OpenAI client options", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses a 25 s timeout and a single retry", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const client = getOpenAIClient();
    expect(OPENAI_REQUEST_TIMEOUT_MS).toBe(25_000);
    expect(OPENAI_MAX_RETRIES).toBe(1);
    expect(client.timeout).toBe(25_000);
    expect(client.maxRetries).toBe(1);
  });
});
