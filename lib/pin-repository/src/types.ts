// ─── Verification / data-quality status ──────────────────────────────────────
export type PinVerificationStatus =
  | 'verified'
  | 'needs_source_verification'
  | 'community_submitted'
  | 'unverified';

// ─── Operational lifecycle status ─────────────────────────────────────────────
export type CataloguePinStatus = 'active' | 'pending_review' | 'archived';

// ─── External identifier map ─────────────────────────────────────────────────
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
export interface CataloguePin {
  id: string;
  title: string;
  brand: string;
  collection: string;
  characters: string[];
  categories: string[];
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
  externalIdentifiers: ExternalIdentifiers;
  verificationStatus?: PinVerificationStatus;
  status: CataloguePinStatus;
  isUserSubmitted: boolean;
  submittedBy?: string;
  catalogueSource?: string;
  manufacturer?: string;
  retailer?: string;
  sourceUrl?: string;
  confidenceLevel?: string;
  isSeedRecord?: boolean;
  needsReview?: boolean;
  needsFrontImage?: boolean;
  needsBackImage?: boolean;
  importBatchId?: string;
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
  confidence: number;
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
  /** Catalogue lifecycle status. Defaults to 'active' when omitted. */
  status?: CataloguePinStatus;
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
  id: string;
  userId: string;
  pinId: string;
  pinhuntId: string;
  pin?: CataloguePin;
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
  pinId: string;
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
  id: string;
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
  // ── Local discovery (migration 007) ──────────────────────────────────────
  /** User's town or city (display only, not precise). */
  town?: string;
  /** User's county or region. */
  county?: string;
  /** User's country. */
  country?: string;
  /**
   * True when the user has set approximate coordinates.
   * Derived server-side — approx_lat/lng are NEVER exposed to the client.
   */
  hasLocationSet: boolean;
  /**
   * The last UK postcode the collector used for geocoding.
   * Stored for UX pre-fill only — never used for precise location.
   */
  postcode?: string;
  nearbyDiscoveryEnabled: boolean;
  preferredRadiusMiles: number;
  openToLocalTrades: boolean;
  openToPostalTrades: boolean;
  happyToTravel: boolean;
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
  // ── Local discovery fields (migration 007) ──
  town?: string;
  county?: string;
  country?: string;
  /** Update the stored postcode (used for geocoding pre-fill). */
  postcode?: string;
  nearbyDiscoveryEnabled?: boolean;
  preferredRadiusMiles?: number;
  openToLocalTrades?: boolean;
  openToPostalTrades?: boolean;
  happyToTravel?: boolean;
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
  /** Display-safe location string e.g. "Watford, Hertfordshire". */
  town?: string;
  county?: string;
  openToLocalTrades: boolean;
  openToPostalTrades: boolean;
  happyToTravel: boolean;
}

export interface SearchCollectorsInput {
  /** Searches username and display_name (case-insensitive partial match). */
  query?: string;
  tradingRegion?: string;
  limit?: number;
  offset?: number;
}

// ─── Nearby collectors ────────────────────────────────────────────────────────

/**
 * A collector returned by the get_collectors_nearby RPC.
 * Coordinates are NEVER included — only a privacy-safe distance band.
 */
export interface NearbyCollector {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  /** Display area e.g. "Watford" — entered by the user, not derived from coords. */
  town?: string;
  county?: string;
  /** Privacy-safe label e.g. "Within 10 miles". */
  distanceBand: string;
  /**
   * Numeric sort key for "Nearest" sort (1–5 mapping to the band thresholds).
   * Used ONLY for sorting — never displayed.
   */
  distanceSortKey: number;
  openToLocalTrades: boolean;
  openToPostalTrades: boolean;
  happyToTravel: boolean;
  forTradeCount: number;
  wantedCount: number;
  pinsTheyHaveIWant: number;
  pinsIHaveTheyWant: number;
  matchScore: number;
  lastActiveAt?: string;
  positiveRatings: number;
  totalRatings: number;
}

export interface GetNearbyCollectorsInput {
  viewerId: string;
  /**
   * Search radius in miles. Defaults to the viewer's preferred_radius_miles.
   * The viewer's own coordinates are read server-side; no lat/lng is passed
   * from the client.
   */
  radiusMiles: number;
}

// ─── Potential trades ─────────────────────────────────────────────────────────

/** A single pin in a potential trade match. */
export interface PotentialTradePin {
  /** 'they_have_i_want' | 'i_have_they_want' */
  direction: 'they_have_i_want' | 'i_have_they_want';
  pinId: string;
  pinhuntId: string;
  title: string;
  imageUrl?: string;
}

