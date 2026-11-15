/**
 * Pin events for Home's "What's Happening" and the /events page (#613,
 * migration 081), managed by admins in the app (Admin → Events).
 *
 * RLS: anyone reads published events; admins also read drafts and are the
 * only ones who can write. Until migration 081 is applied the table doesn't
 * exist and calls throw a PinRepositoryError with code NOT_FOUND (see
 * isEventsUnavailable), so screens can fall back to community posts only.
 */
import { PinRepositoryError } from './repository';

export interface PinEvent {
  id: string;
  title: string;
  description: string;
  /** yyyy-mm-dd. For a rumour, the date it stops being shown is endDate ?? eventDate. */
  eventDate: string;
  /** yyyy-mm-dd, multi-day events only. */
  endDate: string | null;
  /** Free text, e.g. "7am–9:45am". */
  time: string | null;
  location: string | null;
  country: string | null;
  eventType: string;
  /** Short uppercase pill, e.g. "UK EVENT". */
  badgeLabel: string;
  sourceName: string | null;
  /** https only; "View event" opens it. */
  sourceUrl: string | null;
  featured: boolean;
  /** Talked about but not dated: shown last with whenText. */
  rumour: boolean;
  whenText: string | null;
  /** Drafts (false) are visible to admins only. */
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PinEventInput {
  title: string;
  description?: string | null;
  eventDate: string;
  endDate?: string | null;
  time?: string | null;
  location?: string | null;
  country?: string | null;
  eventType?: string | null;
  badgeLabel?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  featured?: boolean;
  rumour?: boolean;
  whenText?: string | null;
  published?: boolean;
}

/** The slice of a Supabase client this module uses (any supabase-js version). */
export interface EventsClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

/** Limits, matching migration 081's checks. */
export const EVENT_LIMITS = {
  title: 120,
  description: 1000,
  time: 60,
  location: 120,
  country: 60,
  eventType: 60,
  badgeLabel: 24,
  sourceName: 80,
  sourceUrl: 500,
  whenText: 60,
} as const;

export const DEFAULT_EVENT_TYPE = 'Pin Event';
export const DEFAULT_BADGE_LABEL = 'EVENT';

const UNAVAILABLE = 'Events are not available yet.';

/** True when the error means migration 081 isn't applied (or reachable) yet. */
export function isEventsUnavailable(err: unknown): boolean {
  return err instanceof PinRepositoryError && err.code === 'NOT_FOUND' && err.message === UNAVAILABLE;
}

function toError(error: unknown, fallback: string): PinRepositoryError {
  const e = (error ?? {}) as { code?: string; message?: string };
  const message = String(e.message ?? '');
  if (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(message)) {
    return new PinRepositoryError('NOT_FOUND', UNAVAILABLE, error);
  }
  if (e.code === '42501' || /row-level security/i.test(message)) {
    return new PinRepositoryError('INVALID_INPUT', 'Only admins can change events.', error);
  }
  if (e.code === '23514') {
    return new PinRepositoryError('INVALID_INPUT', 'Check the event details.', error);
  }
  return new PinRepositoryError('UPSTREAM_ERROR', fallback, error);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function text(value: string | null | undefined, max: number, label: string): string | null {
  const v = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return null;
  if (v.length > max) throw new PinRepositoryError('INVALID_INPUT', `Keep the ${label} to ${max} characters.`);
  return v;
}

/** Checks an event against migration 081's rules and tidies it into a row. */
export function eventInputToRow(input: PinEventInput): Record<string, unknown> {
  const title = text(input.title, EVENT_LIMITS.title, 'title');
  if (!title) throw new PinRepositoryError('INVALID_INPUT', 'Give the event a title.');
  const description = (input.description ?? '').trim();
  if (description.length > EVENT_LIMITS.description) {
    throw new PinRepositoryError('INVALID_INPUT', `Keep the description to ${EVENT_LIMITS.description} characters.`);
  }
  const eventDate = (input.eventDate ?? '').trim();
  if (!isRealDate(eventDate)) throw new PinRepositoryError('INVALID_INPUT', 'Enter the start date as YYYY-MM-DD.');
  const endDate = (input.endDate ?? '').trim() || null;
  if (endDate !== null && !isRealDate(endDate)) throw new PinRepositoryError('INVALID_INPUT', 'Enter the end date as YYYY-MM-DD.');
  if (endDate !== null && endDate < eventDate) throw new PinRepositoryError('INVALID_INPUT', 'The end date is before the start date.');
  const sourceUrl = text(input.sourceUrl, EVENT_LIMITS.sourceUrl, 'link');
  if (sourceUrl !== null && !/^https:\/\/\S+$/i.test(sourceUrl)) {
    throw new PinRepositoryError('INVALID_INPUT', 'The link must start with https://');
  }
  return {
    title,
    description,
    event_date: eventDate,
    end_date: endDate,
    time_text: text(input.time, EVENT_LIMITS.time, 'time'),
    location: text(input.location, EVENT_LIMITS.location, 'location'),
    country: text(input.country, EVENT_LIMITS.country, 'country'),
    event_type: text(input.eventType, EVENT_LIMITS.eventType, 'event type') ?? DEFAULT_EVENT_TYPE,
    badge_label: (text(input.badgeLabel, EVENT_LIMITS.badgeLabel, 'badge') ?? DEFAULT_BADGE_LABEL).toUpperCase(),
    source_name: text(input.sourceName, EVENT_LIMITS.sourceName, 'source'),
    source_url: sourceUrl,
    featured: !!input.featured,
    rumour: !!input.rumour,
    when_text: text(input.whenText, EVENT_LIMITS.whenText, 'rough date'),
    published: !!input.published,
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function mapEventRow(row: Record<string, unknown>): PinEvent | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.event_date !== 'string') return null;
  return {
    id: row.id,
    title: row.title,
    description: typeof row.description === 'string' ? row.description : '',
    eventDate: row.event_date.slice(0, 10),
    endDate: str(row.end_date)?.slice(0, 10) ?? null,
    time: str(row.time_text),
    location: str(row.location),
    country: str(row.country),
    eventType: str(row.event_type) ?? DEFAULT_EVENT_TYPE,
    badgeLabel: str(row.badge_label) ?? DEFAULT_BADGE_LABEL,
    sourceName: str(row.source_name),
    sourceUrl: str(row.source_url),
    featured: row.featured === true,
    rumour: row.rumour === true,
    whenText: str(row.when_text),
    published: row.published === true,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  };
}

const EVENT_COLUMNS =
  'id,title,description,event_date,end_date,time_text,location,country,event_type,badge_label,source_name,source_url,featured,rumour,when_text,published,created_at,updated_at';

const toEvents = (data: unknown): PinEvent[] =>
  ((data ?? []) as Record<string, unknown>[]).map(mapEventRow).filter((e): e is PinEvent => e !== null);

/**
 * Published events that haven't ended (end date, else start date, on or
 * after `today`), soonest first. Drafts are left out even for admins, who
 * can read them through RLS.
 */
export async function getEvents(client: EventsClient, today: string = new Date().toISOString().slice(0, 10)): Promise<PinEvent[]> {
  const { data, error } = await client.from('events').select(EVENT_COLUMNS)
    .eq('published', true)
    .or(`end_date.gte.${today},event_date.gte.${today}`)
    .order('event_date', { ascending: true })
    .limit(100);
  if (error) throw toError(error, 'Could not load events.');
  return toEvents(data);
}

/** Every event, drafts and past ones included, newest start date first. Admins only (RLS). */
export async function getAdminEvents(client: EventsClient): Promise<PinEvent[]> {
  const { data, error } = await client.from('events').select(EVENT_COLUMNS)
    .order('event_date', { ascending: false })
    .limit(500);
  if (error) throw toError(error, 'Could not load events.');
  return toEvents(data);
}

/** Adds an event (no id) or saves changes to one. Admins only (RLS). */
export async function saveEvent(client: EventsClient, input: PinEventInput, id?: string): Promise<PinEvent> {
  const row = eventInputToRow(input);
  const query = id
    ? client.from('events').update(row).eq('id', id)
    : client.from('events').insert(row);
  const { data, error } = await query.select(EVENT_COLUMNS).single();
  if (error) throw toError(error, id ? 'Could not save the event.' : 'Could not add the event.');
  const event = mapEventRow(data as Record<string, unknown>);
  if (!event) throw new PinRepositoryError('UPSTREAM_ERROR', 'Could not save the event.');
  return event;
}

/** Publishes or unpublishes an event. Admins only (RLS). */
export async function setEventPublished(client: EventsClient, id: string, published: boolean): Promise<PinEvent> {
  const { data, error } = await client.from('events').update({ published }).eq('id', id)
    .select(EVENT_COLUMNS).single();
  if (error) throw toError(error, 'Could not update the event.');
  const event = mapEventRow(data as Record<string, unknown>);
  if (!event) throw new PinRepositoryError('UPSTREAM_ERROR', 'Could not update the event.');
  return event;
}

/** Deletes an event. Admins only (RLS). */
export async function deleteEvent(client: EventsClient, id: string): Promise<void> {
  // RLS filters a delete it doesn't allow down to 0 rows without an error,
  // so ask for the deleted row back and treat none as a failure.
  const { data, error } = await client.from('events').delete().eq('id', id).select('id');
  if (error) throw toError(error, 'Could not delete the event.');
  if (!Array.isArray(data) || data.length === 0) {
    throw new PinRepositoryError('NOT_FOUND', 'That event wasn’t deleted. It may already be gone, or you may not be an admin any more.');
  }
}
