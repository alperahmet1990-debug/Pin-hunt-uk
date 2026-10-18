// Credential scan for the contributor website build (#398).
//
// Unlike the Research Review preview, the real app legitimately ships the
// Supabase project URL and the anon key (a public, RLS-bound JWT). So this
// scan allows exactly that and refuses everything else that looks secret:
// any JWT whose role isn't "anon" (above all a service-role key), Supabase
// secret/personal keys, OpenAI keys, Google service-account keys, and the
// server-only variable names with a value next to them.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

const SECRET_PATTERNS = [
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/\bsbp_[A-Za-z0-9]{20,}/, 'Supabase personal access token'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/, 'OpenAI-style secret key'],
  [/-----BEGIN (?:RSA )?PRIVATE KEY-----/, 'private key'],
  [/"private_key_id"\s*:/, 'Google service-account key'],
  [/(SUPABASE_SERVICE_ROLE_KEY|PIXIAN_API_SECRET|EBAY_CLIENT_SECRET|AI_INTEGRATIONS_OPENAI_API_KEY|GOOGLE_APPLICATION_CREDENTIALS_JSON|SESSION_SECRET)\s*["']?\s*[:=]\s*["'][^"'\s]{8,}/, 'server-only setting with a value'],
];

/** The `role` claim of a JWT, or null when it can't be read. */
export function jwtRole(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const role = JSON.parse(json).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/** Findings for one file's text: [] when clean. */
export function scanText(text) {
  const findings = [];
  for (const match of text.matchAll(JWT)) {
    const role = jwtRole(match[0]);
    if (role !== 'anon') findings.push(`JWT with role ${role ?? '(unreadable)'}`);
  }
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) findings.push(label);
  return findings;
}

/** Scan every text asset under `dir`. Returns ["file: finding", …]. */
export function scanDir(dir) {
  const hits = [];
  const walk = d => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|html|json|css|map|txt)$/.test(name)) continue;
      for (const f of scanText(readFileSync(p, 'utf8'))) hits.push(`${path.relative(dir, p)}: ${f}`);
    }
  };
  walk(dir);
  return hits;
}
