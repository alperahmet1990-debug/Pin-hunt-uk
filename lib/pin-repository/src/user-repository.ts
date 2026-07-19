import type {
  AddUserPinInput,
  CreateExternalSaleListingInput,
  CreatePinSubmissionInput,
  EditionType,
  ExternalSaleListing,
  PinSubmission,
  PinSubmissionStatus,
  TraderProfile,
  TradeRating,
  TraderRatingSummary,
  CreateTradeRatingInput,
  Profile,
  PublicProfile,
  SearchCollectorsInput,
  Trade,
  TradeItem,
  TradeMessage,
  UpdateExternalSaleListingInput,
  UpdatePinSubmissionInput,
  UpdateProfileInput,
  UpdateUserPinInput,
  UserPin,
} from './types';

/**
 * IUserPinRepository — user collection and profile operations.
 *
 * All user data is strictly isolated from catalogue data.
 * Catalogue imports can never overwrite collection status, notes, or photos.
 *
 * Methods that mutate data require an authenticated Supabase session; the
 * underlying client enforces this via RLS — no server-side auth checks are
 * duplicated here.
 */
export interface IUserPinRepository {
  // ── Profile ──────────────────────────────────────────────────────────────

  /** Fetch a user's own profile (full data including private fields). */
  getProfile(userId: string): Promise<Profile | null>;

  /** Alias for getProfile — semantic clarity for "my own" profile. */
  getMyProfile(userId: string): Promise<Profile | null>;

  /**
   * Upsert the calling user's own profile.
   * Creates the row if it doesn't exist (handles pre-trigger accounts).
   * Cannot change is_admin.
   */
  updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile>;

  /** Alias for updateProfile. */
  updateMyProfile(userId: string, input: UpdateProfileInput): Promise<Profile>;

  /**
   * Fetch a public profile by username (case-insensitive).
   * Returns null if profile is private or username doesn't exist.
   */
  getPublicProfile(username: string): Promise<PublicProfile | null>;

  /**
   * Search public collector profiles by username, display name, or
   * trading region. Only public profiles with a username are returned.
   */
  searchCollectors(input: SearchCollectorsInput): Promise<PublicProfile[]>;

  /**
   * Check whether a username is available (case-insensitive).
   * Pass excludeUserId to allow the current user's own username through.
   */
  checkUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean>;

  // ── Collection ───────────────────────────────────────────────────────────

  /**
   * Return all collection entries for a user, sorted newest-first.
   * Includes joined catalogue data (pin title, brand, imageUrl, etc.).
   */
  getUserCollection(userId: string): Promise<UserPin[]>;

  /**
   * Add a pin to a user's collection.
   * `input.pinId` should be the pinhunt_id (e.g. "PHUK-00000001").
   * Throws CONFLICT if the user already has this pin in their collection.
   */
  addPinToCollection(userId: string, input: AddUserPinInput): Promise<UserPin>;

  /**
   * Update a collection entry (status, condition, notes, etc.).
   * `userPinId` is the user_pins.id UUID.
   */
  updateUserPin(userPinId: string, input: UpdateUserPinInput): Promise<UserPin>;

  /**
   * Remove a pin from a user's collection.
   * Fails if the pin is referenced in an active trade.
   */
  removeUserPin(userPinId: string): Promise<void>;

  // ── Trades ───────────────────────────────────────────────────────────────

  /** All trades where the user is initiator or recipient. */
  getUserTrades(userId: string): Promise<Trade[]>;

  /** Fetch a single trade with items and messages. */
  getTrade(tradeId: string): Promise<Trade | null>;

  /** Create a new trade request. */
  createTrade(initiatorId: string, recipientId: string, notes?: string): Promise<Trade>;

  /** Update trade status (accept, reject, complete, cancel). */
  updateTradeStatus(tradeId: string, status: Trade['status']): Promise<Trade>;

  /** Add an item (offered or requested pin) to a pending trade. */
  addTradeItem(tradeId: string, userPinId: string, direction: TradeItem['direction']): Promise<TradeItem>;

  /** Send a message in a trade thread. */
  sendTradeMessage(tradeId: string, senderId: string, message: string): Promise<TradeMessage>;

