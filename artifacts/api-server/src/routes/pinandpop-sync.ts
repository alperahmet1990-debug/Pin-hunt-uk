/**
 * Pin & Pop catalogue sync (App Creator only).
 *
 * GET  /admin/catalogue/pinandpop/status  Stored Pin & Pop pin count, highest id, whether a token is set.
 * POST /admin/catalogue/pinandpop/sync    Fetch pins added since the highest stored id and upsert them.
 *      body: { maxPages?: 1–25 } (200 pins a page, default 10). When `complete` is false, call again.
 *
 * The token (PINANDPOP_API_TOKEN) stays on the server; the app never calls
 * Pin & Pop. Rate limit, retries and the licence rules live in
 * scripts/lib/pinandpop.mjs. Edits to existing pins and removals need the
 * full refresh (scripts/import-pinandpop.mjs sync --full), which takes ~10
 * minutes and so runs as a script, not a request.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PINANDPOP_SOURCE,
  PinAndPopApiError,
  createPinAndPopClient,
  highestStoredPinAndPopId,
  syncNewPins,
} from "../../scripts/lib/pinandpop.mjs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;
const anon = () => (anonClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!));
const service = () =>
  (serviceClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  }));

async function requireAppCreator(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await anon().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await service().from("profiles").select("is_app_creator").eq("id", user.id).single();
    if (!profile?.is_app_creator) { res.status(403).json({ error: "App Creator access required" }); return; }
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// One sync at a time per server: two overlapping runs would read the same highest id.
let running = false;

router.get("/admin/catalogue/pinandpop/status", requireAppCreator, async (_req, res) => {
  try {
    const { count, error } = await service().from("pins").select("id", { count: "exact", head: true })
      .eq("catalogue_source", PINANDPOP_SOURCE);
    if (error) throw new Error(error.message);
    res.json({
      pins: count ?? 0,
      highestId: await highestStoredPinAndPopId(service()),
      tokenConfigured: Boolean(process.env.PINANDPOP_API_TOKEN),
      running,
    });
  } catch (err) {
    logger.error({ err }, "pinandpop status failed");
    res.status(500).json({ error: "Status check failed" });
  }
});

router.post("/admin/catalogue/pinandpop/sync", requireAppCreator, async (req, res) => {
  if (!process.env.PINANDPOP_API_TOKEN) {
    res.status(503).json({ error: "Pin & Pop sync isn't configured on this server" });
    return;
  }
  if (running) {
    res.status(409).json({ error: "A Pin & Pop sync is already running" });
    return;
  }
  const requested = Number(req.body?.maxPages ?? 10);
  const maxPages = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 25) : 10;
  running = true;
  try {
    const client = createPinAndPopClient({ token: process.env.PINANDPOP_API_TOKEN });
    const stats = await syncNewPins({ supabase: service(), client, maxPages });
    logger.info({ ...stats, skipped: stats.skipped.length }, "pinandpop sync");
    res.json({ ...stats, skipped: stats.skipped.slice(0, 50), skippedCount: stats.skipped.length });
  } catch (err) {
    const status = err instanceof PinAndPopApiError ? err.status : 0;
    logger.error({ err: (err as Error).message, status }, "pinandpop sync failed");
    // 401/403 mean our token is wrong; don't echo the upstream body.
    res.status(502).json({ error: status === 401 || status === 403 ? "Pin & Pop rejected the API token" : "Pin & Pop sync failed" });
  } finally {
    running = false;
  }
});

export default router;
