import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IUserPinRepository } from './user-repository';
import { PinRepositoryError } from './repository';
import type {
  AddUserPinInput,
  AdminReviewInput,
  CataloguePin,
  CommunityPost,
  CommunityPostType,
  Conversation,
  ConversationMessage,
  CreateCommunityPostInput,
  UpdateCommunityPostInput,
  CreateExternalSaleListingInput,
  CreatePinSubmissionInput,
  PinSubmissionMetadataInput,
  SubmissionAiIdentification,
  DuplicateCandidate,
  DuplicateCandidateResult,
  EditionType,
  ExternalIdentifiers,
  ExternalSaleListing,
  ForTradeInventoryItem,
  CollectorForTradePin,
  GetAllSubmissionsInput,
  GetForTradeInventoryInput,
  GetNearbyCollectorsInput,
  GetPotentialTradesInput,
  NearbyCollector,
  PinSubmission,
  PinSubmissionStatus,
  PostComment,
  PostReport,
  PostReportSummary,
  CommentReport,
  ReportedComment,
  ReportUserInput,
  UserBlock,
  UserReport,
  CatalogueImageCoverage,
  CatalogueImageSource,
  ContributedPinImage,
  ContributedImageReason,
  ContributedImageStatus,
  CreateContributedImageInput,
  FeatureAudience,
  FeatureFlag,
  FeatureKey,
  MyAccess,
  UserAccess,
  ReviewContributedImageInput,
  PinAndPopReference,
  PotentialTradePin,
  Profile,
  PublicProfile,
  SearchCollectorsInput,
  SendConversationMessageInput,
  StartConversationInput,
  CreateTradeRatingInput,
  Trade,
  TradeItem,
  TradeMessage,
  TraderProfile,
  TradeRating,
  UpdateExternalSaleListingInput,
  UpdatePinSubmissionInput,
  UpdateProfileInput,
  UpdateUserPinInput,
  UserPin,
} from './types';
import type { Database, Json } from './database.types';

// crypto.randomUUID() is not available in all React Native runtimes, so pin
// submission IDs use a simple RFC 4122 v4 generator instead.
function generateSubmissionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Postgres unique_violation: the row already exists. */
const UNIQUE_VIOLATION = '23505';

// ─── Row → domain mappers ─────────────────────────────────────────────────────

