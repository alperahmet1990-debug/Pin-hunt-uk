---
name: Supabase direct DB access
description: How to connect psql to the PinHunt Supabase DB for applying migrations.
---
Use the session pooler: `postgresql://postgres.<project-ref>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` with PGPASSWORD=$SUPABASE_DB_PASSWORD. Region is eu-west-1 (NOT eu-west-2, despite the UK app). Direct `db.<ref>.supabase.co` DNS does not resolve from this workspace. If auth fails, the password was likely rotated — re-request SUPABASE_DB_PASSWORD from the user.
All migrations through 013 applied as of 2026-07-25. Realtime publication (`supabase_realtime`) includes `trade_messages`, `trades`, `user_pins`, and `pin_submissions`; RLS filters delivered events, so subscribers only receive rows their select policies allow.

## Bulk catalogue imports
Row-by-row Supabase JS upserts stall/take hours for 13k rows. Use scripts/bulk-import.mjs (XLSX → CSVs in /tmp/pin-import) + scripts/bulk-import.sql (psql \copy into temp staging + set-based upserts) — completes in seconds and is idempotent. Note: `xlsx` ESM builds lack XLSX.readFile; use XLSX.read(fs.readFileSync(...), {type:'buffer'}).
Catalogue visibility: RLS only shows verification_status='verified' pins to regular users; imported rows default to needs_source_verification and must be verified to appear in-app.
