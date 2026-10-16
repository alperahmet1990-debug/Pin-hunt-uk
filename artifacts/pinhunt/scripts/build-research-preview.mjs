#!/usr/bin/env node
// Static web build of the Research Review preview, for hosting at one fixed link (Mac, iPad, any browser).
//
//   node scripts/build-research-preview.mjs --runs <run.json> [<run2.json> …] [--out dist-research-preview] [--skip-export]
//
// The real admin screen is exported for web in demo mode with no Supabase configured, and the Research
// Review API is answered in the browser (lib/researchPreview) from the bundled run files. Decisions stay in
// the viewer's browser, with JSON export / import. The build refuses to finish if the output contains anything
// that looks like a Supabase project URL, a JWT or an API key, so nothing secret can be published by mistake.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(appDir, 'dist-research-preview'));
const runsIdx = args.indexOf('--runs');
const runPaths = runsIdx >= 0 ? args.slice(runsIdx + 1).filter((a, i, all) => !a.startsWith('--') && all.slice(0, i).every(x => !x.startsWith('--'))) : [];
if (!runPaths.length) { console.error('usage: build-research-preview.mjs --runs <run.json> [<run2.json> …] [--out <dir>] [--skip-export]'); process.exit(2); }

// 1. Web export: demo admin, static preview, Supabase and every service URL left empty.
if (!args.includes('--skip-export')) {
  rmSync(outDir, { recursive: true, force: true });
  const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: '1', EXPO_PUBLIC_DEMO_ADMIN: '1', EXPO_PUBLIC_RESEARCH_PREVIEW: 'static',
    EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: '', EXPO_PUBLIC_API_BASE_URL: '/api' };
  const r = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', outDir], { cwd: appDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error('expo export failed'); process.exit(1); }
}

// 2. Research data: the run files merged into one, pins only (sets are derived from the pins on screen).
const merged = new Map();
let generated = null, gitCommit = null;
for (const f of runPaths) {
  const run = JSON.parse(readFileSync(f, 'utf8'));
  for (const c of run.candidates ?? []) if (c.entity_type === 'pin') merged.set(c.research_key, c);
  generated ??= run.generated_at ?? run.generated ?? null;
  gitCommit ??= run.git_commit ?? null;
}
generated ??= new Date().toISOString().slice(0, 10);
mkdirSync(path.join(outDir, 'research-preview'), { recursive: true });
writeFileSync(path.join(outDir, 'research-preview', 'runs.json'),
  JSON.stringify({ format: 'pinhunt-research-preview-data-v1', generated: String(generated).slice(0, 10), git_commit: gitCommit, candidates: [...merged.values()] }));

// 3. Open straight on Research Review, and serve its path as a real file for hosts without an SPA fallback.
const indexPath = path.join(outDir, 'index.html');
const index = readFileSync(indexPath, 'utf8');
mkdirSync(path.join(outDir, 'admin', 'research-review'), { recursive: true });
const page = index.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
writeFileSync(path.join(outDir, 'admin', 'research-review', 'index.html'), page);
writeFileSync(path.join(outDir, 'admin', 'research-review.html'), page);
writeFileSync(indexPath, page.replace('<head>',
  `<head><script>if(location.pathname==='/'||location.pathname==='/index.html')location.replace('/admin/research-review')</script>`));
writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// 4. Refuse to publish anything that looks like a credential or a live backend address.
const BAD = [/[a-z0-9]{20}\.supabase\.co/i, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/, /\bsk-[A-Za-z0-9_-]{20,}/, /\bsbp_[A-Za-z0-9]{20,}/,
  /SUPABASE_SERVICE_ROLE/, /AI_INTEGRATIONS_OPENAI_API_KEY\s*[:=]\s*["'][^"']/];
const hits = [];
let bytes = 0;
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    bytes += st.size;
    if (!/\.(js|html|json|css|map|txt)$/.test(name)) continue;
    const text = readFileSync(p, 'utf8');
    for (const re of BAD) if (re.test(text)) hits.push(`${path.relative(outDir, p)}: matches ${re}`);
  }
};
walk(outDir);
if (hits.length) {
  console.error(`Refusing to publish: ${hits.length} possible credential(s) in the build:\n${hits.join('\n')}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

console.log(`Research Review preview: ${merged.size} pins from ${runPaths.length} run file(s), run of ${String(generated).slice(0, 10)}`);
console.log(`${outDir} (${(bytes / 1024 / 1024).toFixed(1)} MB), credential scan clean`);
