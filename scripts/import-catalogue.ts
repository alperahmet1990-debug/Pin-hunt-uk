/**
 * PinHunt UK — Catalogue Import Script
 *
 * Reads the master XLSX spreadsheet and upserts all pins into Supabase.
 * Idempotent: safe to run multiple times; existing rows are updated in place.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run import [path/to/catalogue.xlsx]
 *   pnpm --filter @workspace/scripts run import:verify-all   # also marks all imported pins as verified
 *
 * Required env vars (set as Replit Secrets):
 *   SUPABASE_URL               or  EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — NEVER commit this; scripts only
 *
 * Column mapping (spreadsheet column → DB field):
 *   pinhunt_id         → pins.pinhunt_id
 *   Pin name           → pins.title
 *   Brand              → pins.brand
 *   Series             → pins.collection
 *   Characters         → characters + pin_characters (semicolon-separated)
 *   Release year       → pins.release_year
 *   Edition size       → pins.limited_edition_size
 *   external_ids       → pin_external_ids (format "PinPics: 12345; eBay: 98765")
 *   Categories         → categories + pin_categories (semicolon-separated)
 *   Release date       → pins.release_date
 *   Park / Retailer    → pins.origin
 *   Edition type       → pins.edition_type
 *   Original price     → pins.retail_price
 *   Currency           → pins.currency
 *   Front image URL    → pins.image_url
 *   Back image URL     → pins.back_image_url
 *   Source URL         → pin_sources.source_url
 *   Verification status → pins.verification_status
 *   Notes              → (ignored — not in schema)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const VERIFY_ALL = process.argv.includes('--verify-all');

// Accept xlsx path as first positional arg, fall back to well-known location
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_XLSX = path.resolve(
  __dirname,
  '..',
  'attached_assets',
  'PinHunt_UK_Master_Pin_Catalogue_Template_Updated_1784488262605.xlsx',
);
const XLSX_PATH =
  process.argv.find(a => a.endsWith('.xlsx') || a.endsWith('.xls')) ?? DEFAULT_XLSX;

// ─── Boot checks ──────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('');
  console.error('❌  Missing required environment variables:');
  if (!SUPABASE_URL)      console.error('   SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL)');
  if (!SERVICE_ROLE_KEY)  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Add them as Replit Secrets, then re-run the script.');
  process.exit(1);
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`❌  Spreadsheet not found: ${XLSX_PATH}`);
  console.error('');
  console.error('Pass the path as an argument:');
  console.error('  pnpm --filter @workspace/scripts run import path/to/catalogue.xlsx');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitSemicolon(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

function mapVerificationStatus(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  if (VERIFY_ALL) return 'verified';
  switch (v) {
    case 'verified':                  return 'verified';
    case 'needs source verification': return 'needs_source_verification';
    case 'community submitted':       return 'community_submitted';
    default:                          return 'needs_source_verification';
  }
}

/**
 * Parse "PinPics: 12345; eBay: 98765" → [{source, external_id}]
 * source is lowercased and normalised to snake_case.
 */
