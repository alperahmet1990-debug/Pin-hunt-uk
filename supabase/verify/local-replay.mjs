// Local replay harness used to pre-validate migrations before staging.
// Usage (outside the repo, in a scratch dir):
//   npm i @electric-sql/pglite@0.5.7 && node local-replay.mjs <repo> --with-045 <repo>/supabase/verify/045_verify.sql
//   node local-replay.mjs <repo> --with-045 <repo>/supabase/verify/050_verify.sql   (RLS cases, 050)
// PGlite is an in-process WASM Postgres; this never contacts a hosted database.
// Local, throwaway Postgres (PGlite, in-process WASM) — replays the repo's
// migration chain with minimal Supabase stubs, then migration 045 and its
// verification script. Touches no hosted database.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const REPO = process.argv[2];
const MIG = path.join(REPO, "supabase/migrations");
const db = new PGlite({ extensions: { pgcrypto } });

const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, path_tokens text[], created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'),1)-1,0)] $$;
create or replace function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'),1)] $$;
create publication supabase_realtime;
-- Supabase's default grants, so verify scripts can run RLS cases as
-- anon/authenticated (050+). Migrations that revoke still revoke after this.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

await db.exec(STUBS);
const files = fs.readdirSync(MIG).filter(f => f.endsWith(".sql") && f !== "001_pins_catalogue.sql").sort();
const only045 = process.argv.includes("--with-045");
const results = [];
for (const f of files) {
  if (f.startsWith("045") && !only045) continue;
  const sql = fs.readFileSync(path.join(MIG, f), "utf8");
  try {
    await db.exec(sql);
    results.push([f, "ok"]);
  } catch (e) {
    results.push([f, "ERROR: " + String(e.message).split("\n")[0]]);
  }
}
for (const [f, r] of results) if (r !== "ok") console.log(f, r);
console.log(`applied ${results.filter(r => r[1] === "ok").length}/${results.length} migration files`);
for (const extra of process.argv.slice(3).filter(a => a.endsWith(".sql"))) {
  try {
    const out = await db.exec(fs.readFileSync(extra, "utf8"));
    const last = out.filter(r => r.rows?.length).map(r => r.rows);
    console.log(path.basename(extra), "ok");
    for (const rows of last) console.log(JSON.stringify(rows));
  } catch (e) {
    console.log(path.basename(extra), "FAILED:", e.message);
    process.exitCode = 1;
  }
}
