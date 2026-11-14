/**
 * WP1 step 3: when a trade is complete, each collector is offered "Update
 * your collection?" once, applied in one write with Undo; and the agreed pins
 * show "UK asking ~£x" only for confident UK values.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TradeCollectionUpdateSheet } from '../components/TradeCollectionUpdateSheet';

let mockTrade: Record<string, unknown> = {};
const mockRestore = jest.fn();
const mockToast = jest.fn();
const at = (m: number) => `2026-11-14T10:0${m}:00Z`;
const mockRepo = {
  getTrade: () => Promise.resolve(mockTrade),
  getPotentialTrades: () => Promise.resolve([]),
  getTraderRating: () => Promise.resolve(null),
  getConversationIdForTrade: () => Promise.resolve('c1'),
};
const mockCollection = {
  'PHUK-1': { pinId: 'PHUK-1', status: 'for_trade', quantity: 1, notes: '', dateAdded: at(0) },
  'PHUK-2': { pinId: 'PHUK-2', status: 'wanted', quantity: 1, notes: '', dateAdded: at(0) },
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 't1' }),
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, restoreEntries: mockRestore }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [], ensurePins: () => Promise.resolve() }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };
const completed = {
  id: 't1', initiatorId: 'u1', recipientId: 'u2', status: 'completed', messages: [],
  initiatorPostedAt: at(1), recipientPostedAt: at(1), initiatorReceivedAt: at(2), recipientReceivedAt: at(3),
  createdAt: at(0), updatedAt: at(3),
  items: [
    { id: 'i1', tradeId: 't1', direction: 'offered', pinhuntId: 'PHUK-1', title: 'Mickey Classic', quantity: 1, createdAt: at(0) },
    { id: 'i2', tradeId: 't1', direction: 'requested', pinhuntId: 'PHUK-2', title: 'Dumbo Blue Sky', quantity: 1, createdAt: at(0) },
  ],
};

beforeEach(async () => {
  mockRestore.mockClear();
  mockToast.mockClear();
  await AsyncStorage.clear();
  mockTrade = completed;
  globalThis.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ values: {
      'PHUK-1': { marketplace: 'EBAY_GB', currency: 'GBP', mid: 14.4, confidence: 'medium', calculatedAt: at(0), stale: false },
      'PHUK-2': { marketplace: 'EBAY_GB', currency: 'GBP', mid: 30, confidence: 'low', calculatedAt: at(0), stale: false },
    } }),
  })) as unknown as typeof fetch;
});

describe('Update your collection? (WP1 step 3)', () => {
  it('opens once by itself, applies in one write, and Undo puts it back', async () => {
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.getByRole('header', { name: 'Update your collection?' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Mickey Classic: Remove from your collection' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Dumbo Blue Sky: Mark Owned and take off your ISO' }).props.accessibilityState.checked).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Update Collection' }));
    expect(mockRestore).toHaveBeenCalledTimes(1);
    const [applied] = mockRestore.mock.calls[0];
    expect(Object.fromEntries(applied)).toEqual({
      'PHUK-1': undefined,
      'PHUK-2': expect.objectContaining({ status: 'owned', quantity: 1 }),
    });

    const toast = mockToast.mock.calls[0][0];
    expect(toast.message).toBe('Collection updated');
    await act(async () => { toast.action.onPress(); });
    expect(Object.fromEntries(mockRestore.mock.calls[1][0])).toEqual(mockCollection);
  }, 30_000);

  it("isn't offered by itself a second time, but stays a button", async () => {
    await AsyncStorage.setItem('@pinhunt_trade_collection_update_v1:u1:t1', at(4));
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.queryByRole('header', { name: 'Update your collection?' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Update Your Collection' }));
    expect(screen.getByRole('header', { name: 'Update your collection?' })).toBeTruthy();
  }, 30_000);

  it('Not Now changes nothing', async () => {
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Not Now' }));
    expect(mockRestore).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('@pinhunt_trade_collection_update_v1:u1:t1')).not.toBeNull();
  }, 30_000);
});

describe("A trade's update can't be applied twice (QA finding)", () => {
  const APPLIED = '@pinhunt_trade_collection_applied_v1:u1:t1';
  const ANSWERED = '@pinhunt_trade_collection_update_v1:u1:t1';

  it('hides Update Your Collection once applied, and Undo brings it back', async () => {
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Update Collection' }));
    await settle();
    expect(screen.queryByRole('button', { name: 'Update Your Collection' })).toBeNull();
    expect(await AsyncStorage.getItem(APPLIED)).not.toBeNull();

    await act(async () => { mockToast.mock.calls[0][0].action.onPress(); });
    await settle();
    expect(await AsyncStorage.getItem(APPLIED)).toBeNull();
    expect(screen.getByRole('button', { name: 'Update Your Collection' })).toBeTruthy();
  }, 30_000);

  it('a trade already applied offers neither the sheet nor the button', async () => {
    await AsyncStorage.setItem(APPLIED, at(5));
    await AsyncStorage.setItem(ANSWERED, at(5));
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.queryByRole('header', { name: 'Update your collection?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update Your Collection' })).toBeNull();
  }, 30_000);

  it('opening the sheet by itself does not count as an answer', async () => {
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await settle();
    expect(screen.getByRole('header', { name: 'Update your collection?' })).toBeTruthy();
    expect(await AsyncStorage.getItem(ANSWERED)).toBeNull();
  }, 30_000);

  it("a collection sync while the sheet is open doesn't re-tick a row", async () => {
    const rows = [
      { key: 'give:A:1', pinhuntId: 'A', title: 'Pin A', side: 'give' as const, quantity: 1, action: 'Remove from your collection' },
      { key: 'get:B:2', pinhuntId: 'B', title: 'Pin B', side: 'get' as const, quantity: 1, action: 'Mark Owned' },
    ];
    const view = await render(<TradeCollectionUpdateSheet visible rows={rows} onClose={jest.fn()} onApply={jest.fn()} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Pin A: Remove from your collection' }));
    await view.rerender(<TradeCollectionUpdateSheet visible rows={rows.map(r => ({ ...r }))} onClose={jest.fn()} onApply={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Pin A: Remove from your collection' }).props.accessibilityState.checked).toBe(false);
  }, 30_000);
});

describe('UK asking chip (WP1 step 3)', () => {
  it('shows on the agreed pins only for a confident UK value', async () => {
    const TradeScreen = require('../app/trade/[id]').default;
    await render(<TradeScreen />);
    await waitFor(() => expect(screen.getAllByText('UK asking ~£14').length).toBeGreaterThan(0), { timeout: 2000 });
    expect(screen.queryByText('UK asking ~£30')).toBeNull();
  }, 30_000);
});
