import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { PinRepositoryError, type CommunityPrice } from '@workspace/pin-repository';
import { ValueDisplay } from '../components/ui/ValueDisplay';
import { resetCommunityPriceCacheForTests } from '../hooks/useCommunityPrice';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// CV-04 (#515): market and community prices side by side on the pin page.

let mockPrices: Record<string, CommunityPrice | null> = {};
let mockServiceError: unknown = null;
let mockService: object | null = null;

jest.mock('@/lib/communityPriceService', () => ({ getCommunityPriceService: () => mockService }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: null }) }));

const service = {
  getCommunityPrice: jest.fn(async (pinId: string, currency: string) => {
    if (mockServiceError) throw mockServiceError;
    return mockPrices[`${pinId}|${currency}`] ?? null;
  }),
};

const ukMarket = (confidence: 'medium' | 'high', mid = 12) => ({
  estimates: [{
    marketplace: 'EBAY_GB', currency: 'GBP', estimatedLow: mid - 3, estimatedMid: mid, estimatedHigh: mid + 3,
    comparableCount: 8, confidence, calculatedAt: new Date().toISOString(), expiresAt: '', stale: false,
  }],
  comparables: [{ ebayItemId: '1', marketplace: 'EBAY_GB', title: 'Pin', itemUrl: null, imageUrl: null, itemPrice: 12, deliveryPrice: 0, totalPrice: 12, currency: 'GBP', condition: null }],
  ebayConfigured: true,
});
let mockMarket: unknown = { estimates: [], comparables: [], ebayConfigured: true };

const early = (entries: number[]): CommunityPrice => ({
  pinId: 'p1', currency: 'GBP', collectorCount: entries.length, median: entries.reduce((a, b) => a + b, 0) / entries.length,
  low: Math.min(...entries), high: Math.max(...entries), entries, step: 'early',
});
const confident = (median: number, n = 11): CommunityPrice => ({
  pinId: 'p1', currency: 'GBP', collectorCount: n, median, low: median - 2, high: median + 2, step: 'confident',
});

beforeEach(() => {
  jest.clearAllMocks();
  resetCommunityPriceCacheForTests();
  resetPriceCurrencyForTests();
  mockPrices = {};
  mockServiceError = null;
  mockService = service;
  mockMarket = { estimates: [], comparables: [], ebayConfigured: true };
  globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockMarket) })) as unknown as typeof fetch;
});

const card = () => screen.findByTestId('two-price-card');

describe('two-price value card (CV-04)', () => {
  it('both confident and close: two tiles and an agreement line', async () => {
    mockMarket = ukMarket('high', 12);
    mockPrices['p1|GBP'] = confident(14);
    await render(<ValueDisplay pinId="p1" />);
    await card();
    const market = await screen.findByTestId('market-price-tile');
    expect(within(market).getByText('£12')).toBeTruthy();
    expect(within(market).getByText(/8 eBay UK listings, asking prices/)).toBeTruthy();
    const community = screen.getByTestId('community-price-tile');
    expect(within(community).getByText('£14')).toBeTruthy();
    expect(within(community).getByText('£12 – £16')).toBeTruthy();
    expect(within(community).getByText(/11 collectors/)).toBeTruthy();
    expect(screen.getByText('The market and collectors agree: about £12 – £14')).toBeTruthy();
  });

  it('far apart: says which way collectors lean', async () => {
    mockMarket = ukMarket('high', 10);
    mockPrices['p1|GBP'] = confident(30);
    await render(<ValueDisplay pinId="p1" />);
    expect(await screen.findByText('Collectors price this higher than the market')).toBeTruthy();
  });

  it('early community price, no market: full-size price with the entries and no names', async () => {
    mockPrices['p1|GBP'] = early([12, 15]);
    await render(<ValueDisplay pinId="p1" />);
    await card();
    const community = screen.getByTestId('community-price-tile');
    const amount = within(community).getByText('£13.50');
    expect(within(community).getByText('£12 and £15')).toBeTruthy();
    expect(within(community).getByText(/priced by 2 collectors/)).toBeTruthy();
    expect(screen.getByTestId('market-price-empty')).toBeTruthy();
    // An early price is the same size as a confident one.
    expect(amount.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 28 })]));
    expect(screen.queryByText(/agree/)).toBeNull();
  });

  it('one collector reads "priced by 1 collector"', async () => {
    mockPrices['p1|GBP'] = early([9]);
    await render(<ValueDisplay pinId="p1" />);
    await card();
    expect(within(screen.getByTestId('community-price-tile')).getByText(/priced by 1 collector$/)).toBeTruthy();
  });

  it('market only: the community tile invites an owner to price it', async () => {
    mockMarket = ukMarket('medium', 6);
    const onAddPrice = jest.fn();
    await render(<ValueDisplay pinId="p1" canPrice onAddPrice={onAddPrice} />);
    await card();
    expect(await screen.findByText(/Growing/)).toBeTruthy();
    expect(screen.getByText('Be the first to price this pin.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add your price' }));
    expect(onAddPrice).toHaveBeenCalled();
  });

  it('only owners get "Add your price"', async () => {
    mockPrices['p1|GBP'] = early([12]);
    await render(<ValueDisplay pinId="p1" canPrice={false} onAddPrice={jest.fn()} />);
    await card();
    expect(screen.queryByRole('button', { name: /Add your price/ })).toBeNull();
    expect(screen.queryByText('Be the first to price this pin.')).toBeNull();
  });

  it('neither price: says the pin hasn’t been priced yet', async () => {
    await render(<ValueDisplay pinId="p1" />);
    await card();
    expect(screen.getByText('No collector prices yet')).toBeTruthy();
    expect(screen.getByText('This pin hasn’t been priced yet.')).toBeTruthy();
  });

  it('US: dollars for the community price, and no UK market figure', async () => {
    mockMarket = ukMarket('high', 12);
    mockPrices['p1|GBP'] = confident(14);
    mockPrices['p1|USD'] = { ...early([20]), currency: 'USD' };
    await render(<ValueDisplay pinId="p1" />);
    await card();
    await fireEvent.press(screen.getByRole('radio', { name: 'US prices, dollars' }));
    await waitFor(() => expect(within(screen.getByTestId('community-price-tile')).getByText('$20')).toBeTruthy());
    expect(screen.getByText('US market prices are coming.')).toBeTruthy();
    expect(service.getCommunityPrice).toHaveBeenCalledWith('p1', 'USD');
  });

  it('keeps the earlier layout when community prices are not available yet', async () => {
    mockServiceError = new PinRepositoryError('NOT_FOUND', 'Community prices are not available yet.');
    await render(<ValueDisplay pinId="p1" catalogueEstimateGBP={null} />);
    expect(await screen.findByText('No value yet')).toBeTruthy();
    expect(screen.queryByTestId('two-price-card')).toBeNull();
  });

  it('keeps the earlier layout with no price source at all', async () => {
    mockService = null;
    await render(<ValueDisplay pinId="p1" catalogueEstimateGBP={18} />);
    expect(await screen.findByText('£18.00')).toBeTruthy();
    expect(screen.queryByTestId('two-price-card')).toBeNull();
  });
});
