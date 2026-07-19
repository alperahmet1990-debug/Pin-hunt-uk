// ─── Verification / data-quality status ──────────────────────────────────────
export type PinVerificationStatus =
  | 'verified'
  | 'needs_source_verification'
  | 'community_submitted'
  | 'unverified';

// ─── Operational lifecycle status ─────────────────────────────────────────────
export type CataloguePinStatus = 'active' | 'pending_review' | 'archived';

// ─── External identifier map ─────────────────────────────────────────────────
// Stores IDs from any external system without a fixed schema.
// Structured rows live in the pin_external_ids table for indexed lookups.
export interface ExternalIdentifiers {
  pinpicsId?: string;
  sku?: string;
  ebayItemId?: string;
  boxlunchSku?: string;
  loungeflySku?: string;
  disneySku?: string;
  wdiNumber?: string;
  dsshId?: string;
  [key: string]: string | undefined;
}

// ─── Core catalogue type ──────────────────────────────────────────────────────
/**
 * A pin in the PinHunt catalogue.
 *
 * `id` = the stable pinhunt_id (e.g. "PHUK-00000001") — used throughout
 * the app for routing, AsyncStorage keys, and display. The database UUID
 * primary key is an internal repository detail and is never exposed here.
 *
 * Catalogue data is owned by the PinHunt import pipeline and can be refreshed
 * from external sources at any time. User data (collection status, photos,
 * notes, trade history) lives in separate tables and is never touched by
 * catalogue imports.
 */
export interface CataloguePin {
  /** Stable public identifier — the pinhunt_id (e.g. "PHUK-00000001"). */
  id: string;

  title: string;
  brand: string;
  /** Series / range name (e.g. "Hidden Mickey 2026 Wave A"). */
  collection: string;

  /** Characters featured on this pin (populated from pin_characters join). */
  characters: string[];
  /** Categories / tags (populated from pin_categories join). */
  categories: string[];

  releaseDate?: string;      // ISO date string
  releaseYear?: number;
  retailPriceGBP?: number;   // retail_price in DB (currency stored separately)
  currency?: string;          // 'GBP' | 'USD' | 'EUR' — currency of retail_price
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;

  /** Venue / retailer (e.g. "Walt Disney World", "Disneyland Paris"). */
  origin?: string;
  /** Edition type (e.g. "Common", "Chaser", "Super Chaser", "LE 500"). */
  edition?: string;

  /** Primary catalogue image URL. */
  imageUrl?: string;
  /** Back face image URL. */
  backImageUrl?: string;

  /**
   * IDs from external catalogue providers, retailers, or licensed data sources.
   * Import pipelines populate this; screens read it for deep-linking.
   */
  externalIdentifiers: ExternalIdentifiers;

  /**
   * Data-quality / verification status.
   * Public reads via the anon key only return 'verified' pins (enforced by RLS).
   */
  verificationStatus?: PinVerificationStatus;

  /** Operational lifecycle status. */
  status: CataloguePinStatus;

  isUserSubmitted: boolean;
  submittedBy?: string;

  /** Which pipeline last wrote this record. */
  catalogueSource?: string;

  createdAt?: string;
  updatedAt?: string;
  catalogueUpdatedAt?: string;
}

// ─── Query types ──────────────────────────────────────────────────────────────
export interface PinFilters {
  brand?: string | string[];
  character?: string;
  category?: string;
  collection?: string;
  edition?: string;
  isNewRelease?: boolean;
  status?: CataloguePinStatus;
  verificationStatus?: PinVerificationStatus;
  limit?: number;
  offset?: number;
}

// ─── Scan matching ────────────────────────────────────────────────────────────
export interface PinMatch {
  pin: CataloguePin;
  confidence: number;  // 0–100
  reasoning?: string;
}

export interface AiMatchAdapter {
  identifyFromCatalogue(
    imageBase64: string,
    mimeType: string,
    catalogue: CataloguePin[],
  ): Promise<Array<{ pinId: string; confidence: number; reasoning: string }>>;
}

// ─── Catalogue write inputs ───────────────────────────────────────────────────
export interface CreatePinInput {
  /** Provide the stable pinhunt_id to enable idempotent imports. */
  pinhuntId: string;
  title: string;
  brand: string;
  collection: string;
  characters?: string[];
  categories?: string[];
  releaseDate?: string;
  releaseYear?: number;
  retailPriceGBP?: number;
  currency?: string;
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;
  origin?: string;
  edition?: string;
  imageUrl?: string;
  backImageUrl?: string;
  externalIdentifiers?: ExternalIdentifiers;
  verificationStatus?: PinVerificationStatus;
  catalogueSource?: string;
}

export interface UpdatePinInput {
  title?: string;
  brand?: string;
  collection?: string;
  characters?: string[];
  categories?: string[];
  releaseDate?: string;
  releaseYear?: number;
  retailPriceGBP?: number;
  currency?: string;
  limitedEditionSize?: number;
  estimatedValueGBP?: number;
  description?: string;
  isNewRelease?: boolean;
  origin?: string;
  edition?: string;
  imageUrl?: string;
  backImageUrl?: string;
  externalIdentifiers?: ExternalIdentifiers;
  verificationStatus?: PinVerificationStatus;
  status?: CataloguePinStatus;
  catalogueSource?: string;
  catalogueUpdatedAt?: string;
}

