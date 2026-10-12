#!/usr/bin/env node
// Screenshot harness for UI pull requests (see docs/agents/OPERATING-MODEL.md §4.5).
//
// Exports the Expo web build in demo mock mode (no Supabase, no .env, no
// network), serves it locally, and captures each route with headless Chrome
// at 390×844 and 320×568, in light and dark.
//
//   pnpm --filter @workspace/pinhunt run screenshots -- --label after --routes home,collection
//   pnpm --filter @workspace/pinhunt run screenshots -- --base origin/main --routes collection
//   pnpm --filter @workspace/pinhunt run screenshots -- --base origin/main --publish 42
//
// Options
//   --label <name>      output folder name (default "after")
//   --base <git-ref>    also capture "before" from that ref (built in a temp worktree)
//   --routes a,b        route names from scripts/screenshot-routes.json (default: all)
//   --route name=/path  extra ad-hoc route (repeatable)
//   --viewports 390x844,320x568   --schemes light,dark
//   --out <dir>         default <repo>/.screenshots
//   --skip-build        reuse the last export for this label
//   --publish <n>       push images to the `agent-artifacts` branch under pr-<n>/
//                       and print a Markdown before/after table for the PR body
//
// Chrome: set CHROME_PATH, or the script looks for Chrome/Chromium in the usual
// places. Install one with `npx @puppeteer/browsers install chrome-headless-shell@stable`.
//
// Limitations: web rendering with mock data only. Native iOS/Android (Liquid
// Glass tabs, safe areas, keyboard, camera) cannot be captured here; mark those
// PRs needs-device-check.

import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '../..');

// ── Arguments ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { label: 'after', routes: null, extra: [], viewports: '390x844,320x568', schemes: 'light,dark', out: path.join(repoRoot, '.screenshots') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--label') args.label = next();
    else if (a === '--base') args.base = next();
    else if (a === '--routes') args.routes = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--route') args.extra.push(next());
    else if (a === '--viewports') args.viewports = next();
    else if (a === '--schemes') args.schemes = next();
    else if (a === '--out') args.out = path.resolve(next());
    else if (a === '--skip-build') args.skipBuild = true;
    else if (a === '--publish') args.publish = next();
    else if (a === '--') continue;
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

// ── Demo data seeded into localStorage (AsyncStorage on web) ────────────
const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3e0'; // keep in sync with lib/demoMode.ts
const now = '2026-01-01T00:00:00.000Z';
const entry = (pinId, status, quantity = 1) => ({ pinId, status, quantity, notes: '', dateAdded: now });
const DEMO_STORAGE = {
  '@pinhunt_collection_v1': JSON.stringify(Object.fromEntries([
    entry('dp-001', 'owned', 2), entry('dp-002', 'owned'), entry('dp-003', 'owned'), entry('dp-004', 'for_trade'),
    entry('dp-005', 'owned'), entry('dp-006', 'wanted'), entry('dp-007', 'wanted'), entry('dp-008', 'for_trade'),
  ].map(e => [e.pinId, e]))),
  [`@pinhunt_boards_v2:${DEMO_USER_ID}`]: JSON.stringify([
    { id: 'demo-board-1', name: 'Favourites', pinIds: ['dp-001', 'dp-002', 'dp-005'], createdAt: now, isCustom: true },
  ]),
};

// ── Build ───────────────────────────────────────────────────────────────
function exportWeb(sourceAppDir, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const env = {
    ...process.env,
    EXPO_NO_DOTENV: '1', // never read .env: no real keys in the bundle
    EXPO_PUBLIC_DEMO_MODE: '1',
    EXPO_PUBLIC_SUPABASE_URL: '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
    EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:9/api',
    CI: '1',
  };
  console.log(`Exporting web build from ${path.relative(repoRoot, sourceAppDir) || '.'} …`);
  const r = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', outDir], { cwd: sourceAppDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error('expo export failed');
  const bundle = readdirSync(path.join(outDir, '_expo/static/js/web')).map(f => readFileSync(path.join(outDir, '_expo/static/js/web', f), 'utf8')).join('\n');
  const leaked = bundle.match(/https:\/\/(?!placeholder\.)[a-z0-9]{10,}\.supabase\.co/);
  if (leaked) throw new Error(`Refusing to continue: a real Supabase URL is in the bundle (${leaked[0]}).`);
}

function prepareBaseWorktree(ref) {
  const dir = path.join(os.tmpdir(), `pinhunt-shots-base-${process.pid}`);
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: repoRoot, stdio: 'ignore' });
  const install = args => spawnSync('pnpm', ['install', '--frozen-lockfile', ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] }).status === 0;
  if (!install(['--offline']) && !install([])) throw new Error(`pnpm install failed in the ${ref} worktree`);
  spawnSync('pnpm', ['--filter', '@workspace/pin-repository', 'run', 'build'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// ── Static server with SPA fallback ─────────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serve(dir) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, urlPath);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ── Chrome ──────────────────────────────────────────────────────────────
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const cache of [path.join(os.homedir(), '.cache/puppeteer'), path.join(repoRoot, 'chrome-headless-shell'), path.join(repoRoot, 'chrome')]) {
    if (!existsSync(cache)) continue;
    const hit = spawnSync('find', [cache, '-type', 'f', '(', '-name', 'chrome-headless-shell', '-o', '-name', 'chrome', ')', '-perm', '-u+x'], { encoding: 'utf8' }).stdout.split('\n').find(Boolean);
    if (hit) return hit;
  }
  throw new Error('No Chrome found. Set CHROME_PATH or run: npx @puppeteer/browsers install chrome-headless-shell@stable');
}

