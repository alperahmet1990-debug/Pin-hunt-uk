import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadPicture, fetchReferenceImage, isPrivateAddress } from "./references";

// The server downloads reference pictures itself, so one it can't fetch is
// left out rather than failing the whole picture check.

/** The test server is on 127.0.0.1, which real downloads refuse. */
const local = { allowPrivate: true };
let server: http.Server;
let base = "";
beforeAll(async () => {
  const big = await sharp({ create: { width: 2000, height: 1500, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 0.5 } } }).png().toBuffer();
  server = http.createServer((req, res) => {
    if (req.url === "/pin.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(big); return; }
    if (req.url === "/huge-no-length") {
      // No Content-Length: streamed until the client gives up.
      res.writeHead(200, { "content-type": "image/jpeg" });
      const chunk = Buffer.alloc(64 * 1024, 1);
      let sent = 0;
      const pump = () => { while (sent < 400 && res.write(chunk)) sent++; if (sent < 400) res.once("drain", pump); else res.end(); };
      res.on("close", () => { sent = 400; });
      pump();
      return;
    }
    if (req.url === "/to-metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
    if (req.url === "/to-pin") { res.writeHead(301, { location: "/pin.png" }); res.end(); return; }
    if (req.url === "/not-an-image") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html></html>"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("fetchReferenceImage", () => {
  it("returns a downloaded picture inline, shrunk to 768 px", async () => {
    const url = await fetchReferenceImage(`${base}/pin.png`, local);
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(url!.split(",")[1], "base64")).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(768);
  });

  it("returns null for a missing picture, a non-image, or an unreachable host", async () => {
    expect(await fetchReferenceImage(`${base}/missing.jpg`, local)).toBeNull();
    expect(await fetchReferenceImage(`${base}/not-an-image`, local)).toBeNull();
    expect(await fetchReferenceImage("http://127.0.0.1:9/pin.jpg", local)).toBeNull();
  });

  it("stops reading a picture once it passes the size limit, even without a Content-Length", async () => {
    await expect(downloadPicture(`${base}/huge-no-length`, 1024 * 1024, local)).rejects.toThrow("picture too large");
    expect((await downloadPicture(`${base}/pin.png`, undefined, local)).length).toBeGreaterThan(0);
  });

  it("refuses internal addresses, and follows a redirect only to an allowed one", async () => {
    await expect(downloadPicture("http://127.0.0.1:1/x.jpg")).rejects.toThrow("address not allowed");
    await expect(downloadPicture("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("address not allowed");
    await expect(downloadPicture("file:///etc/passwd")).rejects.toThrow("not a web address");
    await expect(downloadPicture("http://[::ffff:169.254.169.254]/latest/")).rejects.toThrow("address not allowed");
    expect((await downloadPicture(`${base}/to-pin`, undefined, local)).length).toBeGreaterThan(0);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254, as URL parsing writes it
    expect(isPrivateAddress("::7f00:1")).toBe(true);
    expect(isPrivateAddress("64:ff9b::a9fe:a9fe")).toBe(true);
    expect(isPrivateAddress("2002:a9fe:a9fe::1")).toBe(true);
    expect(isPrivateAddress("febf::1")).toBe(true);
    expect(isPrivateAddress("fec0::1")).toBe(true);
    expect(isPrivateAddress("::ffff:9765:101")).toBe(false); // 151.101.1.1
    expect(isPrivateAddress("2a04:4e42::1")).toBe(false);
    for (const ip of ["192.0.0.8", "192.0.2.1", "198.18.0.1", "198.19.255.1", "198.51.100.7", "203.0.113.9"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("151.101.1.1")).toBe(false);
    expect(await fetchReferenceImage("http://localhost:1/pin.jpg")).toBeNull();
  });
});