export interface SubmitMissingPinInput {
  title: string;
  brand: string;
  collection: string;
  characters?: string[];
  categories?: string[];
  edition?: string;
  origin?: string;
  description?: string;
  imageUrl?: string;
  submittedBy?: string;
  externalIdentifiers?: ExternalIdentifiers;
}

// ─── User collection types ────────────────────────────────────────────────────
export type UserPinStatus = 'owned' | 'wanted' | 'for_trade' | 'traded';
export type PinCondition = 'mint' | 'near_mint' | 'good' | 'fair' | 'poor';

export interface UserPin {
  id: string;               // UUID
  userId: string;           // auth.users UUID
  pinId: string;            // pins.id UUID (internal FK)
  pinhuntId: string;        // pins.pinhunt_id (stable public identifier)
  pin?: CataloguePin;       // joined catalogue data when fetched with pin detail
  status: UserPinStatus;
  acquiredDate?: string;
  purchasePriceGBP?: number;
  currentValueGBP?: number;
  notes?: string;
  condition?: PinCondition;
  isFavourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddUserPinInput {
  pinId: string;            // pins.id UUID or pinhunt_id — repository resolves
  status: UserPinStatus;
  acquiredDate?: string;
  purchasePriceGBP?: number;
  notes?: string;
  condition?: PinCondition;
  isFavourite?: boolean;
}

export interface UpdateUserPinInput {
  status?: UserPinStatus;
  acquiredDate?: string;
  purchasePriceGBP?: number;
  currentValueGBP?: number;
  notes?: string;
  condition?: PinCondition;
  isFavourite?: boolean;
}

// ─── Profile types ────────────────────────────────────────────────────────────
export type ProfileVisibility = 'public' | 'private';

export interface Profile {
  id: string;               // auth.users UUID
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  tradingRegion?: string;
  internationalTradingEnabled: boolean;
  allowTradeRequests: boolean;
  allowMessages: boolean;
  profileVisibility: ProfileVisibility;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  tradingRegion?: string;
  internationalTradingEnabled?: boolean;
  allowTradeRequests?: boolean;
  allowMessages?: boolean;
  profileVisibility?: ProfileVisibility;
}

/** Safe public subset — returned by getPublicProfile and searchCollectors. */
export interface PublicProfile {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  tradingRegion?: string;
  internationalTradingEnabled: boolean;
}

export interface SearchCollectorsInput {
  /** Searches username and display_name (case-insensitive partial match). */
  query?: string;
  tradingRegion?: string;
  limit?: number;
  offset?: number;
}

// ─── Trade types ──────────────────────────────────────────────────────────────
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export interface Trade {
  id: string;
  initiatorId: string;
  recipientId: string;
  status: TradeStatus;
  notes?: string;
  items?: TradeItem[];
  messages?: TradeMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TradeItem {
  id: string;
  tradeId: string;
  userPinId: string;
  direction: 'offered' | 'requested';
  createdAt: string;
}

export interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  message: string;
  createdAt: string;
}

// ─── External marketplace listing types ──────────────────────────────────────
export type ExternalSaleListingPlatform = 'vinted' | 'ebay' | 'other';
export type ExternalSaleListingStatus = 'draft' | 'active' | 'sold' | 'expired' | 'removed';

export interface ExternalSaleListing {
  id: string;
  sellerId: string;
  /** Internal UUID of the pin (pins.id). */
  pinId: string;
  platform: ExternalSaleListingPlatform;
  listingUrl: string;
  askingPrice?: number;
  currency?: string;
  status: ExternalSaleListingStatus;
  // Optional joined fields — populated depending on the query used.
  sellerUsername?: string;
  sellerDisplayName?: string;
  pinTitle?: string;
  pinPinhuntId?: string;
  pinImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalSaleListingInput {
  /**
   * The pin's pinhunt_id (e.g. "PHUK-00000001").
   * The repository resolves this to the internal UUID.
   */
  pinPinhuntId: string;
  platform: ExternalSaleListingPlatform;
  listingUrl: string;
  askingPrice?: number;
  currency?: string;
  /** Defaults to 'active'. Use 'draft' to save without publishing. */
  status?: ExternalSaleListingStatus;
}

export interface UpdateExternalSaleListingInput {
  listingUrl?: string;
  askingPrice?: number | null;
  currency?: string | null;
  status?: ExternalSaleListingStatus;
}

// ─── Submission types ─────────────────────────────────────────────────────────
export type SubmissionType = 'new_pin' | 'correction' | 'image';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface PinSubmission {
  id: string;
  submittedBy: string;
  pinId?: string;
  submissionType: SubmissionType;
  proposedData: Record<string, unknown>;
  notes?: string;
  status: SubmissionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
