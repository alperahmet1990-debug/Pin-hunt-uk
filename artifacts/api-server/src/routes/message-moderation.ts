/**
 * POST /api/admin/messages/:messageId/remove — a moderator removes a message
 * that has an open report (LP-6, #524). Migration 072.
 *
 * Auth: a signed-in admin (profiles.is_admin). The admin id comes from the
 * verified token, never from the request.
 *
 * Body: { reason: string }  1–500 characters after trimming. Required.
 *
 * The database function remove_reported_message (service role only) checks
 * the admin and the open report again, replaces the text with
 * "Removed by PinHunt moderators", clears the photos and pin shares, and
 * records who removed it, when and why. The message row stays, so the
 * report and the rest of the conversation are unchanged. This route then
 * deletes the message's photo files from the community-photos bucket.
 *
 * Responses (bodies are generic; nothing about the message is logged):
 *   200 { removed: true, alreadyRemoved: boolean, photosDeleted: number }
 *   400 { error }  bad message id or reason
 *   401            missing, invalid or expired token
 *   403            not an admin
 *   404 { error }  no such message
 *   409 { error }  the message has no open report
 *   502 { error }  removed, but its photos could not be deleted; repeating
 *                  the request retries the clean-up
 *   503 { error }  server not configured, or migration 072 not applied
 *   500 { error }  anything else
 */
import { Router, type IRouter, type NextFunction, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireUser, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export const MESSAGE_REMOVAL_REASON_MAX = 500;
const PHOTO_BUCKET = "community-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let serviceClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // No anon-key fallback: the function and the storage clean-up need the service role.
  if (!url || !key) return null;
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return serviceClient;
}

async function requireAdminUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const client = getServiceClient();
  if (!client) {
    logger.error({ route: "message.remove" }, "message removal unavailable: service role not configured");
    res.status(503).json({ error: "Message removal is temporarily unavailable." });
    return;
  }
  try {
    const { data, error } = await client.from("profiles").select("is_admin").eq("id", req.userId!).maybeSingle();
    if (error) throw error;
    if (!(data as { is_admin?: boolean } | null)?.is_admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
  } catch {
    logger.warn({ route: "message.remove" }, "admin check failed");
    res.status(500).json({ error: "Could not check your access. Try again." });
    return;
  }
  next();
}

/** Only plain object paths inside one user's folder are ever deleted. */
function safePhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is string =>
      typeof p === "string" && /^[0-9a-f-]{36}\/[^/?#]+$/i.test(p) && !p.includes(".."),
  );
}

interface RemovalResult {
  status?: string;
  photo_paths?: unknown;
}

router.post(
  "/admin/messages/:messageId/remove",
  requireUser,
  requireAdminUser,
  async (req: AuthedRequest, res: Response) => {
    const messageId = String(req.params.messageId ?? "");
    if (!UUID_RE.test(messageId)) {
      res.status(400).json({ error: "Invalid message." });
      return;
    }
    const rawReason = (req.body as { reason?: unknown } | undefined)?.reason;
    const reason = typeof rawReason === "string" ? rawReason.trim() : "";
    if (reason.length === 0) {
      res.status(400).json({ error: "Give a reason for removing this message." });
      return;
    }
    if (reason.length > MESSAGE_REMOVAL_REASON_MAX) {
      res.status(400).json({ error: `Keep the reason to ${MESSAGE_REMOVAL_REASON_MAX} characters or fewer.` });
      return;
    }

    const client = getServiceClient()!;
    let result: RemovalResult;
    try {
      const { data, error } = await client.rpc("remove_reported_message", {
        p_admin_id: req.userId,
        p_message_id: messageId,
        p_reason: reason,
      });
      if (error) {
        // PGRST202: function not found (migration 072 not applied yet).
        if ((error as { code?: string }).code === "PGRST202") {
          logger.error({ route: "message.remove" }, "remove_reported_message missing: apply migration 072");
          res.status(503).json({ error: "Message removal is not available yet." });
          return;
        }
        throw error;
      }
      result = (data ?? {}) as RemovalResult;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      logger.error({ route: "message.remove", code }, "message removal failed");
      res.status(500).json({ error: "Could not remove the message. Try again." });
      return;
    }

    switch (result.status) {
      case "removed":
      case "already_removed":
        break;
      case "not_admin":
        res.status(403).json({ error: "Admin access required" });
        return;
      case "not_found":
        res.status(404).json({ error: "This message no longer exists." });
        return;
      case "no_open_report":
        res.status(409).json({ error: "Only a message with an open report can be removed." });
        return;
      case "invalid_reason":
        res.status(400).json({ error: `Give a reason of up to ${MESSAGE_REMOVAL_REASON_MAX} characters.` });
        return;
      default:
        logger.error({ route: "message.remove", status: String(result.status) }, "unexpected removal result");
        res.status(500).json({ error: "Could not remove the message. Try again." });
        return;
    }

    const paths = safePhotoPaths(result.photo_paths);
    if (paths.length > 0) {
      try {
        const { error } = await client.storage.from(PHOTO_BUCKET).remove(paths);
        if (error) throw error;
      } catch {
        logger.error({ route: "message.remove", photos: paths.length }, "message removed but photo clean-up failed");
        res.status(502).json({ error: "The message was removed, but its photos couldn't be deleted. Try again." });
        return;
      }
    }

    logger.info(
      { route: "message.remove", alreadyRemoved: result.status === "already_removed", photos: paths.length },
      "reported message removed",
    );
    res.status(200).json({
      removed: true,
      alreadyRemoved: result.status === "already_removed",
      photosDeleted: paths.length,
    });
  },
);

export default router;
