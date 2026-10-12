import { describe, expect, it } from "vitest";
import {
  CONFIG_QUERY,
  CONFIG_STATEMENT_RE,
  DATA_COUNTS_QUERY,
  assertPoolerHost,
  buildConfigSql,
  connectionArgs,
  copiedData,
  diffFingerprints,
  findTool,
  missingExtensionsSql,
  pgDumpArgs,
  productionReadOnlySql,
  sanitizeSchemaDump,
} from "./staging-db.mjs";
import { STAGING_MARKER_BUCKET } from "./staging-guard.mjs";

const REF = "abcdefghijklmnopqrst";

describe("connections", () => {
  it("routes by the ref in the pooler user name", () => {
    expect(connectionArgs({ host: "aws-1-eu-west-1.pooler.supabase.com", ref: REF })).toContain(`postgres.${REF}`);
    expect(() => connectionArgs({ host: "h", ref: "bad" })).toThrow(/ref/);
  });

  it("accepts only Supabase session-pooler hosts", () => {
    expect(assertPoolerHost("aws-0-eu-west-1.pooler.supabase.com", "X")).toBeTruthy();
    for (const h of ["db.abc.supabase.co", "localhost", "aws-1-eu-west-1.pooler.supabase.com.evil.io", ""]) {
      expect(() => assertPoolerHost(h, "X")).toThrow(/session pooler/);
    }
  });

  it("dumps definitions only", () => {
    const args = pgDumpArgs(["-h", "h"], "/tmp/x.sql");
    expect(args).toContain("--schema-only");
    expect(args).toContain("--schema=public");
    expect(args.some((a) => /data-only|--inserts|--column-inserts/.test(a))).toBe(false);
  });

  it("makes every production script read-only before it runs", () => {
    const sql = productionReadOnlySql("select 1");
    expect(sql.startsWith("set default_transaction_read_only = on;\nbegin read only;\n")).toBe(true);
    expect(sql.trim().endsWith("rollback;")).toBe(true);
  });
});

