// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Catalogue
  AiMatchAdapter,
  AdminReviewInput,
  GetAllSubmissionsInput,
  CataloguePin,
  CataloguePinStatus,
  CreatePinInput,
  ExternalIdentifiers,
  MissingImageCounts,
  PinFilters,
  PinMatch,
  PinVerificationStatus,
  SubmitMissingPinInput,
  UpdatePinInput,
  // User collection
  AddUserPinInput,
  MarkTradePostedInput,
  ContactPreferences,
  ProblemTrade,
  PinCondition,
  Profile,
  ProfileVisibility,
  PublicProfile,
  SearchCollectorsInput,
  CreatePinSubmissionInput,
  EditionType,
  PinSubmission,
  SubmissionAiIdentification,
  PinSubmissionStatus,
  UpdatePinSubmissionInput,
  Trade,
  TradeItem,
  TradeMessage,
  TradeRating,
  TraderProfile,
  TraderRatingSummary,
  CreateTradeRatingInput,
  TradeStatus,
  UpdateProfileInput,
  UpdateUserPinInput,
  UserPin,
  UserPinStatus,
  // External marketplace listings
  CreateExternalSaleListingInput,
  ExternalSaleListing,
  ExternalSaleListingPlatform,
  ExternalSaleListingStatus,
  UpdateExternalSaleListingInput,
  // Nearby collectors (migration 007)
  NearbyCollector,
  GetNearbyCollectorsInput,
  PotentialTradePin,
  GetPotentialTradesInput,
  ForTradeInventoryItem,
  CollectorForTradePin,
  GetForTradeInventoryInput,
  // Community (migration 007_community)
  CommunityPost,
  CommunityPostType,
  Conversation,
  ConversationMessage,
  CreateCommunityPostInput,
  UpdateCommunityPostInput,
  PostComment,
  PostReport,
  PostReportSummary,
  CommentReport,
  ReportedComment,
  // Blocks and user reports (migration 050)
  UserBlock,
  UserReport,
  UserReportTarget,
  UserSuspension,
  ReportUserInput,
  StartConversationInput,
  // Duplicate detection
  DuplicateCandidate,
  DuplicateCandidateResult,
  // Contributed pin images
  ContributedPinImage,
  PinAndPopReference,
  ContributedImageStatus,
  ContributedImageReason,
  CreateContributedImageInput,
  ReviewContributedImageInput,
  // Feature flags & catalogue photo coverage
  FeatureKey,
  CatalogueImageSource,
  CatalogueImageCoverage,
  FeatureAudience,
  FeatureFlag,
  // Access levels
  MyAccess,
  UserAccess,
} from './types';

// ─── Catalogue repository ─────────────────────────────────────────────────────
export type { PinRepository } from './repository';
export type { PinSetSummary, CatalogueBrowsePin } from './types';
export { PinRepositoryError } from './repository';
export { SUSPENSION_REASON_MAX } from './types';
export { safeDisplayName } from './display-name';
export type { PinRepositoryErrorCode } from './repository';

export {
  createSupabasePinRepository,
} from './supabase-repository';
export type { SupabasePinRepositoryOptions } from './supabase-repository';

// ─── User collection repository ───────────────────────────────────────────────
export type { IUserPinRepository } from './user-repository';
export { createSupabaseUserRepository } from './supabase-user-repository';

// ─── Market valuations (migration 049, read-only) ─────────────────────────────
export type {
  MarketCode,
  MarketConfidenceBand,
  MarketValuation,
  MarketValuationSource,
  MarketValuationSourceSummary,
  MarketValuationsClient,
} from './market-valuations';
export {
  getMarketValuations,
  mapMarketValuationRow,
  MARKET_VALUATION_COLUMNS,
  MARKET_VALUATION_COLUMNS_WITH_SUMMARIES,
} from './market-valuations';

// ─── Collector prices and community prices (migration 065) ─────────────────────
export type {
  CommunityPrice,
  CommunityPriceStep,
  CommunityPricesClient,
  MyPinPrice,
  PriceCurrency,
} from './community-prices';
export {
  clearMyPinPrice,
  COMMUNITY_PRICE_BATCH,
  getCommunityPrice,
  getCommunityPrices,
  getMyCommunityPriceSetting,
  getMyPinPrices,
  isCommunityPricesUnavailable,
  mapCommunityPriceRow,
  mapMyPinPriceRow,
  normalisePriceAmount,
  PRICE_CURRENCIES,
  setMyCommunityPriceSetting,
  setMyPinPrice,
} from './community-prices';

// ─── Database types ───────────────────────────────────────────────────────────
export type { Database, Tables, TablesInsert, TablesUpdate } from './database.types';

// ─── Seed data (dev/testing convenience only) ─────────────────────────────────
export { SEED_PINS } from './seed-data';
