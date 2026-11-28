/**
 * A tiny in-memory stand-in for the Supabase client, enough for the bulk
 * image matcher's queries: from(table) with select/insert/update, the
 * filters eq/neq/in/lt/gte, order/limit, single/maybeSingle, head counts, and
 * storage upload/download. Test-only.
 */
type Row = Record<string, unknown>;

export function createFakeDb(tables: Record<string, Row[]> = {}) {
  const files = new Map<string, Buffer>();

  function from(table: string) {
    tables[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    let head = false;
    let countMode = false;
    let returning = false;
    let limitN = Infinity;
    let orderCol: string | null = null;
    let orderAsc = true;

    const run = () => {
      const rows = tables[table];
      if (op === "insert") {
        for (const r of inserted) rows.push(r);
        return { data: inserted, error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, patch);
        return { data: returning ? matched.map((r) => ({ ...r })) : null, error: null };
      }
      if (orderCol) {
        const c = orderCol;
        matched = [...matched].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (orderAsc ? 1 : -1));
      }
      matched = matched.slice(0, limitN);
      return { data: head ? null : matched.map((r) => ({ ...r })), count: countMode ? matched.length : undefined, error: null };
    };

    const b = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== "select") returning = true;
        if (opts?.count) countMode = true;
        if (opts?.head) head = true;
        return b;
      },
      insert(row: Row | Row[]) { op = "insert"; inserted = (Array.isArray(row) ? row : [row]).map((r) => ({ id: `id-${Math.random()}`, ...r })); return b; },
      update(p: Row) { op = "update"; patch = p; return b; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return b; },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return b; },
      neq(col: string, v: unknown) { filters.push((r) => r[col] !== v); return b; },
      lt(col: string, v: string) { filters.push((r) => r[col] != null && String(r[col]) < v); return b; },
      gte(col: string, v: string) { filters.push((r) => r[col] != null && String(r[col]) >= v); return b; },
      order(col: string, o?: { ascending?: boolean }) { orderCol = col; orderAsc = o?.ascending ?? true; return b; },
      limit(n: number) { limitN = n; return b; },
      async maybeSingle() { const r = run(); const d = r.data as Row[] | null; return { data: d?.[0] ?? null, error: null }; },
      async single() { const r = run(); const d = r.data as Row[] | null; return d?.[0] ? { data: d[0], error: null } : { data: null, error: { message: "no rows" } }; },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) { try { resolve(run()); } catch (e) { reject?.(e); } },
    };
    return b;
  }

  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, data: Buffer) { files.set(`${bucket}/${path}`, data); return { data: {}, error: null }; },
        async download(path: string) {
          const f = files.get(`${bucket}/${path}`);
          return f ? { data: new Blob([new Uint8Array(f)]), error: null } : { data: null, error: { message: "not found" } };
        },
        getPublicUrl(path: string) { return { data: { publicUrl: `https://cdn.test/storage/v1/object/public/${bucket}/${path}` } }; },
        async remove() { return { data: [], error: null }; },
      };
    },
  };

  /** Migration 087's functions: a daily AI-call budget and a one-statement stats merge. */
  const ai = { used: 0 };
  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === "bulk_reserve_ai_calls") {
      const calls = Number(args.p_calls); const limit = Number(args.p_limit);
      if (ai.used + calls <= limit) { ai.used += calls; return { data: [{ allowed: true, used: ai.used, limit_calls: limit }], error: null }; }
      return { data: [{ allowed: false, used: ai.used, limit_calls: limit }], error: null };
    }
    if (name === "bulk_merge_batch_stats") {
      const row = (tables.bulk_image_batches ?? []).find((r) => r.id === args.p_batch);
      if (!row) return { data: null, error: null };
      row.stats = { ...((row.stats as Row) ?? {}), ...((args.p_patch as Row) ?? {}) };
      return { data: row.stats, error: null };
    }
    return { data: null, error: { message: `function ${name} not found` } };
  }

  return { db: { from, storage, rpc } as unknown as import("@supabase/supabase-js").SupabaseClient, tables, files, ai };
}
