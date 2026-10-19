#!/usr/bin/env node
// Static web build of the real PinHunt app, for the contributor website (#398).
//
//   EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… EXPO_PUBLIC_API_BASE_URL=… \
//     node scripts/build-contributor-web.mjs [--out dist-contributor-web]
//
// Same app, same Supabase accounts and roles as the phone app; it just runs in
// a browser. Unlike the Research Review preview it points at a real backend,
// so the three EXPO_PUBLIC_* values are required (staging for the preview,
// production only after review; see docs/release/CONTRIBUTOR-WEB.md).
//
// Safety:
//   • demo mode can't be switched on (it would show mock data);
//   • pages carry noindex and robots.txt disallows crawling (invite-only);
//   • the build is scanned (scripts/lib/webLeakCheck.mjs): only the anon key
//     may appear; anything else that looks secret deletes the build and fails.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jwtRole, scanDir } from './lib/webLeakCheck.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(appDir, 'dist-contributor-web'));

/** Paths opened from outside the app: invite link targets and auth emails. */
const DIRECT_ROUTES = ['login', 'register', 'forgot-password', 'reset', 'update-password', 'add-pin', 'contribute', 'my-submissions'];

const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };

// 1. Settings: a real backend, never demo mode, and the anon key really is one.
const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_API_BASE_URL'];
const missing = required.filter(k => !process.env[k]?.trim());
if (missing.length) fail(`Missing ${missing.join(', ')}: the contributor website needs a real backend.`, 2);
if (process.env.EXPO_PUBLIC_DEMO_MODE === '1') fail('EXPO_PUBLIC_DEMO_MODE must not be set for the contributor website.', 2);
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim();
if (anon.startsWith('eyJ') && jwtRole(anon) !== 'anon') {
  fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is not an anon key. Never put a service-role key in the app.', 2);
}
if (!/^https:\/\//.test(process.env.EXPO_PUBLIC_API_BASE_URL)) fail('EXPO_PUBLIC_API_BASE_URL must be an https:// URL.', 2);

// The Supabase address must be the bare project URL: the client adds
// /auth/v1, /rest/v1 itself. Catch a copied list abbreviation ("…") or an
// endpoint path ("/rest/v1/") before the two-minute export, not after.
let supabaseUrl;
try { supabaseUrl = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL.trim()); } catch {
  fail('EXPO_PUBLIC_SUPABASE_URL is not a valid address. Copy the full Project URL (no "…") from Supabase → Project Settings → API.', 2);
}
if (supabaseUrl.protocol !== 'https:' || supabaseUrl.pathname.replace(/\/+$/, '') !== '' || supabaseUrl.search) {
  fail(`EXPO_PUBLIC_SUPABASE_URL must be just the project address, like https://<project>.supabase.co, with nothing after it. Got a path: "${supabaseUrl.pathname}".`, 2);
}

// 2. Web export.
rmSync(outDir, { recursive: true, force: true });
const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: '', EXPO_PUBLIC_DEMO_ADMIN: '', EXPO_PUBLIC_RESEARCH_PREVIEW: '' };
const r = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', outDir], { cwd: appDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
if (r.status !== 0) fail('expo export failed');

// 3. Invite-only: keep it out of search engines.
const indexPath = path.join(outDir, 'index.html');
const page = readFileSync(indexPath, 'utf8').replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
writeFileSync(indexPath, page);
writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// The export is one page that routes in the browser. Serve the links people
// open directly (invites, the password-reset email) as real files too, so they
// work on hosts without an SPA fallback.
for (const route of DIRECT_ROUTES) {
  mkdirSync(path.join(outDir, route), { recursive: true });
  writeFileSync(path.join(outDir, route, 'index.html'), page);
  writeFileSync(path.join(outDir, `${route}.html`), page);
}

// 4. Credential scan.
const hits = scanDir(outDir);
if (hits.length) {
  rmSync(outDir, { recursive: true, force: true });
  fail(`Refusing to publish: ${hits.length} possible credential(s) in the build:\n${hits.join('\n')}`);
}

let bytes = 0;
const size = d => { for (const n of readdirSync(d)) { const p = path.join(d, n); const s = statSync(p); s.isDirectory() ? size(p) : (bytes += s.size); } };
size(outDir);
console.log(`Contributor website: ${outDir} (${(bytes / 1024 / 1024).toFixed(1)} MB), credential scan clean`);
console.log(`Backend: ${new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).host} · API ${process.env.EXPO_PUBLIC_API_BASE_URL}`);
