import type {
  CataloguePin,
  CreatePinInput,
  PinFilters,
  PinMatch,
  SubmitMissingPinInput,
  UpdatePinInput,
} from './types';

/**
 * PinRepository — the single point of access for all pin catalogue data.
 *
 * Screens and services MUST use this interface; no component may query
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
   * Pass an empty string to list all pins (subject to filters).
   */
  searchPins(query: string, filters?: PinFilters): Promise<CataloguePin[]>;

  /** Fetch a single pin by its stable internal PinHunt ID. */
  getPinById(id: string): Promise<CataloguePin | null>;

  /** All active pins belonging to a named series / collection. */
  getPinsBySeries(series: string): Promise<CataloguePin[]>;

  /**
   * All active pins featuring a character.
   * Uses case-insensitive substring matching so "Mickey" matches "Mickey Mouse".
   */
  getPinsByCharacter(character: string): Promise<CataloguePin[]>;

  // ── Catalogue writes ─────────────────────────────────────────────────────
  // (Intended for admin tooling and import pipelines, not end-user screens.)

  /**
   * Insert a new pin into the catalogue.
   * Provide `id` for idempotent imports (upsert-by-id behaviour).
   */
  createPin(input: CreatePinInput): Promise<CataloguePin>;

  /**
   * Update catalogue fields on an existing pin.
   * NEVER touches user collection records, photos, notes or trade history —
   * those live in separate tables and are not addressable from this method.
   */
  updatePin(id: string, input: UpdatePinInput): Promise<CataloguePin>;

  // ── Community contribution ───────────────────────────────────────────────

  /**
   * Record a user-submitted "this pin is missing from the catalogue" report.
   * The pin is inserted with status='pending_review' and isUserSubmitted=true.
   * A moderator must approve it before it becomes visible to other users.
   */
  submitMissingPin(input: SubmitMissingPinInput): Promise<CataloguePin>;

  // ── Scan matching ────────────────────────────────────────────────────────

  /**
   * Vision-based scan matching against the live catalogue.
   *
   * Requires an AiMatchAdapter to be provided at construction time.
   * Throws PinRepositoryError('AI_ADAPTER_REQUIRED') if none was given —
   * in that case the caller should route through the scan API endpoint instead.
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
