/**
 * #613: events come from the events table (migration 081) through the
 * repository, and admins manage them in Admin → Events.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  PinRepositoryError,
  createSupabaseUserRepository,
  eventInputToRow,
  isEventsUnavailable,
  type PinEvent,
} from '@workspace/pin-repository';
import { pinEventToEvent } from '../utils/events';

let mockService: Record<string, jest.Mock> | null = null;
jest.mock('@/lib/eventService', () => ({ getEventService: () => mockService }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

import AdminEventsScreen from '../app/admin/events';
import { useEvents } from '../hooks/useEvents';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const pinEvent = (id: string, title: string, extra: Partial<PinEvent> = {}): PinEvent => ({
  id, title, description: 'A pin trading morning.', eventDate: day(5), endDate: null, time: '7am–9:45am',
  location: 'Oxford Street, London', country: 'UK', eventType: 'Store Pin Trading Event', badgeLabel: 'UK EVENT',
  sourceName: 'Disney Store', sourceUrl: 'https://example.test/e', featured: false, rumour: false, whenText: null,
  published: true, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra,
});

/** A Supabase-like client recording the calls made on it. */
function fakeClient(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
    builder[m] = (...args: unknown[]) => { calls.push([m, ...args]); return builder; };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { calls, client: { from: (table: string) => { calls.push(['from', table]); return builder; } } };
}

const row = { id: 'r1', title: 'Pin Trading Day', description: '', event_date: '2999-01-02', end_date: null, time_text: null, location: 'Rochester', country: 'UK', event_type: 'Community Trading Event', badge_label: 'UK TRADING', source_name: null, source_url: null, featured: false, rumour: false, when_text: null, published: true, created_at: 'c', updated_at: 'u' };

beforeEach(() => {
  mockService = null;
});

describe('events in the repository (#613)', () => {
  it('reads published events that have not ended, soonest first', async () => {
    const { calls, client } = fakeClient({ data: [row] });
    const repo = createSupabaseUserRepository(client as never);
    const events = await repo.getEvents();
    expect(events).toEqual([expect.objectContaining({ id: 'r1', title: 'Pin Trading Day', eventDate: '2999-01-02', published: true })]);
    expect(calls).toContainEqual(['from', 'events']);
    // Drafts are filtered out even though RLS lets admins read them.
    expect(calls).toContainEqual(['eq', 'published', true]);
    expect(calls.find(c => c[0] === 'or')?.[1]).toMatch(/^end_date\.gte\.\d{4}-\d{2}-\d{2},event_date\.gte\.\d{4}-\d{2}-\d{2}$/);
    expect(calls).toContainEqual(['order', 'event_date', { ascending: true }]);
  });

  it('adds without an id and saves changes with one', async () => {
    const add = fakeClient({ data: row });
    await createSupabaseUserRepository(add.client as never).saveEvent({ title: ' Pin  Trading Day ', eventDate: '2999-01-02' });
    expect(add.calls.find(c => c[0] === 'insert')?.[1]).toMatchObject({ title: 'Pin Trading Day', event_type: 'Pin Event', badge_label: 'EVENT', published: false });

    const edit = fakeClient({ data: row });
    await createSupabaseUserRepository(edit.client as never).saveEvent({ title: 'Pin Trading Day', eventDate: '2999-01-02', published: true }, 'r1');
    expect(edit.calls.find(c => c[0] === 'update')?.[1]).toMatchObject({ published: true });
    expect(edit.calls).toContainEqual(['eq', 'id', 'r1']);
  });

  it('says events are unavailable until migration 081 is applied', async () => {
    const { client } = fakeClient({ error: { code: 'PGRST205', message: "Could not find the table 'public.events'" } });
    const err = await createSupabaseUserRepository(client as never).getEvents().catch(e => e);
    expect(isEventsUnavailable(err)).toBe(true);
  });

  it('checks events against the database rules before saving', () => {
    const bad = (input: object) => () => eventInputToRow({ title: 'Meet', eventDate: '2999-01-02', ...input });
    expect(bad({ title: '  ' })).toThrow('Give the event a title.');
    expect(bad({ eventDate: '2999-02-30' })).toThrow('start date');
    expect(bad({ endDate: '2999-01-01' })).toThrow('before the start date');
    expect(bad({ sourceUrl: 'http://example.test' })).toThrow('https://');
    expect(bad({ sourceUrl: 'javascript:alert(1)' })).toThrow(PinRepositoryError);
    expect(eventInputToRow({ title: 'Meet', eventDate: '2999-01-02', badgeLabel: 'uk event', endDate: '' }))
      .toMatchObject({ badge_label: 'UK EVENT', end_date: null });
  });

  it('turns an event into a card that opens its link', () => {
    expect(pinEventToEvent(pinEvent('a', 'Meet', { rumour: true, whenText: 'December · TBC' }))).toMatchObject({
      id: 'event-a', sourceType: 'admin', hasScheduledDate: true, rumour: true, whenText: 'December · TBC',
      sourceUrl: 'https://example.test/e', time: '7am–9:45am', endDate: undefined,
    });
  });
});

