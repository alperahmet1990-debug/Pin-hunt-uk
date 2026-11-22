import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { CommunityPrice } from '@workspace/pin-repository';
import { ValueDisplay } from '../components/ui/ValueDisplay';
import { resetCommunityPriceCacheForTests } from '../hooks/useCommunityPrice';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// UXR-36 (#702): the Asking price tile no longer says "No market price yet" beside a sold price.

let mockSold: unknown = { status: 'off' };
jest.mock('@/hooks/useSoldPrices', () => ({ useSoldPrices: () => mockSold }));
jest.mock('@/lib/communityPriceService', () => ({
  getCommunityPriceService: () => ({ getCommunityPrice: async () => mockCommunity }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: null }) }));

let mockCommunity: CommunityPrice | null = null;
let mockMarket: unknown = { estimates: [], comparables: [], ebayConfigured: true };

const soldReady = (market: 'UK' | 'US') => ({
  status: 'ready',
  valuations: [{ market, currency: market === 'UK' ? 'GBP' : 'USD', low: 20, fair: 25, high: 30, soldCount: 7, calculatedAt: '' }],
  request: { state: 'priced', checkedAt: null, nextRequestAt: null, requestsOpen: true, markets: [market] },
  error: null,
  requestPrice: jest.fn(),
});

beforeEach(() => {
  resetCommunityPriceCacheForTests();
  resetPriceCurrencyForTests();
  mockSold = { status: 'off' };
  mockCommunity = null;
  mockMarket = { estimates: [], comparables: [], ebayConfigured: true };
  globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockMarket) })) as unknown as typeof fetch;
});

describe('Asking price tile (UXR-36)', () => {
  it('sold UK value and no asking value: points to the sold prices', async () => {
    mockSold = soldReady('UK');
    await render(<ValueDisplay pinId="p1" />);
    const tile = await screen.findByTestId('market-price-empty');
    expect(within(tile).getByText('Asking price')).toBeTruthy();
    expect(within(tile).getByText('Sold prices are shown above')).toBeTruthy();
    expect(screen.queryByText(/No market price yet/)).toBeNull();
  });

  it('no sold value: still labelled Asking price, and explains the gap', async () => {
    await render(<ValueDisplay pinId="p1" />);
    const tile = await screen.findByTestId('market-price-empty');
    expect(within(tile).getByText('Asking price')).toBeTruthy();
    expect(within(tile).getByText(/No asking price yet/)).toBeTruthy();
    expect(screen.queryByText(/No market price yet/)).toBeNull();
  });

  it('a sold value for another market does not count', async () => {
    mockSold = soldReady('US');
    await render(<ValueDisplay pinId="p1" />);
    const tile = await screen.findByTestId('market-price-empty');
    expect(within(tile).queryByText('Sold prices are shown above')).toBeNull();
  });

  it('priced state is labelled Asking price too', async () => {
    mockMarket = {
      estimates: [{ marketplace: 'EBAY_GB', currency: 'GBP', estimatedLow: 9, estimatedMid: 12, estimatedHigh: 15, comparableCount: 8, confidence: 'high', calculatedAt: new Date().toISOString(), expiresAt: '', stale: false }],
      comparables: [{ ebayItemId: '1', marketplace: 'EBAY_GB', title: 'Pin', itemUrl: null, imageUrl: null, itemPrice: 12, deliveryPrice: 0, totalPrice: 12, currency: 'GBP', condition: null }],
      ebayConfigured: true,
    };
    await render(<ValueDisplay pinId="p1" />);
    const tile = await screen.findByTestId('market-price-tile');
    expect(within(tile).getByText('Asking price')).toBeTruthy();
    expect(within(tile).getByText(/eBay UK listings/)).toBeTruthy();
  });
});
