/**
 * #382 (TestFlight feedback): "See all" under What's Happening opened an
 * empty Community page. The What's Happening page lists everything Home
 * draws from, grouped by when it is, and never goes blank.
 */
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { groupEventsByWhen } from '../utils/events';

const mockPush = jest.fn();
let mockEvents: unknown[] = [];
let mockPosts: unknown[] = [];
let mockBlocked = new Set<string>();

jest.mock('@/mock-data/events', () => ({ get EVENTS() { return mockEvents; } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), Stack: { Screen: () => null } }));
jest.mock('@/hooks/useCommunity', () => ({
  useCommunity: () => ({ repo: { getCommunityFeed: () => Promise.resolve(mockPosts) } }),
}));
jest.mock('@/context/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ blockedIds: mockBlocked }) }));

import EventsScreen from '../app/events';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const event = (id: string, title: string, offset: number, extra: object = {}) => ({
  id, title, description: '', eventDate: day(offset), location: 'Rochester', country: 'UK',
  eventType: 'Community Trading Event', badgeLabel: 'UK TRADING', sourceType: 'imported',
  sourceName: 'Get Ready Comics', sourceUrl: `https://example.test/${id}`, hasScheduledDate: true,
  createdAt: '2026-10-16T00:00:00.000Z', ...extra,
});
const post = (id: string, body: string, authorId = 'a1') => ({
  id, authorId, postType: 'new_pickup', body, photos: [], createdAt: new Date().toISOString(), locationText: 'Leeds',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEvents = [];
  mockPosts = [];
  mockBlocked = new Set();
});

describe('grouping events by when they are', () => {
  it('this week, this month, later, unconfirmed, then community posts', () => {
    const groups = groupEventsByWhen([
      event('a', 'Soon', 2), event('b', 'Next month', 20), event('c', 'Far', 90),
      event('d', 'Rumour', 5, { rumour: true }),
      { ...event('e', 'Meet-up', 0), sourceType: 'community', hasScheduledDate: false },
    ] as never);
    expect(groups.map(g => [g.title, g.events.map(e => e.title)])).toEqual([
      ['This week', ['Soon']], ['This month', ['Next month']], ['Later', ['Far']],
      ['Date to be confirmed', ['Rumour']], ['From the community', ['Meet-up']],
    ]);
  });

  it('a multi-day event already under way counts as this week', () => {
    const groups = groupEventsByWhen([event('a', 'Ongoing', -1, { endDate: day(2) })] as never);
    expect(groups[0]).toMatchObject({ title: 'This week' });
  });
});

describe("What's Happening page (#382)", () => {
  it('shows curated events and community event posts together', async () => {
    mockEvents = [event('a', 'Disney Pin Trading Day', 3)];
    mockPosts = [post('p1', 'Pin meet-up at the park\nBring your traders')];
    await render(<EventsScreen />);
    expect(await screen.findByText('Pin meet-up at the park')).toBeTruthy();
    expect(screen.getByText('Disney Pin Trading Day')).toBeTruthy();
    expect(screen.getByText('THIS WEEK')).toBeTruthy();
    expect(screen.getByText('FROM THE COMMUNITY')).toBeTruthy();
    expect(screen.getByText('Via Get Ready Comics')).toBeTruthy();
  });

  it('opens a curated event at its source, and a community post in the app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockEvents = [event('a', 'Disney Pin Trading Day', 3)];
    mockPosts = [post('p1', 'Pin meet-up at the park')];
    await render(<EventsScreen />);
    await fireEvent.press(await screen.findByText('Pin meet-up at the park'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/community/post/[id]', params: { id: 'p1' } });
    await fireEvent.press(screen.getByText('Disney Pin Trading Day'));
    expect(open).toHaveBeenCalledWith('https://example.test/a');
  });

  it('leaves out past events and blocked authors', async () => {
    mockEvents = [event('old', 'Old meet', -10)];
    mockPosts = [post('p1', 'From someone blocked', 'blocked-1')];
    mockBlocked = new Set(['blocked-1']);
    await render(<EventsScreen />);
    expect(await screen.findByTestId('no-events')).toBeTruthy();
    expect(screen.queryByText('Old meet')).toBeNull();
    expect(screen.queryByText('From someone blocked')).toBeNull();
  });

  it('never goes blank: with nothing coming up, it offers to post an event', async () => {
    await render(<EventsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'No events coming up. Post an event' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/community/create-post', params: { type: 'new_pickup' } });
    expect(screen.getByRole('button', { name: 'Post an event' })).toBeTruthy();
  });
});
