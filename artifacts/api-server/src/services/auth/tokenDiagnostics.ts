/**
 * Why was a sign-in rejected? Safe-to-log facts only — never the token, the
 * key or the user's email.
 *
 * Compares the token's issuer (which Supabase project signed it) with the
 * project this server checks against (SUPABASE_URL), and reports whether the
 * token has expired and what kind of key the server uses. That's enough to
 * tell a project mismatch, an expired session and a disabled legacy key apart
 * in the Render log.
 */

export interface TokenRejectionDiagnostics {
  /** Supabase's own error, e.g. "invalid JWT" or "Legacy API keys are disabled". */
  supabaseError: string | null;
  supabaseStatus: number | null;
  supabaseCode: string | null;
  /** Project this server checks sign-ins against (host of SUPABASE_URL). */
  serverProject: string | null;
  /** Project that issued the token (host of the token's `iss`). */
  tokenProject: string | null;
  projectMatches: boolean | null;
  /** Kind of SUPABASE_ANON_KEY: "publishable", "legacy_jwt", "missing" or "other". */
  serverKeyKind: "publishable" | "legacy_jwt" | "missing" | "other";
  tokenExpired: boolean | null;
  /** Seconds since expiry (positive) or until expiry (negative). */
  tokenExpirySecondsAgo: number | null;
  tokenRole: string | null;
  tokenAlg: string | null;
  /** The token couldn't be read as a JWT at all. */
  tokenUnreadable: boolean;
}

function decodePart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hostOf(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    return new URL(url.trim()).host.toLowerCase();
  } catch {
    return null;
  }
}

function keyKind(key: string | undefined): TokenRejectionDiagnostics["serverKeyKind"] {
  const k = key?.trim();
  if (!k) return "missing";
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("eyJ")) return "legacy_jwt";
  return "other";
}

export function describeTokenRejection(
  token: string,
  error: { message?: string; status?: number; code?: string } | null | undefined,
  env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string } = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TokenRejectionDiagnostics {
  const [h, p] = token.split(".");
  const header = decodePart(h);
  const payload = decodePart(p);
  const serverProject = hostOf(env.SUPABASE_URL);
  const tokenProject = hostOf(payload?.iss);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;

  return {
    supabaseError: error?.message ?? null,
    supabaseStatus: typeof error?.status === "number" ? error.status : null,
    supabaseCode: error?.code ?? null,
    serverProject,
    tokenProject,
    projectMatches: serverProject && tokenProject ? serverProject === tokenProject : null,
    serverKeyKind: keyKind(env.SUPABASE_ANON_KEY),
    tokenExpired: exp === null ? null : exp <= nowSeconds,
    tokenExpirySecondsAgo: exp === null ? null : nowSeconds - exp,
    tokenRole: typeof payload?.role === "string" ? payload.role : null,
    tokenAlg: typeof header?.alg === "string" ? header.alg : null,
    tokenUnreadable: payload === null,
  };
}
