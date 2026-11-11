/**
 * WP1 step 2: "N trades need you" on Home's For You and a badge on Profile's
 * Trades row (trades_waiting_for_me, migration 071). The count refreshes on
 * focus, and nothing shows while the call fails (before 071 is applied).
 */
import React from 'react';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockWaiting: () => Promise<number> = () => Promise.resolve(2);
const noopPromise = () => Promise.resolve([]);
const mockRepo = {
  getTradesWaitingCount: () => mockWaiting(),
  getCommunityFeed: noopPromise, getCommunityPost: () => Promise.resolve(null), getPinsByIds: noopPromise, getSetSummaries: noopPromise,
};
const mockEnsure = () => Promise.resolve();

jest.mock('@/mock-data/events', () => ({ EVENTS: [] }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  // Runs the focus callback once, as a mounted, focused screen would.
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
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

import { tradesWaitingLine, useTradesWaiting } from '../hooks/useTradesWaiting';

beforeEach(() => { jest.clearAllMocks(); mockWaiting = () => Promise.resolve(2); });

describe('useTradesWaiting', () => {
  it('reads the count on focus', async () => {
    const { result } = await renderHook(() => useTradesWaiting());
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it('stays at 0 when the call fails (before migration 071)', async () => {
    mockWaiting = () => Promise.reject(new Error('function trades_waiting_for_me() does not exist'));
    const { result } = await renderHook(() => useTradesWaiting());
    await new Promise(r => setTimeout(r, 0));
    expect(result.current.count).toBe(0);
  });

  it('words the line for one and many', () => {
    expect(tradesWaitingLine(1)).toBe('1 trade needs you');
    expect(tradesWaitingLine(3)).toBe('3 trades need you');
  });
});

describe('Home For You', () => {
  it('shows "N trades need you" and opens Trades', async () => {
    const HomeScreen = require('../app/(tabs)/index').default;
    await render(<HomeScreen />);
    const row = await screen.findByRole('button', { name: /^2 trades need you\./ });
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/my-trades');
  }, 30_000);

  it('shows nothing when no trade waits', async () => {
    mockWaiting = () => Promise.resolve(0);
    const HomeScreen = require('../app/(tabs)/index').default;
    await render(<HomeScreen />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText(/trades? needs? you/)).toBeNull();
  }, 30_000);
});

describe('Profile Trades row', () => {
  it('carries the waiting count as a badge', async () => {
    const ProfileScreen = require('../app/(tabs)/profile').default;
    await render(<ProfileScreen />);
    expect(await screen.findByLabelText('Trades, 2 new')).toBeTruthy();
  }, 30_000);
});
