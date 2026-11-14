/**
 * #352: Home's events section never vanishes. With events coming up it
 * shows them (two compact cards since the Home redesign G, Nov 2026); once
 * they've all passed it says so and offers to post one.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const noopPromise = () => Promise.resolve([]);
const mockRepo = { getCommunityFeed: noopPromise, getCommunityPost: () => Promise.resolve(null), getPinsByIds: noopPromise, getSetSummaries: noopPromise };
const mockEnsure = () => Promise.resolve();
let mockEvents: unknown[] = [];

jest.mock('@/mock-data/events', () => ({ get EVENTS() { return mockEvents; } }));
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
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null, signOut: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'demo', displayName: 'someone.else', isAdmin: false }, loading: false }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ totalUnread: 0 }) }));
jest.mock('@/context/SubmissionNotificationsContext', () => ({ useSubmissionNotifications: () => ({ unseenCount: 0 }) }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false, loading: false }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: {}, getEntry: () => undefined, markViewed: jest.fn() }),
}));
jest.mock('@/context/BoardsContext', () => ({ useBoards: () => ({ customBoards: [], getBoardPins: () => [] }) }));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: [], repository: mockRepo, ensurePins: mockEnsure, ensureCollections: mockEnsure, loading: false }),
}));

import HomeScreen from '../app/(tabs)/index';

const upcoming = {
  id: 'e1', title: 'Disney Pin Trading Day', description: '', eventDate: '2999-01-01', location: 'Rochester', country: 'UK',
  eventType: 'Community Trading Event', badgeLabel: 'UK TRADING', sourceType: 'imported', sourceUrl: 'https://example.test/e1',
  hasScheduledDate: true, createdAt: '2026-10-16T00:00:00.000Z',
};
const past = { ...upcoming, id: 'e0', title: 'Old Meet', eventDate: '2000-01-01' };

beforeEach(() => jest.clearAllMocks());

describe('Home: Events (#352, compact since the Home redesign G)', () => {
  it('shows upcoming events as compact cards with date and place, and leaves out past ones', async () => {
    mockEvents = [past, upcoming];
    await render(<HomeScreen />);
    expect(screen.getByText('Events')).toBeTruthy();
    expect(screen.getByText('Disney Pin Trading Day')).toBeTruthy();
    expect(screen.getByText('Rochester')).toBeTruthy();
    expect(screen.getByText('JAN')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.queryByText('Old Meet')).toBeNull();
    expect(screen.queryByTestId('no-events-card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disney Pin Trading Day, 01 JAN, Rochester' })).toBeTruthy();
    // The first Home render in a run is slow on a cold cache.
  }, 20_000);

  it('a multi-day event shows its start date and says the range', async () => {
    mockEvents = [{ ...upcoming, eventDate: '2999-11-14', endDate: '2999-11-15' }];
    await render(<HomeScreen />);
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disney Pin Trading Day, 14–15 NOV, Rochester' })).toBeTruthy();
  });

  it('shows at most two events', async () => {
    mockEvents = [1, 2, 3].map(n => ({ ...upcoming, id: `e${n}`, title: `Meet ${n}`, eventDate: `2999-01-0${n}` }));
    await render(<HomeScreen />);
    expect(screen.getByText('Meet 1')).toBeTruthy();
    expect(screen.getByText('Meet 2')).toBeTruthy();
    expect(screen.queryByText('Meet 3')).toBeNull();
  });

  it('says when nothing is coming up and offers to post an event', async () => {
    mockEvents = [past];
    await render(<HomeScreen />);
    expect(screen.getByText('Events')).toBeTruthy();
    expect(screen.getByText('No events coming up')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'No events coming up. Post an event' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/community/create-post', params: { type: 'new_pickup' } });
  });

  it('"See all" opens the events page, not a filtered Community feed (#382)', async () => {
    mockEvents = [upcoming];
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'See all: Events' }));
    expect(mockPush).toHaveBeenCalledWith('/events');
  });
});