// ── Capture ─────────────────────────────────────────────────────────────
async function capture(webDir, outDir, routes, viewports, schemes) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const server = await serve(webDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const files = [];
  try {
    for (const route of routes) {
      for (const [width, height] of viewports) {
        for (const scheme of schemes) {
          const page = await browser.newPage();
          // Block everything that is not the local server: no external calls, ever.
          await page.setRequestInterception(true);
          page.on('request', r => (r.url().startsWith(origin) || r.url().startsWith('data:') ? r.continue() : r.abort()));
          await page.evaluateOnNewDocument(storage => {
            for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
          }, DEMO_STORAGE);
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
          await page.goto(origin + route.path, { waitUntil: 'networkidle0', timeout: 30_000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 1200));
          const name = `${route.name}__${width}x${height}__${scheme}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
          files.push(name);
          await page.close();
        }
      }
      console.log(`  ✓ ${route.name}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return files;
}

// ── Publish ─────────────────────────────────────────────────────────────
function publish(prNumber, outRoot, labels) {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const slug = remote.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
  const dir = path.join(os.tmpdir(), `pinhunt-agent-artifacts-${process.pid}`);
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const hasRemoteBranch = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', 'agent-artifacts'], { cwd: repoRoot }).status === 0;
  if (hasRemoteBranch) {
    execFileSync('git', ['fetch', 'origin', 'agent-artifacts'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'add', '--detach', dir, 'FETCH_HEAD'], { cwd: repoRoot, stdio: 'ignore' });
  } else {
    execFileSync('git', ['worktree', 'add', '--detach', dir], { cwd: repoRoot, stdio: 'ignore' });
    git('checkout', '--orphan', 'agent-artifacts-tmp');
    git('rm', '-rf', '--quiet', '.');
    writeFileSync(path.join(dir, 'README.md'), '# agent-artifacts\n\nScreenshots attached to agent pull requests. Never merged into main.\n');
  }
  try {
    const target = path.join(dir, `pr-${prNumber}`);
    rmSync(target, { recursive: true, force: true });
    for (const label of labels) cpSync(path.join(outRoot, label), path.join(target, label), { recursive: true });
    git('add', '-A');
    git('commit', '--quiet', '-m', `Screenshots for #${prNumber}`);
    git('push', '--quiet', 'origin', 'HEAD:refs/heads/agent-artifacts');
    const sha = git('rev-parse', 'HEAD').trim();
    return `https://raw.githubusercontent.com/${slug}/${sha}/pr-${prNumber}`;
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: repoRoot, stdio: 'ignore' });
    // The first publish creates a local orphan branch; it is not needed afterwards.
    spawnSync('git', ['branch', '-D', 'agent-artifacts-tmp'], { cwd: repoRoot, stdio: 'ignore' });
  }
}

function markdownTable(baseUrl, outRoot, labels) {
  const [first] = labels;
  const names = readdirSync(path.join(outRoot, first)).filter(f => f.endsWith('.png')).sort();
  const header = `| Screen | ${labels.join(' | ')} |\n|---|${labels.map(() => '---').join('|')}|`;
  const rows = names.map(n => {
    const caption = n.replace('.png', '').replaceAll('__', ' · ');
    const cells = labels.map(l => (existsSync(path.join(outRoot, l, n)) ? `<img src="${baseUrl}/${l}/${n}" width="200">` : '_missing_'));
    return `| ${caption} | ${cells.join(' | ')} |`;
  });
  return `${header}\n${rows.join('\n')}\n\n_Expo web build, demo mock data. Native rendering not shown._`;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const all = JSON.parse(readFileSync(path.join(appDir, 'scripts/screenshot-routes.json'), 'utf8'));
  const routes = [
    ...(args.routes ? args.routes.map(n => all.find(r => r.name === n) ?? (() => { throw new Error(`Unknown route ${n}`); })()) : all),
    ...args.extra.map(e => { const [name, p] = e.split('='); return { name, path: p }; }),
  ];
  const viewports = args.viewports.split(',').map(v => v.split('x').map(Number));
  const schemes = args.schemes.split(',');
  const buildRoot = path.join(args.out, '.build');
  const labels = [];

  if (args.base) {
    const baseDir = prepareBaseWorktree(args.base);
    try {
      const web = path.join(buildRoot, 'before');
      exportWeb(path.join(baseDir, 'artifacts/pinhunt'), web);
      console.log(`Capturing "before" (${args.base}) …`);
      await capture(web, path.join(args.out, 'before'), routes, viewports, schemes);
      labels.push('before');
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', baseDir], { cwd: repoRoot, stdio: 'ignore' });
    }
  }

  const web = path.join(buildRoot, args.label);
  if (!args.skipBuild || !existsSync(web)) exportWeb(appDir, web);
  console.log(`Capturing "${args.label}" …`);
  await capture(web, path.join(args.out, args.label), routes, viewports, schemes);
  labels.push(args.label);
  console.log(`Saved to ${path.relative(process.cwd(), args.out)}/{${labels.join(',')}}`);

  if (args.publish) {
    const url = publish(args.publish, args.out, labels);
    const md = markdownTable(url, args.out, labels);
    writeFileSync(path.join(args.out, 'pr-screenshots.md'), md);
    console.log(`\nPublished. Paste into the PR "Screenshots" section (also saved to ${path.join(args.out, 'pr-screenshots.md')}):\n\n${md}`);
  }
}

main().catch(err => { console.error(err.message ?? err); process.exit(1); });
