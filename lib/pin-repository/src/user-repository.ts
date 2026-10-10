import type {
  AddUserPinInput,
  AdminReviewInput,
  CommunityPost,
  Conversation,
  ConversationMessage,
  CreateCommunityPostInput,
  UpdateCommunityPostInput,
  CreateExternalSaleListingInput,
  CreatePinSubmissionInput,
  DuplicateCandidate,
  EditionType,
  ExternalSaleListing,
  GetAllSubmissionsInput,
  ForTradeInventoryItem,
  GetForTradeInventoryInput,
  GetNearbyCollectorsInput,
  GetPotentialTradesInput,
  NearbyCollector,
  PinSubmission,
  PinSubmissionMetadataInput,
  PinSubmissionStatus,
  PostComment,
  PostReport,
  PostReportSummary,
  CommentReport,
  ReportedComment,
  CatalogueImageCoverage,
  ContributedPinImage,
  CreateContributedImageInput,
  FeatureAudience,
  FeatureFlag,
  FeatureKey,
  MyAccess,
  UserAccess,
  ReviewContributedImageInput,
  PinAndPopReference,
  PotentialTradePin,
  StartConversationInput,
  SendConversationMessageInput,
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

  /** Set IDs the user has explicitly chosen to track. */
  getTrackedSetIds(userId: string): Promise<string[]>;

  /** Begin tracking an official catalogue set. */
  trackSet(userId: string, setId: string): Promise<void>;

  /** Stop tracking an official catalogue set. */
  untrackSet(userId: string, setId: string): Promise<void>;

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
   * Create a pin submission row directly from an already-uploaded storage
   * path, skipping the upload step createPinSubmission performs internally.
   * Used by the API server after running the front photo through Pixian
   * normalization — the server uploads it itself (service-role key) and
   * just needs the row created with the resulting path.
   */
  createPinSubmissionFromPaths(
    userId: string,
    input: PinSubmissionMetadataInput,
    submissionId: string,
    frontImagePath: string,
    backImagePath: string | null,
  ): Promise<PinSubmission>;

  /**
   * Update metadata fields on a draft or needs-changes submission.
   * Does not change images or status.
   */
  updatePinSubmission(submissionId: string, input: UpdatePinSubmissionInput): Promise<PinSubmission>;

  /**
   * Upload (or replace) the front image on an existing submission.
   * Uploads to Supabase Storage and updates `front_image_path`.
   * `base64` is base64-encoded JPEG data (as returned by the image
   * picker/manipulator) — not a local file URI.
   */
  uploadSubmissionFrontImage(submissionId: string, base64: string): Promise<PinSubmission>;

  /**
   * Upload (or replace) the back image on an existing submission.
   * Uploads to Supabase Storage and updates `back_image_path`.
   * `base64` is base64-encoded JPEG data (as returned by the image
   * picker/manipulator) — not a local file URI.
   */
  uploadSubmissionBackImage(submissionId: string, base64: string): Promise<PinSubmission>;

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

  // ── Admin-only submission operations ──────────────────────────────────────

  /**
   * Return all submissions across all users (admin only — enforced by RLS).
   * Optionally filter by one or more statuses.
   */
  getAllPinSubmissions(input?: GetAllSubmissionsInput): Promise<PinSubmission[]>;

  /**
   * Approve, reject, mark under review, or request changes on a submission.
   * Admin only — enforced by RLS.
   */
  reviewPinSubmission(submissionId: string, input: AdminReviewInput): Promise<PinSubmission>;

  /**
   * Search the catalogue for pins that may already represent the same pin
   * as the given submission. Matches on title+brand similarity, FAC number,
   * and SKU. Returns up to 10 candidates with a human-readable match reason.
   * Admin only.
   */
  findSubmissionDuplicateCandidates(submissionId: string): Promise<DuplicateCandidate[]>;

  // ── Contributed pin images (scan → canonical display image) ───────────────
  // Distinct from pin submissions (a whole new pin) and from user_pin_images
  // (a user's private photo of a pin in their own collection). A contributed
  // image offers to become the CATALOGUE's public display image for a pin
  // that doesn't have one yet — gated on consent and admin review.

  /**
   * Record a pending image contribution. `input.storagePath` must already
   * point at an uploaded object in the `pin-contributed-images` bucket —
   * this method only writes the DB row, since the upload itself needs
   * platform-specific compression the repository package doesn't depend on.
   * Throws if `input.consentGranted` is not `true`.
   */
  createContributedImage(
    userId: string,
    pinId: string,
    input: CreateContributedImageInput,
  ): Promise<ContributedPinImage>;

  /** Return all of the authenticated user's own contributed images, any status. */
  getMyContributedImages(userId: string): Promise<ContributedPinImage[]>;

  /** Admin only: all pending contributed images awaiting review, oldest first. */
  getPendingContributedImages(): Promise<ContributedPinImage[]>;

  /** Admin only: a single contributed image by id, with its pin's pinhunt_id/title joined. */
  getContributedImage(imageId: string): Promise<ContributedPinImage | null>;

  /**
   * Admin only: record a reject decision (status + reviewer_notes only).
   * Approval additionally requires promoting the image into the public
   * `pin-catalogue` bucket and writing `pins.image_url` — that cross-bucket
   * step needs the Storage API with a service-role key, so it happens in
   * the API server, which calls this method for the DB bookkeeping half.
   */
  markContributedImageReviewed(
    imageId: string,
    reviewedBy: string,
    input: ReviewContributedImageInput,
  ): Promise<ContributedPinImage>;

  /**
   * Admin only: Pin & Pop reference images/ids for the given pins (DB UUIDs),
   * keyed by pin id. Pins with neither an image nor an id are omitted.
   */
  getPinAndPopReferences(pinIds: string[]): Promise<Record<string, PinAndPopReference>>;

  /** Return a signed URL (1 hour TTL) for a private contributed image. */
  getContributedImageUrl(storagePath: string): Promise<string>;

  /**
   * True when the user already has a pending contribution for this pin
   * (pinhunt_id). Used to stop duplicate submissions.
   */
  hasPendingContributedImage(userId: string, pinId: string): Promise<boolean>;

  // ── Feature flags & catalogue photo coverage (migration 039) ──────────────

  /**
   * Whether the signed-in caller may see a gated feature, per its
   * feature_flags audience. Fails closed — false on any error, including
   * migration 039 not being applied yet.
   */
  canAccessFeature(key: FeatureKey): Promise<boolean>;

  /**
   * Photo status for every Collectible PinTrader catalogue pin. Empty unless
   * the caller can access 'catalogue_contributions'.
   */
  getCatalogueImageCoverage(): Promise<CatalogueImageCoverage[]>;

  /** All feature flags and their current audience. */
  getFeatureFlags(): Promise<FeatureFlag[]>;

  /** App creator only (enforced by RLS): change who a feature is open to. */
  setFeatureAudience(key: FeatureKey, audience: FeatureAudience): Promise<void>;

  // ── Access levels (migration 040) ─────────────────────────────────────────

  /** The caller's own access levels. All false on error / migration missing. */
  getMyAccess(): Promise<MyAccess>;

  /**
   * App creator only: search users by username/display name. An empty query
   * returns everyone who currently has elevated access.
   */
  listUserAccess(query: string): Promise<UserAccess[]>;

  /** App creator only: set a user's admin/contributor rights (audited). */
  setUserAccess(userId: string, access: { isAdmin: boolean; isContributor: boolean }): Promise<void>;

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

  // ── Nearby collectors (migration 007) ────────────────────────────────────

  /**
   * Return collectors near the viewer who have opted in to discovery.
   * The viewer's own coordinates are looked up server-side via the
   * get_collectors_nearby RPC — no lat/lng is passed from the client.
   * Distance is returned as a privacy-safe band label only.
   */
  getNearbyCollectors(input: GetNearbyCollectorsInput): Promise<NearbyCollector[]>;

  /**
   * Return pins that each side has that the other wants,
   * to surface a potential trade match.
   */
  getPotentialTrades(input: GetPotentialTradesInput): Promise<PotentialTradePin[]>;

  /**
   * Return current for-trade listings, optionally restricted to a set of pins
   * (by pinhunt_id). Powers Find Trades' "on your ISO", "missing from your
   * set" and collection-based discovery calculations — one shared query
   * instead of a bespoke RPC per section.
   */
  getForTradeInventory(input: GetForTradeInventoryInput): Promise<ForTradeInventoryItem[]>;

  // ── Community posts ────────────────────────────────────────────────────────

  /** Return community posts, newest first. Optional filter by post type. */
  getCommunityFeed(options?: { postType?: string; limit?: number; offset?: number }): Promise<CommunityPost[]>;

  /** Return a single post with author profile and linked pin. */
  getCommunityPost(postId: string): Promise<CommunityPost | null>;

  /** Create a community post as the given author. */
  createCommunityPost(authorId: string, input: CreateCommunityPostInput): Promise<CommunityPost>;

  /** Update own post's body, type, and/or photos (RLS enforced on server). */
  updateCommunityPost(postId: string, input: UpdateCommunityPostInput): Promise<CommunityPost>;

  /** Delete own post (RLS enforced on server). */
  deleteCommunityPost(postId: string): Promise<void>;

  // ── Post comments ──────────────────────────────────────────────────────────

  /** Return all comments for a post, oldest first. */
  getPostComments(postId: string): Promise<PostComment[]>;

  /** Add a comment to a post. */
  createPostComment(postId: string, authorId: string, body: string): Promise<PostComment>;

  /** Delete own comment (RLS enforced on server). */
  deletePostComment(commentId: string): Promise<void>;

  // ── Post reports (moderation) ──────────────────────────────────────────────

  /**
   * Report a post as the given user. Idempotent per (post, reporter):
   * reporting the same post twice resolves without creating a duplicate.
   */
  reportCommunityPost(postId: string, reporterId: string, reason?: string): Promise<PostReport>;

  /** Whether the given user has already reported the post. */
  hasReportedPost(postId: string, reporterId: string): Promise<boolean>;

  /**
   * Aggregated report summaries for the admin moderation queue,
   * most-recently-reported first. Admin RLS applies.
   */
  getPostReportSummaries(): Promise<PostReportSummary[]>;

  /**
   * Dismiss all reports for a post (admin action after review).
   * Admin delete RLS applies.
   */
  dismissPostReports(postId: string): Promise<void>;

  /**
   * Report a comment as the given user. Idempotent per (comment, reporter):
   * reporting the same comment twice resolves without creating a duplicate.
   */
  reportPostComment(commentId: string, reporterId: string, reason?: string): Promise<CommentReport>;

  /** IDs (within the given set) of comments the user has already reported. */
  getMyReportedCommentIds(commentIds: string[], reporterId: string): Promise<string[]>;

  /**
   * Reported comments (with comment body, author, and aggregated report info)
   * for the admin moderation queue, most-recently-reported first. Admin RLS applies.
   */
  getReportedComments(): Promise<ReportedComment[]>;

  // ── Conversations / DMs ────────────────────────────────────────────────────

  /** Return all conversations for userId, sorted by most recent message. */
  getConversations(userId: string): Promise<Conversation[]>;

  /** Mark a conversation as read for the current user (updates their last-read timestamp). */
  markConversationRead(conversationId: string): Promise<void>;
  /** Lightweight per-conversation unread counts for the current user (badge polling). */
  getConversationUnreadCounts(): Promise<Record<string, number>>;

  /** Return a single conversation with messages and other participant profile. */
  getConversation(conversationId: string, currentUserId: string): Promise<Conversation | null>;

  /**
   * Start a conversation with a recipient and send the opening message.
   * Returns the new conversation.
   */
  startConversation(initiatorId: string, input: StartConversationInput): Promise<Conversation>;

  /** Return all messages in a conversation, oldest first. */
  getConversationMessages(conversationId: string): Promise<ConversationMessage[]>;

  /** Send a message in an existing conversation. */
  sendConversationMessage(conversationId: string, senderId: string, body: string, input?: SendConversationMessageInput): Promise<ConversationMessage>;

  /** Link an agreed trade to a conversation. */
  linkConversationTrade(conversationId: string, tradeId: string): Promise<void>;
}
