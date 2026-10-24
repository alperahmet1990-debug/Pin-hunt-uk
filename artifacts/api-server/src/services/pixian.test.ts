import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePinPhoto, pixianConfigured, PixianTimeoutError } from "./pixian";

// Pixian client: production test-mode guard, retry and timeout (#472).
// fetch is stubbed: no real Pixian traffic.

const ok = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe("pixian", () => {
  beforeEach(() => {
    vi.stubEnv("PIXIAN_API_ID", "id");
    vi.stubEnv("PIXIAN_API_SECRET", "secret");
    vi.stubEnv("PIXIAN_TEST_MODE", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is switched off when test mode is set in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIXIAN_TEST_MODE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(pixianConfigured()).toBe(false);
    await expect(normalizePinPhoto(Buffer.from([1]), "image/jpeg")).rejects.toThrow(/test mode/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows test mode outside production", () => {
    vi.stubEnv("PIXIAN_TEST_MODE", "true");
    expect(pixianConfigured()).toBe(true);
  });

  it("retries once after a 5xx", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const out = await normalizePinPhoto(Buffer.from([1]), "image/jpeg");
    expect(out).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(normalizePinPhoto(Buffer.from([1]), "image/jpeg")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up with a timeout error and does not retry it", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchMock);
    await expect(normalizePinPhoto(Buffer.from([1]), "image/jpeg")).rejects.toBeInstanceOf(PixianTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    await normalizePinPhoto(Buffer.from([1]), "image/jpeg");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
