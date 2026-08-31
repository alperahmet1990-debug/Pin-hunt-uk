/**
 * Shared base URL for the Express API server (scan, valuation, geocode,
 * admin tools). Every screen that calls the server should import API_BASE
 * from here rather than re-deriving it locally.
 *
 * Resolution order:
 *  1. EXPO_PUBLIC_API_BASE_URL — explicit override. Set this for local
 *     physical-device testing (a LAN IP the phone can actually reach —
 *     "localhost" from the phone's own JS runtime means the phone itself,
 *     not the dev machine) or for a real deployed URL in production.
 *  2. EXPO_PUBLIC_DOMAIN — legacy Replit-domain fallback, still supported.
 *  3. http://localhost:8080/api — same-machine fallback (web/simulator
 *     only; unreachable from a physical device in Expo Go).
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
  ?? (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : 'http://localhost:8080/api');
