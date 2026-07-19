// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Catalogue
  AiMatchAdapter,
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
  PinSubmission,
  SubmissionStatus,
  SubmissionType,
  Trade,
  TradeItem,
  TradeMessage,
  TradeStatus,
  UpdateProfileInput,
  UpdateUserPinInput,
  UserPin,
  UserPinStatus,
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