describe("sanitizeSchemaDump", () => {
  const dump = [
    "SET statement_timeout = 0;",
    "SET transaction_timeout = 0;",
    "CREATE SCHEMA public;",
    "ALTER SCHEMA public OWNER TO pg_database_owner;",
    "COMMENT ON SCHEMA public IS 'standard public schema';",
    "CREATE TABLE public.pins (id uuid);",
    "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;",
    "ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.pins;",
    "GRANT SELECT ON TABLE public.pins TO anon, authenticated;",
    'REVOKE ALL ON TABLE public.pins FROM "service_role";',
  ].join("\n");

  it("drops statements a fresh Supabase project can't or needn't run, and keeps the rest", () => {
    const { sql, removed } = sanitizeSchemaDump(dump);
    expect(sql).toContain("CREATE TABLE public.pins (id uuid);");
    expect(sql).toContain("GRANT SELECT ON TABLE public.pins TO anon, authenticated;");
    expect(sql).not.toMatch(/transaction_timeout|CREATE SCHEMA public|ALTER SCHEMA public|COMMENT ON SCHEMA|ALTER DEFAULT PRIVILEGES|PUBLICATION/);
    expect(Object.values(removed).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("refuses a dump that contains row data", () => {
    expect(() => sanitizeSchemaDump(`${dump}\nCOPY public.profiles (id, email) FROM stdin;`)).toThrow(/row data/);
    expect(() => sanitizeSchemaDump(`${dump}\nINSERT INTO public.profiles VALUES (1);`)).toThrow(/row data/);
  });

  it("refuses grants to roles a new project doesn't have", () => {
    expect(() => sanitizeSchemaDump(`${dump}\nGRANT SELECT ON TABLE public.pins TO metabase_reader;`)).toThrow(/metabase_reader/);
  });
});

describe("configuration export", () => {
  const cfg = {
    buckets: [{ id: "avatars", name: "avatars", public: true, file_size_limit: null, allowed_mime_types: null },
      { id: "pin-contributed-images", name: "pin-contributed-images", public: false, file_size_limit: 10485760, allowed_mime_types: ["image/jpeg", "image/png"] }],
    storagePolicies: [{ table: "objects", name: "Owner's uploads", permissive: "PERMISSIVE", roles: ["authenticated"], cmd: "INSERT", qual: null, with_check: "(bucket_id = 'avatars'::text)" },
      { table: "objects", name: "public read", permissive: "PERMISSIVE", roles: ["public"], cmd: "SELECT", qual: "(bucket_id = 'avatars'::text)", with_check: null }],
    authTriggers: [{ table: "users", name: "on_auth_user_created", def: "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()" }],
    realtimeTables: ["conversation_messages"],
    extensions: [],
    catalogueSources: [{ id: "collectible_pintrader", display_name: "Collectible PinTrader", notes: "It's fine", public_display_allowed: true }],
    featureFlags: [{ key: "catalogue_contributions", audience: "admin", description: null }],
  };

  it("builds idempotent statements of the allowed kinds only", () => {
    const sql = buildConfigSql(cfg);
    const lines = sql.trim().split("\n");
    expect(lines.every((l) => CONFIG_STATEMENT_RE.test(l))).toBe(true);
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain(`drop policy if exists "Owner's uploads" on storage."objects";`);
    expect(sql).toContain(`for insert to "authenticated" with check ((bucket_id = 'avatars'::text));`);
    expect(sql).toContain("for select to public using");
    expect(sql).toContain(`drop trigger if exists "on_auth_user_created" on auth."users";`);
    expect(sql).toContain("public.handle_new_user();");
    expect(sql).toContain("if not exists (select 1 from pg_publication_tables");
    expect(sql).toContain("'It''s fine'");
    expect(sql).toContain("array['image/jpeg', 'image/png']::text[]");
  });

  it("never reads user rows, sign-ins or files from production", () => {
    expect(CONFIG_QUERY).not.toMatch(/from\s+auth\.users|storage\.objects|public\.(profiles|user_pins|conversation|community|trades|pin_submissions)/i);
  });

  it("only adds the extensions staging is missing", () => {
    expect(missingExtensionsSql([{ name: "pgcrypto", schema: "extensions" }, { name: "pg_trgm", schema: "extensions" }], ["pgcrypto", "plpgsql"]))
      .toEqual(['create extension if not exists "pg_trgm" with schema "extensions";']);
  });
});

describe("verification", () => {
  it("diffs fingerprints and ignores the staging marker bucket", () => {
    const prod = "table|pins|\nbucket|avatars|public=true size=- mime=-\n";
    const staging = `table|pins|\nbucket|${STAGING_MARKER_BUCKET}|public=false size=- mime=-\nbucket|avatars|public=true size=- mime=-\n`;
    expect(diffFingerprints(prod, staging)).toEqual({ missingInStaging: [], extraInStaging: [] });
    expect(diffFingerprints(prod + "table|profiles|\n", staging).missingInStaging).toEqual(["table|profiles|"]);
  });

  it("flags any copied data, allowing only the reference tables", () => {
    expect(copiedData({ "auth.users": 0, "storage.objects": 0, public: { catalogue_sources: 2, feature_flags: 1, pins: 0 } })).toEqual([]);
    expect(copiedData({ "auth.users": 3, "storage.objects": 1, public: { profiles: 3 } }))
      .toEqual(["auth.users (3)", "storage.objects (1)", "public.profiles (3)"]);
    expect(DATA_COUNTS_QUERY).toMatch(/auth\.users/);
  });
});

describe("findTool", () => {
  it("prefers PATH, then the known Mac folders, else null", () => {
    const has = (set) => (p) => set.has(p);
    expect(findTool("psql", { pathEnv: "/usr/bin:/x/bin", dirs: ["/app/bin"], exists: has(new Set(["/x/bin/psql", "/app/bin/psql"])) })).toBe("/x/bin/psql");
    expect(findTool("psql", { pathEnv: "/usr/bin", dirs: ["/app/bin"], exists: has(new Set(["/app/bin/psql"])) })).toBe("/app/bin/psql");
    expect(findTool("psql", { pathEnv: "", dirs: ["/app/bin"], exists: () => false })).toBeNull();
  });
});
