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

export async function pendingReferences(limit: number, retryFailed = false): Promise<PendingReference[]> {
  const { data, error } = await boardDb().rpc("picture_index_pending", { p_model: INDEX_MODEL, p_limit: limit, p_retry_failed: retryFailed });
  if (error) throw new Error(`Could not list pictures to index: ${error.message}`);
  return (data ?? []) as PendingReference[];
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

export async function indexStatus(): Promise<IndexStatus> {
  const { data, error } = await boardDb().rpc("picture_index_status", { p_model: INDEX_MODEL });
  if (error) throw new Error(`Could not read the picture index: ${error.message}`);
  const row = ((data ?? []) as Array<{ references_total: number; indexed: number; failed: number }>)[0];
  return { referencesTotal: Number(row?.references_total ?? 0), indexed: Number(row?.indexed ?? 0), failed: Number(row?.failed ?? 0) };
}

/** Catalogue pins whose reference pictures look most like the embedding, closest first. */
export async function nearestPins(embedding: number[], count: number): Promise<Array<{ pinhuntId: string; distance: number }>> {
  const { data, error } = await boardDb().rpc("picture_index_nearest", { p_model: INDEX_MODEL, p_embedding: toVectorLiteral(embedding), p_count: count });
  if (error) throw new Error(`Picture search failed: ${error.message}`);
  return ((data ?? []) as Array<{ pinhunt_id: string; distance: number }>).map((r) => ({ pinhuntId: r.pinhunt_id, distance: Number(r.distance) }));
}