function parseExternalIds(
  raw: unknown,
): Array<{ source: string; external_id: string }> {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .flatMap(s => {
      const colonIdx = s.indexOf(':');
      if (colonIdx === -1) return [];
      const source = s
        .slice(0, colonIdx)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const external_id = s.slice(colonIdx + 1).trim();
      return source && external_id ? [{ source, external_id }] : [];
    });
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── Per-row import ───────────────────────────────────────────────────────────

type ImportReport = {
  total: number;
  upserted: number;
  errors: Array<{ pinhunt_id: string; error: string }>;
};

async function importRow(row: Record<string, unknown>, report: ImportReport): Promise<void> {
  const pinhuntId = asString(row['pinhunt_id']);
  if (!pinhuntId) {
    report.errors.push({ pinhunt_id: '(missing)', error: 'pinhunt_id is empty — row skipped' });
    return;
  }

  try {
    // ── 1. Upsert the pin ────────────────────────────────────────────────
    const { data: pinData, error: pinErr } = await supabase
      .from('pins')
      .upsert(
        {
          pinhunt_id: pinhuntId,
          title: asString(row['Pin name']) ?? pinhuntId,
          brand: asString(row['Brand']) ?? 'Unknown',
          collection: asString(row['Series']) ?? 'Uncategorised',
          release_year: asNumber(row['Release year']),
          release_date: asString(row['Release date']),
          retail_price: asNumber(row['Original price']),
          currency: asString(row['Currency']) ?? 'USD',
          limited_edition_size: asNumber(row['Edition size']),
          origin: asString(row['Park / Retailer']),
          edition_type: asString(row['Edition type']),
          image_url: asString(row['Front image URL']),
          back_image_url: asString(row['Back image URL']),
          verification_status: mapVerificationStatus(row['Verification status']),
          status: 'active',
          catalogue_source: 'pinhunt_import',
          catalogue_updated_at: new Date().toISOString(),
        },
        { onConflict: 'pinhunt_id' },
      )
      .select('id')
      .single();

    if (pinErr) throw new Error(`pin upsert: ${pinErr.message}`);
    const pinUuid = (pinData as { id: string }).id;

    // ── 2. Characters ────────────────────────────────────────────────────
    const characters = splitSemicolon(row['Characters']);
    if (characters.length > 0) {
      await supabase
        .from('characters')
        .upsert(characters.map(name => ({ name })), {
          onConflict: 'name',
          ignoreDuplicates: true,
        });

      const { data: charRows } = await supabase
        .from('characters')
        .select('id')
        .in('name', characters);

      if (charRows?.length) {
        await supabase.from('pin_characters').delete().eq('pin_id', pinUuid);
        await supabase.from('pin_characters').insert(
          (charRows as Array<{ id: string }>).map(c => ({
            pin_id: pinUuid,
            character_id: c.id,
          })),
        );
      }
    }

    // ── 3. Categories ────────────────────────────────────────────────────
    const categories = splitSemicolon(row['Categories']);
    if (categories.length > 0) {
      await supabase
        .from('categories')
        .upsert(categories.map(name => ({ name })), {
          onConflict: 'name',
          ignoreDuplicates: true,
        });

      const { data: catRows } = await supabase
        .from('categories')
        .select('id')
        .in('name', categories);

      if (catRows?.length) {
        await supabase.from('pin_categories').delete().eq('pin_id', pinUuid);
        await supabase.from('pin_categories').insert(
          (catRows as Array<{ id: string }>).map(c => ({
            pin_id: pinUuid,
            category_id: c.id,
          })),
        );
      }
    }

    // ── 4. External IDs ──────────────────────────────────────────────────
    const externalIds = parseExternalIds(row['external_ids']);
    for (const eid of externalIds) {
      // Best effort — no unique constraint on (pin_id, source) yet
      const { data: existing } = await supabase
        .from('pin_external_ids')
        .select('id')
        .eq('pin_id', pinUuid)
        .eq('source', eid.source)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('pin_external_ids')
          .update({ external_id: eid.external_id })
          .eq('id', (existing as { id: string }).id);
      } else {
        await supabase.from('pin_external_ids').insert({
          pin_id: pinUuid,
          source: eid.source,
          external_id: eid.external_id,
        });
      }
    }

    // ── 5. Source URL ────────────────────────────────────────────────────
    const sourceUrl = asString(row['Source URL']);
    if (sourceUrl) {
      const { data: existingSrc } = await supabase
        .from('pin_sources')
        .select('id')
        .eq('pin_id', pinUuid)
        .eq('source_url', sourceUrl)
        .maybeSingle();

      if (!existingSrc) {
        await supabase.from('pin_sources').insert({
          pin_id: pinUuid,
          source_url: sourceUrl,
          source_name: 'spreadsheet',
        });
      }
    }

    report.upserted++;
  } catch (err) {
    report.errors.push({
      pinhunt_id: pinhuntId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('PinHunt UK — Catalogue Import');
  console.log('─'.repeat(50));
  console.log(`  Source : ${XLSX_PATH}`);
  console.log(`  Target : ${SUPABASE_URL}`);
  if (VERIFY_ALL) {
    console.log('  Mode   : --verify-all (all imported pins will be marked "verified")');
  } else {
    console.log('  Mode   : standard (verification_status taken from spreadsheet)');
  }
  console.log('');

  // Parse spreadsheet
  const workbook = XLSX.readFile(XLSX_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });

  if (rows.length === 0) {
    console.warn('⚠️  Spreadsheet has no data rows. Nothing to import.');
    return;
  }

  console.log(`Found ${rows.length} rows. Importing…`);
  console.log('');

  const report: ImportReport = { total: rows.length, upserted: 0, errors: [] };

  // Import sequentially to avoid rate limits and make error output readable
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pinhuntId = asString(row['pinhunt_id']) ?? `row-${i + 2}`;
    process.stdout.write(`  [${String(i + 1).padStart(3, ' ')}/${rows.length}] ${pinhuntId.padEnd(25)} `);
    await importRow(row, report);
    const ok = !report.errors.some(e => e.pinhunt_id === pinhuntId);
    console.log(ok ? '✓' : '✗  ERROR');
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log(`  Imported : ${report.upserted} / ${report.total}`);
  console.log(`  Errors   : ${report.errors.length}`);

  if (report.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    report.errors.forEach(e => {
      console.log(`  ${e.pinhunt_id}: ${e.error}`);
    });
  }

  if (!VERIFY_ALL) {
    console.log('');
    console.log('⚠️  Note: pins with verification_status ≠ "verified" will NOT be visible');
    console.log('   in the app (RLS restricts public reads to verified pins only).');
    console.log('');
    console.log('   To verify all imported pins for development:');
    console.log('     pnpm --filter @workspace/scripts run import:verify-all');
    console.log('');
    console.log('   Or verify individual pins in the Supabase SQL editor:');
    console.log(`     UPDATE pins SET verification_status = 'verified'`);
    console.log(`       WHERE verification_status != 'verified';`);
  }

  console.log('');
  process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