describe('Home and What’s Happening read events from the repository (#613)', () => {
  function Probe() {
    const { events } = useEvents();
    return <Text>{events.map(e => `${e.title}:${e.sourceType}`).join('|') || 'none'}</Text>;
  }

  it('loads published events through the event service', async () => {
    mockService = { getEvents: jest.fn().mockResolvedValue([pinEvent('a', 'Store Trading Event')]) };
    await render(<Probe />);
    expect(await screen.findByText('Store Trading Event:admin')).toBeTruthy();
  });

  it('shows no curated events (community posts still show) when loading fails', async () => {
    mockService = { getEvents: jest.fn().mockRejectedValue(new Error('down')) };
    await render(<Probe />);
    await waitFor(() => expect(mockService!.getEvents).toHaveBeenCalled());
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('shows no curated events when there is no event service', async () => {
    mockService = null;
    await render(<Probe />);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('no screen imports the built-in event list any more', () => {
    const appDir = path.join(__dirname, '..', 'app');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name) && fs.readFileSync(p, 'utf8').includes('@/mock-data/events')) offenders.push(p);
      }
    };
    walk(appDir);
    expect(offenders).toEqual([]);
  });
});

describe('Admin → Events (#613)', () => {
  function service(events: PinEvent[]) {
    return {
      getAdminEvents: jest.fn().mockResolvedValue(events),
      saveEvent: jest.fn().mockImplementation(async (input: { title: string }) => pinEvent('new', input.title, { published: false })),
      setEventPublished: jest.fn().mockImplementation(async (id: string, published: boolean) =>
        ({ ...events.find(e => e.id === id)!, published })),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
    };
  }

  // Renders the screen and waits for the first load.
  async function renderAdmin() {
    await render(<AdminEventsScreen />);
    await screen.findByText('Add an event');
  }

  it('lists published events and drafts', async () => {
    mockService = service([pinEvent('a', 'Store Trading Event'), pinEvent('b', 'Spring meet', { published: false })]);
    await renderAdmin();
    expect(screen.getByText('Store Trading Event')).toBeTruthy();
    expect(screen.getByText('Spring meet')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('adds an event from the form', async () => {
    mockService = service([]);
    await renderAdmin();
    await fireEvent.press(screen.getByText('Add an event'));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Pin Trading Night');
    await fireEvent.changeText(screen.getByLabelText('Start date'), '2999-03-04');
    await fireEvent.changeText(screen.getByLabelText('Link'), 'https://example.test/night');
    await fireEvent.press(screen.getByText('Add event'));
    expect(mockService.saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pin Trading Night', eventDate: '2999-03-04', sourceUrl: 'https://example.test/night', published: false }),
      undefined,
    );
    // The list reloads after saving.
    expect(mockService.getAdminEvents).toHaveBeenCalledTimes(2);
  });

  it('edits an event in place', async () => {
    mockService = service([pinEvent('a', 'Store Trading Event')]);
    await renderAdmin();
    await fireEvent.press(screen.getByLabelText('Edit Store Trading Event'));
    expect(screen.getByLabelText('Title').props.value).toBe('Store Trading Event');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Store Trading Evening');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockService.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Store Trading Evening', published: true }), 'a');
  });

  it('shows a save error and keeps the form open', async () => {
    mockService = service([]);
    mockService.saveEvent.mockRejectedValue(new Error('Enter the start date as YYYY-MM-DD.'));
    await renderAdmin();
    await fireEvent.press(screen.getByText('Add an event'));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Meet');
    await fireEvent.press(screen.getByText('Add event'));
    expect(screen.getByText('Enter the start date as YYYY-MM-DD.')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
  });

  it('publishes and unpublishes', async () => {
    mockService = service([pinEvent('b', 'Spring meet', { published: false })]);
    await renderAdmin();
    await fireEvent.press(screen.getByLabelText('Publish Spring meet'));
    expect(mockService.setEventPublished).toHaveBeenCalledWith('b', true);
    await waitFor(() => expect(screen.getByText('Published')).toBeTruthy());
  });

  it('deletes only after confirming', async () => {
    mockService = service([pinEvent('a', 'Store Trading Event')]);
    await renderAdmin();
    await fireEvent.press(screen.getByLabelText('Delete Store Trading Event'));
    expect(mockService.deleteEvent).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep it'));
    await fireEvent.press(screen.getByLabelText('Delete Store Trading Event'));
    await fireEvent.press(screen.getByText('Delete'));
    expect(mockService.deleteEvent).toHaveBeenCalledWith('a');
    expect(screen.queryByText('Store Trading Event')).toBeNull();
  });

  it('says so when migration 081 is not applied', async () => {
    mockService = service([]);
    mockService.getAdminEvents.mockRejectedValue(new PinRepositoryError('NOT_FOUND', 'Events are not available yet.'));
    await render(<AdminEventsScreen />);
    expect(await screen.findByText(/migration 081/)).toBeTruthy();
  });
});

describe('demo events (screenshots, #613)', () => {
  it('serve published, upcoming events to Home and every event to Admin', async () => {
    const { createDemoEvents } = jest.requireActual('../mock-data/events') as typeof import('../mock-data/events');
    const demo = createDemoEvents();
    const today = new Date().toISOString().slice(0, 10);
    const shown = await demo.getEvents();
    expect(shown.every(e => e.published && (e.endDate ?? e.eventDate) >= today)).toBe(true);
    const all = await demo.getAdminEvents();
    expect(all.some(e => !e.published)).toBe(true);
    const added = await demo.saveEvent({ title: 'Demo meet', eventDate: '2999-01-01', published: true });
    expect((await demo.getEvents()).map(e => e.id)).toContain(added.id);
    await demo.setEventPublished(added.id, false);
    expect((await demo.getEvents()).map(e => e.id)).not.toContain(added.id);
    await demo.deleteEvent(added.id);
    expect((await demo.getAdminEvents()).map(e => e.id)).not.toContain(added.id);
  });
});
