// ─── External identifier map ─────────────────────────────────────────────────
// Stores IDs from any external system without a fixed schema.
// New providers can be added here without a DB migration.
export interface ExternalIdentifiers {
  /** PinPics.com catalogue number */
  pinpicsId?: string;
  /** Retailer or manufacturer SKU */
  sku?: string;
  /** eBay item or reference ID */
  ebayItemId?: string;
  /** BoxLunch product code */
  boxlunchSku?: string;
  /** Loungefly product code */
  loungeflySku?: string;
  /** shopDisney / Disney store product code */
  disneySku?: string;
  /** WDI (Walt Disney Imagineering) catalogue number */
  wdiNumber?: string;
  /** DSSH (DisneyShopping.com) legacy ID */
  dsshId?: string;
  // Any future provider can be added without schema changes:
  [key: string]: string | undefined;
}

// ─── Core catalogue type ──────────────────────────────────────────────────────
export type CataloguePinStatus = 'active' | 'pending_review' | 'rejected';

/**
 * A pin in the PinHunt catalogue.
 *
 * Catalogue data (all fields here) is owned by the PinHunt import pipeline
 * and can be refreshed from external sources at any time.
 *
 * User data (collection status, personal photos, notes, trade history) lives
 * in separate tables and is NEVER touched by catalogue imports.
 */
export interface CataloguePin {
  /** Stable internal PinHunt ID — never changes, never reused. */
  id: string;

  title: string;
  brand: string;
  /** Series / collection name (e.g. "Haunted Mansion 50th", "Tropical Vibes"). */
  collection: string;
  characters: string[];

  releaseDate?: string;       // ISO date string
  retailPriceGBP?: number;
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;
  origin?: string;            // "Walt Disney World", "Disneyland Paris", "BoxLunch Retail" …
  edition?: string;           // "Open Edition", "LE 2500", "WDI", "Artist Series" …

  /** Primary catalogue image URL (CDN / object storage). */
  imageUrl?: string;

  /**
   * IDs from external catalogue providers, retailers, or licensed data sources.
   * Import pipelines populate this; screens read it for deep-linking.
   */
  externalIdentifiers: ExternalIdentifiers;

  status: CataloguePinStatus;
  isUserSubmitted: boolean;
  submittedBy?: string;       // user identifier, if submitted via the app

  /**
   * Which pipeline last wrote this record.
   * e.g. 'pinhunt_seed' | 'pinpics_import' | 'user_submission'
   */
  catalogueSource?: string;

  createdAt?: string;
  updatedAt?: string;
  /** Timestamp of the last external-data sync for this record. */
  catalogueUpdatedAt?: string;
}

// ─── Query types ──────────────────────────────────────────────────────────────
export interface PinFilters {
  brand?: string | string[];
  character?: string;
  collection?: string;
  edition?: string;
  isNewRelease?: boolean;
  status?: CataloguePinStatus;
  limit?: number;
  offset?: number;
}

// ─── Scan matching ────────────────────────────────────────────────────────────
export interface PinMatch {
  pin: CataloguePin;
  confidence: number;   // 0–100
  reasoning?: string;
}

/**
 * Adapter that injects AI vision logic into the repository at construction time.
 * Keeps the repository package free of hard AI-SDK dependencies so the same
 * code runs in both the Expo app (no AI) and the API server (with AI).
 */
export interface AiMatchAdapter {
  identifyFromCatalogue(
    imageBase64: string,
    mimeType: string,
    catalogue: CataloguePin[],
  ): Promise<Array<{ pinId: string; confidence: number; reasoning: string }>>;
}

// ─── Write input types ────────────────────────────────────────────────────────
export interface CreatePinInput {
  /** Provide a stable ID to enable idempotent imports; omit to auto-generate. */
  id?: string;
  title: string;
  brand: string;
  collection: string;
  characters?: string[];
  releaseDate?: string;
  retailPriceGBP?: number;
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;
  origin?: string;
  edition?: string;
  imageUrl?: string;
  externalIdentifiers?: ExternalIdentifiers;
  catalogueSource?: string;
}

export interface UpdatePinInput {
  title?: string;
  brand?: string;
  collection?: string;
  characters?: string[];
  releaseDate?: string;
  retailPriceGBP?: number;
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;
  origin?: string;
  edition?: string;
  imageUrl?: string;
  externalIdentifiers?: ExternalIdentifiers;
  status?: CataloguePinStatus;
  catalogueSource?: string;
  catalogueUpdatedAt?: string;
}

export interface SubmitMissingPinInput {
  title: string;
  brand: string;
  collection: string;
  characters?: string[];
  edition?: string;
  origin?: string;
  description?: string;
  imageUrl?: string;
  /** App-level user identifier (not a Supabase auth UID — auth is future work). */
  submittedBy?: string;
  externalIdentifiers?: ExternalIdentifiers;
}
