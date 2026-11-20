/**
 * Picture index — image embeddings from Google Vertex AI.
 *
 * multimodalembedding@001 turns a picture into a list of numbers (an
 * embedding); pictures that look alike get nearby numbers. 256 numbers per
 * picture keeps the index small (pin_picture_index, migration 085).
 *
 * Uses the same Google service account as Cloud Vision
 * (GOOGLE_APPLICATION_CREDENTIALS_JSON), which needs the "Vertex AI User"
 * role and the Vertex AI API enabled on its project. The access token is
 * made here (a signed JWT exchanged at Google's token endpoint), so no extra
 * dependency is needed.
 */
import { createSign } from "node:crypto";
import sharp from "sharp";

export const EMBEDDING_DIMENSION = 256;
export const EMBEDDING_MODEL_ID = "multimodalembedding@001";
/** Stored with each row: rows from another model or size can't be compared. */
export const INDEX_MODEL = `vertex-${EMBEDDING_MODEL_ID}-${EMBEDDING_DIMENSION}`;

interface ServiceAccount {
  project_id?: string;
  client_email: string;
  private_key: string;
}

export function serviceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const raw = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

/** The picture index is on: switched on, and Google credentials with a project are present. */
export function pictureIndexConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const sa = serviceAccount(env);
  return env.PICTURE_INDEX_ENABLED === "true" && !!sa && !!(env.VERTEX_PROJECT_ID || sa.project_id);
}

/** A Google Cloud region name (e.g. us-central1, europe-west2); anything else falls back to us-central1. */
export function vertexLocation(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VERTEX_LOCATION?.trim() ?? "";
  return /^[a-z]+-[a-z]+[0-9]{1,2}$/.test(raw) ? raw : "us-central1";
}

export class VertexError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

let cachedToken: { token: string; expires: number } | null = null;

export function resetTokenCacheForTests() {
  cachedToken = null;
}

/** An OAuth access token for the service account, reused until a minute before it expires. */
export async function accessToken(sa: ServiceAccount, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expires - 60_000 > now) return cachedToken.token;
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new VertexError(`Google sign-in failed (${res.status}${data.error_description ? `: ${data.error_description}` : ""})`, res.status);
  }
  cachedToken = { token: data.access_token, expires: now + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

/** A picture the way it's described: no transparency, at most 512px, JPEG. Same for references and crops. */
export async function prepareForEmbedding(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** The embedding of one picture. Throws VertexError (with the HTTP status) on failure. */
export async function embedImage(
  image: Buffer,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<number[]> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sa = serviceAccount(env);
  if (!sa) throw new VertexError("Google credentials aren't configured.");
  const project = env.VERTEX_PROJECT_ID || sa.project_id;
  if (!project) throw new VertexError("No Google Cloud project is set (VERTEX_PROJECT_ID).");
  const location = vertexLocation(env);
  const token = await accessToken(sa, fetchImpl);
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${location}/publishers/google/models/${EMBEDDING_MODEL_ID}:predict`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ image: { bytesBase64Encoded: (await prepareForEmbedding(image)).toString("base64") } }],
      parameters: { dimension: EMBEDDING_DIMENSION },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    predictions?: Array<{ imageEmbedding?: number[] }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new VertexError(`Picture description failed (${res.status}${data.error?.message ? `: ${data.error.message}` : ""})`, res.status);
  const embedding = data.predictions?.[0]?.imageEmbedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION || !embedding.every(Number.isFinite)) {
    throw new VertexError("Picture description came back in an unexpected shape.");
  }
  return embedding;
}

/** pgvector's text form: "[0.1,0.2,…]". */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;
