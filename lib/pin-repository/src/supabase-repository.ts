import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PinRepositoryError, type PinRepository } from './repository';
import type {
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
} from './types';
import type { Database } from './database.types';

// ─── DB row shape (with joined relations) ─────────────────────────────────────

interface PinRow {
  id: string;                    // UUID primary key (internal)
  pinhunt_id: string;            // stable public catalogue ID
  title: string;
  brand: string;
  collection: string;
  release_date: string | null;
  release_year: number | null;
  retail_price: number | null;
  currency: string;
  limited_edition_size: number | null;
  estimated_value_gbp: number | null;
  description: string | null;
  is_new_release: boolean;
  origin: string | null;
  edition_type: string | null;
  image_url: string | null;
  back_image_url: string | null;
  external_identifiers: ExternalIdentifiers;
  verification_status: string;
  status: string;
  is_user_submitted: boolean;
  submitted_by: string | null;
  catalogue_source: string | null;
  catalogue_updated_at: string | null;
  manufacturer: string | null;
  retailer: string | null;
  source_url: string | null;
  confidence_level: string | null;
  is_seed_record: boolean;
  needs_review: boolean;
  needs_front_image: boolean;
  needs_back_image: boolean;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined via PostgREST resource embedding
  pin_characters: Array<{ characters: { name: string } }> | null;
  pin_categories: Array<{ categories: { name: string } }> | null;
}

// ─── Row → domain mapping ──────────────────────────────────────────────────────

function rowToPin(row: PinRow): CataloguePin {
  return {
    // CataloguePin.id = pinhunt_id (stable, app-facing identifier)
    id: row.pinhunt_id,
    title: row.title,
    brand: row.brand,
    collection: row.collection,
    characters: row.pin_characters?.map(pc => pc.characters.name) ?? [],
    categories: row.pin_categories?.map(pc => pc.categories.name) ?? [],
    releaseDate: row.release_date ?? undefined,
    releaseYear: row.release_year ?? undefined,
    retailPriceGBP: row.retail_price ?? undefined,
    currency: row.currency,
    limitedEditionSize: row.limited_edition_size ?? undefined,
    estimatedValueGBP: row.estimated_value_gbp ?? undefined,
    description: row.description ?? undefined,
    isNewRelease: row.is_new_release,
    origin: row.origin ?? undefined,
    edition: row.edition_type ?? undefined,      // maps edition_type → edition
    imageUrl: row.image_url ?? undefined,
    backImageUrl: row.back_image_url ?? undefined,
    externalIdentifiers: row.external_identifiers ?? {},
    verificationStatus: row.verification_status as PinVerificationStatus,
    status: row.status as CataloguePinStatus,
    isUserSubmitted: row.is_user_submitted,
    submittedBy: row.submitted_by ?? undefined,
    catalogueSource: row.catalogue_source ?? undefined,
    manufacturer: row.manufacturer ?? undefined,
    retailer: row.retailer ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    confidenceLevel: row.confidence_level ?? undefined,
    isSeedRecord: row.is_seed_record ?? false,
    needsReview: row.needs_review ?? false,
    needsFrontImage: row.needs_front_image ?? false,
    needsBackImage: row.needs_back_image ?? false,
    importBatchId: row.import_batch_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    catalogueUpdatedAt: row.catalogue_updated_at ?? undefined,
  };
}

// ─── SELECT fragment (reused across all pin queries) ─────────────────────────

