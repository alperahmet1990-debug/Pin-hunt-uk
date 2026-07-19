/**
 * PinHunt UK — Setup Verification Script
 *
 * Checks that Supabase is correctly configured before the first import.
 * Run this after applying the SQL migrations.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run verify
 *
 * Required env vars:
 *   SUPABASE_URL               or EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY          or EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const passed: string[] = [];
const failed: string[] = [];

function ok(msg: string) {
  passed.push(msg);
  console.log(`  ✓  ${msg}`);
}

function fail(msg: string, detail?: string) {
  failed.push(msg);
  console.error(`  ✗  ${msg}${detail ? `\n       → ${detail}` : ''}`);
}

async function main() {
  console.log('');
  console.log('PinHunt UK — Setup Verification');
  console.log('─'.repeat(50));
  console.log('');

  // ── Check env vars ──────────────────────────────────────────────────────
  console.log('[ Environment variables ]');
  if (SUPABASE_URL) ok('SUPABASE_URL is set');
  else              fail('SUPABASE_URL is missing');

  if (ANON_KEY)     ok('SUPABASE_ANON_KEY is set');
  else              fail('SUPABASE_ANON_KEY is missing (needed by the Expo app)');

  if (SERVICE_ROLE_KEY) ok('SUPABASE_SERVICE_ROLE_KEY is set');
  else                  fail('SUPABASE_SERVICE_ROLE_KEY is missing (needed for import script)');

  if (failed.length > 0) {
    console.log('');
    console.log('❌  Fix the missing env vars, then re-run.');
    process.exit(1);
  }
  console.log('');

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Database connectivity ───────────────────────────────────────────────
  console.log('[ Database connectivity ]');
  try {
    const { error } = await adminClient.from('pins').select('id', { count: 'exact', head: true });
    if (error) fail('Cannot connect to DB as service role', error.message);
    else        ok('Service role can connect and query pins table');
  } catch (e) {
    fail('Service role connection failed', String(e));
  }

  try {
    const { error } = await anonClient.from('pins').select('id', { count: 'exact', head: true });
    if (error) fail('Cannot connect to DB as anon', error.message);
    else        ok('Anon key can connect and query pins table');
  } catch (e) {
    fail('Anon key connection failed', String(e));
  }
  console.log('');

  // ── Schema check ────────────────────────────────────────────────────────
  console.log('[ Schema check ]');
  const tables = [
    'profiles', 'pins', 'characters', 'categories',
    'pin_characters', 'pin_categories', 'pin_external_ids',
    'pin_images', 'pin_sources', 'user_pins', 'pin_submissions',
    'scan_attempts', 'price_history', 'trades', 'trade_items', 'trade_messages',
  ];

  for (const table of tables) {
    try {
      const { error } = await adminClient.from(table as never).select('*', { count: 'exact', head: true });
      if (error) fail(`Table '${table}' missing or inaccessible`, error.message);
      else        ok(`Table '${table}' exists`);
    } catch (e) {
      fail(`Table '${table}' check failed`, String(e));
    }
  }
  console.log('');

  // ── RLS check ───────────────────────────────────────────────────────────
  console.log('[ Row Level Security ]');
  try {
    // Insert a test pin via service role, then check anon access
    const testId = `PHUK-TEST-${Date.now()}`;
    const { error: insertErr } = await adminClient.from('pins').insert({
      pinhunt_id: testId,
      title: 'RLS Test Pin',
      brand: 'Test',
      collection: 'Test',
      verification_status: 'needs_source_verification',
      status: 'active',
    });

    if (insertErr) {
      fail('Cannot insert test pin via service role', insertErr.message);
    } else {
      ok('Service role can insert pins');

      // Anon should NOT see this (needs_source_verification)
      const { data: anonData } = await anonClient
        .from('pins')
        .select('id')
        .eq('pinhunt_id', testId)
        .maybeSingle();

      if (anonData) {
        fail('RLS BREACH: anon key can read unverified pins!');
      } else {
        ok('Anon key cannot read unverified pins (RLS working correctly)');
      }

      // Mark verified
      await adminClient
        .from('pins')
        .update({ verification_status: 'verified' })
        .eq('pinhunt_id', testId);

      // Anon SHOULD see verified
      const { data: verifiedData } = await anonClient
        .from('pins')
        .select('id')
        .eq('pinhunt_id', testId)
        .maybeSingle();

      if (verifiedData) {
        ok('Anon key can read verified pins (RLS working correctly)');
      } else {
        fail('Anon key cannot read verified pins — RLS or replication issue');
      }

      // Anon should NOT be able to write
      const { error: writeErr } = await anonClient.from('pins').insert({
        pinhunt_id: `${testId}-ANON`,
        title: 'Should be rejected',
        brand: 'Test',
        collection: 'Test',
      });

      if (writeErr) {
        ok('Anon key is blocked from writing pins (RLS working correctly)');
      } else {
        fail('RLS BREACH: anon key can write to pins!');
        // Clean up
        await adminClient.from('pins').delete().eq('pinhunt_id', `${testId}-ANON`);
      }

      // Clean up test pin
      await adminClient.from('pins').delete().eq('pinhunt_id', testId);
    }
  } catch (e) {
    fail('RLS check threw an unexpected error', String(e));
  }
  console.log('');

  // ── Auth check ──────────────────────────────────────────────────────────
  console.log('[ Auth endpoint ]');
  try {
    // Attempt sign-in with a non-existent account — we just want to confirm
    // the auth endpoint is reachable (it should return an error, not throw)
    const { error } = await anonClient.auth.signInWithPassword({
      email: `verify-${Date.now()}@example.com`,
      password: 'not-a-real-password',
    });
    if (error?.message?.includes('Invalid login credentials') ||
        error?.message?.includes('Email not confirmed') ||
        error?.status === 400) {
      ok('Auth endpoint is reachable (rejected invalid credentials as expected)');
    } else if (error) {
      fail('Auth endpoint returned unexpected error', error.message);
    } else {
      fail('Auth endpoint accepted a random email/password — something is wrong');
    }
  } catch (e) {
    fail('Auth endpoint unreachable', String(e));
  }
  console.log('');

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('─'.repeat(50));
  console.log(`  Passed : ${passed.length}`);
  console.log(`  Failed : ${failed.length}`);
  console.log('');

  if (failed.length === 0) {
    console.log('✅  All checks passed. You can now run the import:');
    console.log('   pnpm --filter @workspace/scripts run import:verify-all');
  } else {
    console.log('❌  Some checks failed. Review the output above.');
    console.log('');
    console.log('Common fixes:');
    console.log('  Schema errors → run supabase/migrations/001_schema.sql in the Supabase SQL editor');
    console.log('  RLS errors    → run supabase/migrations/002_rls.sql in the Supabase SQL editor');
    console.log('  Auth errors   → check SUPABASE_URL is correct and the project is active');
  }
  console.log('');

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
