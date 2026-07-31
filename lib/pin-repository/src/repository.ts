import type {
  PinSetSummary,
  CataloguePin,
  CreatePinInput,
  MissingImageCounts,
  PinFilters,
  PinMatch,
  SubmitMissingPinInput,
  UpdatePinInput,
} from './types';

/**
 * PinRepository — the single point of access for catalogue data.
 *
 * All screens and services MUST use this interface; no component may query
 * Supabase (or any other data source) directly.
 *
 * Implementations:
 *  - SupabasePinRepository   current implementation
 *  - (future) CachedPinRepository   wraps any impl with in-memory cache
 *  - (future) RemoteCataloguePinRepository   licensed external API
 */
export interface PinRepository {
  // ── Catalogue queries ────────────────────────────────────────────────────

  /**
   * Full-text search across title, brand, collection and characters.
   * Pass an empty string to list all accessible pins (subject to RLS + filters).
   */
  searchPins(query: string, filters?: PinFilters): Promise<CataloguePin[]>;

  /**
   * Fetch a single pin by its stable pinhunt_id (e.g. "PHUK-00000001").
   * Returns null if not found or not accessible via RLS.
   */
  getPinById(pinhuntId: string): Promise<CataloguePin | null>;

  /** Alias for getPinById — always queries by pinhunt_id. */
  getPinByPinhuntId(pinhuntId: string): Promise<CataloguePin | null>;

  /** All accessible pins belonging to a named series / collection. */
  getPinsBySeries(series: string): Promise<CataloguePin[]>;

  /**
   * Validated set summaries from the trusted catalogue (pin_sets table).
   * Used to show expected totals for ongoing sets, e.g. "7 of 12 released".
   * Returns [] when the table is empty or unavailable.
   */
  getSetSummaries(): Promise<PinSetSummary[]>;

  /** Fetch multiple pins by their PinHunt IDs (order not guaranteed). */
  getPinsByIds(pinhuntIds: string[]): Promise<CataloguePin[]>;

  /**
   * All accessible pins featuring a character (case-insensitive substring match).
   * e.g. "Mickey" matches "Mickey Mouse".
   */
  getPinsByCharacter(character: string): Promise<CataloguePin[]>;

  /**
   * All accessible pins in a given category (case-insensitive substring match).
   * e.g. "Hidden" matches "Hidden Disney", "Hidden Mickey".
   */
  getPinsByCategory(category: string): Promise<CataloguePin[]>;

  /**
   * Distinct values of a text column (brand or collection) for autocomplete.
   * Optional case-insensitive substring `search` narrows the results.
   * Returned values are sorted alphabetically and capped at `limit` (default 25).
   */
  getDistinctFieldValues(
    field: 'brand' | 'collection',
    search?: string,
    limit?: number,
  ): Promise<string[]>;

  /**
   * Exact counts of pins still missing images, for backfill progress tracking.
   * Uses head-count queries so it stays cheap even with tens of thousands of pins.
   */
  countMissingImages(): Promise<MissingImageCounts>;

  // ── Catalogue writes ─────────────────────────────────────────────────────
  // Intended for admin tooling and import pipelines, not end-user screens.
  // Requires service-role key or admin privileges.

  /**
   * Insert or update a pin in the catalogue.
   * Idempotent: upserts by pinhunt_id.
   * Also manages junction rows for characters and categories.
   */
  createPin(input: CreatePinInput): Promise<CataloguePin>;

  /**
   * Update catalogue fields on an existing pin (by pinhunt_id).
   * NEVER touches user collection records, photos, notes or trade history.
   */
  updatePin(pinhuntId: string, input: UpdatePinInput): Promise<CataloguePin>;

  /**
   * Permanently delete a pin from the catalogue (by pinhunt_id).
   * Also removes the pin's front/back images from the `pin-catalogue`
   * storage bucket (best-effort: storage failures are logged, not thrown).
   * Throws PinRepositoryError('NOT_FOUND') if the pin does not exist.
   */
  deletePin(pinhuntId: string): Promise<void>;

  // ── Community contribution ───────────────────────────────────────────────

  /**
   * Record a user-submitted "missing pin" report.
   * Inserts with status='pending_review' and isUserSubmitted=true.
   * A moderator must approve before it becomes publicly visible.
   */
  submitMissingPin(input: SubmitMissingPinInput): Promise<CataloguePin>;

  // ── Scan matching ────────────────────────────────────────────────────────

  /**
   * Vision-based scan matching against the live catalogue.
   * Requires an AiMatchAdapter at construction time.
   * Throws PinRepositoryError('AI_ADAPTER_REQUIRED') otherwise —
   * mobile callers should route through POST /api/scan/identify instead.
   */
  findPossibleMatches(imageBase64: string, mimeType?: string): Promise<PinMatch[]>;
}

// ─── Error type ───────────────────────────────────────────────────────────────
export type PinRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'AI_ADAPTER_REQUIRED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_INPUT';

export class PinRepositoryError extends Error {
  constructor(
    public readonly code: PinRepositoryErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PinRepositoryError';
  }
}
