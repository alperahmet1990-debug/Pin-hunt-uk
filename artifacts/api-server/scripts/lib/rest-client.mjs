/**
 * A small stand-in for supabase-js's query builder, over Supabase's REST API
 * (PostgREST) with the built-in fetch, so maintainer scripts run with plain
 * `node` and no install. It supports only what scripts/lib/pinandpop.mjs uses:
 *
 *   from(t).select(cols, { count: "exact", head: true })
 *     .eq(c, v) .neq(c, v) .gte(c, v) .is(c, null) .in(c, values) .or(expr)
 *     .order(c, { ascending }) .limit(n) .range(from, to)
 *   from(t).insert(rows)
 *   from(t).upsert(rows, { onConflict, ignoreDuplicates }) [.select(cols)]
 *   from(t).update(values).eq(...)
 *   from(t).delete().in(...).eq(...)
 *   rpc(fn, args)                     (GET; read-only functions only)
 *
 * Every builder is awaitable and resolves to { data, error, count }, like supabase-js.
 */

export function restHeaders(serviceKey) {
  const key = String(serviceKey ?? "").trim();
  // New-style secret keys (sb_secret_…) go in the apikey header only.
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

class Query {
  constructor(client, table) {
    this.c = client;
    this.table = table;
    this.method = "GET";
    this.params = [];
    this.prefer = [];
    this.body = undefined;
    this.cols = null;
    this.head = false;
  }
  select(cols = "*", opts = {}) {
    this.cols = cols.replace(/\s+/g, "");
    if (opts.count === "exact") this.prefer.push("count=exact");
    if (opts.head) this.head = true;
    if (this.method !== "GET") this.prefer.push("return=representation");
    return this;
  }
  eq(c, v) { this.params.push([c, `eq.${v}`]); return this; }
  neq(c, v) { this.params.push([c, `neq.${v}`]); return this; }
  gte(c, v) { this.params.push([c, `gte.${v}`]); return this; }
  is(c, v) { this.params.push([c, `is.${v === null ? "null" : v}`]); return this; }
  in(c, values) { this.params.push([c, `in.(${values.map(quote).join(",")})`]); return this; }
  or(expr) { this.params.push(["or", `(${expr})`]); return this; }
  order(c, { ascending = true } = {}) { this.params.push(["order", `${c}.${ascending ? "asc" : "desc"}`]); return this; }
  limit(n) { this.params.push(["limit", String(n)]); return this; }
  range(from, to) { this.params.push(["offset", String(from)], ["limit", String(to - from + 1)]); return this; }
  insert(rows) { this.method = "POST"; this.body = rows; this.prefer.push("return=minimal"); return this; }
  upsert(rows, { onConflict, ignoreDuplicates = false } = {}) {
    this.method = "POST";
    this.body = rows;
    this.prefer.push(ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates");
    if (onConflict) this.params.push(["on_conflict", onConflict.replace(/\s+/g, "")]);
    return this;
  }
  update(values) { this.method = "PATCH"; this.body = values; return this; }
  delete() { this.method = "DELETE"; return this; }

  url() {
    const qs = [];
    if (this.cols && (this.method === "GET" || this.prefer.includes("return=representation"))) qs.push(`select=${encodeURIComponent(this.cols)}`);
    for (const [k, v] of this.params) qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return `${this.c.base}/rest/v1/${this.table}${qs.length ? `?${qs.join("&")}` : ""}`;
  }

  async run() {
    const headers = { ...this.c.headers, "Content-Type": "application/json" };
    const prefer = this.prefer.filter((p, i, a) => a.indexOf(p) === i && !(p === "return=minimal" && a.includes("return=representation")));
    if (prefer.length) headers.Prefer = prefer.join(",");
    const res = await this.c.fetch(this.url(), {
      method: this.head ? "HEAD" : this.method,
      headers,
      body: this.body === undefined ? undefined : JSON.stringify(this.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let count = null;
    const range = res.headers?.get?.("content-range");
    if (range && /\/(\d+)$/.test(range)) count = Number(/\/(\d+)$/.exec(range)[1]);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: { message: `${res.status} ${err.message ?? err.error ?? ""}`.trim(), code: err.code }, count };
    }
    if (this.head || res.status === 204) return { data: null, error: null, count };
    const text = await res.text();
    return { data: text ? JSON.parse(text) : null, error: null, count };
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

// Every call gives up on its own (outbound-timeouts.test.ts, #67), so a hung
// connection can't stall a scheduled sync forever. Generous: a 250-pin upsert
// into the indexed pins table can take tens of seconds.
const REQUEST_TIMEOUT_MS = 120_000;

export function createRestClient(url, serviceKey, fetchImpl = fetch) {
  const client = { base: String(url).replace(/\/$/, ""), headers: restHeaders(serviceKey), fetch: fetchImpl };
  return {
    from: (table) => new Query(client, table),
    rpc: async (fn, args = {}) => {
      const qs = Object.entries(args).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      const res = await fetchImpl(`${client.base}/rest/v1/rpc/${fn}${qs ? `?${qs}` : ""}`, { headers: client.headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return { data: null, error: { message: `${res.status}` } };
      return { data: await res.json(), error: null };
    },
    storageBucketExists: async (id) => {
      const res = await fetchImpl(`${client.base}/storage/v1/bucket/${encodeURIComponent(id)}`, { headers: client.headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.ok) return true;
      if ([400, 404].includes(res.status)) return false;
      throw new Error(`couldn't check storage buckets (${res.status})`);
    },
  };
}
