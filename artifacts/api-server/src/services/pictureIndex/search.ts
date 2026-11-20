/**
 * Picture index — searching it: the catalogue pins whose reference pictures
 * look most like a crop. One embedding call per crop (≈ $0.0001).
 */
import { nearestPins } from "./store";
import { embedImage } from "./vertex";

/** Pinhunt ids, closest first. Throws on failure (callers fall back to text search). */
export async function lookalikePins(crop: Buffer, count = 30): Promise<string[]> {
  const embedding = await embedImage(crop, { timeoutMs: 10_000 });
  return (await nearestPins(embedding, count)).map((r) => r.pinhuntId);
}
