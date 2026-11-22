/**
 * Picture index — database access (pin_picture_index, migration 085).
 * Service-role only, through the board-scan client.
 */
import { createHash } from "node:crypto";
import { boardDb } from "../boardScan/store";
import { INDEX_MODEL, toVectorLiteral } from "./vertex";

export interface PendingReference {
  pin_image_id: string;
  pin_id: string;
  image_url: string;
}

export interface IndexStatus {
  referencesTotal: number;
  indexed: number;
  failed: number;
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Reference pictures read per page while looking for ones to describe. */
export const PENDING_PAGE = 200;
/** Ids per `in (...)` filter: keeps the request URL short. */
const IN_CHUNK = 100;

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * The next page of Pin & Pop reference pictures (by id, after `after`) and
 * which of them still need describing: never described, URL changed since,
 * or (when retrying) failed before. Pins that are archived are skipped.
 *
 * Paged by id with simple indexed reads instead of one big join, so each
 * call stays fast however much of the index is already built (the join in
 * picture_index_pending slows as the index fills). `next` is null at the end.
 */
export async function pendingReferences(
  after: string | null,
  retryFailed = false,
): Promise<{ refs: PendingReference[]; next: string | null }> {
  let q = boardDb().from("pin_images").select("id, pin_id, image_url")
    .eq("source", "pin_and_pop").eq("image_type", "reference").like("image_url", "https://%")
    .order("id", { ascending: true }).limit(PENDING_PAGE);
  if (after) q = q.gt("id", after);
  const { data, error } = await q;
  if (error) throw new Error(`Could not list pictures to index: ${error.message}`);
  const page = (data ?? []) as Array<{ id: string; pin_id: string; image_url: string }>;
  if (page.length === 0) return { refs: [], next: null };

  const indexed = new Map<string, { md5: string; failed: boolean }>();
  for (const ids of chunks(page.map((r) => r.id), IN_CHUNK)) {
    const res = await boardDb().from("pin_picture_index").select("pin_image_id, image_url_md5, error")
      .eq("model", INDEX_MODEL).in("pin_image_id", ids);
    if (res.error) throw new Error(`Could not list pictures to index: ${res.error.message}`);
    for (const r of (res.data ?? []) as Array<{ pin_image_id: string; image_url_md5: string; error: string | null }>) {
      indexed.set(r.pin_image_id, { md5: r.image_url_md5, failed: r.error !== null });
    }
  }
  const archived = new Set<string>();
  for (const ids of chunks([...new Set(page.map((r) => r.pin_id))], IN_CHUNK)) {
    const res = await boardDb().from("pins").select("id").in("id", ids).not("archived_at", "is", null);
    if (res.error) throw new Error(`Could not list pictures to index: ${res.error.message}`);
    for (const r of (res.data ?? []) as Array<{ id: string }>) archived.add(r.id);
  }

  const refs = page
    .filter((r) => !archived.has(r.pin_id))
    .filter((r) => {
      const x = indexed.get(r.id);
      return !x || x.md5 !== md5(r.image_url) || (retryFailed && x.failed);
    })
    .map((r) => ({ pin_image_id: r.id, pin_id: r.pin_id, image_url: r.image_url }));
  return { refs, next: page.length < PENDING_PAGE ? null : page[page.length - 1].id };
}

/** Save a reference picture's embedding, or why it couldn't be made (embedding null). */
export async function saveEmbedding(ref: PendingReference, embedding: number[] | null, problem: string | null = null): Promise<void> {
  const { error } = await boardDb().from("pin_picture_index").upsert({
    pin_image_id: ref.pin_image_id,
    pin_id: ref.pin_id,
    model: INDEX_MODEL,
    image_url_md5: md5(ref.image_url),
    embedding: embedding ? toVectorLiteral(embedding) : null,
    error: embedding ? null : (problem ?? "unknown error").slice(0, 300),
    created_at: new Date().toISOString(),
  }, { onConflict: "pin_image_id,model" });
  if (error) throw new Error(`Could not save to the picture index: ${error.message}`);
}

/** The number of reference pictures changes only with a catalogue sync: counted at most every 10 minutes. */
const TOTAL_TTL_MS = 10 * 60_000;
let totalCache: { value: number; at: number } | null = null;
let statusInFlight: Promise<IndexStatus> | null = null;

export function resetStatusCacheForTests() {
  totalCache = null;
  statusInFlight = null;
}

async function countRows(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(`Could not read the picture index: ${error.message}`);
  return count ?? 0;
}

/**
 * Progress for the admin screen: three simple counts, no join. The total is
 * cached; calls made while one is running share it, so a busy screen can't
 * pile queries onto the database.
 */
export function indexStatus(now = Date.now()): Promise<IndexStatus> {
  if (statusInFlight) return statusInFlight;
  statusInFlight = (async () => {
    const db = boardDb();
    const total = totalCache && now - totalCache.at < TOTAL_TTL_MS
      ? totalCache.value
      : await countRows(db.from("pin_images").select("id", { count: "exact", head: true })
        .eq("source", "pin_and_pop").eq("image_type", "reference").like("image_url", "https://%"));
    totalCache = { value: total, at: totalCache && now - totalCache.at < TOTAL_TTL_MS ? totalCache.at : now };
    const [indexed, failed] = await Promise.all([
      countRows(db.from("pin_picture_index").select("pin_image_id", { count: "exact", head: true }).eq("model", INDEX_MODEL).is("error", null)),
      countRows(db.from("pin_picture_index").select("pin_image_id", { count: "exact", head: true }).eq("model", INDEX_MODEL).not("error", "is", null)),
    ]);
    return { referencesTotal: total, indexed, failed };
  })().finally(() => { statusInFlight = null; });
  return statusInFlight;
}

/** Catalogue pins whose reference pictures look most like the embedding, closest first. */
export async function nearestPins(embedding: number[], count: number): Promise<Array<{ pinhuntId: string; distance: number }>> {
  const { data, error } = await boardDb().rpc("picture_index_nearest", { p_model: INDEX_MODEL, p_embedding: toVectorLiteral(embedding), p_count: count });
  if (error) throw new Error(`Picture search failed: ${error.message}`);
  return ((data ?? []) as Array<{ pinhunt_id: string; distance: number }>).map((r) => ({ pinhuntId: r.pinhunt_id, distance: Number(r.distance) }));
}
