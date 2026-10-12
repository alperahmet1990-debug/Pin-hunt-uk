/**
 * Pure helpers for scripts/staging-db.mjs: what is read from production,
 * how the schema dump is made safe to restore into a fresh Supabase
 * project, and how staging is compared with production.
 *
 * Nothing here opens a connection. Unit-tested in staging-db.test.mjs.
 */
import { STAGING_MARKER_BUCKET, isValidRef } from "./staging-guard.mjs";

/** Where psql/pg_dump usually live on a Mac, checked after PATH. */
export const TOOL_DIRS = [
  "/Applications/Postgres.app/Contents/Versions/latest/bin",
  "/opt/homebrew/opt/libpq/bin",
  "/usr/local/opt/libpq/bin",
];

/** Full path of a Postgres tool: the first PATH entry or known folder that has it, else null. */
export function findTool(name, { pathEnv = process.env.PATH ?? "", dirs = TOOL_DIRS, exists } = {}) {
  for (const dir of [...pathEnv.split(":").filter(Boolean), ...dirs]) {
    const candidate = `${dir.replace(/\/$/, "")}/${name}`;
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** Pooler host shown in Dashboard → Connect → Session pooler. */
const POOLER_HOST_RE = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;

export function assertPoolerHost(host, label) {
  if (!POOLER_HOST_RE.test(String(host ?? ""))) {
    throw new Error(`${label} must be the session pooler host from Dashboard → Connect (aws-N-<region>.pooler.supabase.com).`);
  }
  return host;
}

/**
 * psql/pg_dump connection args. The pooler routes on the user name
 * (postgres.<ref>), so the ref in the user name is the project we reach.
 */
export function connectionArgs({ host, ref }) {
  if (!isValidRef(ref)) throw new Error("invalid project ref");
  return ["-h", host, "-p", "5432", "-U", `postgres.${ref}`, "-d", "postgres"];
}

/** pg_dump args: definitions only — no rows, ever. */
export function pgDumpArgs(conn, outFile) {
  return [...conn, "--schema-only", "--schema=public", "--no-owner", "--no-comments", "-f", outFile];
}

/**
 * Every SQL script sent to production goes through this: the session is
 * read-only server-side before anything else runs, and the work is inside a
 * READ ONLY transaction that is rolled back.
 */
export function productionReadOnlySql(sql) {
  return `set default_transaction_read_only = on;\nbegin read only;\n${sql.trim().replace(/;?\s*$/, ";")}\nrollback;\n`;
}

// Roles that exist in every Supabase project. A grant to any other role
// would fail on restore, so the export stops and names it instead.
export const SUPABASE_ROLES = new Set([
  "public", "postgres", "anon", "authenticated", "service_role", "authenticator", "dashboard_user",
  "pgbouncer", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin",
  "supabase_realtime_admin", "supabase_replication_admin", "supabase_read_only_user",
]);

/** Lines a fresh Supabase project already has, or that only Supabase may run. */
const DROP_LINES = [
  { re: /^SET transaction_timeout = .*;$/, why: "pg_dump 17 setting unknown to older servers" },
  { re: /^CREATE SCHEMA public;$/, why: "public already exists" },
  { re: /^ALTER SCHEMA public OWNER TO .*;$/, why: "Supabase owns public" },
  { re: /^COMMENT ON SCHEMA public IS .*;$/, why: "Supabase owns public" },
  { re: /^ALTER DEFAULT PRIVILEGES .*;$/, why: "fresh projects already have Supabase's defaults" },
  { re: /^(CREATE|ALTER) PUBLICATION .*;$/, why: "realtime membership is applied idempotently from config.sql" },
];

/**
 * Makes a `pg_dump --schema-only --schema=public` file safe to restore into a
 * fresh Supabase project. Throws if the file contains any row data, or a
 * grant to a role Supabase doesn't have.
 */
export function sanitizeSchemaDump(text) {
  const out = [];
  const removed = {};
  const unknownRoles = new Set();
  for (const line of text.split("\n")) {
    if (/^COPY .* FROM stdin;$/.test(line) || /^INSERT INTO /.test(line)) {
      throw new Error("the dump contains row data; only --schema-only dumps may be restored.");
    }
    const drop = DROP_LINES.find((d) => d.re.test(line));
    if (drop) {
      removed[drop.why] = (removed[drop.why] ?? 0) + 1;
      continue;
    }
    const grant = /^(?:GRANT|REVOKE) .* (?:TO|FROM) (.+);$/.exec(line);
    if (grant) {
      for (const role of grant[1].replace(/ WITH GRANT OPTION$/, "").split(",")) {
        const name = role.trim().replace(/^"|"$/g, "");
        if (!SUPABASE_ROLES.has(name.toLowerCase())) unknownRoles.add(name);
      }
    }
    out.push(line);
  }
  if (unknownRoles.size) {
    throw new Error(`the dump grants to roles a new Supabase project doesn't have: ${[...unknownRoles].join(", ")}.`);
  }
  return { sql: out.join("\n"), removed };
}

/**
 * Read-only query (run through productionReadOnlySql) returning, as one JSON
 * value, the configuration a public-schema dump misses. It reads catalog
 * metadata and two small configuration tables — never auth.users,
 * storage.objects or any user table.
 */
export const CONFIG_QUERY = `
select json_build_object(
  'buckets', (select coalesce(json_agg(json_build_object(
      'id', id, 'name', name, 'public', public,
      'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id), '[]')
    from storage.buckets),
  'storagePolicies', (select coalesce(json_agg(json_build_object(
      'table', tablename, 'name', policyname, 'permissive', permissive, 'roles', roles,
      'cmd', cmd, 'qual', qual, 'with_check', with_check) order by tablename, policyname), '[]')
    from pg_policies where schemaname = 'storage'),
  'authTriggers', (select coalesce(json_agg(json_build_object(
      'table', c.relname, 'name', t.tgname, 'def', pg_get_triggerdef(t.oid)) order by c.relname, t.tgname), '[]')
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where n.nspname = 'auth' and not t.tgisinternal and pn.nspname = 'public'),
  'realtimeTables', (select coalesce(json_agg(tablename order by tablename), '[]')
    from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
  'extensions', (select coalesce(json_agg(json_build_object('name', e.extname, 'schema', n.nspname) order by e.extname), '[]')
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace),
  'catalogueSources', (select coalesce(json_agg(json_build_object(
      'id', id, 'display_name', display_name, 'attribution_text', attribution_text,
      'rights_basis', rights_basis, 'exact_license_variant', exact_license_variant,
      'public_display_allowed', public_display_allowed, 'storage_allowed', storage_allowed,
      'app_use_allowed', app_use_allowed, 'attribution_required', attribution_required,
      'notes', notes) order by id), '[]')
    from public.catalogue_sources),
  'featureFlags', (select coalesce(json_agg(json_build_object(
      'key', key, 'audience', audience, 'description', description) order by key), '[]')
    from public.feature_flags)
)`;

export const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
export const quoteLiteral = (v) =>
  v === null || v === undefined ? "null" : typeof v === "boolean" || typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const textArray = (a) => (a == null ? "null" : `array[${a.map(quoteLiteral).join(", ")}]::text[]`);
const roleList = (roles) => roles.map((r) => (r === "public" ? "public" : quoteIdent(r))).join(", ");

/** Statement kinds config.sql may contain; anything else is a bug. */
export const CONFIG_STATEMENT_RE = /^(insert into storage\.buckets|drop policy if exists|create policy|drop trigger if exists|CREATE (CONSTRAINT )?TRIGGER|do \$\$|insert into public\.(catalogue_sources|feature_flags)|-- )/;

/** Idempotent SQL for the configuration captured by CONFIG_QUERY. */
export function buildConfigSql(cfg) {
  const lines = ["-- generated by staging-db export: bucket settings, storage policies, auth triggers, realtime, reference rows"];
  for (const b of cfg.buckets) {
    lines.push(
      `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (${quoteLiteral(b.id)}, ${quoteLiteral(b.name)}, ${b.public}, ${quoteLiteral(b.file_size_limit)}, ${textArray(b.allowed_mime_types)}) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;`,
    );
  }
  for (const p of cfg.storagePolicies) {
    const target = `storage.${quoteIdent(p.table)}`;
    lines.push(`drop policy if exists ${quoteIdent(p.name)} on ${target};`);
    lines.push(
      `create policy ${quoteIdent(p.name)} on ${target} as ${p.permissive === "RESTRICTIVE" ? "restrictive" : "permissive"} for ${p.cmd.toLowerCase()} to ${roleList(p.roles)}` +
        (p.qual ? ` using (${p.qual})` : "") +
        (p.with_check ? ` with check (${p.with_check})` : "") +
        ";",
    );
  }
  for (const t of cfg.authTriggers) {
    lines.push(`drop trigger if exists ${quoteIdent(t.name)} on auth.${quoteIdent(t.table)};`);
    lines.push(`${t.def};`);
  }
  for (const table of cfg.realtimeTables) {
    lines.push(
      `do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = ${quoteLiteral(table)}) then alter publication supabase_realtime add table public.${quoteIdent(table)}; end if; end $$;`,
    );
  }
  for (const s of cfg.catalogueSources) {
    const cols = Object.keys(s);
    lines.push(`insert into public.catalogue_sources (${cols.join(", ")}) values (${cols.map((c) => quoteLiteral(s[c])).join(", ")}) on conflict (id) do nothing;`);
  }
  for (const f of cfg.featureFlags) {
    lines.push(`insert into public.feature_flags (key, audience, description) values (${quoteLiteral(f.key)}, ${quoteLiteral(f.audience)}, ${quoteLiteral(f.description)}) on conflict (key) do nothing;`);
  }
  const bad = lines.filter((l) => !CONFIG_STATEMENT_RE.test(l));
  if (bad.length) throw new Error(`unexpected statement in config.sql: ${bad[0].slice(0, 80)}`);
  return lines.join("\n") + "\n";
}

/** Extensions production has that staging lacks, as idempotent statements. */
export function missingExtensionsSql(prodExtensions, stagingExtensionNames) {
  const have = new Set(stagingExtensionNames);
  return prodExtensions
    .filter((e) => !have.has(e.name))
    .map((e) => `create extension if not exists ${quoteIdent(e.name)} with schema ${quoteIdent(e.schema)};`);
}

/** One line per object: tables, columns, RLS, policies, functions, triggers, grants, buckets, realtime. */
export const FINGERPRINT_QUERY = `
select kind || '|' || name || '|' || detail from (
  select 'table' as kind, table_name::text as name, '' as detail
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
  union all
  select 'column', table_name || '.' || column_name, data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '')
    from information_schema.columns where table_schema = 'public'
  union all
  select 'rls', c.relname::text, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname,
         cmd || ' ' || array_to_string(roles, ',') || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'secdef=' || p.prosecdef::text || ' md5=' || md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'
  union all
  select 'trigger', c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'auth') and not t.tgisinternal
  union all
  select 'grant', table_name || ':' || grantee, string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') group by table_name, grantee
  union all
  select 'bucket', id, 'public=' || public::text || ' size=' || coalesce(file_size_limit::text, '-') || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '-')
    from storage.buckets
  union all
  select 'realtime', schemaname || '.' || tablename, '' from pg_publication_tables where pubname = 'supabase_realtime'
) f order by 1`;

/** Differences between two fingerprints, ignoring the staging marker bucket. */
export function diffFingerprints(prodText, stagingText) {
  const clean = (t) => new Set(t.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith(`bucket|${STAGING_MARKER_BUCKET}|`)));
  const prod = clean(prodText);
  const staging = clean(stagingText);
  return {
    missingInStaging: [...prod].filter((l) => !staging.has(l)).sort(),
    extraInStaging: [...staging].filter((l) => !prod.has(l)).sort(),
  };
}

/**
 * Row counts proving staging holds no copied data: sign-ins, uploaded files
 * and every public table. Run against STAGING only.
 */
export const DATA_COUNTS_QUERY = `
select json_build_object(
  'auth.users', (select count(*) from auth.users),
  'storage.objects', (select count(*) from storage.objects),
  'public', (select coalesce(json_object_agg(c.relname,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint), '{}')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r')
)`;

/** Tables restore fills from config.sql (configuration, no personal data). */
export const REFERENCE_TABLES = new Set(["catalogue_sources", "feature_flags"]);

/** Non-empty tables that would mean data was copied, given DATA_COUNTS_QUERY output. */
export function copiedData(counts) {
  const found = [];
  if (counts["auth.users"] > 0) found.push(`auth.users (${counts["auth.users"]})`);
  if (counts["storage.objects"] > 0) found.push(`storage.objects (${counts["storage.objects"]})`);
  for (const [table, n] of Object.entries(counts.public ?? {})) {
    if (n > 0 && !REFERENCE_TABLES.has(table)) found.push(`public.${table} (${n})`);
  }
  return found;
}
