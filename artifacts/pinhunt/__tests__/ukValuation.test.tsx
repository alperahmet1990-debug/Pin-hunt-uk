import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MarketValueSection } from '../components/MarketValueSection';
import { confidentUkEstimate, type EstimateLike } from '../utils/ukValuation';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/lib/apiBase', () => ({ API_BASE: 'http://api.test/api' }));

const gb = (over: Partial<EstimateLike> = {}) => ({
  marketplace: 'EBAY_GB' as const, currency: 'GBP', estimatedLow: 12, estimatedMid: 15, estimatedHigh: 20,
  comparableCount: 4, confidence: 'medium' as const, calculatedAt: new Date().toISOString(), expiresAt: '', stale: false, ...over,
});
const us = (over: Partial<EstimateLike> = {}) => ({ ...gb(), marketplace: 'EBAY_US' as const, currency: 'USD', estimatedLow: 30, estimatedMid: 33, estimatedHigh: 40, confidence: 'high' as const, ...over });
const comp = (marketplace: 'EBAY_GB' | 'EBAY_US', id = 'i1') => ({
  ebayItemId: id, marketplace, title: `Listing ${id}`, itemUrl: null, imageUrl: null, itemPrice: 14, deliveryPrice: null, totalPrice: null, currency: 'GBP', condition: 'New',
});

describe('confidentUkEstimate (B-P1-19)', () => {
  it('returns the GB estimate at medium or high confidence with GB listings', () => {
    expect(confidentUkEstimate([gb()], [comp('EBAY_GB')])?.marketplace).toBe('EBAY_GB');
    expect(confidentUkEstimate([gb({ confidence: 'high' })], [comp('EBAY_GB')])).not.toBeNull();
  });

  it.each(['low', 'insufficient'] as const)('hides at %s confidence', confidence => {
    expect(confidentUkEstimate([gb({ confidence })], [comp('EBAY_GB')])).toBeNull();
  });

  it('hides without GB comparables, even when the US is confident', () => {
    expect(confidentUkEstimate([gb()], [comp('EBAY_US')])).toBeNull();
    expect(confidentUkEstimate([gb({ comparableCount: 0 })], [comp('EBAY_GB')])).toBeNull();
    expect(confidentUkEstimate([us()], [comp('EBAY_US')])).toBeNull();
  });

  it('hides when the range is missing', () => {
    expect(confidentUkEstimate([gb({ estimatedLow: null })], [comp('EBAY_GB')])).toBeNull();
  });
});

describe('MarketValueSection', () => {
  const respond = (payload: unknown) => {
    globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })) as unknown as typeof fetch;
  };

  it('shows one Typical UK price range from eBay asking prices, never the US figure or a refresh button', async () => {
    respond({ estimates: [gb(), us()], comparables: [comp('EBAY_GB'), comp('EBAY_US', 'u1')], ebayConfigured: true });
    await render(<MarketValueSection pinId="p1" />);
    await waitFor(() => expect(screen.getByText('Typical UK price')).toBeTruthy());
    expect(screen.getByText('£12–£20')).toBeTruthy();
    expect(screen.getByText(/eBay asking prices · 4 UK listings/)).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/Refresh eBay value|Check eBay value/)).toBeNull();
    // Only UK listings in the expandable list.
    await fireEvent.press(screen.getByRole('button', { name: /See the eBay UK listings/ }));
    expect(screen.getByText('Listing i1')).toBeTruthy();
    expect(screen.queryByText('Listing u1')).toBeNull();
  }, 20_000);

  it('renders nothing at low confidence', async () => {
    respond({ estimates: [gb({ confidence: 'low' })], comparables: [comp('EBAY_GB')], ebayConfigured: true });
    await render(<MarketValueSection pinId="p1" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing when no value is saved, and offers no manual eBay check', async () => {
    respond({ estimates: [], comparables: [], ebayConfigured: true });
    await render(<MarketValueSection pinId="p1" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.toJSON()).toBeNull();
  });
});