  // ── External marketplace listings ─────────────────────────────────────────

  /**
   * Create a new external marketplace listing.
   * `input.pinPinhuntId` is the pinhunt_id (e.g. "PHUK-00000001"); the
   * repository resolves it to the internal UUID.
   */
  createExternalSaleListing(sellerId: string, input: CreateExternalSaleListingInput): Promise<ExternalSaleListing>;

  /** Update an existing listing (URL, price, status). Only the owner may call this. */
  updateExternalSaleListing(listingId: string, input: UpdateExternalSaleListingInput): Promise<ExternalSaleListing>;

  /** Permanently delete a listing. Only the owner may call this. */
  removeExternalSaleListing(listingId: string): Promise<void>;

  /**
   * Return active listings for a pin visible to the public:
   * - status = 'active'
   * - seller has a public profile with a username
   * - pin is verified
   * `pinPinhuntId` is the pinhunt_id (e.g. "PHUK-00000001").
   * Includes joined seller username/display name for display.
   */
  getExternalListingsForPin(pinPinhuntId: string): Promise<ExternalSaleListing[]>;

  /**
   * Return all listings for a seller (all statuses).
   * Includes joined pin title/pinhunt_id/image for display.
   */
  getSellerExternalListings(sellerId: string): Promise<ExternalSaleListing[]>;

  /** Convenience: set a listing's status to 'sold'. */
  markExternalListingSold(listingId: string): Promise<ExternalSaleListing>;

  // ── Pin submissions (catalogue contributions) ─────────────────────────────

  /**
   * Create a new pin submission.
   * Uploads front (and optionally back) images to Supabase Storage,
   * then inserts the submission row. `userId` must equal `auth.uid()`.
   * Defaults status to 'draft'.
   */
  createPinSubmission(userId: string, input: CreatePinSubmissionInput): Promise<PinSubmission>;

  /**
   * Update metadata fields on a draft or needs-changes submission.
   * Does not change images or status.
   */
  updatePinSubmission(submissionId: string, input: UpdatePinSubmissionInput): Promise<PinSubmission>;

  /**
   * Upload (or replace) the front image on an existing submission.
   * Uploads to Supabase Storage and updates `front_image_path`.
   * `localUri` is a device file URI.
   */
  uploadSubmissionFrontImage(submissionId: string, localUri: string): Promise<PinSubmission>;

  /**
   * Upload (or replace) the back image on an existing submission.
   * Uploads to Supabase Storage and updates `back_image_path`.
   * `localUri` is a device file URI.
   */
  uploadSubmissionBackImage(submissionId: string, localUri: string): Promise<PinSubmission>;

  /**
   * Change a draft submission's status to 'submitted', making it
   * available for moderator review.
   */
  submitPinForReview(submissionId: string): Promise<PinSubmission>;

  /** Return all submissions for the authenticated user, newest first. */
  getMyPinSubmissions(userId: string): Promise<PinSubmission[]>;

  /** Return a single submission. Returns null if not found or not owned. */
  getPinSubmission(submissionId: string): Promise<PinSubmission | null>;

  /**
   * Delete a draft submission and remove its images from Supabase Storage.
   * Only draft submissions can be deleted.
   */
  deleteDraftSubmission(submissionId: string): Promise<void>;

  /**
   * Return a signed URL (1 hour TTL) for a private submission image.
   * `storagePath` is the value stored in `front_image_path` / `back_image_path`.
   */
  getSubmissionImageUrl(storagePath: string): Promise<string>;

  // ── Trade ratings & for-trade discovery ───────────────────────────────────

  /**
   * Return all users who have the given pin (internal UUID) marked as for_trade,
   * enriched with their positive/total rating counts.
   */
  getUsersWithPinForTrade(pinId: string): Promise<TraderProfile[]>;

  /** Aggregate positive/total ratings received by a user. */
  getTraderRating(userId: string): Promise<TraderRatingSummary>;

  /** Submit a positive or negative rating for a trader after a trade. */
  createTradeRating(raterId: string, input: CreateTradeRatingInput): Promise<TradeRating>;
}
