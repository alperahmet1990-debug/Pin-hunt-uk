import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import TradeScreen from '../trade/[id]';

// UXR-10 (#676): the trade screen names the other collector.
const mockPush = jest.fn();
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
  Stack: { Screen: (props: { options: unknown }) => { mockSetOptions(props.options); return null; } },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false }));
jest.mock('@/context/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ isBlocked: () => false }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: [], restoreEntries: jest.fn(), ready: true }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [], ensurePins: jest.fn() }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) }));

const trade = {
  id: 't1', initiatorId: 'me', recipientId: 'ana-id', status: 'accepted', notes: 'Hi there',
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', items: [], messages: [],
};
let mockRepo: Record<string, unknown>;
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me' }) }));

function makeRepo(getProfileUsername: () => Promise<string | null>) {
  return {
    getTrade: jest.fn().mockResolvedValue(trade),
    getConversationIdForTrade: jest.fn().mockResolvedValue(null),
    getPotentialTrades: jest.fn().mockResolvedValue([]),
    getProfileUsername: jest.fn(getProfileUsername),
  };
}

describe('Trade screen: who the trade is with', () => {
  beforeEach(() => jest.clearAllMocks());

  it('names the collector in the title, note and timeline, and opens their profile', async () => {
    mockRepo = makeRepo(async () => 'ana');
    const { findByText, getByTestId } = await render(<TradeScreen />);
    expect(await findByText('@ana accepted')).toBeTruthy();
    expect(await findByText(/Note from @ana: Hi there/)).toBeTruthy();
    expect(mockSetOptions).toHaveBeenLastCalledWith({ title: 'Trade with @ana' });
    await fireEvent.press(getByTestId('trade-other-collector'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/collector/[username]', params: { username: 'ana' } });
  });

  it('still works with "the other collector" when the name cannot be read', async () => {
    mockRepo = makeRepo(async () => { throw new Error('nope'); });
    const { findByText, queryByTestId } = await render(<TradeScreen />);
    expect(await findByText('The other collector accepted')).toBeTruthy();
    await waitFor(() => expect(mockSetOptions).toHaveBeenLastCalledWith({ title: 'Trade with the other collector' }));
    expect(queryByTestId('trade-other-collector')).toBeNull();
  });
});
