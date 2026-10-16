/**
 * Static web preview of Research Review (scripts/build-research-preview.mjs).
 *
 * When the web export is built with EXPO_PUBLIC_RESEARCH_PREVIEW=static (demo admin only, which in turn
 * requires that Supabase is NOT configured), the screen's API calls are answered in the browser by the
 * shared mock (mockApi.ts) from the research data bundled at /research-preview/runs.json. Nothing is sent
 * anywhere. Decisions are kept in this browser's storage and can be exported / imported as JSON.
 */
import { isDemoAdmin } from '@/lib/demoMode';
import { createMockApi, type MockApi, type SavedDecisions } from './mockApi';
import { checksFromWorkbookBase64 } from './workbook';

export const isStaticResearchPreview = isDemoAdmin && process.env.EXPO_PUBLIC_RESEARCH_PREVIEW === 'static';

const STORAGE_KEY = 'pinhunt.researchPreview.decisions.v1';
const DATA_URL = '/research-preview/runs.json';

export interface PreviewInfo { generated: string | null; gitCommit: string | null; pins: number }
let ready: Promise<{ api: MockApi; info: PreviewInfo }> | null = null;

function readSaved(): SavedDecisions | null {
  try { const raw = globalThis.localStorage?.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSaved(api: MockApi) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(api.snapshot())); } catch { /* storage full or blocked: decisions stay in memory */ }
}

function load() {
  ready ??= (async () => {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error('The preview research data could not be loaded');
    const data = await resp.json();
    const api = createMockApi(data.candidates ?? [], data.git_commit ?? 'preview');
    api.restore(readSaved());
    return { api, info: { generated: data.generated ?? null, gitCommit: data.git_commit ?? null, pins: api.size } };
  })();
  return ready;
}

export async function previewInfo(): Promise<PreviewInfo> { return (await load()).info; }

/** Drop-in for the screen's api(): same paths, same errors. */
export async function previewApi(path: string, init?: RequestInit) {
  const { api } = await load();
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: Record<string, unknown> = {};
  if (typeof init?.body === 'string' && init.body) body = JSON.parse(init.body);
  if (path.startsWith('/admin/research/catalogue/checks') && typeof body.file === 'string') {
    try { body = { checks: await checksFromWorkbookBase64(body.file) }; }
    catch (e) { throw new Error(e instanceof Error ? e.message : 'Could not read the workbook'); }
  }
  const [status, data] = api.handle(method, path, body) as [number, Record<string, any>];
  if (method !== 'GET') writeSaved(api);
  if (status >= 400) throw new Error(data?.error ?? 'Request failed');
  return data;
}

/** This browser's decisions as a JSON file body. */
export async function exportDecisions(): Promise<{ text: string; count: number }> {
  const { api } = await load();
  const snap = api.snapshot();
  return { text: JSON.stringify(snap, null, 1), count: Object.keys(snap.decisions).length };
}

/** Merges decisions from an exported file; pins the current data doesn't contain are skipped. */
export async function importDecisions(text: string) {
  const { api } = await load();
  let parsed: SavedDecisions;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not valid JSON'); }
  if (parsed?.format !== 'pinhunt-research-review-preview-v1' || typeof parsed.decisions !== 'object') {
    throw new Error('That file is not a Research Review preview export');
  }
  const result = api.restore(parsed);
  writeSaved(api);
  return result;
}

/** Clears this browser's saved decisions (the page reloads afterwards). */
export function clearDecisions() {
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* nothing saved */ }
}
