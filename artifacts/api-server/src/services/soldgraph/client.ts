/**
 * Soldgraph API client (server-side only).
 *
 * - Searches are jobs: `200 complete`, or `202 pending` followed by long-polling
 *   `poll_url` (joined to the API ORIGIN, not /v1) with `?wait=20`.
 * - Every logical page request carries an `Idempotency-Key` (UUID) that is reused
 *   on every retry of that request, so a retry is never charged twice.
 * - 429 (honouring Retry-After) and 5xx are retried with exponential backoff and
 *   jitter. `quota_exceeded` / `upstream_daily_limit` are never retried: they map
 *   to ProviderUnavailableError(until).
 * - Spend control: SOLDGRAPH_ENABLED must equal "true" (kill switch), the month's
 *   usage is checked against the budget BEFORE each billable call, usage is
 *   recorded for every call, and an in-process limiter keeps under 60 req/min.
 * - SOLDGRAPH_API_KEY is only ever placed in the Authorization header. It is
 *   never logged, never put in an error message and never returned.
 *
 * No route uses this yet; it is not reachable from the mobile app.
 */
import { randomUUID } from "node:crypto";
import { logger as defaultLogger } from "../../lib/logger";
import {
  BudgetExceededError,
  ProviderDisabledError,
  ProviderUnavailableError,
  SoldgraphHttpError,
  SoldgraphTimeoutError,
} from "./errors";
import { monthOf, type SoldgraphBudget, type SoldgraphUsageStatus, type UsageStore } from "./usage-store";

export * from "./errors";
export * from "./usage-store";

export const SOLDGRAPH_DEFAULT_BASE_URL = "https://api.soldgraph.com/v1";

export const SOLDGRAPH_DEFAULT_MONTHLY_LIMIT = 100;

export type SoldgraphCallKind = "search" | "poll" | "cache_hit";

/**
 * Counting rule for budget and usage: each billable HTTP call to a search or
 * listing route costs 1 credit; polls of an already-started job and cache hits
 * cost 0. Change here if Soldgraph's docs say otherwise.
 */
export function soldgraphCreditsForCall(kind: SoldgraphCallKind): number {
  return kind === "search" ? 1 : 0;
}

/** Default budget when no row exists: SOLDGRAPH_MONTHLY_LIMIT (positive integer) or 100, always a hard stop. */
export function defaultSoldgraphBudget(env: NodeJS.ProcessEnv = process.env): SoldgraphBudget {
  const raw = Number(env.SOLDGRAPH_MONTHLY_LIMIT);
  const limit = Number.isInteger(raw) && raw > 0 ? raw : SOLDGRAPH_DEFAULT_MONTHLY_LIMIT;
  return { limitCredits: limit, hardStop: true };
}

export interface SoldgraphClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: SoldgraphClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface SoldgraphLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface SoldgraphClientOptions {
  usageStore: UsageStore;
  /** Defaults to process.env.SOLDGRAPH_API_KEY (read at call time). */
  apiKey?: string;
  /** Defaults to process.env.SOLDGRAPH_ENABLED === "true" (read at call time). */
  enabled?: boolean;
  baseUrl?: string;
  fetch?: typeof fetch;
  clock?: SoldgraphClock;
  logger?: SoldgraphLogger;
  random?: () => number;
  uuid?: () => string;
  /** Max HTTP attempts per request (default 3). */
  maxAttempts?: number;
  /** Per-request timeout for searches (default 15s). */
  requestTimeoutMs?: number;
  /** Overall deadline for one search() call, all pages included (default 60s). */
  deadlineMs?: number;
  /** Max pages followed per search (default 1). */
  pageCap?: number;
  /** Requests per rolling minute (default 60). */
  ratePerMinute?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Long-poll wait in seconds (default 20). */
  pollWaitSeconds?: number;
  /** Pause between polls that came back still pending (default 1000). */
  pollIntervalMs?: number;
  /**
   * Budget used when the store has no row for the month. Defaults to
   * { limitCredits: SOLDGRAPH_MONTHLY_LIMIT or 100, hardStop: true }.
   */
  defaultBudget?: SoldgraphBudget;
  /** Fraction of the budget at which a warning is logged (default 0.8). */
  warnAtFraction?: number;
}

