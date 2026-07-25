import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserPinRepository } from './user-repository';
import { PinRepositoryError } from './repository';
import type {
  AddUserPinInput,
  CataloguePin,
  CommunityPost,
  CommunityPostType,
  Conversation,
  ConversationMessage,
  CreateCommunityPostInput,
  CreateExternalSaleListingInput,
  CreatePinSubmissionInput,
  EditionType,
  ExternalIdentifiers,
  ExternalSaleListing,
  GetNearbyCollectorsInput,
  GetPotentialTradesInput,
  NearbyCollector,
  PinSubmission,
  PinSubmissionStatus,
  PostComment,
  PotentialTradePin,
  Profile,
  PublicProfile,
  SearchCollectorsInput,
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
import type { Database } from './database.types';

// ─── Row → domain mappers ─────────────────────────────────────────────────────

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
  };
}

function rowToPinSubmission(row: Record<string, unknown>): PinSubmission {
  return {
    id: row.id as string,
    submittedBy: row.submitted_by as string,
    proposedName: row.proposed_name as string,
    brand: row.brand as string,
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
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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

  /** Upload a local image URI to Supabase Storage and return the storage path. */
  private async uploadSubmissionImage(
    userId: string,
    submissionId: string,
    localUri: string,
    side: 'front' | 'back',
  ): Promise<string> {
    const path = `${userId}/${submissionId}/${side}.jpg`;
    const response = await fetch(localUri);
    const blob = await response.blob();
    const { error } = await this.client.storage
      .from('pin-submissions')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    return path;
  }

  async createPinSubmission(userId: string, input: CreatePinSubmissionInput): Promise<PinSubmission> {
    // Generate the submission UUID upfront so we can build storage paths.
    // crypto.randomUUID() is not available in all React Native runtimes,
    // so we use a simple RFC 4122 v4 UUID generator instead.
    const submissionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

    // Upload front image (required).
    const frontPath = await this.uploadSubmissionImage(userId, submissionId, input.frontImageUri, 'front');

    // Upload back image (optional).
    let backPath: string | null = null;
    if (input.backImageUri) {
      backPath = await this.uploadSubmissionImage(userId, submissionId, input.backImageUri, 'back');
    }

    const { data, error } = await this.client
      .from('pin_submissions')
      .insert({
        id: submissionId,
        submitted_by: userId,
        proposed_name: input.proposedName,
        brand: input.brand,
        series_name: input.seriesName ?? null,
        release_location: input.releaseLocation ?? null,
        release_year: input.releaseYear ?? null,
        edition_type: (input.editionType ?? 'unknown') as EditionType,
        edition_size: input.editionSize ?? null,
        fac_number: input.facNumber ?? null,
        sku: input.sku ?? null,
        character_names: input.characterNames ?? null,
        front_image_path: frontPath,
        back_image_path: backPath,
        notes: input.notes ?? null,
        status: (input.status ?? 'draft') as PinSubmissionStatus,
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

  async uploadSubmissionFrontImage(submissionId: string, localUri: string): Promise<PinSubmission> {
    const { data: sub, error: subError } = await this.client
      .from('pin_submissions')
      .select('submitted_by')
      .eq('id', submissionId)
      .single();
    if (subError || !sub) throw new Error('Submission not found.');

    const userId = (sub as { submitted_by: string }).submitted_by;
    const frontPath = await this.uploadSubmissionImage(userId, submissionId, localUri, 'front');

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

  async uploadSubmissionBackImage(submissionId: string, localUri: string): Promise<PinSubmission> {
    const { data: sub, error: subError } = await this.client
      .from('pin_submissions')
      .select('submitted_by')
      .eq('id', submissionId)
      .single();
    if (subError || !sub) throw new Error('Submission not found.');

    const userId = (sub as { submitted_by: string }).submitted_by;
    const backPath = await this.uploadSubmissionImage(userId, submissionId, localUri, 'back');

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
      .select('*')
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]).map(rowToPinSubmission);
  }

  async getPinSubmission(submissionId: string): Promise<PinSubmission | null> {
    const { data, error } = await this.client
      .from('pin_submissions')
      .select('*')
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

  // ── Trade ratings & for-trade discovery ─────────────────────────────────────

  async getUsersWithPinForTrade(pinId: string): Promise<TraderProfile[]> {
    // 1. Get user_ids of people with this pin for_trade
    const { data: pinData, error: pinErr } = await this.client
      .from('user_pins')
      .select('user_id')
      .eq('pin_id', pinId)
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
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled),
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
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled),
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
      })
      .select(`
        *,
        profiles(id, username, display_name, avatar_url, trading_region, international_trading_enabled),
        pins(pinhunt_id, title, brand, image_url)
      `)
      .single();

    if (error) throw new Error(error.message);
    return this.rowToCommunityPost(data as Record<string, unknown>);
  }

  async deleteCommunityPost(postId: string): Promise<void> {
    const { error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('community_posts')
      .delete()
      .eq('id', postId);
    if (error) throw new Error(error.message);
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
            body: lastMsgRow.body as string,
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
      return this.rowToConversation(enriched, userId);
    });
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
      body: r.body as string,
      createdAt: r.created_at as string,
    }));
  }

  async sendConversationMessage(conversationId: string, senderId: string, body: string): Promise<ConversationMessage> {
    const { data, error } = await this.client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('conversation_messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, body })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const r = data as Record<string, unknown>;
    return {
      id: r.id as string,
      conversationId: r.conversation_id as string,
      senderId: r.sender_id as string,
      body: r.body as string,
      createdAt: r.created_at as string,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSupabaseUserRepository(
  client: SupabaseClient,
): IUserPinRepository {
  return new SupabaseUserPinRepository(client as SupabaseClient<Database>);
}
