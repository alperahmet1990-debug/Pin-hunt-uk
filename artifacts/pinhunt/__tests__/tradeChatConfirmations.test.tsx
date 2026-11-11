/**
 * WP1 (trading in chat): trade confirmations are in-app dialogs, not
 * Alert.alert (whose callbacks don't run on Expo web), and Propose Trade is
 * pinned above the composer instead of scrolling away in the message list.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

let mockParams: Record<string, string> = {};
let mockTrade: Record<string, unknown> = {};
const mockCancelTrade = jest.fn();
const mockMarkReceived = jest.fn();
const mockRepo = {
  getTrade: () => Promise.resolve(mockTrade),
  cancelTrade: (id: string) => { mockCancelTrade(id); return Promise.resolve({ ...mockTrade, status: 'cancelled' }); },
  markTradeReceived: (id: string) => { mockMarkReceived(id); return Promise.resolve({ ...mockTrade }); },
  getPotentialTrades: () => Promise.resolve([]),
  getTraderRating: () => Promise.resolve(null),
  getPinsByIds: () => Promise.resolve([]),
  getContactPreferences: () => Promise.resolve({ acceptsMessages: true, acceptsTradeRequests: true }),
  getConversation: () => Promise.resolve({
    id: 'c1', participantAId: 'u1', participantBId: 'u2', createdAt: '2026-10-13T10:00:00Z',
    otherParticipant: { id: 'u2', username: 'bea' },
  }),
  getConversationMessages: () => Promise.resolve(Array.from({ length: 200 }, (_, i) => ({
    id: `m${i + 1}`, conversationId: 'c1', senderId: i % 2 ? 'u1' : 'u2', body: `Message ${i + 1}`,
    messageType: 'text', pinIds: [], forTradePinIds: [], photoUrls: [],
    createdAt: new Date(Date.UTC(2026, 9, 13, 10, 0, i)).toISOString(),
  }))),
  getCommunityPost: () => Promise.resolve(null),
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), MediaTypeOptions: {} }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ totalUnread: 0, markRead: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [], ensurePins: () => Promise.resolve() }) }));

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
const baseTrade = {
  id: 't1', initiatorId: 'u1', recipientId: 'u2', status: 'accepted', messages: [],
  createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T11:05:00Z',
};

describe('Trade screen confirmations are in-app (WP1)', () => {
  beforeEach(() => { mockParams = { id: 't1' }; mockCancelTrade.mockClear(); mockMarkReceived.mockClear(); });

  it('Cancel Trade asks in an in-app dialog; No does nothing, Yes cancels', async () => {
    mockTrade = { ...baseTrade };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();

    await fireEvent.press(screen.getByText('Cancel Trade'));
    expect(screen.getByRole('header', { name: 'Cancel trade?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'No' }));
    expect(mockCancelTrade).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Cancel trade?' })).toBeNull();

    await fireEvent.press(screen.getByText('Cancel Trade'));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, cancel' }));
    await settle();
    expect(mockCancelTrade).toHaveBeenCalledWith('t1');
  }, 30_000);

  it('I\'ve Received Their Pins asks in an in-app dialog before confirming', async () => {
    mockTrade = { ...baseTrade, recipientPostedAt: '2026-10-14T09:00:00Z' };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();

    await fireEvent.press(screen.getByText("I've Received Their Pins"));
    expect(screen.getByRole('header', { name: 'Received their pins?' })).toBeTruthy();
    expect(mockMarkReceived).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, received' }));
    await settle();
    expect(mockMarkReceived).toHaveBeenCalledWith('t1');
  }, 30_000);
});

describe('Propose Trade placement (WP1)', () => {
  it('sits above the composer, outside the message list, in a long chat', async () => {
    mockParams = { id: 'c1' };
    const ChatScreen = require('../app/community/chat/[id]').default;
    await render(<ChatScreen />);
    const list = await screen.findByTestId('chat-messages');
    await settle();
    expect(screen.getByText('Propose Trade')).toBeTruthy();
    expect(within(list).queryByText('Propose Trade')).toBeNull();
  }, 30_000);
});
