// Types for pinandpop.mjs, so src/routes/pinandpop-sync.ts can share the sync.
import type { SupabaseClient } from "@supabase/supabase-js";

export declare const PINANDPOP_SOURCE: "pin_and_pop";
export declare const PINANDPOP_ATTRIBUTION: string;
export declare const PINANDPOP_API_BASE: string;
export declare function pinhuntIdFor(ppId: number | string): string;
export declare function ppIdFromPinhuntId(pinhuntId: string | null | undefined): number | null;

export interface PinAndPopPage { items: Record<string, unknown>[]; hasMore: boolean }
export interface PinAndPopClient {
  getJson(pathAndQuery: string): Promise<any>;
  pages(opts?: { idAfter?: number | null; perPage?: number; maxPages?: number }): AsyncGenerator<PinAndPopPage>;
  getPin(id: number): Promise<any>;
  readonly requestCount: number;
}
export declare class PinAndPopApiError extends Error {
  constructor(message: string, status: number);
  status: number;
}
export declare function createPinAndPopClient(opts: {
  token: string | undefined;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  baseUrl?: string;
  timeoutMs?: number;
}): PinAndPopClient;

export declare function highestStoredPinAndPopId(supabase: SupabaseClient): Promise<number | null>;
export declare function ensurePinAndPopSource(supabase: SupabaseClient): Promise<void>;
export interface PinAndPopSyncStats {
  startedAfterId: number | null;
  fetched: number;
  written: number;
  skipped: { id: unknown; problem: string }[];
  highestId: number | null;
  complete: boolean;
  requests: number;
}
export declare function syncNewPins(args: {
  supabase: SupabaseClient;
  client: PinAndPopClient;
  maxPages?: number;
  log?: (msg: string) => void;
}): Promise<PinAndPopSyncStats>;
