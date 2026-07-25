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
  StartConversationInput,
  // Duplicate detection
  DuplicateCandidate,
} from './types';

// ─── Catalogue repository ─────────────────────────────────────────────────────
export type { PinRepository } from './repository';
export { PinRepositoryError } from './repository';
export type { PinRepositoryErrorCode } from './repository';

export {
  createSupabasePinRepository,
} from './supabase-repository';
export type { SupabasePinRepositoryOptions } from './supabase-repository';

// ─── User collection repository ───────────────────────────────────────────────
export type { IUserPinRepository } from './user-repository';
export { createSupabaseUserRepository } from './supabase-user-repository';

// ─── Database types ───────────────────────────────────────────────────────────
export type { Database, Tables, TablesInsert, TablesUpdate } from './database.types';

// ─── Seed data (dev/testing convenience only) ─────────────────────────────────
export { SEED_PINS } from './seed-data';
