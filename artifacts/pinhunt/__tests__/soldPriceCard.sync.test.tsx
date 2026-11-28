import React from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SoldPriceCard } from '../components/SoldPriceCard';
import { ValueDisplay } from '../components/ui/ValueDisplay';
import { resetCommunityPriceCacheForTests } from '../hooks/useCommunityPrice';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// UXR-37 (#703): the sold-price card and the VALUE card share one UK £ / US $ switch.

jest.mock('@/hooks/useSoldPrices', () => ({
  useSoldPrices: () => ({
    status: 'ready',
    valuations: [
      { market: 'UK', currency: 'GBP', low: 20, fair: 25, high: 30, soldCount: 7, calculatedAt: '' },
      { market: 'US', currency: 'USD', low: 30, fair: 35, high: 40, soldCount: 3, calculatedAt: '' },
    ],
    request: { state: 'priced', checkedAt: null, nextRequestAt: null, requestsOpen: true, markets: ['UK', 'US'] },
    error: null,
    requestPrice: jest.fn(),
  }),
}));
jest.mock('@/lib/communityPriceService', () => ({
  getCommunityPriceService: () => ({ getCommunityPrice: async () => null }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: null }) }));

beforeEach(async () => {
  resetCommunityPriceCacheForTests();
  await act(async () => resetPriceCurrencyForTests());
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ estimates: [], comparables: [], ebayConfigured: true }) }),
  ) as unknown as typeof fetch;
});

const selected = (label: string) => screen.getByLabelText(label).props.accessibilityState?.selected;

function Both() {
  return (
    <View>
      <SoldPriceCard pinId="p1" />
      <ValueDisplay pinId="p1" />
    </View>
  );
}

describe('shared currency switch (UXR-37)', () => {
  it('tapping US $ on the sold card switches the VALUE card too', async () => {
    await render(<Both />);
    expect(await screen.findByTestId('two-price-card')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('US sold prices, dollars'));
    expect(selected('US prices, dollars')).toBe(true);
    expect(selected('UK prices, pounds')).toBe(false);
    expect(selected('US sold prices, dollars')).toBe(true);
  });

  it('tapping UK £ on the VALUE card switches the sold card back', async () => {
    await render(<Both />);
    await fireEvent.press(await screen.findByLabelText('US prices, dollars'));
    expect(selected('US sold prices, dollars')).toBe(true);
    await fireEvent.press(screen.getByLabelText('UK prices, pounds'));
    expect(selected('UK sold prices, pounds')).toBe(true);
  });
});
