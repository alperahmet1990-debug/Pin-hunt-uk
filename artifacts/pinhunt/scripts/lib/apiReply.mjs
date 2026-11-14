// Local API answers for screenshot routes (scripts/screenshots.mjs, "api" key).

/**
 * A route's "api" reply for this request, or null. Keys are path suffixes,
 * optionally prefixed with a method ("POST /price-request"); a method key wins.
 */
export function apiReply(api, method, pathname) {
  if (!api) return null;
  let plain = null;
  for (const [key, reply] of Object.entries(api)) {
    const m = key.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
    const suffix = m ? m[2] : key;
    if (!pathname.endsWith(suffix)) continue;
    if (m && m[1] === method) return reply;
    if (!m && !plain) plain = reply;
  }
  return plain;
}