export interface SoldgraphSearchOptions {
  pinId?: string;
  deadlineMs?: number;
  maxPages?: number;
  maxAttempts?: number;
}

export type SoldgraphParams = Record<string, string | number | boolean | undefined | null>;

export interface SoldgraphSearchResult<T = unknown> {
  rows: T[];
  pages: number;
  /** True when the provider reported more pages than the page cap allowed. */
  truncated: boolean;
  requestIds: string[];
}

export interface SoldgraphClient {
  search<T = unknown>(
    route: string,
    params?: SoldgraphParams,
    opts?: SoldgraphSearchOptions,
  ): Promise<SoldgraphSearchResult<T>>;
}

/** Sliding-window limiter: at most `max` acquisitions per `windowMs`. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: SoldgraphClock,
  ) {}

  async acquire(deadlineAt: number): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      while (this.stamps.length && this.stamps[0] <= now - this.windowMs) this.stamps.shift();
      if (this.stamps.length < this.max) {
        this.stamps.push(now);
        return;
      }
      const wait = this.stamps[0] + this.windowMs - now;
      if (now + wait > deadlineAt) throw new SoldgraphTimeoutError();
      await this.clock.sleep(wait);
    }
  }
}

const QUOTA_CODES = new Set(["quota_exceeded", "upstream_daily_limit"]);
const ROUTE_RE = /^\/?[a-z0-9][a-z0-9_\-/]*$/i;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function errorCode(body: unknown): string | null {
  if (!isObj(body) || !isObj(body.error)) return null;
  const code = body.error.code;
  return typeof code === "string" && /^[a-z0-9_.-]{1,64}$/i.test(code) ? code : null;
}

function parseRetryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

function quotaUntil(code: string, now: number, retryAfterMs: number | null): Date {
  if (retryAfterMs !== null && retryAfterMs > 0) return new Date(now + retryAfterMs);
  const d = new Date(now);
  return code === "upstream_daily_limit"
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function createSoldgraphClient(options: SoldgraphClientOptions): SoldgraphClient {
  const clock = options.clock ?? systemClock;
  const log = options.logger ?? (defaultLogger as unknown as SoldgraphLogger);
  const random = options.random ?? Math.random;
  const uuid = options.uuid ?? randomUUID;
  const store = options.usageStore;
  const baseUrl = (options.baseUrl ?? SOLDGRAPH_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const origin = new URL(baseUrl).origin;
  const defaultMaxAttempts = options.maxAttempts ?? 3;
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const defaultDeadlineMs = options.deadlineMs ?? 60_000;
  const defaultPageCap = options.pageCap ?? 1;
  const baseBackoffMs = options.baseBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  const pollWaitSeconds = options.pollWaitSeconds ?? 20;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const warnAt = options.warnAtFraction ?? 0.8;
  const limiter = new RateLimiter(options.ratePerMinute ?? 60, 60_000, clock);

  interface Ctx {
    deadlineAt: number;
    maxAttempts: number;
    requestId: string | null;
    accepted: boolean;
  }

  const fetchImpl = (): typeof fetch => options.fetch ?? fetch;

  function backoff(attempt: number): number {
    const exp = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (attempt - 1));
    return Math.round(exp * (0.5 + random() * 0.5));
  }

  async function http(
    url: string,
    ctx: Ctx,
    key: string,
    kind: { idempotencyKey?: string; timeoutMs: number },
  ): Promise<{ status: number; body: Json }> {
    for (let attempt = 1; ; attempt++) {
      const remaining = ctx.deadlineAt - clock.now();
      if (remaining <= 0) throw new SoldgraphTimeoutError();
      await limiter.acquire(ctx.deadlineAt);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      };
      if (kind.idempotencyKey) headers["Idempotency-Key"] = kind.idempotencyKey;

      let res: Response;
      try {
        res = await fetchImpl()(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(Math.max(1, Math.min(kind.timeoutMs, remaining))),
        });
      } catch {
        // Network error or per-request timeout. Details are not logged: they can echo request data.
        if (attempt >= ctx.maxAttempts) throw new SoldgraphHttpError(0, "network_error", ctx.requestId);
        const delay = backoff(attempt);
        if (delay >= ctx.deadlineAt - clock.now()) throw new SoldgraphTimeoutError();
        log.warn({ attempt }, "soldgraph request failed, retrying");
        await clock.sleep(delay);
        continue;
      }

      const requestId = res.headers.get("x-request-id");
      if (requestId) ctx.requestId = requestId;

      let body: unknown = null;
      try {
        body = JSON.parse(await res.text());
      } catch {
        body = null;
      }

      if (res.ok) {
        if (!isObj(body)) throw new SoldgraphHttpError(res.status, "invalid_response", ctx.requestId);
        return { status: res.status, body };
      }

      const code = errorCode(body);
      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"), clock.now());
      if (code && QUOTA_CODES.has(code)) {
        throw new ProviderUnavailableError(quotaUntil(code, clock.now(), retryAfterMs), code);
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= ctx.maxAttempts) throw new SoldgraphHttpError(res.status, code, ctx.requestId);
        const left = ctx.deadlineAt - clock.now();
        if (res.status === 429 && retryAfterMs !== null && retryAfterMs >= left) {
          // Waiting would outlast this search: report unavailable instead of blocking.
          throw new ProviderUnavailableError(new Date(clock.now() + retryAfterMs), code ?? "rate_limited");
        }
        const delay = retryAfterMs ?? backoff(attempt);
        if (delay >= left) throw new SoldgraphTimeoutError();
        log.warn({ attempt, status: res.status, requestId: ctx.requestId }, "soldgraph request retrying");
        await clock.sleep(delay);
        continue;
      }
      throw new SoldgraphHttpError(res.status, code, ctx.requestId);
    }
  }

  function resolvePollUrl(pollUrl: unknown): string {
    if (typeof pollUrl !== "string") throw new SoldgraphHttpError(200, "invalid_response", null);
    let url: URL;
    try {
      url = new URL(pollUrl, origin);
    } catch {
      throw new SoldgraphHttpError(200, "invalid_poll_url", null);
    }
    // Never send the bearer token anywhere but the API origin.
    if (url.origin !== origin) throw new SoldgraphHttpError(200, "invalid_poll_url", null);
    return url.toString();
  }

  function failedJob(body: Json, ctx: Ctx, now: number): Error {
    const code = errorCode(body) ?? "job_failed";
    if (QUOTA_CODES.has(code)) return new ProviderUnavailableError(quotaUntil(code, now, null), code);
    return new SoldgraphHttpError(200, code, ctx.requestId);
  }

  async function guardBudget(route: string): Promise<void> {
    const month = monthOf(clock.now());
    let usage;
    let budget;
    try {
      [usage, budget] = await Promise.all([store.getMonthUsage(month), store.getBudget(month)]);
    } catch {
      // Cannot verify spend: fail closed.
      log.error({ route, month }, "soldgraph budget check failed, refusing call");
      throw new BudgetExceededError(month, null, null);
    }
    const effective = budget ?? options.defaultBudget ?? defaultSoldgraphBudget();
    const cost = soldgraphCreditsForCall("search");
    const used = usage.credits;
    const limit = effective.limitCredits;
    if (effective.hardStop && used + cost > limit) {
      log.warn({ route, month, used, limit }, "soldgraph budget cap reached, refusing call");
      throw new BudgetExceededError(month, used, limit);
    }
    if (limit > 0 && used + cost >= limit * warnAt) {
      log.warn({ route, month, used, limit }, "soldgraph usage at or above budget warning threshold");
    }
  }

  interface PageResult {
    rows: unknown[];
    next: { cursor?: string; page?: string } | null;
    requestId: string | null;
  }

  async function runPage(
    route: string,
    query: URLSearchParams,
    key: string,
    opts: { pinId?: string; deadlineAt: number; maxAttempts: number },
  ): Promise<PageResult> {
    await guardBudget(route);

    const idempotencyKey = uuid();
    const ctx: Ctx = {
      deadlineAt: opts.deadlineAt,
      maxAttempts: opts.maxAttempts,
      requestId: null,
      accepted: false,
    };
    let status: SoldgraphUsageStatus = "error";
    try {
      const qs = query.toString();
      let res = await http(`${baseUrl}/${route}${qs ? `?${qs}` : ""}`, ctx, key, {
        idempotencyKey,
        timeoutMs: requestTimeoutMs,
      });
      ctx.accepted = true;
      let body = res.body;
      let pollUrl: string | null = null;

      for (;;) {
        if (body.status === "complete") {
          status = "complete";
          const result = isObj(body.result) ? body.result : {};
          const rows = Array.isArray(result.data) ? result.data : [];
          const next: PageResult["next"] =
            result.next_cursor != null && result.next_cursor !== ""
              ? { cursor: String(result.next_cursor) }
              : result.next_page != null && result.next_page !== ""
                ? { page: String(result.next_page) }
                : null;
          return { rows, next, requestId: ctx.requestId };
        }
        if (body.status === "failed") {
          throw failedJob(body, ctx, clock.now());
        }
        if (body.status !== "pending") {
          throw new SoldgraphHttpError(res.status, "invalid_response", ctx.requestId);
        }

        if (typeof body.poll_url === "string") pollUrl = resolvePollUrl(body.poll_url);
        if (!pollUrl) throw new SoldgraphHttpError(res.status, "invalid_response", ctx.requestId);

        const left = ctx.deadlineAt - clock.now();
        if (left <= 0) throw new SoldgraphTimeoutError();
        const wait = Math.max(1, Math.min(pollWaitSeconds, Math.floor(left / 1000)));
        const u = new URL(pollUrl);
        u.searchParams.set("wait", String(wait));
        const startedAt = clock.now();
        res = await http(u.toString(), ctx, key, { timeoutMs: wait * 1000 + 10_000 });
        body = res.body;
        if (body.status === "pending" && clock.now() - startedAt < pollIntervalMs) {
          await clock.sleep(pollIntervalMs);
        }
      }
    } catch (err) {
      if (err instanceof SoldgraphTimeoutError) status = "timeout";
      else if (err instanceof ProviderUnavailableError) status = "unavailable";
      else if (err instanceof SoldgraphHttpError && ctx.accepted) status = "failed";
      else status = "error";
      throw err;
    } finally {
      try {
        await store.recordUsage({
          provider: "soldgraph",
          route,
          requestId: ctx.requestId,
          idempotencyKey,
          status,
          credits: ctx.accepted ? soldgraphCreditsForCall("search") : 0,
          ...(opts.pinId ? { pinId: opts.pinId } : {}),
          occurredAt: new Date(clock.now()).toISOString(),
        });
      } catch {
        log.error({ route, status }, "soldgraph usage record failed");
      }
    }
  }

  return {
    async search<T = unknown>(
      route: string,
      params: SoldgraphParams = {},
      opts: SoldgraphSearchOptions = {},
    ): Promise<SoldgraphSearchResult<T>> {
      // Kill switch first: nothing else runs, and no network call is made.
      const enabled = options.enabled ?? process.env.SOLDGRAPH_ENABLED === "true";
      if (!enabled) throw new ProviderDisabledError("disabled");
      const key = options.apiKey ?? process.env.SOLDGRAPH_API_KEY ?? "";
      if (!key) throw new ProviderDisabledError("not_configured");

      const cleanRoute = route.replace(/^\/+/, "");
      if (!ROUTE_RE.test(route) || cleanRoute.includes("..")) {
        throw new SoldgraphHttpError(0, "invalid_route", null);
      }

      const deadlineAt = clock.now() + (opts.deadlineMs ?? defaultDeadlineMs);
      const maxPages = Math.max(1, opts.maxPages ?? defaultPageCap);
      const maxAttempts = Math.max(1, opts.maxAttempts ?? defaultMaxAttempts);

      const base = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) base.set(k, String(v));
      }

      const rows: T[] = [];
      const requestIds: string[] = [];
      let pages = 0;
      let truncated = false;
      let query = base;
      for (;;) {
        const page = await runPage(cleanRoute, query, key, { pinId: opts.pinId, deadlineAt, maxAttempts });
        pages += 1;
        rows.push(...(page.rows as T[]));
        if (page.requestId) requestIds.push(page.requestId);
        if (!page.next) break;
        if (pages >= maxPages) {
          truncated = true;
          break;
        }
        query = new URLSearchParams(base);
        if (page.next.cursor !== undefined) query.set("cursor", page.next.cursor);
        else if (page.next.page !== undefined) query.set("page", page.next.page);
      }
      log.info({ route: cleanRoute, pages, rows: rows.length, truncated }, "soldgraph search complete");
      return { rows, pages, truncated, requestIds };
    },
  };
}