function rowToUserReport(row: Record<string, unknown>): UserReport {
  const messageId = (row.message_id as string | null) ?? undefined;
  return {
    id: row.id as string,
    target: messageId ? 'message' : 'profile',
    reporterId: row.reporter_id as string,
    reportedUserId: row.reported_user_id as string,
    messageId,
    reason: (row.reason as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToUserPin(row: Record<string, unknown>): UserPin {
  const pinRow = row.pins as Record<string, unknown> | null;
  const pinCharacters = pinRow?.pin_characters as Array<{ characters: { name: string } }> | null;
  const pinCategories = pinRow?.pin_categories as Array<{ categories: { name: string } }> | null;

  const pin: CataloguePin | undefined = pinRow
    ? {
        id: pinRow.pinhunt_id as string,
        title: pinRow.title as string,
        brand: pinRow.brand as string,
        collection: pinRow.collection as string,
        characters: pinCharacters?.map(pc => pc.characters.name) ?? [],
        categories: pinCategories?.map(pc => pc.categories.name) ?? [],
        imageUrl: (pinRow.image_url as string | null) ?? undefined,
        backImageUrl: (pinRow.back_image_url as string | null) ?? undefined,
        estimatedValueGBP: (pinRow.estimated_value_gbp as number | null) ?? undefined,
        retailPriceGBP: (pinRow.retail_price as number | null) ?? undefined,
        edition: (pinRow.edition_type as string | null) ?? undefined,
        origin: (pinRow.origin as string | null) ?? undefined,
        isNewRelease: (pinRow.is_new_release as boolean) ?? false,
        externalIdentifiers: (pinRow.external_identifiers as ExternalIdentifiers) ?? {},
        status: (pinRow.status as CataloguePin['status']) ?? 'active',
        isUserSubmitted: (pinRow.is_user_submitted as boolean) ?? false,
      }
    : undefined;

  return {
    id: row.id as string,
    userId: row.user_id as string,
    pinId: row.pin_id as string,
    pinhuntId: pin?.id ?? '',
    pin,
    status: row.status as UserPin['status'],
    quantity: (row.quantity as number | null) ?? 1,
    acquiredDate: (row.acquired_date as string | null) ?? undefined,
    purchasePriceGBP: (row.purchase_price_gbp as number | null) ?? undefined,
    currentValueGBP: (row.current_value_gbp as number | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    condition: (row.condition as UserPin['condition']) ?? undefined,
    isFavourite: (row.is_favourite as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    username: (row.username as string | null) ?? undefined,
    displayName: (row.display_name as string | null) ?? undefined,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    bio: (row.bio as string | null) ?? undefined,
    location: (row.location as string | null) ?? undefined,
    tradingRegion: (row.trading_region as string | null) ?? undefined,
    internationalTradingEnabled: (row.international_trading_enabled as boolean) ?? false,
    allowTradeRequests: (row.allow_trade_requests as boolean) ?? true,
    allowMessages: (row.allow_messages as boolean) ?? true,
    profileVisibility: ((row.profile_visibility as string) ?? 'public') as Profile['profileVisibility'],
    isAdmin: (row.is_admin as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    // ── Migration 007: local discovery ──────────────────────────────────────
    town: (row.town as string | null) ?? undefined,
    county: (row.county as string | null) ?? undefined,
    country: (row.country as string | null) ?? undefined,
    // approx_lat/lng are column-revoked for the authenticated role (migration 008)
    // and must never be read by client code. has_location_set is a safe boolean
    // kept in sync by a DB trigger (sync_has_location_set).
    hasLocationSet: (row.has_location_set as boolean) ?? false,
    postcode: (row.postcode as string | null) ?? undefined,
    nearbyDiscoveryEnabled: (row.nearby_discovery_enabled as boolean) ?? false,
    preferredRadiusMiles: (row.preferred_radius_miles as number) ?? 25,
    openToLocalTrades: (row.open_to_local_trades as boolean) ?? false,
    openToPostalTrades: (row.open_to_postal_trades as boolean) ?? false,
    happyToTravel: (row.happy_to_travel as boolean) ?? false,
  };
}

function rowToPublicProfile(row: Record<string, unknown>): PublicProfile {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: (row.display_name as string | null) ?? undefined,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    bio: (row.bio as string | null) ?? undefined,
    tradingRegion: (row.trading_region as string | null) ?? undefined,
    internationalTradingEnabled: (row.international_trading_enabled as boolean) ?? false,
    // ── Migration 007 fields ─────────────────────────────────────────────
    town: (row.town as string | null) ?? undefined,
    county: (row.county as string | null) ?? undefined,
    openToLocalTrades: (row.open_to_local_trades as boolean) ?? false,
    openToPostalTrades: (row.open_to_postal_trades as boolean) ?? false,
    happyToTravel: (row.happy_to_travel as boolean) ?? false,
    isAdmin: (row.is_admin as boolean) ?? false,
  };
}

function rowToPinSubmission(row: Record<string, unknown>): PinSubmission {
  return {
    id: row.id as string,
    submittedBy: row.submitted_by as string,
    proposedName: (row.proposed_name as string | null) ?? '',
    brand: (row.brand as string | null) ?? '',
    seriesName: (row.series_name as string | null) ?? undefined,
    releaseLocation: (row.release_location as string | null) ?? undefined,
    releaseYear: (row.release_year as number | null) ?? undefined,
    editionType: (row.edition_type as EditionType) ?? 'unknown',
    editionSize: (row.edition_size as number | null) ?? undefined,
    facNumber: (row.fac_number as string | null) ?? undefined,
    sku: (row.sku as string | null) ?? undefined,
    characterNames: (row.character_names as string[] | null) ?? undefined,
    frontImagePath: row.front_image_path as string,
    backImagePath: (row.back_image_path as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    status: row.status as PinSubmissionStatus,
    reviewerNotes: (row.reviewer_notes as string | null) ?? undefined,
    approvedPinId: (row.approved_pin_id as string | null) ?? undefined,
    approvedPinhuntId: (row.approved_pin as { pinhunt_id: string } | null)?.pinhunt_id ?? undefined,
    approvedPinTitle: (row.approved_pin as { title?: string } | null)?.title ?? undefined,
    rightsConfirmedAt: (row.rights_confirmed_at as string | null) ?? undefined,
    aiIdentification: (row.ai_identification as SubmissionAiIdentification | null) ?? undefined,
    originalMetadata: (row.original_metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToContributedImage(row: Record<string, unknown>): ContributedPinImage {
  const pin = row.pin as { pinhunt_id?: string; title?: string; image_url?: string | null } | null;
  return {
    id: row.id as string,
    pinId: row.pin_id as string,
    pinhuntId: pin?.pinhunt_id ?? undefined,
    pinTitle: pin?.title ?? undefined,
    pinImageUrl: pin?.image_url ?? undefined,
    uploadedBy: row.uploaded_by as string,
    storagePath: row.image_url as string,
    status: row.status as ContributedImageStatus,
    contributorConsentAt: row.contributor_consent_at as string,
    proposalReason: (row.proposal_reason as ContributedImageReason | null) ?? undefined,
    reviewerNotes: (row.reviewer_notes as string | null) ?? undefined,
    reviewedBy: (row.reviewed_by as string | null) ?? undefined,
    reviewedAt: (row.reviewed_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToExternalSaleListing(row: Record<string, unknown>): ExternalSaleListing {
  return {
    id: row.id as string,
    sellerId: row.seller_id as string,
    pinId: row.pin_id as string,
    platform: row.platform as ExternalSaleListing['platform'],
    listingUrl: row.listing_url as string,
    askingPrice: (row.asking_price as number | null) ?? undefined,
    currency: (row.currency as string | null) ?? undefined,
    status: row.status as ExternalSaleListing['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Structured messages retain a readable preview for existing conversation UIs. */
function conversationMessageBody(row: Record<string, unknown>): string {
  const body = (row.body as string | null) ?? '';
  if (body.trim()) return body;
  const type = row.message_type as string | null;
  if (type === 'pin_share') {
    const count = Array.isArray(row.pin_ids) ? row.pin_ids.length : 0;
    return count === 1 ? 'Shared a pin' : `Shared ${count || 'some'} pins`;
  }
  if (type === 'photo') {
    const count = Array.isArray(row.photo_urls) ? row.photo_urls.length : 0;
    return count === 1 ? 'Shared a photo' : `Shared ${count || 'some'} photos`;
  }
  return 'Message';
}

function rowToTrade(row: Record<string, unknown>): Trade {
  return {
    id: row.id as string,
    initiatorId: row.initiator_id as string,
    recipientId: row.recipient_id as string,
    status: row.status as Trade['status'],
    notes: (row.notes as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Profile column lists ─────────────────────────────────────────────────────
// approx_lat and approx_lng are REVOKED for the authenticated role
// (migration 008). Using select('*') on profiles would fail for those columns.
// All profile reads must use an explicit safe column list.
//
// BASE_PROFILE_COLUMNS: columns present in the initial schema (migrations 001–006).
//   Used as a fallback when migration 007/008 haven't been applied yet.
//
// SAFE_PROFILE_COLUMNS: full list including discovery fields added in 007/008.
//   Preferred when migrations are applied.

const BASE_PROFILE_COLUMNS = [
  'id', 'username', 'display_name', 'avatar_url', 'bio', 'location',
  'trading_region', 'international_trading_enabled', 'allow_trade_requests',
  'allow_messages', 'profile_visibility', 'is_admin', 'created_at', 'updated_at',
].join(', ');

const SAFE_PROFILE_COLUMNS = [
  ...BASE_PROFILE_COLUMNS.split(', '),
  // migration 007 — local discovery fields (coordinates excluded)
  'town', 'county', 'country',
  'has_location_set',           // safe boolean — kept in sync by trigger (migration 008)
  'postcode',                   // last geocoded postcode — display-safe, for UX pre-fill (migration 012)
  'nearby_discovery_enabled', 'preferred_radius_miles',
  'open_to_local_trades', 'open_to_postal_trades', 'happy_to_travel',
].join(', ');

/**
 * Returns true when the Supabase error indicates a column doesn't exist yet
 * (i.e. migration 007/008 haven't been applied to this environment).
 * PostgreSQL error code 42703 = undefined_column.
 */
function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42703' ||
    Boolean(err.message?.includes('does not exist') && err.message?.includes('column'))
  );
}

// ─── SELECT fragment for user_pins with joined pin data ───────────────────────

const SELECT_USER_PINS = `
  *,
  pins(
    *,
    pin_characters(characters(name)),
    pin_categories(categories(name))
  )
`.trim();

// ─── Implementation ───────────────────────────────────────────────────────────

class SupabaseUserPinRepository implements IUserPinRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  // ── Profile ───────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<Profile | null> {
    let { data, error } = await this.client
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    // Migrations 007/008 not yet applied — fall back to base columns.
    if (isMissingColumnError(error as { code?: string; message?: string })) {
      ({ data, error } = await this.client
        .from('profiles')
        .select(BASE_PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle());
    }

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToProfile(data as unknown as Record<string, unknown>);
  }

  async getMyProfile(userId: string): Promise<Profile | null> {
    return this.getProfile(userId);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    // Use upsert so this works even if the trigger hasn't created the row yet
    // (handles accounts created before migration 003 was applied).
    const upsertData: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
    if (input.username !== undefined) upsertData.username = input.username ?? null;
    if (input.displayName !== undefined) upsertData.display_name = input.displayName ?? null;
    if (input.avatarUrl !== undefined) upsertData.avatar_url = input.avatarUrl ?? null;
    if (input.bio !== undefined) upsertData.bio = input.bio ?? null;
    if (input.location !== undefined) upsertData.location = input.location ?? null;
    if (input.tradingRegion !== undefined) upsertData.trading_region = input.tradingRegion ?? null;
    if (input.internationalTradingEnabled !== undefined) upsertData.international_trading_enabled = input.internationalTradingEnabled;
    if (input.allowTradeRequests !== undefined) upsertData.allow_trade_requests = input.allowTradeRequests;
    if (input.allowMessages !== undefined) upsertData.allow_messages = input.allowMessages;
    if (input.profileVisibility !== undefined) upsertData.profile_visibility = input.profileVisibility;
    // ── Migration 007: local discovery ──────────────────────────────────────
    if (input.town !== undefined) upsertData.town = input.town ?? null;
    if (input.county !== undefined) upsertData.county = input.county ?? null;
    if (input.country !== undefined) upsertData.country = input.country ?? null;
    if (input.nearbyDiscoveryEnabled !== undefined) upsertData.nearby_discovery_enabled = input.nearbyDiscoveryEnabled;
    if (input.preferredRadiusMiles !== undefined) upsertData.preferred_radius_miles = input.preferredRadiusMiles;
    if (input.openToLocalTrades !== undefined) upsertData.open_to_local_trades = input.openToLocalTrades;
    if (input.openToPostalTrades !== undefined) upsertData.open_to_postal_trades = input.openToPostalTrades;
    if (input.happyToTravel !== undefined) upsertData.happy_to_travel = input.happyToTravel;
    if (input.postcode !== undefined) upsertData.postcode = input.postcode ?? null;

    const { data, error } = await this.client
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(upsertData as any, { onConflict: 'id' })
      .select(SAFE_PROFILE_COLUMNS)
      .single();

    // Migrations 007/008 not yet applied — retry returning base columns only.
    if (isMissingColumnError(error as { code?: string; message?: string })) {
      const fallback = await this.client
        .from('profiles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(upsertData as any, { onConflict: 'id' })
        .select(BASE_PROFILE_COLUMNS)
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return rowToProfile(fallback.data as unknown as Record<string, unknown>);
    }

    if (error) throw new Error(error.message);
    return rowToProfile(data as unknown as Record<string, unknown>);
  }

  async updateMyProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    return this.updateProfile(userId, input);
  }

  async getPublicProfile(username: string): Promise<PublicProfile | null> {
    // Use the `profiles` table directly with explicit safe column selection so
    // that new migration-007 fields are available without waiting for the
    // public_profiles view to be updated. approx_lat/approx_lng are never
    // included in the select list — only display-safe fields are fetched.
    const { data, error } = await this.client
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, trading_region, international_trading_enabled, town, county, open_to_local_trades, open_to_postal_trades, happy_to_travel')
      .eq('username', username.toLowerCase())
      .eq('profile_visibility', 'public')
      .not('username', 'is', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToPublicProfile(data as unknown as Record<string, unknown>);
  }

  async searchCollectors(input: SearchCollectorsInput): Promise<PublicProfile[]> {
    let query = this.client
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, trading_region, international_trading_enabled, town, county, open_to_local_trades, open_to_postal_trades, happy_to_travel')
      .eq('profile_visibility', 'public')
      .not('username', 'is', null);

    if (input.query?.trim()) {
      const term = `%${input.query.trim().toLowerCase()}%`;
      query = query.or(`username.ilike.${term},display_name.ilike.${term}`);
    }

    if (input.tradingRegion?.trim()) {
      query = query.ilike('trading_region', `%${input.tradingRegion.trim()}%`);
    }

    query = query
      .order('username', { ascending: true })
      .limit(input.limit ?? 30)
      .range(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 30) - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToPublicProfile);
  }

  async checkUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
    let query = this.client
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase());

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return data === null; // null means no matching row → username is available
  }

  // ── Collection ────────────────────────────────────────────────────────

  async getUserCollection(userId: string): Promise<UserPin[]> {
    const { data, error } = await this.client
      .from('user_pins')
      .select(SELECT_USER_PINS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToUserPin);
  }

  async addPinToCollection(userId: string, input: AddUserPinInput): Promise<UserPin> {
    // Resolve pinhunt_id → DB UUID (the app always passes pinhunt_id as pinId)
    const { data: pinRow, error: pinErr } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', input.pinId)
      .maybeSingle();

    if (pinErr) throw new Error(pinErr.message);
    if (!pinRow) throw new Error(`Pin not found in catalogue: ${input.pinId}`);

    const { data, error } = await this.client
      .from('user_pins')
      .insert({
        user_id: userId,
        pin_id: (pinRow as { id: string }).id,
        status: input.status,
        quantity: input.quantity ?? 1,
        acquired_date: input.acquiredDate ?? null,
        purchase_price_gbp: input.purchasePriceGBP ?? null,
        notes: input.notes ?? null,
        condition: input.condition ?? null,
        is_favourite: input.isFavourite ?? false,
      })
      .select(SELECT_USER_PINS)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Pin ${input.pinId} is already in your collection`);
      }
      throw new Error(error.message);
    }

    return rowToUserPin(data as unknown as Record<string, unknown>);
  }

  async updateUserPin(userPinId: string, input: UpdateUserPinInput): Promise<UserPin> {
    const updates: Record<string, unknown> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.quantity !== undefined) updates.quantity = input.quantity;
    if (input.acquiredDate !== undefined) updates.acquired_date = input.acquiredDate;
    if (input.purchasePriceGBP !== undefined) updates.purchase_price_gbp = input.purchasePriceGBP;
    if (input.currentValueGBP !== undefined) updates.current_value_gbp = input.currentValueGBP;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.condition !== undefined) updates.condition = input.condition;
    if (input.isFavourite !== undefined) updates.is_favourite = input.isFavourite;

    const { data, error } = await this.client
      .from('user_pins')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', userPinId)
      .select(SELECT_USER_PINS)
      .single();

    if (error) throw new Error(error.message);
    return rowToUserPin(data as unknown as Record<string, unknown>);
  }

  async removeUserPin(userPinId: string): Promise<void> {
    const { error } = await this.client
      .from('user_pins')
      .delete()
      .eq('id', userPinId);

    if (error) throw new Error(error.message);
  }

  async getTrackedSetIds(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_tracked_sets')
      .select('set_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Array<{ set_id: string }>).map(row => row.set_id);
  }

  async trackSet(userId: string, setId: string): Promise<void> {
    const { error } = await this.client
      .from('user_tracked_sets')
      .upsert({ user_id: userId, set_id: setId }, { onConflict: 'user_id,set_id' });

    if (error) throw new Error(error.message);
  }

  async untrackSet(userId: string, setId: string): Promise<void> {
    const { error } = await this.client
      .from('user_tracked_sets')
      .delete()
      .eq('user_id', userId)
      .eq('set_id', setId);

    if (error) throw new Error(error.message);
  }

  // ── Trades ────────────────────────────────────────────────────────────

  async getUserTrades(userId: string): Promise<Trade[]> {
    const { data, error } = await this.client
      .from('trades')
      .select('*')
      .or(`initiator_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(rowToTrade);
  }

  async getTrade(tradeId: string): Promise<Trade | null> {
    const { data, error } = await this.client
      .from('trades')
      .select('*, trade_items(*), trade_messages(*)')
      .eq('id', tradeId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as Record<string, unknown>;
    const trade = rowToTrade(row);
    trade.items = ((row.trade_items as Record<string, unknown>[]) ?? []).map(r => ({
      id: r.id as string,
      tradeId: r.trade_id as string,
      userPinId: r.user_pin_id as string,
      direction: r.direction as TradeItem['direction'],
      createdAt: r.created_at as string,
    }));
    trade.messages = ((row.trade_messages as Record<string, unknown>[]) ?? []).map(r => ({
      id: r.id as string,
      tradeId: r.trade_id as string,
      senderId: r.sender_id as string,
      message: r.message as string,
      createdAt: r.created_at as string,
    }));
    return trade;
  }

  async createTrade(initiatorId: string, recipientId: string, notes?: string): Promise<Trade> {
    const { data, error } = await this.client
      .from('trades')
      .insert({ initiator_id: initiatorId, recipient_id: recipientId, notes: notes ?? null })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToTrade(data as Record<string, unknown>);
  }

  async updateTradeStatus(tradeId: string, status: Trade['status']): Promise<Trade> {
    const { data, error } = await this.client
      .from('trades')
      .update({ status })
      .eq('id', tradeId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToTrade(data as Record<string, unknown>);
  }

  async addTradeItem(
    tradeId: string,
    userPinId: string,
    direction: TradeItem['direction'],
  ): Promise<TradeItem> {
    const { data, error } = await this.client
      .from('trade_items')
      .insert({ trade_id: tradeId, user_pin_id: userPinId, direction })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      tradeId: row.trade_id as string,
      userPinId: row.user_pin_id as string,
      direction: row.direction as TradeItem['direction'],
      createdAt: row.created_at as string,
    };
  }

  async sendTradeMessage(
    tradeId: string,
    senderId: string,
    message: string,
  ): Promise<TradeMessage> {
    const { data, error } = await this.client
      .from('trade_messages')
      .insert({ trade_id: tradeId, sender_id: senderId, message })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      tradeId: row.trade_id as string,
      senderId: row.sender_id as string,
      message: row.message as string,
      createdAt: row.created_at as string,
    };
  }

  // ── External marketplace listings ───────────────────────────────────────────

  async createExternalSaleListing(
    sellerId: string,
    input: CreateExternalSaleListingInput,
  ): Promise<ExternalSaleListing> {
    // Resolve pinhunt_id → internal UUID (same pattern as addPinToCollection)
    const { data: pinRow, error: pinError } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', input.pinPinhuntId)
      .maybeSingle();
    if (pinError) throw new Error(pinError.message);
    if (!pinRow) throw new Error(`Pin not found: ${input.pinPinhuntId}`);

    const { data, error } = await this.client
      .from('external_sale_listings')
      .insert({
        seller_id: sellerId,
        pin_id: (pinRow as { id: string }).id,
        platform: input.platform,
        listing_url: input.listingUrl,
        asking_price: input.askingPrice ?? null,
        currency: input.currency ?? null,
        status: input.status ?? 'active',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToExternalSaleListing(data as Record<string, unknown>);
  }

  async updateExternalSaleListing(
    listingId: string,
    input: UpdateExternalSaleListingInput,
  ): Promise<ExternalSaleListing> {
    const updates: Record<string, unknown> = {};
    if (input.listingUrl !== undefined) updates.listing_url = input.listingUrl;
    if (input.askingPrice !== undefined) updates.asking_price = input.askingPrice ?? null;
    if (input.currency !== undefined) updates.currency = input.currency ?? null;
    if (input.status !== undefined) updates.status = input.status;

    const { data, error } = await this.client
      .from('external_sale_listings')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', listingId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToExternalSaleListing(data as Record<string, unknown>);
  }

  async removeExternalSaleListing(listingId: string): Promise<void> {
    const { error } = await this.client
      .from('external_sale_listings')
      .delete()
      .eq('id', listingId);
    if (error) throw new Error(error.message);
  }

  async getExternalListingsForPin(pinPinhuntId: string): Promise<ExternalSaleListing[]> {
    // Resolve pinhunt_id → internal UUID
    const { data: pinRow, error: pinError } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', pinPinhuntId)
      .maybeSingle();
    if (pinError) throw new Error(pinError.message);
    if (!pinRow) return []; // unknown pin → no listings

    const pinUuid = (pinRow as { id: string }).id;
    const { data, error } = await this.client
      .from('external_sale_listings')
      .select('*, profiles(username, display_name)')
      .eq('pin_id', pinUuid)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(row => {
      const profileRow = row.profiles as Record<string, unknown> | null;
      return {
        ...rowToExternalSaleListing(row),
        sellerUsername: (profileRow?.username as string | null) ?? undefined,
        sellerDisplayName: (profileRow?.display_name as string | null) ?? undefined,
      };
    });
  }

  async getSellerExternalListings(sellerId: string): Promise<ExternalSaleListing[]> {
    const { data, error } = await this.client
      .from('external_sale_listings')
      .select('*, pins(pinhunt_id, title, image_url)')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(row => {
      const pinRow = row.pins as Record<string, unknown> | null;
      return {
        ...rowToExternalSaleListing(row),
        pinTitle: (pinRow?.title as string | null) ?? undefined,
        pinPinhuntId: (pinRow?.pinhunt_id as string | null) ?? undefined,
        pinImageUrl: (pinRow?.image_url as string | null) ?? undefined,
      };
    });
  }

  async markExternalListingSold(listingId: string): Promise<ExternalSaleListing> {
    return this.updateExternalSaleListing(listingId, { status: 'sold' });
  }

  // ── Pin submissions ───────────────────────────────────────────────────────────

  /**
   * Upload a base64-encoded image to Supabase Storage and return the storage
   * path. Takes base64 (as returned directly by the image picker/manipulator)
   * rather than fetching a local file URI — `fetch(uri).blob()` is unreliable
   * on-device in React Native.
   */
  private async uploadSubmissionImage(
    userId: string,
    submissionId: string,
    base64: string,
    side: 'front' | 'back',
  ): Promise<string> {
    const path = `${userId}/${submissionId}/${side}.jpg`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const { error } = await this.client.storage
      .from('pin-submissions')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    return path;
  }

  async createPinSubmission(userId: string, input: CreatePinSubmissionInput): Promise<PinSubmission> {
    const submissionId = generateSubmissionId();

    // Upload front image (required).
    const frontPath = await this.uploadSubmissionImage(userId, submissionId, input.frontImageBase64, 'front');

    // Upload back image (optional).
    let backPath: string | null = null;
    if (input.backImageBase64) {
      backPath = await this.uploadSubmissionImage(userId, submissionId, input.backImageBase64, 'back');
    }

    return this.createPinSubmissionFromPaths(userId, input, submissionId, frontPath, backPath);
  }

  async createPinSubmissionFromPaths(
    userId: string,
    input: PinSubmissionMetadataInput,
    submissionId: string,
    frontImagePath: string,
    backImagePath: string | null,
  ): Promise<PinSubmission> {
    const { data, error } = await this.client
      .from('pin_submissions')
      .insert({
        id: submissionId,
        submitted_by: userId,
        proposed_name: input.proposedName || null,
        brand: input.brand || null,
        series_name: input.seriesName ?? null,
        release_location: input.releaseLocation ?? null,
        release_year: input.releaseYear ?? null,
        edition_type: (input.editionType ?? 'unknown') as EditionType,
        edition_size: input.editionSize ?? null,
        fac_number: input.facNumber ?? null,
        sku: input.sku ?? null,
        character_names: input.characterNames ?? null,
        front_image_path: frontImagePath,
        back_image_path: backImagePath,
        notes: input.notes ?? null,
        status: (input.status ?? 'draft') as PinSubmissionStatus,
        // Columns from migration 047, sent only when used so a database
        // without 047 still accepts ordinary named submissions.
        ...(input.rightsConfirmed ? { rights_confirmed_at: new Date().toISOString() } : {}),
        ...(input.aiIdentification ? { ai_identification: input.aiIdentification as unknown as Json } : {}),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async updatePinSubmission(submissionId: string, input: UpdatePinSubmissionInput): Promise<PinSubmission> {
    const updates: Record<string, unknown> = {};
    if (input.proposedName !== undefined) updates.proposed_name = input.proposedName;
    if (input.brand !== undefined) updates.brand = input.brand;
    if (input.seriesName !== undefined) updates.series_name = input.seriesName;
    if (input.releaseLocation !== undefined) updates.release_location = input.releaseLocation;
    if (input.releaseYear !== undefined) updates.release_year = input.releaseYear;
    if (input.editionType !== undefined) updates.edition_type = input.editionType;
    if (input.editionSize !== undefined) updates.edition_size = input.editionSize;
    if (input.facNumber !== undefined) updates.fac_number = input.facNumber;
    if (input.sku !== undefined) updates.sku = input.sku;
    if (input.characterNames !== undefined) updates.character_names = input.characterNames;
    if (input.notes !== undefined) updates.notes = input.notes;

    const { data, error } = await this.client
      .from('pin_submissions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async uploadSubmissionFrontImage(submissionId: string, base64: string): Promise<PinSubmission> {
    const { data: sub, error: subError } = await this.client
      .from('pin_submissions')
      .select('submitted_by')
      .eq('id', submissionId)
      .single();
    if (subError || !sub) throw new Error('Submission not found.');

    const userId = (sub as { submitted_by: string }).submitted_by;
    const frontPath = await this.uploadSubmissionImage(userId, submissionId, base64, 'front');

    const { data, error } = await this.client
      .from('pin_submissions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ front_image_path: frontPath } as any)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async uploadSubmissionBackImage(submissionId: string, base64: string): Promise<PinSubmission> {
    const { data: sub, error: subError } = await this.client
      .from('pin_submissions')
      .select('submitted_by')
      .eq('id', submissionId)
      .single();
    if (subError || !sub) throw new Error('Submission not found.');

    const userId = (sub as { submitted_by: string }).submitted_by;
    const backPath = await this.uploadSubmissionImage(userId, submissionId, base64, 'back');

    const { data, error } = await this.client
      .from('pin_submissions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ back_image_path: backPath } as any)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async submitPinForReview(submissionId: string): Promise<PinSubmission> {
    const { data, error } = await this.client
      .from('pin_submissions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: 'submitted' } as any)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async getMyPinSubmissions(userId: string): Promise<PinSubmission[]> {
    const { data, error } = await this.client
      .from('pin_submissions')
      .select('*, approved_pin:pins!approved_pin_id(pinhunt_id, title)')
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToPinSubmission);
  }

  async getPinSubmission(submissionId: string): Promise<PinSubmission | null> {
    const { data, error } = await this.client
      .from('pin_submissions')
      .select('*, approved_pin:pins!approved_pin_id(pinhunt_id, title)')
      .eq('id', submissionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async deleteDraftSubmission(submissionId: string): Promise<void> {
    // Fetch the submission to get storage paths before deleting.
    const { data: sub, error: fetchError } = await this.client
      .from('pin_submissions')
      .select('submitted_by, front_image_path, back_image_path, status')
      .eq('id', submissionId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!sub) throw new Error('Submission not found.');
    const s = sub as { submitted_by: string; front_image_path: string; back_image_path: string | null; status: string };
    if (s.status !== 'draft') throw new Error('Only draft submissions can be deleted.');

    // Delete the DB row first (RLS enforces ownership + draft status).
    const { error: deleteError } = await this.client
      .from('pin_submissions')
      .delete()
      .eq('id', submissionId);
    if (deleteError) throw new Error(deleteError.message);

    // Clean up storage (best-effort — do not throw on failure).
    const paths: string[] = [s.front_image_path];
    if (s.back_image_path) paths.push(s.back_image_path);
    await this.client.storage.from('pin-submissions').remove(paths).catch(() => {});
  }

  async getSubmissionImageUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from('pin-submissions')
      .createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) throw new Error(`Could not generate image URL: ${error?.message ?? 'unknown'}`);
    return data.signedUrl;
  }

  // ── Admin-only submission operations ─────────────────────────────────────────

  async getAllPinSubmissions(input?: GetAllSubmissionsInput): Promise<PinSubmission[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (this.client as any)
      .from('pin_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (input?.statuses && input.statuses.length > 0) {
      q = q.in('status', input.statuses);
    }
    if (input?.limit !== undefined) {
      const from = input.offset ?? 0;
      q = q.range(from, from + input.limit - 1);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToPinSubmission);
  }

  async reviewPinSubmission(submissionId: string, input: AdminReviewInput): Promise<PinSubmission> {
    const updates: Record<string, unknown> = { status: input.status };
    if (input.reviewerNotes !== undefined) {
      updates.reviewer_notes = input.reviewerNotes;
    }

    // Resolve pinhunt_id → internal UUID so we can write the FK column.
    if (input.approvedPinhuntId) {
      const { data: pinRow, error: pinErr } = await this.client
        .from('pins')
        .select('id')
        .eq('pinhunt_id', input.approvedPinhuntId)
        .maybeSingle();
      if (pinErr) throw new Error(pinErr.message);
      if (pinRow) {
        updates.approved_pin_id = (pinRow as { id: string }).id;
      }
    }

    const { data, error } = await this.client
      .from('pin_submissions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToPinSubmission(data as Record<string, unknown>);
  }

  async findSubmissionDuplicateCandidates(submissionId: string): Promise<DuplicateCandidateResult> {
    const sub = await this.getPinSubmission(submissionId);
    if (!sub) throw new Error('Submission not found');

    const PIN_COLS = 'pinhunt_id, title, brand, collection, release_year, image_url, all_characters';
    // Signal strength — lower ranks first in the result.
    const STRENGTH: Record<string, number> = {
      'FAC number': 0, SKU: 0, 'name + brand': 1, name: 2, 'same set + character': 3, 'AI match': 4,
    };
    const candidates = new Map<string, DuplicateCandidate & { strength: number }>();
    const failedChecks: string[] = [];

    // `label` overrides the shown reason (e.g. "AI match (86%)"); `reason` ranks it.
    const addCandidate = (row: Record<string, unknown>, reason: string, label?: string) => {
      const id = row.pinhunt_id as string;
      const existing = candidates.get(id);
      if (existing) {
        // Several signals agreeing is worth showing.
        if (!existing.matchReason.includes(reason)) existing.matchReason += ` + ${label ?? reason}`;
        existing.strength = Math.min(existing.strength, STRENGTH[reason]);
        return;
      }
      candidates.set(id, {
        pinhuntId: id,
        title: row.title as string,
        brand: row.brand as string,
        collection: row.collection as string,
        releaseYear: (row.release_year as number | null) ?? undefined,
        imageUrl: (row.image_url as string | null) ?? undefined,
        matchReason: label ?? reason,
        strength: STRENGTH[reason],
      });
    };

    // Retired/archived pins aren't merge targets — same filter as searchPins.
    const livePins = () => this.client
      .from('pins')
      .select(PIN_COLS)
      .is('archived_at', null)
      .or('catalogue_status.is.null,catalogue_status.neq.archived');

    // Runs one check, recording (not swallowing) a failure.
    const run = async (label: string, query: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
      const { data, error } = await query;
      if (error) {
        if (!failedChecks.includes(label)) failedChecks.push(label);
        return [] as Record<string, unknown>[];
      }
      return (data ?? []) as Record<string, unknown>[];
    };

    const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase();
    const checks: Promise<void>[] = [];

    // 1. Identifiers — strongest signal. Catalogue imports have used several
    //    key names for SKUs, so check each.
    const idChecks: Array<[string, string | undefined, string[]]> = [
      ['FAC number', sub.facNumber, ['facNumber', 'fac']],
      ['SKU', sub.sku, ['sku', 'disneySku', 'boxlunchSku', 'loungeflySku']],
    ];
    for (const [label, value, keys] of idChecks) {
      const v = value?.trim();
      if (!v) continue;
      for (const key of keys) {
        checks.push(run(label, livePins().contains('external_identifiers', { [key]: v }).limit(5))
          .then(rows => rows.forEach(r => addCandidate(r, label))));
      }
    }

    // 2. Name — every significant word of the proposed name appears in the
    //    title, in any order. Brand is a bonus, not a requirement, because
    //    submitters and the catalogue spell brands differently
    //    ("Disney" vs "Disney Parks").
    const STOP = new Set(['the', 'and', 'pin', 'pins', 'disney', 'with', 'for', 'of']);
    const tokens = (sub.proposedName ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP.has(t))
      .slice(0, 5);
    if (tokens.length > 0) {
      let q = livePins();
      for (const t of tokens) q = q.ilike('title', `%${t}%`);
      const brand = norm(sub.brand);
      checks.push(run('name', q.limit(15)).then(rows => rows.forEach(r => {
        const pinBrand = norm(r.brand as string);
        const brandMatch = !!brand && !!pinBrand && (pinBrand.includes(brand) || brand.includes(pinBrand));
        addCandidate(r, brandMatch ? 'name + brand' : 'name');
      })));
    }

    // 3. Same set and year with a shared character — catches a pin whose
    //    catalogue title is worded differently from the submission.
    const series = sub.seriesName?.trim().replace(/[,()]/g, ' ');
    const characters = (sub.characterNames ?? []).map(norm).filter(Boolean);
    if (series && sub.releaseYear && characters.length > 0) {
      checks.push(run('same set', livePins()
        .or(`collection.ilike.%${series}%,normalised_series.ilike.%${series}%`)
        .eq('release_year', sub.releaseYear)
        .limit(60)).then(rows => rows.forEach(r => {
          const text = `${norm(r.title as string)} ${norm(r.all_characters as string)}`;
          if (characters.some(c => text.includes(c))) addCandidate(r, 'same set + character');
        })));
    }

    // 4. What the AI scan matched when the photo was submitted (#395) — the
    //    only signal an unnamed, photo-only submission has. Ranked last.
    const aiMatches = (sub.aiIdentification?.matches ?? []).filter(m => m.pinId).slice(0, 5);
    if (aiMatches.length > 0) {
      const confidence = new Map(aiMatches.map(m => [m.pinId, m.confidence]));
      checks.push(run('AI match', livePins().in('pinhunt_id', aiMatches.map(m => m.pinId)))
        .then(rows => rows.forEach(r => {
          const pct = Math.round(confidence.get(r.pinhunt_id as string) ?? 0);
          addCandidate(r, 'AI match', `AI match (${pct}%)`);
        })));
    }

    await Promise.all(checks);

    const sorted = Array.from(candidates.values())
      .sort((a, b) => a.strength - b.strength || a.title.localeCompare(b.title))
      .slice(0, 10)
      .map(({ strength: _strength, ...c }) => c);
    return { candidates: sorted, failedChecks };
  }

  // ── Contributed pin images ────────────────────────────────────────────────────

  async createContributedImage(
    userId: string,
    pinId: string,
    input: CreateContributedImageInput,
  ): Promise<ContributedPinImage> {
    if (!input.consentGranted) {
      throw new Error('Rights consent is required to contribute a pin image.');
    }

    // Resolve pinhunt_id → DB UUID (the app always passes pinhunt_id as pinId).
    const { data: pinRow, error: pinErr } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', pinId)
      .maybeSingle();
    if (pinErr) throw new Error(pinErr.message);
    if (!pinRow) throw new Error(`Pin not found in catalogue: ${pinId}`);

    const { data, error } = await this.client
      .from('pin_images')
      .insert({
        pin_id: (pinRow as { id: string }).id,
        image_url: input.storagePath,
        image_type: 'front',
        uploaded_by: userId,
        status: 'pending',
        public_display_allowed: false,
        contributor_consent_at: new Date().toISOString(),
        // Only sent when set, so the 038-era scan flow keeps working on a
        // database without migration 039's proposal_reason column.
        ...(input.proposalReason ? { proposal_reason: input.proposalReason } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToContributedImage(data as Record<string, unknown>);
  }

  async getMyContributedImages(userId: string): Promise<ContributedPinImage[]> {
    const { data, error } = await this.client
      .from('pin_images')
      .select('*, pin:pins!pin_id(pinhunt_id, title, image_url)')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToContributedImage);
  }

  async getPendingContributedImages(): Promise<ContributedPinImage[]> {
    const { data, error } = await this.client
      .from('pin_images')
      .select('*, pin:pins!pin_id(pinhunt_id, title, image_url)')
      .eq('status', 'pending')
      // Contributions only — imported/reference rows (e.g. Pin & Pop) have no uploader.
      .not('uploaded_by', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToContributedImage);
  }

  async getContributedImage(imageId: string): Promise<ContributedPinImage | null> {
    const { data, error } = await this.client
      .from('pin_images')
      .select('*, pin:pins!pin_id(pinhunt_id, title, image_url)')
      .eq('id', imageId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToContributedImage(data as Record<string, unknown>);
  }

  async markContributedImageReviewed(
    imageId: string,
    reviewedBy: string,
    input: ReviewContributedImageInput,
  ): Promise<ContributedPinImage> {
    const updates: Record<string, unknown> = {
      status: input.action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    };
    if (input.reviewerNotes !== undefined) updates.reviewer_notes = input.reviewerNotes;

    const { data, error } = await this.client
      .from('pin_images')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', imageId)
      .select('*, pin:pins!pin_id(pinhunt_id, title, image_url)')
      .single();

    if (error) throw new Error(error.message);
    return rowToContributedImage(data as Record<string, unknown>);
  }

  async getPinAndPopReferences(pinIds: string[]): Promise<Record<string, PinAndPopReference>> {
    const out: Record<string, PinAndPopReference> = {};
    if (pinIds.length === 0) return out;

    const [{ data: pinRows, error: pinErr }, { data: imageRows, error: imageErr }] = await Promise.all([
      this.client.from('pins').select('id, external_identifiers').in('id', pinIds),
      this.client
        .from('pin_images')
        .select('pin_id, image_url, source_record_id, created_at')
        .eq('source', 'pin_and_pop')
        .in('pin_id', pinIds)
        .order('created_at', { ascending: false }),
    ]);
    if (pinErr) throw new Error(pinErr.message);
    // Tolerate a database without migration 037's pin_images.source column.
    if (imageErr && !/source/.test(imageErr.message)) throw new Error(imageErr.message);

    for (const row of (pinRows ?? []) as Array<{ id: string; external_identifiers: ExternalIdentifiers | null }>) {
      const externalId = (row.external_identifiers as Record<string, unknown> | null)?.pin_and_pop;
      if (externalId) {
        out[row.id] = {
          externalId: String(externalId),
          pageUrl: `https://pinandpop.com/pins/${encodeURIComponent(String(externalId))}`,
        };
      }
    }
    for (const row of (imageRows ?? []) as Array<{ pin_id: string; image_url: string; source_record_id: string | null }>) {
      const ref = out[row.pin_id] ?? {};
      if (ref.imageUrl) continue; // newest first — keep the latest
      ref.imageUrl = row.image_url;
      if (!ref.externalId && row.source_record_id) {
        ref.externalId = row.source_record_id;
        ref.pageUrl = `https://pinandpop.com/pins/${encodeURIComponent(row.source_record_id)}`;
      }
      out[row.pin_id] = ref;
    }
    return out;
  }

  async getContributedImageUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from('pin-contributed-images')
      .createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) throw new Error(`Could not generate image URL: ${error?.message ?? 'unknown'}`);
    return data.signedUrl;
  }

  async hasPendingContributedImage(userId: string, pinId: string): Promise<boolean> {
    const { data: pinRow, error: pinErr } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', pinId)
      .maybeSingle();
    if (pinErr) throw new Error(pinErr.message);
    if (!pinRow) return false;

    const { count, error } = await this.client
      .from('pin_images')
      .select('id', { count: 'exact', head: true })
      .eq('pin_id', (pinRow as { id: string }).id)
      .eq('uploaded_by', userId)
      .eq('status', 'pending');
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }

  // ── Feature flags & catalogue photo coverage ─────────────────────────────────

  async canAccessFeature(key: FeatureKey): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.client as any).rpc('can_access_feature', { p_key: key });
    if (error) return false;
    return data === true;
  }

  async getCatalogueImageCoverage(): Promise<CatalogueImageCoverage[]> {
    // PostgREST caps rows per request, so page through the function's
    // (deterministically ordered) result.
    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (this.client as any)
        .rpc('get_catalogue_image_coverage')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map(row => ({
      pinhuntId: row.pinhunt_id as string,
      title: row.title as string,
      setName: (row.set_name as string | null) ?? 'Uncategorised',
      releaseYear: (row.release_year as number | null) ?? undefined,
      editionType: (row.edition_type as string | null) ?? undefined,
      imageUrl: (row.image_url as string | null) ?? undefined,
      imageSource: (row.image_source as CatalogueImageSource) ?? null,
      pendingCount: (row.pending_count as number | null) ?? 0,
      myStatus: (row.my_status as ContributedImageStatus | null) ?? undefined,
      origin: (row.origin as string | null) ?? undefined,
      mainCharacter: (row.main_character as string | null) ?? undefined,
      allCharacters: (row.all_characters as string | null) ?? undefined,
      catalogueSource: (row.catalogue_source as string | null) ?? undefined,
      needsBackImage: (row.needs_back_image as boolean | null) ?? undefined,
      missingFields: (row.missing_fields as string[] | null) ?? undefined,
    }));
  }

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.client as any)
      .from('feature_flags')
      .select('key, audience, description')
      .order('key');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      key: row.key as FeatureKey,
      audience: row.audience as FeatureAudience,
      description: (row.description as string | null) ?? undefined,
    }));
  }

  async setFeatureAudience(key: FeatureKey, audience: FeatureAudience): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.client as any)
      .from('feature_flags')
      .update({ audience, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select('key');
    if (error) throw new Error(error.message);
    // RLS silently filters a non-creator's update to zero rows.
    if (!data || data.length === 0) throw new Error('Only the App Creator can change feature rollouts.');
  }

  // ── Access levels ────────────────────────────────────────────────────────────

  async getMyAccess(): Promise<MyAccess> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.client as any).rpc('get_my_access');
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (error || !row) return { isAppCreator: false, isAdmin: false, isContributor: false };
    return {
      isAppCreator: row.is_app_creator === true,
      isAdmin: row.is_admin === true,
      isContributor: row.is_contributor === true,
    };
  }

  async listUserAccess(query: string): Promise<UserAccess[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.client as any).rpc('list_user_access', { p_query: query });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      id: row.id as string,
      username: (row.username as string | null) ?? undefined,
      displayName: (row.display_name as string | null) ?? undefined,
      avatarUrl: (row.avatar_url as string | null) ?? undefined,
      isAppCreator: row.is_app_creator === true,
      isAdmin: row.is_admin === true,
      isContributor: row.is_contributor === true,
    }));
  }

  async setUserAccess(userId: string, access: { isAdmin: boolean; isContributor: boolean }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.client as any).rpc('set_user_access', {
      p_user: userId,
      p_is_admin: access.isAdmin,
      p_is_contributor: access.isContributor,
    });
    if (error) throw new Error(error.message);
  }

  // ── Trade ratings & for-trade discovery ─────────────────────────────────────

  async getUsersWithPinForTrade(pinId: string): Promise<TraderProfile[]> {
    // 0. Callers pass the public pinhunt_id; user_pins.pin_id is the internal UUID.
    const { data: pinRow, error: pinRowErr } = await this.client
      .from('pins')
      .select('id')
      .eq('pinhunt_id', pinId)
      .maybeSingle();
    if (pinRowErr || !pinRow) return [];

    // 1. Get user_ids of people with this pin for_trade
    const { data: pinData, error: pinErr } = await this.client
      .from('user_pins')
      .select('user_id')
      .eq('pin_id', (pinRow as { id: string }).id)
      .eq('status', 'for_trade');

    if (pinErr || !pinData || pinData.length === 0) return [];
    const userIds = (pinData as { user_id: string }[]).map(r => r.user_id);

    // 2. Fetch their profiles (only users who have set a username = public)
    const { data: profileData, error: profileErr } = await this.client
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, trading_region, international_trading_enabled, town, county, open_to_local_trades, open_to_postal_trades, happy_to_travel')
      .in('id', userIds)
      .not('username', 'is', null);

    if (profileErr || !profileData || profileData.length === 0) return [];

    // 3. Fetch all ratings for these users in one query
    const { data: ratingData } = await this.client
      .from('trade_ratings')
      .select('ratee_id, is_positive')
      .in('ratee_id', userIds);

    const ratingMap = new Map<string, { positive: number; total: number }>();
    ((ratingData ?? []) as { ratee_id: string; is_positive: boolean }[]).forEach(r => {
      const cur = ratingMap.get(r.ratee_id) ?? { positive: 0, total: 0 };
      ratingMap.set(r.ratee_id, { positive: cur.positive + (r.is_positive ? 1 : 0), total: cur.total + 1 });
    });

    return (profileData as Record<string, unknown>[]).map(p => ({
      id: p.id as string,
      username: p.username as string,
      displayName: (p.display_name as string | null) ?? undefined,
      avatarUrl: (p.avatar_url as string | null) ?? undefined,
      bio: (p.bio as string | null) ?? undefined,
      tradingRegion: (p.trading_region as string | null) ?? undefined,
      internationalTradingEnabled: (p.international_trading_enabled as boolean) ?? false,
      town: (p.town as string | null) ?? undefined,
      county: (p.county as string | null) ?? undefined,
      openToLocalTrades: (p.open_to_local_trades as boolean) ?? false,
      openToPostalTrades: (p.open_to_postal_trades as boolean) ?? false,
      happyToTravel: (p.happy_to_travel as boolean) ?? false,
      positiveRatings: ratingMap.get(p.id as string)?.positive ?? 0,
      totalRatings: ratingMap.get(p.id as string)?.total ?? 0,
    }));
  }

  async getForTradeInventory(input: GetForTradeInventoryInput): Promise<ForTradeInventoryItem[]> {
    const { viewerId, pinIds, limit } = input;

    // Resolve app-facing pinhunt_ids → internal UUIDs when a pin list is given.
    let pinUuidToPinhuntId: Map<string, string> | null = null;
    if (pinIds) {
      if (pinIds.length === 0) return [];
      const { data: pinRows, error: pinRowsErr } = await this.client
        .from('pins')
        .select('id, pinhunt_id')
        .in('pinhunt_id', pinIds);
      if (pinRowsErr || !pinRows || pinRows.length === 0) return [];
      pinUuidToPinhuntId = new Map((pinRows as { id: string; pinhunt_id: string }[]).map(r => [r.id, r.pinhunt_id]));
    }

    let query = this.client
      .from('user_pins')
      .select('pin_id, user_id, pins(pinhunt_id, title, image_url, collection)')
      .eq('status', 'for_trade')
      .neq('user_id', viewerId);

    query = pinUuidToPinhuntId
      ? query.in('pin_id', [...pinUuidToPinhuntId.keys()])
      : query.limit(limit ?? 500);

    const { data: rows, error } = await query;
    if (error || !rows || rows.length === 0) return [];

    const userIds = [...new Set((rows as { user_id: string }[]).map(r => r.user_id))];
    const { data: profileData } = await this.client
      .from('profiles')
      .select('id, username')
      .in('id', userIds)
      .not('username', 'is', null);
    const usernameById = new Map(((profileData ?? []) as { id: string; username: string }[]).map(p => [p.id, p.username]));

    type Row = { pin_id: string; user_id: string; pins: { pinhunt_id: string; title: string; image_url: string | null; collection: string | null } | null };
    return (rows as Row[])
      .filter(r => r.pins && usernameById.has(r.user_id))
      .map(r => ({
        pinId: r.pins!.pinhunt_id,
        title: r.pins!.title,
        imageUrl: r.pins!.image_url ?? undefined,
        collection: r.pins!.collection ?? undefined,
        traderId: r.user_id,
        traderUsername: usernameById.get(r.user_id)!,
      }));
  }

  async getCollectorForTradePins(username: string): Promise<CollectorForTradePin[]> {
    // Same visibility rule as getPublicProfile: a private profile shows nothing.
    const { data: profile, error: profileErr } = await this.client
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .eq('profile_visibility', 'public')
      .not('username', 'is', null)
      .maybeSingle();
    if (profileErr || !profile) return [];

    // Only for_trade rows: other collectors' owned and ISO pins stay private
    // (RLS user_pins_for_trade_read allows exactly these rows).
    const { data: rows, error } = await this.client
      .from('user_pins')
      .select('pin_id, pins(pinhunt_id, title, image_url, collection)')
      .eq('user_id', (profile as { id: string }).id)
      .eq('status', 'for_trade')
      .limit(500);
    if (error || !rows) return [];

    type Row = { pin_id: string; pins: { pinhunt_id: string; title: string; image_url: string | null; collection: string | null } | null };
    return (rows as unknown as Row[])
      .filter(r => r.pins)
      .map(r => ({
        pinId: r.pins!.pinhunt_id,
        title: r.pins!.title,
        imageUrl: r.pins!.image_url ?? undefined,
        collection: r.pins!.collection ?? undefined,
      }));
  }

  async getTraderRating(userId: string): Promise<{ positive: number; total: number }> {
    const { data, error } = await this.client
      .from('trade_ratings')
      .select('is_positive')
      .eq('ratee_id', userId);

    if (error || !data) return { positive: 0, total: 0 };
    const rows = data as { is_positive: boolean }[];
    return { positive: rows.filter(r => r.is_positive).length, total: rows.length };
  }

  async createTradeRating(raterId: string, input: CreateTradeRatingInput): Promise<TradeRating> {
    const { data, error } = await this.client
      .from('trade_ratings')
      .insert({
        trade_id: input.tradeId ?? null,
        rater_id: raterId,
        ratee_id: input.rateeId,
        is_positive: input.isPositive,
        comment: input.comment ?? null,
      })
      .select()
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      tradeId: (row.trade_id as string | null) ?? undefined,
      raterId: row.rater_id as string,
      rateeId: row.ratee_id as string,
      isPositive: row.is_positive as boolean,
      comment: (row.comment as string | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }

  // ── Nearby collectors (migration 007) ────────────────────────────────────────

  async getNearbyCollectors(input: GetNearbyCollectorsInput): Promise<NearbyCollector[]> {
    // The RPC reads the viewer's own coords server-side — we never pass lat/lng.
    const { data, error } = await this.client.rpc('get_collectors_nearby', {
      p_viewer_id: input.viewerId,
      p_radius_miles: input.radiusMiles,
    });

    if (error) throw new Error(error.message);
    if (!data) return [];

    return (data as Array<Record<string, unknown>>).map(row => ({
      id: row.id as string,
      username: row.username as string,
      avatarUrl: (row.avatar_url as string | null) ?? undefined,
      bio: (row.bio as string | null) ?? undefined,
      town: (row.town as string | null) ?? undefined,
      county: (row.county as string | null) ?? undefined,
      distanceBand: row.distance_band as string,
      distanceSortKey: row.distance_sort_key as number,
      openToLocalTrades: (row.open_to_local_trades as boolean) ?? false,
      openToPostalTrades: (row.open_to_postal_trades as boolean) ?? false,
      happyToTravel: (row.happy_to_travel as boolean) ?? false,
      forTradeCount: (row.for_trade_count as number) ?? 0,
      wantedCount: (row.wanted_count as number) ?? 0,
      pinsTheyHaveIWant: (row.pins_they_have_i_want as number) ?? 0,
      pinsIHaveTheyWant: (row.pins_i_have_they_want as number) ?? 0,
      matchScore: (row.match_score as number) ?? 0,
      lastActiveAt: (row.last_active_at as string | null) ?? undefined,
      positiveRatings: (row.positive_ratings as number) ?? 0,
      totalRatings: (row.total_ratings as number) ?? 0,
    }));
  }

  async getPotentialTrades(input: GetPotentialTradesInput): Promise<PotentialTradePin[]> {
    const { data, error } = await this.client.rpc('get_potential_trades', {
      p_viewer_id: input.viewerId,
      p_collector_id: input.collectorId,
    });

    if (error) throw new Error(error.message);
    if (!data) return [];

    return (data as Array<Record<string, unknown>>).map(row => ({
      direction: row.direction as PotentialTradePin['direction'],
      pinId: row.pin_id as string,
      pinhuntId: row.pinhunt_id as string,
      title: row.title as string,
      imageUrl: (row.image_url as string | null) ?? undefined,
    }));
  }

  // ── Community posts ─────────────────────────────────────────────────────────

  private rowToCommunityPost(row: Record<string, unknown>): CommunityPost {
    const authorRow = row.profiles as Record<string, unknown> | null;
    const pinRow = row.pins as Record<string, unknown> | null;
    return {
      id: row.id as string,
      authorId: row.author_id as string,
      postType: row.post_type as CommunityPostType,
      body: row.body as string,
      photos: (row.photos as string[] | null) ?? [],
      linkedPinId: (row.linked_pin_id as string | null) ?? undefined,
      authorProfile: authorRow
        ? {
            id: authorRow.id as string,
            username: authorRow.username as string,
            displayName: (authorRow.display_name as string | null) ?? undefined,
            avatarUrl: (authorRow.avatar_url as string | null) ?? undefined,
            bio: (authorRow.bio as string | null) ?? undefined,
            tradingRegion: (authorRow.trading_region as string | null) ?? undefined,
            internationalTradingEnabled: (authorRow.international_trading_enabled as boolean) ?? false,
            openToLocalTrades: (authorRow.open_to_local_trades as boolean) ?? false,
            openToPostalTrades: (authorRow.open_to_postal_trades as boolean) ?? false,
            happyToTravel: (authorRow.happy_to_travel as boolean) ?? false,
            isAdmin: (authorRow.is_admin as boolean) ?? false,
          }
        : undefined,
      linkedPin: pinRow
        ? {
            id: pinRow.pinhunt_id as string,
            title: pinRow.title as string,
            brand: pinRow.brand as string,
            imageUrl: (pinRow.image_url as string | null) ?? undefined,
          }
        : undefined,
      commentCount: (row.comment_count as number | null) ?? undefined,
      publicSlug: (row.public_slug as string | null) ?? undefined,
      shareImageUrl: (row.share_image_url as string | null) ?? undefined,
      shareCount: (row.share_count as number | null) ?? undefined,
      priceText: (row.price_text as string | null) ?? undefined,
      lookingFor: (row.looking_for as string | null) ?? undefined,
      locationText: (row.location_text as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  async getCommunityFeed(options?: { postType?: string; limit?: number; offset?: number }): Promise<CommunityPost[]> {
    let query = this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      .select(`
        *,
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled, is_admin),
        pins(pinhunt_id, title, brand, image_url)
      `)
      .order('created_at', { ascending: false });

    if (options?.postType) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = (query as any).eq('post_type', options.postType);
    }
    const limit = options?.limit ?? 30;
    const offset = options?.offset ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(r => this.rowToCommunityPost(r));
  }

  async getCommunityPost(postId: string): Promise<CommunityPost | null> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      .select(`
        *,
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled, is_admin),
        pins(pinhunt_id, title, brand, image_url)
      `)
      .eq('id', postId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.rowToCommunityPost(data as Record<string, unknown>);
  }

  async createCommunityPost(authorId: string, input: CreateCommunityPostInput): Promise<CommunityPost> {
    // Resolve pinhunt_id to internal UUID if provided
    let linkedPinUuid: string | null = null;
    if (input.linkedPinId) {
      const { data: pinRow } = await this.client
        .from('pins')
        .select('id')
        .eq('pinhunt_id', input.linkedPinId)
        .maybeSingle();
      if (pinRow) linkedPinUuid = (pinRow as { id: string }).id;
    }

    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      .insert({
        author_id: authorId,
        post_type: input.postType,
        body: input.body,
        photos: input.photos ?? [],
        linked_pin_id: linkedPinUuid,
        price_text: input.priceText ?? null,
        looking_for: input.lookingFor ?? null,
        location_text: input.locationText ?? null,
      })
      .select(`
        *,
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled, is_admin),
        pins(pinhunt_id, title, brand, image_url)
      `)
      .single();

    if (error) throw new Error(error.message);
    return this.rowToCommunityPost(data as Record<string, unknown>);
  }

  async updateCommunityPost(postId: string, input: UpdateCommunityPostInput): Promise<CommunityPost> {
    // If photos are being replaced, fetch the current list first so removed
    // photos can be cleaned out of storage afterwards.
    let previousPhotos: string[] = [];
    if (input.photos !== undefined) {
      const { data: existing, error: fetchError } = await this.client
        .from('community_posts')
        .select('photos')
        .eq('id', postId)
        .maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      previousPhotos = (existing?.photos as string[] | null) ?? [];
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.postType !== undefined) updates.post_type = input.postType;
    if (input.body !== undefined) updates.body = input.body;
    if (input.photos !== undefined) updates.photos = input.photos;

    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', postId)
      .select(`
        *,
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled, is_admin),
        pins(pinhunt_id, title, brand, image_url)
      `)
      .single();

    if (error) throw new Error(error.message);

    // Best-effort: delete photos that were removed from the post.
    if (input.photos !== undefined) {
      const kept = new Set(input.photos);
      const removed = previousPhotos.filter(url => !kept.has(url));
      if (removed.length > 0) {
        const BUCKET = 'community-photos';
        const MARKER = `/${BUCKET}/`;
        const paths = removed
          .map(url => {
            const idx = url.indexOf(MARKER);
            return idx !== -1 ? url.slice(idx + MARKER.length) : null;
          })
          .filter((p): p is string => p !== null && p.length > 0);
        if (paths.length > 0) {
          // Ignore storage errors — the post row is already updated.
          await this.client.storage.from(BUCKET).remove(paths);
        }
      }
    }

    return this.rowToCommunityPost(data as Record<string, unknown>);
  }

  async deleteCommunityPost(postId: string): Promise<void> {
    // Fetch the post first so we can clean up any stored photos.
    const { data: postData, error: fetchError } = await this.client
      .from('community_posts')
      .select('photos')
      .eq('id', postId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    // Delete the DB row.
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      .delete()
      .eq('id', postId);
    if (error) throw new Error(error.message);

    // Best-effort: remove storage objects for any photos attached to the post.
    // Photos are stored as full public URLs; extract the object path (the part
    // after `/community-photos/`) so we can call storage.remove().
    const photos = (postData?.photos as string[] | null) ?? [];
    if (photos.length > 0) {
      const BUCKET = 'community-photos';
      const MARKER = `/${BUCKET}/`;
      const paths = photos
        .map(url => {
          const idx = url.indexOf(MARKER);
          return idx !== -1 ? url.slice(idx + MARKER.length) : null;
        })
        .filter((p): p is string => p !== null && p.length > 0);

      if (paths.length > 0) {
        // Ignore storage errors — the DB row is already gone and RLS may
        // prevent an admin from deleting another user's files anyway.
        await this.client.storage.from(BUCKET).remove(paths);
      }
    }
  }

  // ── Post comments ─────────────────────────────────────────────────────────────

  private rowToPostComment(row: Record<string, unknown>): PostComment {
    const authorRow = row.profiles as Record<string, unknown> | null;
    return {
      id: row.id as string,
      postId: row.post_id as string,
      authorId: row.author_id as string,
      body: row.body as string,
      authorProfile: authorRow
        ? {
            id: authorRow.id as string,
            username: authorRow.username as string,
            displayName: (authorRow.display_name as string | null) ?? undefined,
            avatarUrl: (authorRow.avatar_url as string | null) ?? undefined,
            bio: (authorRow.bio as string | null) ?? undefined,
            tradingRegion: (authorRow.trading_region as string | null) ?? undefined,
            internationalTradingEnabled: (authorRow.international_trading_enabled as boolean) ?? false,
            openToLocalTrades: (authorRow.open_to_local_trades as boolean) ?? false,
            openToPostalTrades: (authorRow.open_to_postal_trades as boolean) ?? false,
            happyToTravel: (authorRow.happy_to_travel as boolean) ?? false,
          }
        : undefined,
      createdAt: row.created_at as string,
    };
  }

  async getPostComments(postId: string): Promise<PostComment[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_comments')
      .select('*, profiles(id, username, display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(r => this.rowToPostComment(r));
  }

  async createPostComment(postId: string, authorId: string, body: string): Promise<PostComment> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_comments')
      .insert({ post_id: postId, author_id: authorId, body })
      .select('*, profiles(id, username, display_name, avatar_url)')
      .single();

    if (error) throw new Error(error.message);
    return this.rowToPostComment(data as Record<string, unknown>);
  }

  async deletePostComment(commentId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_comments')
      .delete()
      .eq('id', commentId);
    if (error) throw new Error(error.message);
  }

  // ── Post reports (moderation) ─────────────────────────────────────────────

  async reportCommunityPost(postId: string, reporterId: string, reason?: string): Promise<PostReport> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_reports' as any)
      .upsert(
        { post_id: postId, reporter_id: reporterId, reason: reason ?? null },
        { onConflict: 'post_id,reporter_id', ignoreDuplicates: false },
      )
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const row = data as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      postId: row.post_id as string,
      reporterId: row.reporter_id as string,
      reason: (row.reason as string | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }

  async hasReportedPost(postId: string, reporterId: string): Promise<boolean> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_reports' as any)
      .select('id')
      .eq('post_id', postId)
      .eq('reporter_id', reporterId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data != null;
  }

  async getPostReportSummaries(): Promise<PostReportSummary[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_reports' as any)
      .select('post_id, reason, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const byPost = new Map<string, PostReportSummary>();
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const postId = r.post_id as string;
      const reason = (r.reason as string | null) ?? undefined;
      const createdAt = r.created_at as string;
      const existing = byPost.get(postId);
      if (existing) {
        existing.reportCount += 1;
        if (createdAt > existing.latestReportAt) existing.latestReportAt = createdAt;
        if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
      } else {
        byPost.set(postId, {
          postId,
          reportCount: 1,
          latestReportAt: createdAt,
          reasons: reason ? [reason] : [],
        });
      }
    }
    // Most recently reported first
    return [...byPost.values()].sort((a, b) => b.latestReportAt.localeCompare(a.latestReportAt));
  }

  async dismissPostReports(postId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('post_reports' as any)
      .delete()
      .eq('post_id', postId);
    if (error) throw new Error(error.message);
  }

  // ── Comment reports (moderation) ──────────────────────────────────────────

  async reportPostComment(commentId: string, reporterId: string, reason?: string): Promise<CommentReport> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('comment_reports' as any)
      .upsert(
        { comment_id: commentId, reporter_id: reporterId, reason: reason ?? null },
        { onConflict: 'comment_id,reporter_id', ignoreDuplicates: false },
      )
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const row = data as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      commentId: row.comment_id as string,
      reporterId: row.reporter_id as string,
      reason: (row.reason as string | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }

  async getMyReportedCommentIds(commentIds: string[], reporterId: string): Promise<string[]> {
    if (commentIds.length === 0) return [];
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('comment_reports' as any)
      .select('comment_id')
      .eq('reporter_id', reporterId)
      .in('comment_id', commentIds);

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(r => r.comment_id as string);
  }

  async getReportedComments(): Promise<ReportedComment[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('comment_reports' as any)
      .select('comment_id, reason, created_at, post_comments(*, profiles(id, username, display_name, avatar_url))')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const byComment = new Map<string, ReportedComment>();
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const commentId = r.comment_id as string;
      const reason = (r.reason as string | null) ?? undefined;
      const createdAt = r.created_at as string;
      const existing = byComment.get(commentId);
      if (existing) {
        existing.reportCount += 1;
        if (createdAt > existing.latestReportAt) existing.latestReportAt = createdAt;
        if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
      } else {
        const commentRow = r.post_comments as Record<string, unknown> | null;
        // Comment already deleted (reports cascade) — skip defensively.
        if (!commentRow) continue;
        byComment.set(commentId, {
          comment: this.rowToPostComment(commentRow),
          reportCount: 1,
          latestReportAt: createdAt,
          reasons: reason ? [reason] : [],
        });
      }
    }
    // Most recently reported first
    return [...byComment.values()].sort((a, b) => b.latestReportAt.localeCompare(a.latestReportAt));
  }

  // ── Blocks and user reports (migration 050) ─────────────────────────────────

  async blockUser(blockerId: string, blockedUserId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_blocks' as any)
      .insert({ blocker_id: blockerId, blocked_id: blockedUserId });
    // Already blocked: the primary key rejects the duplicate, which is the
    // state the caller asked for.
    if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_blocks' as any)
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedUserId);
    if (error) throw new Error(error.message);
  }

  async getBlockedUsers(blockerId: string): Promise<UserBlock[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_blocks' as any)
      .select('blocked_id, created_at, blocked:profiles!user_blocks_blocked_id_fkey(username, avatar_url)')
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(r => {
      const profile = r.blocked as Record<string, unknown> | null;
      return {
        blockedUserId: r.blocked_id as string,
        username: (profile?.username as string | null) ?? undefined,
        avatarUrl: (profile?.avatar_url as string | null) ?? undefined,
        createdAt: r.created_at as string,
      };
    });
  }

  async reportUser(reporterId: string, input: ReportUserInput): Promise<UserReport> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_reports' as any)
      .insert({
        reporter_id: reporterId,
        reported_user_id: input.reportedUserId,
        message_id: input.messageId ?? null,
        reason: input.reason?.trim() || null,
      })
      .select('*')
      .single();

    if (!error) return rowToUserReport(data as unknown as Record<string, unknown>);
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);

    // Already reported: return the existing report.
    let existing = this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_reports' as any)
      .select('*')
      .eq('reporter_id', reporterId);
    existing = input.messageId
      ? existing.eq('message_id', input.messageId)
      : existing.eq('reported_user_id', input.reportedUserId).is('message_id', null);
    const { data: row, error: readError } = await existing.maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error('Report could not be saved');
    return rowToUserReport(row as unknown as Record<string, unknown>);
  }

  async getUserReports(): Promise<UserReport[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_reports' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToUserReport);
  }

  async dismissUserReport(reportId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('user_reports' as any)
      .delete()
      .eq('id', reportId);
    if (error) throw new Error(error.message);
  }

  // ── Conversations / DMs ──────────────────────────────────────────────────────

  private rowToConversation(row: Record<string, unknown>, currentUserId: string): Conversation {
    const isA = row.participant_a_id === currentUserId;
    const otherProfileRow = isA
      ? (row.participant_b_profile as Record<string, unknown> | null)
      : (row.participant_a_profile as Record<string, unknown> | null);

    const lastMsgRow = row.last_msg as Record<string, unknown> | null;

    return {
      id: row.id as string,
      participantAId: row.participant_a_id as string,
      participantBId: row.participant_b_id as string,
      contextPostId: (row.context_post_id as string | null) ?? undefined,
      contextPinId: (row.context_pin_id as string | null) ?? undefined,
      tradeId: (row.trade_id as string | null) ?? undefined,
      lastMessageAt: (row.last_message_at as string | null) ?? undefined,
      createdAt: row.created_at as string,
      otherParticipant: otherProfileRow
        ? {
            id: otherProfileRow.id as string,
            username: (otherProfileRow.username as string) ?? '',
            displayName: (otherProfileRow.display_name as string | null) ?? undefined,
            avatarUrl: (otherProfileRow.avatar_url as string | null) ?? undefined,
            tradingRegion: (otherProfileRow.trading_region as string | null) ?? undefined,
            internationalTradingEnabled: (otherProfileRow.international_trading_enabled as boolean) ?? false,
            openToLocalTrades: (otherProfileRow.open_to_local_trades as boolean) ?? false,
            openToPostalTrades: (otherProfileRow.open_to_postal_trades as boolean) ?? false,
            happyToTravel: (otherProfileRow.happy_to_travel as boolean) ?? false,
          }
        : undefined,
      lastMessage: lastMsgRow
        ? {
            id: lastMsgRow.id as string,
            conversationId: lastMsgRow.conversation_id as string,
            senderId: lastMsgRow.sender_id as string,
            body: conversationMessageBody(lastMsgRow),
            messageType: (lastMsgRow.message_type as ConversationMessage['messageType']) ?? 'text',
            pinIds: (lastMsgRow.pin_ids as string[] | null) ?? [],
            forTradePinIds: (lastMsgRow.for_trade_pin_ids as string[] | null) ?? [],
            photoUrls: (lastMsgRow.photo_urls as string[] | null) ?? [],
            createdAt: lastMsgRow.created_at as string,
          }
        : undefined,
    };
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversations')
      .select('*')
      .or(`participant_a_id.eq.${userId},participant_b_id.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) throw new Error(error.message);
    const convRows = (data ?? []) as Record<string, unknown>[];
    if (convRows.length === 0) return [];

    // Collect all participant IDs we need profiles for
    const otherIds = convRows.map(r =>
      r.participant_a_id === userId ? r.participant_b_id : r.participant_a_id,
    ) as string[];

    const { data: profileData } = await this.client
      .from('profiles')
      .select('id, username, display_name, avatar_url, trading_region, international_trading_enabled')
      .in('id', otherIds);

    const profileMap = new Map<string, Record<string, unknown>>();
    ((profileData ?? []) as Record<string, unknown>[]).forEach(p => profileMap.set(p.id as string, p));

    // Fetch last message for each conversation
    const convIds = convRows.map(r => r.id as string);
    // We'll get the last message per conversation via a separate query and match by conversation_id
    const { data: msgData } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversation_messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    const lastMsgMap = new Map<string, Record<string, unknown>>();
    ((msgData ?? []) as Record<string, unknown>[]).forEach(m => {
      const cid = m.conversation_id as string;
      if (!lastMsgMap.has(cid)) lastMsgMap.set(cid, m);
    });

    // Unread = messages from the other participant newer than my last-read mark.
    const unreadMap = new Map<string, number>();
    const lastReadByConv = new Map<string, string | null>();
    convRows.forEach(r => {
      const isA = r.participant_a_id === userId;
      lastReadByConv.set(
        r.id as string,
        ((isA ? r.a_last_read_at : r.b_last_read_at) as string | null) ?? null,
      );
    });
    ((msgData ?? []) as Record<string, unknown>[]).forEach(m => {
      if (m.sender_id === userId) return;
      const cid = m.conversation_id as string;
      const lastRead = lastReadByConv.get(cid);
      if (lastRead == null || (m.created_at as string) > lastRead) {
        unreadMap.set(cid, (unreadMap.get(cid) ?? 0) + 1);
      }
    });

    return convRows.map(r => {
      const otherId = r.participant_a_id === userId ? r.participant_b_id : r.participant_a_id;
      const isA = r.participant_a_id === userId;
      const otherProfile = profileMap.get(otherId as string) ?? null;
      const enriched = {
        ...r,
        participant_a_profile: isA ? null : otherProfile,
        participant_b_profile: isA ? otherProfile : null,
        last_msg: lastMsgMap.get(r.id as string) ?? null,
      };
      const conv = this.rowToConversation(enriched, userId);
      conv.unreadCount = unreadMap.get(conv.id) ?? 0;
      return conv;
    });
  }

  async getConversationUnreadCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.client.rpc('get_conversation_unread_counts');
    if (error) throw new Error(error.message);
    const map: Record<string, number> = {};
    ((data ?? []) as { conversation_id: string; unread_count: number }[]).forEach(r => {
      map[r.conversation_id] = Number(r.unread_count);
    });
    return map;
  }

  async markConversationRead(conversationId: string): Promise<void> {
    const { error } = await this.client.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    });
    if (error) throw new Error(error.message);
  }

  async getConversation(conversationId: string, currentUserId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as Record<string, unknown>;
    const otherId = row.participant_a_id === currentUserId ? row.participant_b_id : row.participant_a_id;

    const { data: profileData } = await this.client
      .from('profiles')
      .select('id, username, display_name, avatar_url, trading_region, international_trading_enabled')
      .eq('id', otherId as string)
      .maybeSingle();

    const isA = row.participant_a_id === currentUserId;
    return this.rowToConversation({
      ...row,
      participant_a_profile: isA ? null : (profileData ?? null),
      participant_b_profile: isA ? (profileData ?? null) : null,
      last_msg: null,
    }, currentUserId);
  }

  async startConversation(initiatorId: string, input: StartConversationInput): Promise<Conversation> {
    // Resolve pin pinhunt_id → UUID if provided
    let contextPinUuid: string | null = null;
    if (input.contextPinId) {
      const { data: pinRow } = await this.client
        .from('pins')
        .select('id')
        .eq('pinhunt_id', input.contextPinId)
        .maybeSingle();
      if (pinRow) contextPinUuid = (pinRow as { id: string }).id;
    }

    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversations')
      .insert({
        participant_a_id: initiatorId,
        participant_b_id: input.recipientId,
        context_post_id: input.contextPostId ?? null,
        context_pin_id: contextPinUuid,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const conv = data as Record<string, unknown>;

    // Send opening message
    await this.sendConversationMessage(conv.id as string, initiatorId, input.openingMessage);

    return this.getConversation(conv.id as string, initiatorId) as Promise<Conversation>;
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(r => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      senderId: r.sender_id as string,
      body: conversationMessageBody(r),
      messageType: (r.message_type as ConversationMessage['messageType']) ?? 'text',
      pinIds: (r.pin_ids as string[] | null) ?? [],
      forTradePinIds: (r.for_trade_pin_ids as string[] | null) ?? [],
      photoUrls: (r.photo_urls as string[] | null) ?? [],
      createdAt: r.created_at as string,
    }));
  }

  async sendConversationMessage(
    conversationId: string,
    senderId: string,
    body: string,
    input: SendConversationMessageInput = {},
  ): Promise<ConversationMessage> {
    const messageType = input.messageType ?? 'text';
    const storedBody = body.trim() || (
      messageType === 'pin_share'
        ? (input.pinIds?.length === 1 ? 'Shared a pin' : `Shared ${input.pinIds?.length ?? 0} pins`)
        : messageType === 'photo'
          ? (input.photoUrls?.length === 1 ? 'Shared a photo' : `Shared ${input.photoUrls?.length ?? 0} photos`)
          : 'Message'
    );
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        body: storedBody,
        message_type: messageType,
        pin_ids: input.pinIds ?? [],
        for_trade_pin_ids: input.forTradePinIds ?? [],
        photo_urls: input.photoUrls ?? [],
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const r = data as Record<string, unknown>;
    return {
      id: r.id as string,
      conversationId: r.conversation_id as string,
      senderId: r.sender_id as string,
      body: conversationMessageBody(r),
      messageType: (r.message_type as ConversationMessage['messageType']) ?? 'text',
      pinIds: (r.pin_ids as string[] | null) ?? [],
      forTradePinIds: (r.for_trade_pin_ids as string[] | null) ?? [],
      photoUrls: (r.photo_urls as string[] | null) ?? [],
      createdAt: r.created_at as string,
    };
  }

  async linkConversationTrade(conversationId: string, tradeId: string): Promise<void> {
    const { error } = await this.client.rpc('link_conversation_trade', {
      p_conversation_id: conversationId,
      p_trade_id: tradeId,
    });
    if (error) throw new Error(error.message);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
// Overloaded to accept either a pre-built SupabaseClient (preferred for the
// Expo app, which uses a singleton) or a url + key pair (api-server / scripts).

export function createSupabaseUserRepository(
  client: SupabaseClient,
): IUserPinRepository;
export function createSupabaseUserRepository(
  supabaseUrl: string,
  supabaseKey: string,
): IUserPinRepository;
export function createSupabaseUserRepository(
  clientOrUrl: SupabaseClient | string,
  supabaseKey?: string,
): IUserPinRepository {
  if (typeof clientOrUrl === 'string') {
    const client = createClient<Database>(clientOrUrl, supabaseKey as string);
    return new SupabaseUserPinRepository(client);
  }
  return new SupabaseUserPinRepository(clientOrUrl as SupabaseClient<Database>);
}