const SELECT_PINS = `
  *,
  pin_characters(characters(name)),
  pin_categories(categories(name))
`.trim();

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SupabasePinRepositoryOptions {
  /**
   * Inject an AI adapter to enable findPossibleMatches.
   * Omit in mobile contexts — route through POST /api/scan/identify instead.
   */
  aiAdapter?: AiMatchAdapter;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class SupabasePinRepository implements PinRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly ai?: AiMatchAdapter;

  constructor(
    client: SupabaseClient<Database>,
    options: SupabasePinRepositoryOptions = {},
  ) {
    this.client = client;
    this.ai = options.aiAdapter;
  }

  // ── Junction table helpers ──────────────────────────────────────────────

  private async upsertCharacters(pinUuid: string, names: string[]): Promise<void> {
    if (!names.length) return;
    // Ensure all characters exist in the lookup table
    await this.client
      .from('characters')
      .upsert(names.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
    // Fetch UUIDs for this set of names
    const { data: rows } = await this.client
      .from('characters')
      .select('id')
      .in('name', names);
    if (!rows?.length) return;
    // Replace junction entries for this pin
    await this.client.from('pin_characters').delete().eq('pin_id', pinUuid);
    await this.client
      .from('pin_characters')
      .insert(rows.map(r => ({ pin_id: pinUuid, character_id: r.id })));
  }

  private async upsertCategories(pinUuid: string, names: string[]): Promise<void> {
    if (!names.length) return;
    await this.client
      .from('categories')
      .upsert(names.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
    const { data: rows } = await this.client
      .from('categories')
      .select('id')
      .in('name', names);
    if (!rows?.length) return;
    await this.client.from('pin_categories').delete().eq('pin_id', pinUuid);
    await this.client
      .from('pin_categories')
      .insert(rows.map(r => ({ pin_id: pinUuid, category_id: r.id })));
  }

  // ── searchPins ─────────────────────────────────────────────────────────

  async searchPins(query: string, filters: PinFilters = {}): Promise<CataloguePin[]> {
    // Build the base query. RLS automatically restricts to verification_status='verified'
    // when using the anon key — no need to duplicate that check here.
    let q = this.client.from('pins').select(SELECT_PINS);

    // Explicit status filter (e.g. to list pending_review pins with service role)
    if (filters.status) {
      q = q.eq('status', filters.status);
    }

    if (filters.verificationStatus) {
      q = q.eq('verification_status', filters.verificationStatus);
    }

    if (filters.brand) {
      const brands = Array.isArray(filters.brand) ? filters.brand : [filters.brand];
      q = q.in('brand', brands);
    }

    if (filters.collection) {
      q = q.eq('collection', filters.collection);
    }

    if (filters.edition) {
      q = q.ilike('edition_type', `%${filters.edition}%`);
    }

    if (filters.isNewRelease !== undefined) {
      q = q.eq('is_new_release', filters.isNewRelease);
    }

    if (filters.needsAnyImage) {
      q = q.or('needs_front_image.eq.true,needs_back_image.eq.true');
    }

    // Character filter: resolve name → UUID → filter by junction
    if (filters.character) {
      const { data: charRows } = await this.client
        .from('characters')
        .select('id')
        .ilike('name', `%${filters.character}%`);

      if (!charRows?.length) return [];

      const { data: pcRows } = await this.client
        .from('pin_characters')
        .select('pin_id')
        .in('character_id', charRows.map(r => r.id));

      if (!pcRows?.length) return [];
      q = q.in('id', [...new Set(pcRows.map(r => r.pin_id))]);
    }

    // Category filter: same pattern
    if (filters.category) {
      const { data: catRows } = await this.client
        .from('categories')
        .select('id')
        .ilike('name', `%${filters.category}%`);

      if (!catRows?.length) return [];

      const { data: pcRows } = await this.client
        .from('pin_categories')
        .select('pin_id')
        .in('category_id', catRows.map(r => r.id));

      if (!pcRows?.length) return [];
      q = q.in('id', [...new Set(pcRows.map(r => r.pin_id))]);
    }

    // Full-text search across title, brand and collection
    if (query.trim()) {
      q = q.or(
        `title.ilike.%${query}%,brand.ilike.%${query}%,collection.ilike.%${query}%`,
      );
    }

    if (filters.limit) q = q.limit(filters.limit);
    if (filters.offset) {
      q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
    }

    q = q.order('title');

    const { data, error } = await q;
    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return (data as unknown as PinRow[]).map(rowToPin);
  }

  // ── getPinById / getPinByPinhuntId ─────────────────────────────────────

  async getPinById(pinhuntId: string): Promise<CataloguePin | null> {
    return this.getPinByPinhuntId(pinhuntId);
  }

  async getPinByPinhuntId(pinhuntId: string): Promise<CataloguePin | null> {
    const { data, error } = await this.client
      .from('pins')
      .select(SELECT_PINS)
      .eq('pinhunt_id', pinhuntId)
      .maybeSingle();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    if (!data) return null;
    return rowToPin(data as unknown as PinRow);
  }

  // ── getPinsBySeries ────────────────────────────────────────────────────

  async getPinsBySeries(series: string): Promise<CataloguePin[]> {
    const { data, error } = await this.client
      .from('pins')
      .select(SELECT_PINS)
      .eq('collection', series)
      .order('title');

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return (data as unknown as PinRow[]).map(rowToPin);
  }

  // ── getPinsByCharacter ─────────────────────────────────────────────────

  async getPinsByCharacter(character: string): Promise<CataloguePin[]> {
    return this.searchPins('', { character });
  }

  // ── getPinsByCategory ──────────────────────────────────────────────────

  async getPinsByCategory(category: string): Promise<CataloguePin[]> {
    return this.searchPins('', { category });
  }

  // ── getDistinctFieldValues ─────────────────────────────────────────────

  async getDistinctFieldValues(
    field: 'brand' | 'collection',
    search?: string,
    limit = 25,
  ): Promise<string[]> {
    // PostgREST has no DISTINCT, so page through the (sorted) column and
    // dedupe client-side. With a search term the scan is narrow; without one
    // we cap the scan to keep it bounded.
    const PAGE = 1000;
    const MAX_SCAN = 10000;
    const seen = new Set<string>();
    const values: string[] = [];

    for (let offset = 0; offset < MAX_SCAN; offset += PAGE) {
      let q = this.client
        .from('pins')
        .select(field)
        .not(field, 'is', null)
        .order(field)
        .range(offset, offset + PAGE - 1);

      if (search?.trim()) {
        q = q.ilike(field, `%${search.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);

      for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
        const v = row[field]?.trim();
        if (v && !seen.has(v.toLowerCase())) {
          seen.add(v.toLowerCase());
          values.push(v);
          if (values.length >= limit) return values;
        }
      }

      if (!data || data.length < PAGE) break;
    }

    return values;
  }

  // ── createPin ─────────────────────────────────────────────────────────

  async createPin(input: CreatePinInput): Promise<CataloguePin> {
    const row = {
      pinhunt_id: input.pinhuntId,
      title: input.title,
      brand: input.brand,
      collection: input.collection,
      release_date: input.releaseDate ?? null,
      release_year: input.releaseYear ?? null,
      retail_price: input.retailPriceGBP ?? null,
      currency: input.currency ?? 'GBP',
      limited_edition_size: input.limitedEditionSize ?? null,
      estimated_value_gbp: input.estimatedValueGBP ?? null,
      description: input.description ?? null,
      is_new_release: input.isNewRelease ?? false,
      origin: input.origin ?? null,
      edition_type: input.edition ?? null,
      image_url: input.imageUrl ?? null,
      back_image_url: input.backImageUrl ?? null,
      external_identifiers: input.externalIdentifiers ?? {},
      verification_status: input.verificationStatus ?? 'needs_source_verification',
      status: (input.status ?? 'active') as CataloguePinStatus,
      is_user_submitted: false,
      catalogue_source: input.catalogueSource ?? 'pinhunt_import',
    };

    const { data, error } = await this.client
      .from('pins')
      .upsert(row, { onConflict: 'pinhunt_id' })
      .select('id, pinhunt_id')
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);

    const pinUuid = (data as { id: string }).id;

    // Manage junction tables
    await this.upsertCharacters(pinUuid, input.characters ?? []);
    await this.upsertCategories(pinUuid, input.categories ?? []);

    // Re-fetch with joins to return the full domain object
    const pin = await this.getPinByPinhuntId(input.pinhuntId);
    if (!pin) throw new PinRepositoryError('UPSTREAM_ERROR', 'Pin not found after insert');
    return pin;
  }

  // ── updatePin ─────────────────────────────────────────────────────────

  async updatePin(pinhuntId: string, input: UpdatePinInput): Promise<CataloguePin> {
    const updates: Record<string, unknown> = {};

    if (input.title !== undefined) updates.title = input.title;
    if (input.brand !== undefined) updates.brand = input.brand;
    if (input.collection !== undefined) updates.collection = input.collection;
    if (input.releaseDate !== undefined) updates.release_date = input.releaseDate;
    if (input.releaseYear !== undefined) updates.release_year = input.releaseYear;
    if (input.retailPriceGBP !== undefined) updates.retail_price = input.retailPriceGBP;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.limitedEditionSize !== undefined) updates.limited_edition_size = input.limitedEditionSize;
    if (input.estimatedValueGBP !== undefined) updates.estimated_value_gbp = input.estimatedValueGBP;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isNewRelease !== undefined) updates.is_new_release = input.isNewRelease;
    if (input.origin !== undefined) updates.origin = input.origin;
    if (input.edition !== undefined) updates.edition_type = input.edition;
    if (input.imageUrl !== undefined) updates.image_url = input.imageUrl;
    if (input.backImageUrl !== undefined) updates.back_image_url = input.backImageUrl;
    if (input.verificationStatus !== undefined) updates.verification_status = input.verificationStatus;
    if (input.status !== undefined) updates.status = input.status;
    if (input.catalogueSource !== undefined) updates.catalogue_source = input.catalogueSource;
    if (input.catalogueUpdatedAt !== undefined) updates.catalogue_updated_at = input.catalogueUpdatedAt;
    if (input.needsFrontImage !== undefined) updates.needs_front_image = input.needsFrontImage;
    if (input.needsBackImage  !== undefined) updates.needs_back_image  = input.needsBackImage;

    // Merge external_identifiers rather than overwriting
    if (input.externalIdentifiers !== undefined) {
      const { data: existing } = await this.client
        .from('pins')
        .select('external_identifiers')
        .eq('pinhunt_id', pinhuntId)
        .single();
      updates.external_identifiers = {
        ...((existing?.external_identifiers ?? {}) as Record<string, unknown>),
        ...input.externalIdentifiers,
      };
    }

    if (Object.keys(updates).length > 0) {
      const { data: pinData, error } = await this.client
        .from('pins')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('pinhunt_id', pinhuntId)
        .select('id')
        .single();

      if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
      if (!pinData) throw new PinRepositoryError('NOT_FOUND', `Pin not found: ${pinhuntId}`);

      const pinUuid = (pinData as { id: string }).id;

      // Update junction tables only when explicitly provided
      if (input.characters !== undefined) {
        await this.upsertCharacters(pinUuid, input.characters);
      }
      if (input.categories !== undefined) {
        await this.upsertCategories(pinUuid, input.categories);
      }
    }

    const pin = await this.getPinByPinhuntId(pinhuntId);
    if (!pin) throw new PinRepositoryError('NOT_FOUND', `Pin not found: ${pinhuntId}`);
    return pin;
  }

  // ── deletePin ─────────────────────────────────────────────────────────

  async deletePin(pinhuntId: string): Promise<void> {
    const { data, error } = await this.client
      .from('pins')
      .delete()
      .eq('pinhunt_id', pinhuntId)
      .select('id');

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    if (!data?.length) throw new PinRepositoryError('NOT_FOUND', `Pin not found: ${pinhuntId}`);

    // Best-effort cleanup of catalogue images. The DB record is already gone;
    // a storage failure must never surface to the caller — just log it.
    try {
      const { error: storageError } = await this.client.storage
        .from('pin-catalogue')
        .remove([`pins/${pinhuntId}/front.jpg`, `pins/${pinhuntId}/back.jpg`]);
      if (storageError) {
        console.warn(`[pin-repository] Failed to remove catalogue images for ${pinhuntId}: ${storageError.message}`);
      }
    } catch (e) {
      console.warn(`[pin-repository] Failed to remove catalogue images for ${pinhuntId}:`, e);
    }
  }

  // ── submitMissingPin ──────────────────────────────────────────────────

  async submitMissingPin(input: SubmitMissingPinInput): Promise<CataloguePin> {
    // Auto-generate a temporary pinhunt_id for the pending submission.
    // A moderator assigns the final PHUK-XXXXXXXX ID on approval.
    const tempId = `PHUK-SUB-${Date.now()}`;

    const row = {
      pinhunt_id: tempId,
      title: input.title,
      brand: input.brand,
      collection: input.collection,
      release_date: null,
      release_year: null,
      retail_price: null,
      currency: 'GBP',
      limited_edition_size: null,
      estimated_value_gbp: null,
      description: input.description ?? null,
      is_new_release: false,
      origin: input.origin ?? null,
      edition_type: input.edition ?? null,
      image_url: input.imageUrl ?? null,
      back_image_url: null,
      external_identifiers: input.externalIdentifiers ?? {},
      verification_status: 'verified' as const,
      status: 'active' as const,
      is_user_submitted: true,
      submitted_by: input.submittedBy ?? null,
      catalogue_source: 'user_submission',
    };

    const { data, error } = await this.client
      .from('pins')
      .insert(row)
      .select('id, pinhunt_id')
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);

    const pinUuid = (data as { id: string; pinhunt_id: string }).id;
    const pinhuntId = (data as { id: string; pinhunt_id: string }).pinhunt_id;

    await this.upsertCharacters(pinUuid, input.characters ?? []);
    await this.upsertCategories(pinUuid, input.categories ?? []);

    const pin = await this.getPinByPinhuntId(pinhuntId);
    if (!pin) throw new PinRepositoryError('UPSTREAM_ERROR', 'Submission not found after insert');
    return pin;
  }

  // ── findPossibleMatches ────────────────────────────────────────────────

  async findPossibleMatches(imageBase64: string, mimeType = 'image/jpeg'): Promise<PinMatch[]> {
    if (!this.ai) {
      throw new PinRepositoryError(
        'AI_ADAPTER_REQUIRED',
        'findPossibleMatches requires an AiMatchAdapter. ' +
          'On mobile, route scan requests through POST /api/scan/identify instead.',
      );
    }

    const catalogue = await this.searchPins('', { limit: 500 });
    if (catalogue.length === 0) return [];

    const rawMatches = await this.ai.identifyFromCatalogue(imageBase64, mimeType, catalogue);

    return rawMatches
      .map(m => {
        const pin = catalogue.find(p => p.id === m.pinId);
        if (!pin) return null;
        return { pin, confidence: m.confidence, reasoning: m.reasoning } as PinMatch;
      })
      .filter(Boolean) as PinMatch[];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
// Overloaded to accept either a pre-built SupabaseClient (preferred for the
// Expo app, which uses a singleton) or a url + key pair (api-server / scripts).

export function createSupabasePinRepository(
  client: SupabaseClient,
  options?: SupabasePinRepositoryOptions,
): PinRepository;
export function createSupabasePinRepository(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabasePinRepositoryOptions,
): PinRepository;
export function createSupabasePinRepository(
  clientOrUrl: SupabaseClient | string,
  keyOrOptions?: string | SupabasePinRepositoryOptions,
  options?: SupabasePinRepositoryOptions,
): PinRepository {
  if (typeof clientOrUrl === 'string') {
    const client = createClient<Database>(clientOrUrl, keyOrOptions as string);
    return new SupabasePinRepository(client, options);
  }
  return new SupabasePinRepository(
    clientOrUrl as SupabaseClient<Database>,
    keyOrOptions as SupabasePinRepositoryOptions | undefined,
  );
}
