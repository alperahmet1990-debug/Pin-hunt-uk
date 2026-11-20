import { createVerify, generateKeyPairSync } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { accessToken, EMBEDDING_DIMENSION, embedImage, pictureIndexConfigured, resetTokenCacheForTests, toVectorLiteral, VertexError } from "./vertex";

// Vertex AI embeddings without the network: a throwaway key signs the
// sign-in token, and a fake fetch plays Google's token and predict endpoints.

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sa = { project_id: "proj-1", client_email: "indexer@proj-1.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const env = { GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify(sa), PICTURE_INDEX_ENABLED: "true" } as NodeJS.ProcessEnv;

type Call = { url: string; init: RequestInit };
function fakeGoogle(predict: (body: unknown) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    }
    const r = predict(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const picture = () => sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 0.5 } } }).png().toBuffer();
const vector = Array.from({ length: EMBEDDING_DIMENSION }, (_, i) => i / 1000);

beforeEach(() => resetTokenCacheForTests());

describe("picture index: Vertex AI", () => {
  it("is on only when switched on and Google credentials with a project are present", () => {
    expect(pictureIndexConfigured(env)).toBe(true);
    expect(pictureIndexConfigured({ ...env, PICTURE_INDEX_ENABLED: undefined })).toBe(false);
    expect(pictureIndexConfigured({ PICTURE_INDEX_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(pictureIndexConfigured({ ...env, GOOGLE_APPLICATION_CREDENTIALS_JSON: "{not json" })).toBe(false);
  });

  it("signs in with a correctly signed token and reuses it", async () => {
    const g = fakeGoogle(() => ({ status: 200, body: {} }));
    expect(await accessToken(sa, g.impl)).toBe("tok-1");
    expect(await accessToken(sa, g.impl)).toBe("tok-1");
    expect(g.calls).toHaveLength(1);
    const assertion = new URLSearchParams(String(g.calls[0].init.body)).get("assertion")!;
    const [h, c, sig] = assertion.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ iss: sa.client_email, aud: "https://oauth2.googleapis.com/token" });
  });

  it("describes a picture: a small JPEG in, 256 numbers out", async () => {
    let sent: { instances: Array<{ image: { bytesBase64Encoded: string } }>; parameters: { dimension: number } } | null = null;
    const g = fakeGoogle((body) => { sent = body as typeof sent; return { status: 200, body: { predictions: [{ imageEmbedding: vector }] } }; });
    expect(await embedImage(await picture(), { env, fetchImpl: g.impl })).toEqual(vector);
    expect(g.calls[1].url).toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/proj-1/locations/us-central1/publishers/google/models/multimodalembedding@001:predict");
    expect((g.calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(sent!.parameters.dimension).toBe(256);
    const meta = await sharp(Buffer.from(sent!.instances[0].image.bytesBase64Encoded, "base64")).metadata();
    expect([meta.format, meta.width, meta.hasAlpha]).toEqual(["jpeg", 512, false]);
  });

  it("uses the region and project set for Vertex", async () => {
    const g = fakeGoogle(() => ({ status: 200, body: { predictions: [{ imageEmbedding: vector }] } }));
    await embedImage(await picture(), { env: { ...env, VERTEX_LOCATION: "europe-west2", VERTEX_PROJECT_ID: "other" }, fetchImpl: g.impl });
    expect(g.calls[1].url).toContain("https://europe-west2-aiplatform.googleapis.com/v1/projects/other/locations/europe-west2/");
  });

  it("reports Google's refusals with their status, and odd answers", async () => {
    const denied = fakeGoogle(() => ({ status: 403, body: { error: { message: "Permission denied" } } }));
    await expect(embedImage(await picture(), { env, fetchImpl: denied.impl })).rejects.toMatchObject({ status: 403, message: expect.stringContaining("Permission denied") });
    resetTokenCacheForTests();
    const odd = fakeGoogle(() => ({ status: 200, body: { predictions: [{ imageEmbedding: [1, 2] }] } }));
    await expect(embedImage(await picture(), { env, fetchImpl: odd.impl })).rejects.toBeInstanceOf(VertexError);
  });

  it("writes vectors the way pgvector reads them", () => {
    expect(toVectorLiteral([0.5, -1, 2e-3])).toBe("[0.5,-1,0.002]");
  });

  it("only uses a real-looking region name in the address it sends the token to", async () => {
    const { vertexLocation } = await import("./vertex");
    expect(vertexLocation({ VERTEX_LOCATION: "europe-west2" } as NodeJS.ProcessEnv)).toBe("europe-west2");
    expect(vertexLocation({ VERTEX_LOCATION: "evil.example.com/x" } as NodeJS.ProcessEnv)).toBe("us-central1");
    expect(vertexLocation({} as NodeJS.ProcessEnv)).toBe("us-central1");
  });
});
