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

// ─── Database types ───────────────────────────────────────────────────────────
export type { Database, Tables, TablesInsert, TablesUpdate } from './database.types';

// ─── Seed data (dev/testing convenience only) ─────────────────────────────────
export { SEED_PINS } from './seed-data';
