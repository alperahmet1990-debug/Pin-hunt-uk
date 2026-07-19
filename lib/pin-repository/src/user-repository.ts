import type {
  AddUserPinInput,
  Profile,
  PublicProfile,
  SearchCollectorsInput,
  Trade,
  TradeItem,
  TradeMessage,
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
}
