/**
 * #352: Home's "What's Happening" never vanishes. With events coming up it
 * shows them; once they've all passed it says so and offers to post one.
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
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'demo', isAdmin: false }, loading: false }) }));
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

describe("Home: What's Happening (#352)", () => {
  it('shows upcoming events and leaves out past ones', async () => {
    mockEvents = [past, upcoming];
    await render(<HomeScreen />);
    expect(screen.getByText('What’s Happening')).toBeTruthy();
    expect(screen.getByText('Disney Pin Trading Day')).toBeTruthy();
    expect(screen.queryByText('Old Meet')).toBeNull();
    expect(screen.queryByTestId('no-events-card')).toBeNull();
  });

  it('says when nothing is coming up and offers to post an event', async () => {
    mockEvents = [past];
    await render(<HomeScreen />);
    expect(screen.getByText('What’s Happening')).toBeTruthy();
    expect(screen.getByText('No events coming up')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'No events coming up. Post an event' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/community/create-post', params: { type: 'new_pickup' } });
  });
});
