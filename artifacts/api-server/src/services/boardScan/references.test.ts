import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchReferenceImage } from "./references";

// The server downloads reference pictures itself, so one it can't fetch is
// left out rather than failing the whole picture check.

let server: http.Server;
let base = "";
beforeAll(async () => {
  const big = await sharp({ create: { width: 2000, height: 1500, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 0.5 } } }).png().toBuffer();
  server = http.createServer((req, res) => {
    if (req.url === "/pin.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(big); return; }
    if (req.url === "/not-an-image") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html></html>"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("fetchReferenceImage", () => {
  it("returns a downloaded picture inline, shrunk to 768 px", async () => {
    const url = await fetchReferenceImage(`${base}/pin.png`);
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(url!.split(",")[1], "base64")).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(768);
  });

  it("returns null for a missing picture, a non-image, or an unreachable host", async () => {
    expect(await fetchReferenceImage(`${base}/missing.jpg`)).toBeNull();
    expect(await fetchReferenceImage(`${base}/not-an-image`)).toBeNull();
    expect(await fetchReferenceImage("http://127.0.0.1:9/pin.jpg")).toBeNull();
  });
});
