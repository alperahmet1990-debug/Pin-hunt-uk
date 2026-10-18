/**
 * Per-user daily caps and repeat-request reuse for the paid calls behind
 * contributions: the AI scan (OpenAI + Google Vision) and Pixian photo
 * clean-up. Backed by contributor_ai_usage (migration 047), written only
 * with the service-role key.
 *
 * Fails open: if the table isn't there yet (047 not applied), the service
 * key is missing, or the database errors, calls are allowed and nothing is
 * cached. A cap is cost protection, not a security boundary — it must
 * never take a core flow down.
 *
 * Admins and the App Creator are not capped (catalogue work, testing).
 *
 * Limits (per user, rolling 24h), overridable without a redeploy of code:
 *   CONTRIBUTOR_DAILY_SCANS        default 60
 *   CONTRIBUTOR_DAILY_CLEANUPS     default 60
 *   CONTRIBUTOR_DAILY_SUBMISSIONS  default 40
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type UsageKind = "scan" | "photo_cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_LIMITS: Record<UsageKind | "submission", number> = {
  scan: 60,
  photo_cleanup: 60,
  submission: 40,
};
const LIMIT_ENV: Record<UsageKind | "submission", string> = {
  scan: "CONTRIBUTOR_DAILY_SCANS",
  photo_cleanup: "CONTRIBUTOR_DAILY_CLEANUPS",
  submission: "CONTRIBUTOR_DAILY_SUBMISSIONS",
};

export function dailyLimit(kind: UsageKind | "submission"): number {
  const raw = Number(process.env[LIMIT_ENV[kind]]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMITS[kind];
}

/** sha256 of the photo as sent (base64 text), so identical retries match. */
export function imageHash(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

let client: SupabaseClient | null = null;
function usageClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

function warn(what: string, err: unknown) {
  console.warn(`[usage-caps] ${what} failed, allowing:`, err instanceof Error ? err.message : err);
}

async function isUncapped(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (error) throw error;
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

async function countSince(db: SupabaseClient, table: string, userCol: string, userId: string, extra?: [string, string]) {
  let q = db.from(table).select("id", { count: "exact", head: true })
    .eq(userCol, userId)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  if (extra) q = q.eq(extra[0], extra[1]);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** True when the user may make another `kind` call today. */
export async function withinDailyCap(userId: string, kind: UsageKind | "submission"): Promise<boolean> {
  const db = usageClient();
  if (!db) return true;
  try {
    if (await isUncapped(db, userId)) return true;
    const used = kind === "submission"
      ? await countSince(db, "pin_submissions", "submitted_by", userId)
      : await countSince(db, "contributor_ai_usage", "user_id", userId, ["kind", kind]);
    return used < dailyLimit(kind);
  } catch (err) {
    warn(`cap check (${kind})`, err);
    return true;
  }
}

/** Log one paid call. Never throws; the caller doesn't wait on it. */
export async function recordUsage(userId: string, kind: UsageKind, sha256: string | null, result?: unknown): Promise<void> {
  const db = usageClient();
  if (!db) return;
  try {
    const { error } = await db.from("contributor_ai_usage").insert({
      user_id: userId,
      kind,
      image_sha256: sha256,
      result: result ?? null,
    });
    if (error) throw error;
  } catch (err) {
    warn(`record (${kind})`, err);
  }
}

/**
 * The saved result of this user's identical earlier `kind` call, if one
 * succeeded within maxAgeMs. Same user only: results can carry details
 * about the photo, so they're never shared between accounts.
 */
export async function cachedResult<T>(userId: string, kind: UsageKind, sha256: string, maxAgeMs = DAY_MS): Promise<T | null> {
  const db = usageClient();
  if (!db) return null;
  try {
    const { data, error } = await db.from("contributor_ai_usage")
      .select("result")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("image_sha256", sha256)
      .not("result", "is", null)
      .gte("created_at", new Date(Date.now() - maxAgeMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return ((data as { result?: T } | null)?.result) ?? null;
  } catch (err) {
    warn(`cache lookup (${kind})`, err);
    return null;
  }
}
