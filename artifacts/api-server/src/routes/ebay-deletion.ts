/**
 * eBay Marketplace Account Deletion endpoint (Production API compliance).
 *
 * GET  /api/ebay/account-deletion?challenge_code=...  → eBay verification
 * POST /api/ebay/account-deletion                     → deletion notifications
 *
 * Per eBay's spec, the challenge response is:
 *   SHA-256(challengeCode + verificationToken + endpointUrl)
 * where endpointUrl must exactly match the URL entered in the eBay portal.
 * Set EBAY_DELETION_ENDPOINT_URL to that exact URL; otherwise it is derived
 * from the incoming request.
 *
 * Intentionally unauthenticated (eBay calls it directly). No secrets logged.
 */
import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";

const router: IRouter = Router();

function endpointUrl(req: Request): string {
  const configured = process.env.EBAY_DELETION_ENDPOINT_URL;
  if (configured) return configured;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  return `https://${host}/api/ebay/account-deletion`;
}

router.get("/ebay/account-deletion", (req, res) => {
  const challengeCode = req.query.challenge_code;
  const token = process.env.EBAY_DELETION_VERIFICATION_TOKEN;

  if (typeof challengeCode !== "string" || !challengeCode) {
    res.status(400).json({ error: "challenge_code is required" });
    return;
  }
  if (!token) {
    req.log.error("EBAY_DELETION_VERIFICATION_TOKEN is not set");
    res.status(500).json({ error: "Verification token not configured" });
    return;
  }

  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(token);
  hash.update(endpointUrl(req));
  res.status(200).json({ challengeResponse: hash.digest("hex") });
});

router.post("/ebay/account-deletion", (req, res) => {
  // Acknowledge immediately; full deletion handling comes later.
  // Log only non-sensitive metadata — never the raw payload wholesale.
  const notification = req.body?.notification;
  req.log.info(
    {
      topic: req.body?.metadata?.topic,
      notificationId: notification?.notificationId,
      eventDate: notification?.eventDate,
      username: notification?.data?.username,
    },
    "eBay account deletion notification received",
  );
  res.sendStatus(200);
});

export default router;
