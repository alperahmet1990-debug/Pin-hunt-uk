/**
 * Geocoding route — converts a UK postcode to approximate lat/lng
 * and persists them to the user's profile row.
 *
 * POST /api/geocode
 *   Authorization: Bearer <supabase-jwt>
 *   Body: { postcode: string }
 *
 * The endpoint:
 *   1. Verifies the JWT and extracts the authenticated user ID.
 *   2. Calls postcodes.io (free, no API key required) to resolve lat/lng.
 *   3. Writes approx_lat / approx_lng to profiles using the service-role key
 *      so that column-level security (migration 008) does not block the write.
 *
 * approx_lat / approx_lng are NEVER returned to the client.
 * The has_location_set boolean (kept in sync by a DB trigger) is what
 * the client reads to know whether a location is set.
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger';

const router: IRouter = Router();

// ─── postcodes.io response shape (minimal) ────────────────────────────────────

interface PostcodesIoResult {
  latitude: number;
  longitude: number;
}

interface PostcodesIoResponse {
  status: number;
  result: PostcodesIoResult | null;
}

async function geocodeUkPostcode(
  postcode: string,
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = postcode.trim().replace(/\s+/g, '').toUpperCase();
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as PostcodesIoResponse;
    if (!data.result?.latitude || !data.result?.longitude) return null;
    return { lat: data.result.latitude, lng: data.result.longitude };
  } catch (err) {
    logger.warn({ err, postcode }, '[geocode] postcodes.io request failed');
    return null;
  }
}

// ─── POST /geocode ─────────────────────────────────────────────────────────────

router.post('/geocode', async (req: Request, res: Response) => {
  // ── 1. Extract and validate JWT ────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header (Bearer token required)' });
    return;
  }

  // ── 2. Validate request body ───────────────────────────────────────────────
  const { postcode } = req.body as { postcode?: unknown };
  if (typeof postcode !== 'string' || !postcode.trim()) {
    res.status(400).json({ error: '"postcode" is required' });
    return;
  }

  // ── 3. Build service-role Supabase client ──────────────────────────────────
  // approx_lat/approx_lng are column-revoked for the authenticated role
  // (migration 008). Writing them requires the service-role key — the anon key
  // is NOT a valid fallback here.
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({
      error:
        'SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Contact support.',
    });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── 4. Verify JWT → get authenticated user ─────────────────────────────────
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    logger.warn({ authError }, '[geocode] JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // ── 5. Geocode the postcode via postcodes.io ───────────────────────────────
  const coords = await geocodeUkPostcode(postcode);
  if (coords === null) {
    res.status(422).json({
      error:
        'Could not geocode that postcode. Please check it is a valid UK postcode and try again.',
    });
    return;
  }

  // ── 6. Persist approx_lat / approx_lng (service role bypasses column RLS) ──
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({
      approx_lat: coords.lat,
      approx_lng: coords.lng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    logger.error({ err: updateError, userId: user.id }, '[geocode] profile update failed');
    res.status(500).json({ error: 'Failed to save location. Please try again.' });
    return;
  }

  logger.info({ userId: user.id }, '[geocode] location updated successfully');
  res.json({ success: true });
});

export default router;
