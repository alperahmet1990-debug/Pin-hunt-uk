import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outbound timeouts (#67): every call this server makes to another service
// must give up on its own, so a hung upstream can't hold a request open.
// No real network traffic: fetch and the Vision client are stubbed.

const vision = vi.hoisted(() => ({
  batchAnnotateImages: vi.fn(),
}));

vi.mock("@google-cloud/vision", () => ({
  ImageAnnotatorClient: class {
    batchAnnotateImages = vision.batchAnnotateImages;
  },
}));

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__fixtures__") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mjs)$/.test(entry.name) && !/\.test\.(ts|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** The text of each call matching `pattern`, from the call to its closing parenthesis. */
function calls(source: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    let i = match.index! + match[0].length - 1; // at the opening "("
    for (; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")" && --depth === 0) break;
    }
    found.push(source.slice(match.index!, i + 1));
  }
  return found;
}

/** A fetch that never answers, except by rejecting when its signal aborts. */
function hangingFetch() {
  return vi.fn((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
}

/** Keeps the requested timeout for the assertion, but fires after 10 ms. */
function shortenTimeouts() {
  const real = AbortSignal.timeout.bind(AbortSignal);
  return vi.spyOn(AbortSignal, "timeout").mockImplementation(() => real(10));
}

describe("every outbound call has a timeout", () => {
  const files = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "scripts"))];

  it("passes a signal to every fetch", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of files) {
      for (const call of calls(readFileSync(file, "utf8"), /\bfetch(?:Impl\(\))?\(/g)) {
        seen++;
        if (!/\bsignal\s*:/.test(call)) missing.push(`${relative(ROOT, file)}: ${call.slice(0, 80)}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("gives every Google Vision call a deadline", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of files) {
      for (const call of calls(readFileSync(file, "utf8"), /\.(?:annotateImage|batchAnnotateImages)\(/g)) {
        seen++;
        if (!/\btimeout\s*:/.test(call)) missing.push(relative(ROOT, file));
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("creates the OpenAI client with a timeout", () => {
    const client = readFileSync(
      join(ROOT, "..", "..", "lib", "integrations-openai-ai-server", "src", "client.ts"),
      "utf8",
    );
    const ctor = calls(client, /new OpenAI\(/g);
    expect(ctor).toHaveLength(1);
    expect(ctor[0]).toMatch(/\btimeout\s*:/);
  });
});

describe("hanging upstreams", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("eBay", () => {
    beforeEach(() => {
      vi.stubEnv("EBAY_CLIENT_ID", "id");
      vi.stubEnv("EBAY_CLIENT_SECRET", "secret");
    });

    it("gives up when the token request hangs", async () => {
      const timeout = shortenTimeouts();
      vi.stubGlobal("fetch", hangingFetch());
      const { searchListings } = await import("./ebay");
      await expect(searchListings("EBAY_GB", "hatbox ghost pin")).rejects.toMatchObject({ name: "TimeoutError" });
      expect(timeout).toHaveBeenCalledWith(15_000);
    });

    it("gives up when the search hangs", async () => {
      const timeout = shortenTimeouts();
      const hang = hangingFetch();
      const fetchMock = vi.fn((url: unknown, init?: RequestInit) =>
        String(url).includes("/oauth2/token")
          ? Promise.resolve(Response.json({ access_token: "t", expires_in: 7200 }))
          : hang(url, init));
      vi.stubGlobal("fetch", fetchMock);
      const { searchListings } = await import("./ebay");
      await expect(searchListings("EBAY_GB", "hatbox ghost pin")).rejects.toMatchObject({ name: "TimeoutError" });
      expect(timeout).toHaveBeenCalledWith(20_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Pixian", () => {
    it("reports a timeout when Pixian hangs, without retrying", async () => {
      vi.stubEnv("PIXIAN_API_ID", "id");
      vi.stubEnv("PIXIAN_API_SECRET", "secret");
      vi.stubEnv("PIXIAN_TEST_MODE", "");
      const timeout = shortenTimeouts();
      const fetchMock = hangingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const { normalizePinPhoto, PixianTimeoutError } = await import("./pixian");
      await expect(normalizePinPhoto(Buffer.from([1]), "image/jpeg")).rejects.toBeInstanceOf(PixianTimeoutError);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Google Vision (scan signals)", () => {
    it("returns null on time and sets the same deadline on the call", async () => {
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", JSON.stringify({
        project_id: "p", client_email: "e@example.com", private_key: "k",
      }));
      vision.batchAnnotateImages.mockReset().mockImplementation(() => new Promise(() => {}));
      const { getVisionSignals } = await import("./google-vision");
      const started = Date.now();
      await expect(getVisionSignals("AAAA", 20)).resolves.toBeNull();
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(vision.batchAnnotateImages).toHaveBeenCalledWith(expect.anything(), { timeout: 20 });
    });
  });
});
