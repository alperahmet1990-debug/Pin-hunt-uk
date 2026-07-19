import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserPinRepository } from './user-repository';
import type {
  AddUserPinInput,
  CataloguePin,
  ExternalIdentifiers,
  Profile,
  Trade,
  TradeItem,
  TradeMessage,
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
    isAdmin: (row.is_admin as boolean) ?? false,
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
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToProfile(data as Record<string, unknown>);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    const updates: Record<string, unknown> = {};
    if (input.username !== undefined) updates.username = input.username;
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.location !== undefined) updates.location = input.location;

    const { data, error } = await this.client
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return rowToProfile(data as Record<string, unknown>);
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
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSupabaseUserRepository(
  client: SupabaseClient,
): IUserPinRepository {
  return new SupabaseUserPinRepository(client as SupabaseClient<Database>);
}
