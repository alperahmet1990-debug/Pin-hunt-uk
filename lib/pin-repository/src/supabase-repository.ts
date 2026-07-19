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
  SubmitMissingPinInput,
  UpdatePinInput,
} from './types';

// ─── DB row → domain type mapping ────────────────────────────────────────────

interface PinRow {
  id: string;
  title: string;
  brand: string;
  collection: string;
  characters: string[];
  release_date: string | null;
  retail_price_gbp: number | null;
  limited_edition_size: number | null;
  estimated_value_gbp: number | null;
  description: string | null;
  is_new_release: boolean;
  origin: string | null;
  edition: string | null;
  image_url: string | null;
  external_identifiers: ExternalIdentifiers;
  status: CataloguePinStatus;
  is_user_submitted: boolean;
  submitted_by: string | null;
  catalogue_source: string | null;
  created_at: string;
  updated_at: string;
  catalogue_updated_at: string | null;
}

function rowToPin(row: PinRow): CataloguePin {
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    collection: row.collection,
    characters: row.characters ?? [],
    releaseDate: row.release_date ?? undefined,
    retailPriceGBP: row.retail_price_gbp ?? undefined,
    limitedEditionSize: row.limited_edition_size ?? undefined,
    estimatedValueGBP: row.estimated_value_gbp ?? undefined,
    description: row.description ?? undefined,
    isNewRelease: row.is_new_release,
    origin: row.origin ?? undefined,
    edition: row.edition ?? undefined,
    imageUrl: row.image_url ?? undefined,
    externalIdentifiers: row.external_identifiers ?? {},
    status: row.status,
    isUserSubmitted: row.is_user_submitted,
    submittedBy: row.submitted_by ?? undefined,
    catalogueSource: row.catalogue_source ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    catalogueUpdatedAt: row.catalogue_updated_at ?? undefined,
  };
}

function pinToInsertRow(input: CreatePinInput, status: CataloguePinStatus = 'active', isUserSubmitted = false) {
  return {
    ...(input.id ? { id: input.id } : {}),
    title: input.title,
    brand: input.brand,
    collection: input.collection,
    characters: input.characters ?? [],
    release_date: input.releaseDate ?? null,
    retail_price_gbp: input.retailPriceGBP ?? null,
    limited_edition_size: input.limitedEditionSize ?? null,
    estimated_value_gbp: input.estimatedValueGBP ?? null,
    description: input.description ?? null,
    is_new_release: input.isNewRelease ?? false,
    origin: input.origin ?? null,
    edition: input.edition ?? null,
    image_url: input.imageUrl ?? null,
    external_identifiers: input.externalIdentifiers ?? {},
    status,
    is_user_submitted: isUserSubmitted,
    catalogue_source: input.catalogueSource ?? 'pinhunt_seed',
  };
}

// ─── Construction options ─────────────────────────────────────────────────────

export interface SupabasePinRepositoryOptions {
  /**
   * Inject an AI adapter to enable findPossibleMatches.
   * Omit in client-side / mobile contexts — use the scan API endpoint instead.
   */
  aiAdapter?: AiMatchAdapter;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class SupabasePinRepository implements PinRepository {
  private readonly client: SupabaseClient;
  private readonly ai?: AiMatchAdapter;

  constructor(supabaseUrl: string, supabaseKey: string, options: SupabasePinRepositoryOptions = {}) {
    this.client = createClient(supabaseUrl, supabaseKey);
    this.ai = options.aiAdapter;
  }

  // ── searchPins ──────────────────────────────────────────────────────────────
  async searchPins(query: string, filters: PinFilters = {}): Promise<CataloguePin[]> {
    let q = this.client.from('pins').select('*');

    // Status filter (default to active only)
    q = q.eq('status', filters.status ?? 'active');

    // Brand filter
    if (filters.brand) {
      const brands = Array.isArray(filters.brand) ? filters.brand : [filters.brand];
      q = q.in('brand', brands);
    }

    if (filters.collection) {
      q = q.eq('collection', filters.collection);
    }

    if (filters.edition) {
      q = q.ilike('edition', `%${filters.edition}%`);
    }

    if (filters.isNewRelease !== undefined) {
      q = q.eq('is_new_release', filters.isNewRelease);
    }

    // Character filter — array contains
    if (filters.character) {
      q = q.contains('characters', [filters.character]);
    }

    // Text search across title, brand and collection
    if (query.trim()) {
      q = q.or(
        `title.ilike.%${query}%,brand.ilike.%${query}%,collection.ilike.%${query}%`,
      );
    }

    // Pagination
    if (filters.limit) q = q.limit(filters.limit);
    if (filters.offset) q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

    q = q.order('title');

    const { data, error } = await q;
    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return (data as PinRow[]).map(rowToPin);
  }

  // ── getPinById ──────────────────────────────────────────────────────────────
  async getPinById(id: string): Promise<CataloguePin | null> {
    const { data, error } = await this.client
      .from('pins')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    if (!data) return null;
    return rowToPin(data as PinRow);
  }

  // ── getPinsBySeries ─────────────────────────────────────────────────────────
  async getPinsBySeries(series: string): Promise<CataloguePin[]> {
    const { data, error } = await this.client
      .from('pins')
      .select('*')
      .eq('collection', series)
      .eq('status', 'active')
      .order('title');

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return (data as PinRow[]).map(rowToPin);
  }

  // ── getPinsByCharacter ──────────────────────────────────────────────────────
  async getPinsByCharacter(character: string): Promise<CataloguePin[]> {
    // Use Postgres array overlap: find any pin whose characters array contains
    // at least one element matching the search string (case-insensitive).
    const { data, error } = await this.client
      .from('pins')
      .select('*')
      .eq('status', 'active')
      .order('title');

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);

    const lower = character.toLowerCase();
    return (data as PinRow[])
      .map(rowToPin)
      .filter(p => p.characters.some(c => c.toLowerCase().includes(lower)));
  }

