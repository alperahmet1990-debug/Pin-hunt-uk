import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SoldPriceCard } from '../components/SoldPriceCard';
import { POLL_MS } from '../hooks/useSoldPrices';
import { setFormatMarket } from '../utils/format';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// "Recent sold prices" tile: priced, pending, no sales found, flag off, and
// the "Get a price" request. fetch is mocked; nothing reaches a network.
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));

type Reply = { status: number; body?: unknown };
const UK = { market: 'UK', currency: 'GBP', low: 18.4, fair: 24.6, high: 31.2, soldCount: 7, activeCount: 0, calculatedAt: '2026-11-10T10:00:00Z' };
const US = { market: 'US', currency: 'USD', low: 28, fair: 34, high: 41, soldCount: 3, activeCount: 0, calculatedAt: '2026-11-10T10:00:00Z' };
const OPEN = { state: 'none', checkedAt: null, nextRequestAt: null, requestsOpen: true };

let routes: { valuations: Reply; status: Reply; post: Reply };
let fetchMock: jest.Mock;

function reply(r: Reply) {
  return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} });
}

beforeEach(async () => {
  routes = {
    valuations: { status: 200, body: { valuations: [] } },
    status: { status: 200, body: OPEN },
    post: { status: 202, body: { state: 'pending' } },
  };
  fetchMock = jest.fn((url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    if (url.endsWith('/market-valuations')) return reply(routes.valuations);
    if (url.endsWith('/price-request')) return reply(init?.method === 'POST' ? routes.post : routes.status);
    return reply({ status: 404 });
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  await act(async () => resetPriceCurrencyForTests());
});

afterEach(() => jest.useRealTimers());

const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

describe('SoldPriceCard', () => {
  it('renders nothing when sold prices are switched off on the server (404)', async () => {
    routes.valuations = { status: 404 };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('sold-price-card')).toBeNull();
  });

  it('renders nothing when there is no value and requests are closed', async () => {
    routes.status = { status: 404 };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('sold-price-card')).toBeNull();
  });

  it('shows low, fair and high for the UK home market with the sale count, sending the session token', async () => {
    routes.valuations = { status: 200, body: { valuations: [UK, US] } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByTestId('sold-price-priced')).toBeTruthy();
    expect(screen.getByText('£25')).toBeTruthy();
    expect(screen.getByText('£18')).toBeTruthy();
    expect(screen.getByText('£31')).toBeTruthy();
    expect(screen.getByText(/Based on 7 recent sales on eBay UK/)).toBeTruthy();
    expect(screen.getByText(/not asking prices/)).toBeTruthy();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token' });
    // No listings or links.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('starts on the US market for a US collector, and shows the other market on tap', async () => {
    await act(async () => setFormatMarket('US'));
    routes.valuations = { status: 200, body: { valuations: [UK, US] } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByText(/Based on 3 recent sales on eBay US/)).toBeTruthy();
    expect(screen.getByText('$34')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('UK sold prices, pounds'));
    expect(screen.getByText(/Based on 7 recent sales on eBay UK/)).toBeTruthy();
  });

  it('ignores values with no sold evidence (asking prices only)', async () => {
    routes.valuations = { status: 200, body: { valuations: [{ ...UK, soldCount: 0, activeCount: 5 }] } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByTestId('sold-price-empty')).toBeTruthy();
  });

  it('offers "Get a price", shows the pending state, polls, then shows the price', async () => {
    jest.useFakeTimers();
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    await fireEvent.press(await screen.findByText('Get a price'));
    expect(await screen.findByTestId('sold-price-pending')).toBeTruthy();
    expect(screen.getByText('Checking recent sales…')).toBeTruthy();
    expect(posts()).toHaveLength(1);

    // Still running on the first poll.
    routes.status = { status: 200, body: { ...OPEN, state: 'pending' } };
    await act(async () => { jest.advanceTimersByTime(POLL_MS); });
    expect(screen.getByTestId('sold-price-pending')).toBeTruthy();

    // Finished: the tile re-reads the values.
    routes.status = { status: 200, body: { ...OPEN, state: 'priced', checkedAt: '2026-11-14T10:00:00Z' } };
    routes.valuations = { status: 200, body: { valuations: [UK] } };
    await act(async () => { jest.advanceTimersByTime(POLL_MS); });
    expect(await screen.findByTestId('sold-price-priced')).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it('shows the pending state for a request someone else started', async () => {
    routes.status = { status: 200, body: { ...OPEN, state: 'pending' } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByTestId('sold-price-pending')).toBeTruthy();
    expect(screen.queryByText('Get a price')).toBeNull();
  });

  it('shows "No recent sales found" with the check date, and no button', async () => {
    routes.status = { status: 200, body: { state: 'no_sales', checkedAt: '2026-11-14T10:00:00Z', nextRequestAt: '2026-12-14T10:00:00Z', requestsOpen: true } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByText('No recent sales found')).toBeTruthy();
    expect(screen.getByText(/on 14 Nov 2026/)).toBeTruthy();
    expect(screen.getByText(/check again from 14 Dec 2026/)).toBeTruthy();
    expect(screen.queryByText('Get a price')).toBeNull();
  });

  it('points to the other market when only it has a sold price', async () => {
    routes.valuations = { status: 200, body: { valuations: [US] } };
    routes.status = { status: 200, body: { state: 'priced', checkedAt: '2026-11-14T10:00:00Z', nextRequestAt: null, requestsOpen: true } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    expect(await screen.findByText('No recent sales found')).toBeTruthy();
    await fireEvent.press(screen.getByText('eBay US has a sold price: see US $'));
    expect(screen.getByText(/Based on 3 recent sales on eBay US/)).toBeTruthy();
  });

  it('shows a cached "no sales" answer straight away', async () => {
    routes.post = { status: 200, body: { state: 'no_sales', checkedAt: '2026-11-01T10:00:00Z', nextRequestAt: '2026-12-01T10:00:00Z' } };
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    await fireEvent.press(await screen.findByText('Get a price'));
    expect(await screen.findByText('No recent sales found')).toBeTruthy();
  });

  it.each([
    [{ status: 429, body: { error: 'daily_limit' } }, /today’s price checks/],
    [{ status: 429, body: { error: 'busy' } }, /busy right now/],
    [{ status: 503, body: { error: 'budget' } }, /aren’t available right now/],
  ])('explains a refused request (%o) and keeps the button', async (post, text) => {
    routes.post = post;
    await render(<SoldPriceCard pinId="PHUK-00000001" />);
    await fireEvent.press(await screen.findByText('Get a price'));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText('Get a price')).toBeTruthy();
  });
});
