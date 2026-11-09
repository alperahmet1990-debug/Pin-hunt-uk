/**
 * WP1 / #32: proposals carry the agreed pins (migration 070). Chat pre-ticks
 * the pins shared in the conversation; the trade screen shows the agreed pins,
 * lets either side change them while waiting, and accepts the version shown.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

let mockParams: Record<string, string> = {};
let mockTrade: Record<string, unknown> = {};
const mockPropose = jest.fn();
const mockAccept = jest.fn();
const mockSetItems = jest.fn();
const at = (m: number) => `2026-11-09T10:0${m}:00Z`;
const mockRepo = {
  getTrade: () => Promise.resolve(mockTrade),
  acceptTrade: (...args: unknown[]) => { mockAccept(...args); return Promise.resolve({ ...mockTrade, status: 'accepted' }); },
  setTradeItems: (...args: unknown[]) => { mockSetItems(...args); return Promise.resolve(mockTrade); },
  proposeTradeInChat: (...args: unknown[]) => { mockPropose(...args); return Promise.resolve({ id: 't9', status: 'pending' }); },
  getPotentialTrades: () => Promise.resolve([]),
  getTraderRating: () => Promise.resolve(null),
  getPinsByIds: () => Promise.resolve([]),
  getContactPreferences: () => Promise.resolve({ acceptsMessages: true, acceptsTradeRequests: true }),
  getConversation: () => Promise.resolve({
    id: 'c1', participantAId: 'u1', participantBId: 'u2', createdAt: '2026-11-09T10:00:00Z',
    otherParticipant: { id: 'u2', username: 'bea' },
  }),
  getConversationMessages: () => Promise.resolve([
    { id: 'm1', conversationId: 'c1', senderId: 'u1', body: '', messageType: 'pin_share', pinIds: ['PHUK-1'], forTradePinIds: ['PHUK-1'], photoUrls: [], createdAt: at(1) },
    { id: 'm2', conversationId: 'c1', senderId: 'u2', body: '', messageType: 'pin_share', pinIds: ['PHUK-2'], forTradePinIds: [], photoUrls: [], createdAt: at(2) },
  ]),
  getCommunityPost: () => Promise.resolve(null),
};
const mockPins = [
  { id: 'PHUK-1', title: 'Mickey Classic', collection: 'Park Icons', characters: [], brand: 'Disneyland Paris' },
  { id: 'PHUK-2', title: 'Dumbo Blue Sky', collection: 'Park Icons', characters: [], brand: 'Disneyland Paris' },
];

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
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins, ensurePins: () => Promise.resolve() }) }));

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
const item = (id: string, direction: 'offered' | 'requested', pinhuntId: string, title: string) =>
  ({ id, tradeId: 't1', direction, pinhuntId, title, quantity: 1, createdAt: at(0) });
const baseTrade = {
  id: 't1', initiatorId: 'u2', recipientId: 'u1', status: 'pending', messages: [], itemsVersion: 4,
  createdAt: at(0), updatedAt: at(0),
};

describe('Propose Trade in chat sends the pins (#32)', () => {
  beforeEach(() => { mockParams = { id: 'c1' }; mockPropose.mockClear(); });

  it('pre-ticks the pins shared in chat and sends them as offered/requested', async () => {
    const ChatScreen = require('../app/community/chat/[id]').default;
    await render(<ChatScreen />);
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Propose Trade' }));
    expect(screen.getByRole('header', { name: 'Propose a trade' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: "I'll give: Mickey Classic" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: "I'd like: Dumbo Blue Sky" }).props.accessibilityState.checked).toBe(true);

    const buttons = screen.getAllByRole('button', { name: 'Propose Trade' });
    await fireEvent.press(buttons[buttons.length - 1]);
    await settle();
    const [, sent] = mockPropose.mock.calls[0];
    expect(mockPropose.mock.calls[0][0]).toBe('c1');
    expect(sent).toHaveLength(2);
    expect(sent).toEqual(expect.arrayContaining([
      { pinhuntId: 'PHUK-1', direction: 'offered' },
      { pinhuntId: 'PHUK-2', direction: 'requested' },
    ]));
  }, 30_000);

  it('sends only the pins left ticked', async () => {
    const ChatScreen = require('../app/community/chat/[id]').default;
    await render(<ChatScreen />);
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Propose Trade' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: "I'd like: Dumbo Blue Sky" }));
    const buttons = screen.getAllByRole('button', { name: 'Propose Trade' });
    await fireEvent.press(buttons[buttons.length - 1]);
    await settle();
    expect(mockPropose).toHaveBeenCalledWith('c1', [{ pinhuntId: 'PHUK-1', direction: 'offered' }]);
  }, 30_000);
});

describe('Trade screen shows the agreed pins (#32)', () => {
  beforeEach(() => { mockParams = { id: 't1' }; mockAccept.mockClear(); mockSetItems.mockClear(); });

  it('shows the pins from my side and accepts the version on screen', async () => {
    mockTrade = { ...baseTrade, items: [item('i1', 'offered', 'PHUK-2', 'Dumbo Blue Sky'), item('i2', 'requested', 'PHUK-1', 'Mickey Classic')] };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.getByRole('header', { name: 'Pins in this trade' })).toBeTruthy();
    // u1 is the recipient: the proposer's offered pin is what u1 gets.
    expect(screen.getByLabelText('You get: Dumbo Blue Sky')).toBeTruthy();
    expect(screen.getByLabelText('You give: Mickey Classic')).toBeTruthy();
    expect(screen.queryByText('Potential match')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    await settle();
    expect(mockAccept).toHaveBeenCalledWith('t1', 4);
  }, 30_000);

  it('lets the other side change the pins while waiting', async () => {
    mockTrade = { ...baseTrade, items: [item('i1', 'offered', 'PHUK-2', 'Dumbo Blue Sky'), item('i2', 'requested', 'PHUK-1', 'Mickey Classic')] };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Change pins' }));
    expect(screen.getByRole('header', { name: 'Change the pins' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: "I'll give: Mickey Classic" }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save Pins' }));
    await settle();
    expect(mockSetItems).toHaveBeenCalledWith('t1', [{ pinhuntId: 'PHUK-2', direction: 'offered' }]);
  }, 30_000);

  it('asks for pins before accepting a trade that has none', async () => {
    mockTrade = { ...baseTrade, items: [] };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add Pins' }));
    expect(screen.getByRole('header', { name: 'Add the pins' })).toBeTruthy();
    expect(mockAccept).not.toHaveBeenCalled();
  }, 30_000);

  it('freezes the pins once accepted', async () => {
    mockTrade = { ...baseTrade, status: 'accepted', items: [item('i1', 'offered', 'PHUK-2', 'Dumbo Blue Sky')] };
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.getByRole('header', { name: 'Agreed pins' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change pins' })).toBeNull();
  }, 30_000);
});