  // ── createPin ───────────────────────────────────────────────────────────────
  async createPin(input: CreatePinInput): Promise<CataloguePin> {
    const row = pinToInsertRow(input);

    const { data, error } = await this.client
      .from('pins')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return rowToPin(data as PinRow);
  }

  // ── updatePin ───────────────────────────────────────────────────────────────
  async updatePin(id: string, input: UpdatePinInput): Promise<CataloguePin> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.title !== undefined) updates.title = input.title;
    if (input.brand !== undefined) updates.brand = input.brand;
    if (input.collection !== undefined) updates.collection = input.collection;
    if (input.characters !== undefined) updates.characters = input.characters;
    if (input.releaseDate !== undefined) updates.release_date = input.releaseDate;
    if (input.retailPriceGBP !== undefined) updates.retail_price_gbp = input.retailPriceGBP;
    if (input.limitedEditionSize !== undefined) updates.limited_edition_size = input.limitedEditionSize;
    if (input.estimatedValueGBP !== undefined) updates.estimated_value_gbp = input.estimatedValueGBP;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isNewRelease !== undefined) updates.is_new_release = input.isNewRelease;
    if (input.origin !== undefined) updates.origin = input.origin;
    if (input.edition !== undefined) updates.edition = input.edition;
    if (input.imageUrl !== undefined) updates.image_url = input.imageUrl;
    if (input.status !== undefined) updates.status = input.status;
    if (input.catalogueSource !== undefined) updates.catalogue_source = input.catalogueSource;
    if (input.catalogueUpdatedAt !== undefined) updates.catalogue_updated_at = input.catalogueUpdatedAt;

    // Merge external_identifiers rather than overwriting
    if (input.externalIdentifiers !== undefined) {
      const { data: existing } = await this.client
        .from('pins').select('external_identifiers').eq('id', id).single();
      updates.external_identifiers = {
        ...(existing?.external_identifiers ?? {}),
        ...input.externalIdentifiers,
      };
    }

    const { data, error } = await this.client
      .from('pins')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    if (!data) throw new PinRepositoryError('NOT_FOUND', `Pin ${id} not found`);
    return rowToPin(data as PinRow);
  }

  // ── submitMissingPin ────────────────────────────────────────────────────────
  async submitMissingPin(input: SubmitMissingPinInput): Promise<CataloguePin> {
    const row = pinToInsertRow(
      { ...input, catalogueSource: 'user_submission' },
      'pending_review',
      true,
    );
    if (input.submittedBy) {
      (row as Record<string, unknown>).submitted_by = input.submittedBy;
    }

    const { data, error } = await this.client
      .from('pins')
      .insert(row)
      .select()
      .single();

    if (error) throw new PinRepositoryError('UPSTREAM_ERROR', error.message, error);
    return rowToPin(data as PinRow);
  }

  // ── findPossibleMatches ─────────────────────────────────────────────────────
  async findPossibleMatches(imageBase64: string, mimeType = 'image/jpeg'): Promise<PinMatch[]> {
    if (!this.ai) {
      throw new PinRepositoryError(
        'AI_ADAPTER_REQUIRED',
        'findPossibleMatches requires an AiMatchAdapter. ' +
          'On mobile, route scan requests through POST /api/scan/identify instead.',
      );
    }

    // Fetch full active catalogue to give the AI full context
    const catalogue = await this.searchPins('', { status: 'active', limit: 500 });
    if (catalogue.length === 0) return [];

    const rawMatches = await this.ai.identifyFromCatalogue(imageBase64, mimeType, catalogue);

    const mapped = rawMatches.map(m => {
      const pin = catalogue.find(p => p.id === m.pinId);
      if (!pin) return null;
      return { pin, confidence: m.confidence, reasoning: m.reasoning } as PinMatch;
    });
    return mapped.filter(Boolean) as PinMatch[];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSupabasePinRepository(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabasePinRepositoryOptions,
): PinRepository {
  return new SupabasePinRepository(supabaseUrl, supabaseKey, options);
}
