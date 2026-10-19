/**
 * Bearer-token authentication for signed-in collector routes.
 *
 * Same contract as the per-route requireUser copies (scan.ts,
 * contribute-pin-image.ts, …): a Supabase access token in
 * `Authorization: Bearer <token>`, checked with auth.getUser. Responds 401
 * with a generic message when the token is missing, invalid or expired, and
 * never logs the token. New routes should use this instead of another copy;
 * moving the existing routes onto it is #11 (B-P2-12).
 */
import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

export interface AuthedRequest extends Request {
  userId?: string;
}

let authClient: SupabaseClient | null = null;
function getAuthClient(): SupabaseClient {
  if (!authClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
    authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return authClient;
}

export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token ? token : null;
}

export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  try {
    const { data, error } = await getAuthClient().auth.getUser(token);
    if (error || !data?.user?.id) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    req.userId = data.user.id;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.name : "unknown" }, "requireUser: auth check failed");
    res.status(401).json({ error: "Authentication failed" });
    return;
  }
  next();
}