export interface GetPotentialTradesInput {
  viewerId: string;
  collectorId: string;
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

// ─── Trade rating types ───────────────────────────────────────────────────────

export interface TraderProfile extends PublicProfile {
  positiveRatings: number;
  totalRatings: number;
}

export interface TradeRating {
  id: string;
  tradeId?: string;
  raterId: string;
  rateeId: string;
  isPositive: boolean;
  comment?: string;
  createdAt: string;
}

export interface CreateTradeRatingInput {
  tradeId?: string;
  rateeId: string;
  isPositive: boolean;
  comment?: string;
}

export interface TraderRatingSummary {
  positive: number;
  total: number;
}

// ─── External marketplace listing types ──────────────────────────────────────
export type ExternalSaleListingPlatform = 'vinted' | 'ebay' | 'other';
export type ExternalSaleListingStatus = 'draft' | 'active' | 'sold' | 'expired' | 'removed';

export interface ExternalSaleListing {
  id: string;
  sellerId: string;
  pinId: string;
  platform: ExternalSaleListingPlatform;
  listingUrl: string;
  askingPrice?: number;
  currency?: string;
  status: ExternalSaleListingStatus;
  sellerUsername?: string;
  sellerDisplayName?: string;
  pinTitle?: string;
  pinPinhuntId?: string;
  pinImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalSaleListingInput {
  pinPinhuntId: string;
  platform: ExternalSaleListingPlatform;
  listingUrl: string;
  askingPrice?: number;
  currency?: string;
  status?: ExternalSaleListingStatus;
}

export interface UpdateExternalSaleListingInput {
  listingUrl?: string;
  askingPrice?: number | null;
  currency?: string | null;
  status?: ExternalSaleListingStatus;
}

// ─── Pin submission types ─────────────────────────────────────────────────────

export type EditionType =
  | 'open_edition'
  | 'limited_edition'
  | 'limited_release'
  | 'mystery'
  | 'hidden_disney'
  | 'unknown';

export type PinSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_changes';

export interface PinSubmission {
  id: string;
  submittedBy: string;
  proposedName: string;
  brand: string;
  seriesName?: string;
  releaseLocation?: string;
  releaseYear?: number;
  editionType: EditionType;
  editionSize?: number;
  facNumber?: string;
  sku?: string;
  characterNames?: string[];
  frontImagePath: string;
  backImagePath?: string;
  notes?: string;
  status: PinSubmissionStatus;
  reviewerNotes?: string;
  approvedPinId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePinSubmissionInput {
  proposedName: string;
  brand: string;
  seriesName?: string;
  releaseLocation?: string;
  releaseYear?: number;
  editionType?: EditionType;
  editionSize?: number;
  facNumber?: string;
  sku?: string;
  characterNames?: string[];
  frontImageUri: string;
  backImageUri?: string;
  notes?: string;
  status?: PinSubmissionStatus;
}

// ─── Community post types ──────────────────────────────────────────────────────

export type CommunityPostType =
  | 'in_search_of'
  | 'for_trade'
  | 'for_sale'
  | 'new_pickup'
  | 'discussion';

export interface CommunityPost {
  id: string;
  authorId: string;
  postType: CommunityPostType;
  body: string;
  /** Storage paths or external URLs */
  photos: string[];
  linkedPinId?: string;
  /** Joined author profile when fetched with profile data. */
  authorProfile?: PublicProfile;
  /** Joined catalogue pin when fetched with pin data. */
  linkedPin?: Pick<CataloguePin, 'id' | 'title' | 'brand' | 'imageUrl'>;
  commentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommunityPostInput {
  postType: CommunityPostType;
  body: string;
  photos?: string[];
  linkedPinId?: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  authorProfile?: PublicProfile;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participantAId: string;
  participantBId: string;
  contextPostId?: string;
  contextPinId?: string;
  lastMessageAt?: string;
  createdAt: string;
  /** Joined profile of the other participant (relative to current user). */
  otherParticipant?: PublicProfile;
  lastMessage?: ConversationMessage;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface StartConversationInput {
  recipientId: string;
  contextPostId?: string;
  contextPinId?: string;
  /** Opening message body (sent immediately after creating the conversation). */
  openingMessage: string;
}

// ─── Admin review types ───────────────────────────────────────────────────────

export interface AdminReviewInput {
  /** New status set by the admin. */
  status: 'approved' | 'rejected' | 'needs_changes' | 'under_review';
  /** Optional note shown to the submitter. Required for rejected/needs_changes. */
  reviewerNotes?: string;
  /**
   * When approving via "Approve & Add to Catalogue", pass the pinhunt_id
   * (e.g. "PHUK-00000001") of the newly created catalogue pin. The repository
   * resolves it to the internal UUID and writes it to approved_pin_id.
   */
  approvedPinhuntId?: string;
}

export interface GetAllSubmissionsInput {
  /** Filter to one or more statuses. Omit to return all statuses. */
  statuses?: PinSubmissionStatus[];
  limit?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UpdatePinSubmissionInput {
  proposedName?: string;
  brand?: string;
  seriesName?: string | null;
  releaseLocation?: string | null;
  releaseYear?: number | null;
  editionType?: EditionType;
  editionSize?: number | null;
  facNumber?: string | null;
  sku?: string | null;
  characterNames?: string[] | null;
  notes?: string | null;
}
