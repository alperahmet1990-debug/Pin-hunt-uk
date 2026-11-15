/**
 * Home redesign G (Nov 2026): the header, the three stat tiles, Find a pin /
 * Submit a new pin, the one "needs you" line and the zero-pin state.
 * ISO and For trade are distinct states and must open their own tabs.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { needsYouParts } from '../utils/needsYou';

const mockPush = jest.fn();
const noopPromise = () => Promise.resolve([]);
const mockRepo = { getCommunityFeed: noopPromise, getCommunityPost: () => Promise.resolve(null), getPinsByIds: noopPromise, getSetSummaries: noopPromise, getTradesWaitingCount: () => Promise.resolve(0) };
const mockEnsure = jest.fn(() => Promise.resolve());
const entry = (pinId: string, status: string, dateAdded: string) => ({ pinId, status, quantity: 1, notes: '', dateAdded });
const FULL = {
  p1: entry('p1', 'owned', '2026-10-01'), p2: entry('p2', 'for_trade', '2026-10-03'), p3: entry('p3', 'owned', '2026-10-02'),
  p4: entry('p4', 'owned', '2026-09-01'), p5: entry('p5', 'wanted', '2026-10-04'), p6: entry('p6', 'wanted', '2026-10-05'),
};
let mockCollection: Record<string, unknown> = FULL;
let mockUnread = 0;
let mockSubmissions = 0;
const mockPins = ['p1', 'p2', 'p3', 'p4'].map(id => ({ id, title: `Pin ${id}`, collection: 'Park Icons', characters: [], imageUrl: `https://example.test/${id}.png` }));

jest.mock('@/mock-data/events', () => ({ EVENTS: [] }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/components/AddPinsWelcomeSheet', () => ({ AddPinsWelcomeSheet: () => null }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null, signOut: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'demo', isAdmin: false }, loading: false }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ totalUnread: mockUnread }) }));
jest.mock('@/context/SubmissionNotificationsContext', () => ({ useSubmissionNotifications: () => ({ unseenCount: mockSubmissions }) }));
jest.mock('@/hooks/useTradesWaiting', () => ({ ...jest.requireActual('@/hooks/useTradesWaiting'), useTradesWaiting: () => ({ count: 0 }) }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false, loading: false }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: () => undefined, markViewed: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: mockRepo, ensurePins: mockEnsure, ensureCollections: mockEnsure, loading: false }),
}));

import HomeScreen from '../app/(tabs)/index';

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection = FULL;
  mockUnread = 0;
  mockSubmissions = 0;
});

describe('Home stat tiles', () => {
  it('keep the counting rules: owned + for trade, wanted, for trade', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('button', { name: '4 total pins. Open your collection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2 ISO. Open your ISO list' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 for trade. Open your For Trade list' })).toBeTruthy();
  }, 30_000);

  it.each([
    ['home-stat-total', 'all'],
    ['home-stat-iso', 'iso'],
    ['home-stat-trade', 'traders'],
  ])('%s opens Collection on the %s view', async (testID, tab) => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId(testID));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/collection', params: { tab } });
  });

  it('Total pins shows the three newest owned pins, not ISO', async () => {
    const { toJSON } = await render(<HomeScreen />);
    const uris = JSON.stringify(toJSON()).match(/https:\/\/example\.test\/p\d\.png/g) ?? [];
    expect([...new Set(uris)]).toEqual(['https://example.test/p2.png', 'https://example.test/p3.png', 'https://example.test/p1.png']);
  });
});

describe('Home actions and header', () => {
  it('Find a pin opens the scanner', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Find a pin\./ }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/scan');
  });

  it('Submit a new pin opens the photo-first submission flow', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Submit a new pin\./ }));
    expect(mockPush).toHaveBeenCalledWith('/add-pin');
  });

  it('Find a pin and Submit a new pin get the same size: neither button carries its own padding or border', async () => {
    await render(<HomeScreen />);
    const find = screen.getByRole('button', { name: /^Find a pin\./ });
    const submit = screen.getByRole('button', { name: /^Submit a new pin\./ });
    // Padding or a border on one button made it wider than the other (flex: 1 shares space after padding).
    const outer = (el: { props: { style?: unknown } }) => {
      const { opacity: _opacity, ...rest } = Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean));
      return rest;
    };
    expect(outer(submit)).toEqual(outer(find));
    expect(outer(find)).not.toHaveProperty('padding');
    expect(outer(find)).not.toHaveProperty('paddingHorizontal');
    expect(outer(find)).not.toHaveProperty('borderWidth');
  });

  it('shows the app name, Messages with its count, and the avatar opens Edit profile', async () => {
    mockUnread = 3;
    await render(<HomeScreen />);
    expect(screen.getByText('PinHunt')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Messages, 3 unread' }));
    expect(mockPush).toHaveBeenCalledWith('/community/conversations');
    await fireEvent.press(screen.getByRole('button', { name: 'Open profile' }));
    expect(mockPush).toHaveBeenCalledWith('/edit-profile');
  });
});

describe('Home needs-you line', () => {
  it('is hidden when nothing is waiting', async () => {
    await render(<HomeScreen />);
    expect(screen.queryByTestId('home-needs-you')).toBeNull();
  });

  it('combines what is waiting and opens the first', async () => {
    mockUnread = 2;
    mockSubmissions = 1;
    await render(<HomeScreen />);
    expect(screen.getByText('2 unread messages · 1 submission update')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-needs-you'));
    expect(mockPush).toHaveBeenCalledWith('/community/conversations');
  });

  it('orders trades, then messages, then submissions', () => {
    expect(needsYouParts({ trades: 2, messages: 1, submissions: 3 }).map(p => [p.text, p.route])).toEqual([
      ['2 trades need you', '/my-trades'],
      ['1 unread message', '/community/conversations'],
      ['3 submission updates', '/my-submissions'],
    ]);
    expect(needsYouParts({ trades: 0, messages: 0, submissions: 1 })[0].route).toBe('/my-submissions');
    expect(needsYouParts({ trades: 0, messages: 0, submissions: 0 })).toEqual([]);
  });
});

describe('Home with zero pins', () => {
  it('shows zeros, empty thumbnails and one "Add the pins you own" line', async () => {
    mockCollection = {};
    await render(<HomeScreen />);
    expect(screen.getByRole('button', { name: '0 total pins. Open your collection' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-add-first'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/browse-catalogue', params: { mode: 'add' } });
  });

  it('puts that line right under the tiles, above Find a pin, so it stays above the fold', async () => {
    mockCollection = {};
    const { toJSON } = await render(<HomeScreen />);
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('home-stat-trade')).toBeLessThan(tree.indexOf('home-add-first'));
    expect(tree.indexOf('home-add-first')).toBeLessThan(tree.indexOf('Find a pin. Scan'));
  });

  it('hides that line once a pin is owned', async () => {
    await render(<HomeScreen />);
    expect(screen.queryByTestId('home-add-first')).toBeNull();
  });
});
