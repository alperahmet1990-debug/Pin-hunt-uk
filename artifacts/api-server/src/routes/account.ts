/**
 * DELETE /api/account — the signed-in collector deletes their own account
 * (App Store Guideline 5.1.1(v), UK GDPR erasure). B-P0-03a, #13.
 *
 * Auth: requireUser. Only the caller's own account can be deleted; the user
 * id comes from the verified token, never from the request.
 *
 * Responses (bodies are generic; details are logged server-side without the
 * user's id, email or content):
 *   200 { deleted: true }   account removed (or was already gone)
 *   401                     missing, invalid or expired token
 *   409 { error }           account can't be deleted in the app (App Creator)
 *   500 { error }           a step failed; nothing irreversible is lost and
 *                           the request can be repeated
 *   503 { error }           server not configured for deletions
 *
 * The client signs the user out after a 200 (the session no longer works).
 * Steps and database support: services/account-deletion.ts, migration 051.
 */
import { Router, type IRouter, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireUser, type AuthedRequest } from "../middlewares/auth";
import { AccountDeletionError, deleteAccount } from "../services/account-deletion";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let serviceClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // No anon-key fallback: deleting an auth user needs the service role.
  if (!url || !key) return null;
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return serviceClient;
}

const GENERIC_FAILURE = "We couldn't delete your account right now. Please try again.";

router.delete("/account", requireUser, async (req: AuthedRequest, res: Response) => {
  const client = getServiceClient();
  if (!client) {
    logger.error({ route: "account.delete" }, "account deletion unavailable: service role not configured");
    res.status(503).json({ error: "Account deletion is temporarily unavailable. Please try again later." });
    return;
  }

  try {
    const result = await deleteAccount(client, req.userId!, (stage, code) => {
      logger.warn({ route: "account.delete", stage, code }, "account deletion: non-fatal step failed");
    });

    if (result.status === "refused") {
      logger.info({ route: "account.delete", reason: result.reason }, "account deletion refused");
      res.status(409).json({ error: "This account can't be deleted in the app. Please contact support." });
      return;
    }

    logger.info(
      { route: "account.delete", storageObjects: result.storageObjectsRemoved, alreadyGone: result.alreadyGone },
      "account deleted",
    );
    res.status(200).json({ deleted: true });
  } catch (err) {
    const stage = err instanceof AccountDeletionError ? err.stage : "unknown";
    const code = err instanceof AccountDeletionError ? err.code : undefined;
    logger.error({ route: "account.delete", stage, code }, "account deletion failed");
    res.status(500).json({ error: GENERIC_FAILURE });
  }
});

export default router;
