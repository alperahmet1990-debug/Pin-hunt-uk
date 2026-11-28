import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PricePinsScreen from '../admin/price-pins';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'tok' } }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));
jest.mock('@/lib/apiBase', () => ({ API_BASE: 'https://api.test/api' }));

const setup = {
  markets: ['UK', 'US'],
  switches: { soldgraph: true, valuationV2: true },
  month: '2026-11',
  budget: { usedCredits: 10, limitCredits: 500, hardStop: true },
  job: null,
};
const plan = {
  candidates: 100, alreadyAnswered: 20, toPrice: 80, creditsPerPin: 2, pinsThisRun: 80, plannedCredits: 160,
  budget: setup.budget, spendable: 490,
};

const calls: Array<{ url: string; body?: unknown }> = [];
function respond(status: number, data: unknown) {
  return Promise.resolve({ status, json: () => Promise.resolve(data) } as Response);
}

beforeEach(() => {
  calls.length = 0;
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/plan')) return respond(200, { plan, blockers: [] });
    if (url.endsWith('/run')) return respond(202, { job: {} });
    return respond(200, setup);
  }) as unknown as typeof fetch;
});

describe('PricePinsScreen', () => {
  it('checks the cost, then runs only after confirming the planned credits', async () => {
    const { getByText, getByRole, findByText, getByLabelText } = await render(<PricePinsScreen />);
    await findByText('UK, US');
    await fireEvent.changeText(getByLabelText('How many pins'), '100');
    await fireEvent.press(getByRole('button', { name: 'Check cost' }));
    await findByText(/This run: 80 pins, up to 160 credits/);
    expect(calls.find(c => c.url.endsWith('/plan'))?.body).toEqual({ pins: { kind: 'popular', count: 100 }, cacheDays: 30, maxCredits: 200 });
    expect(calls.some(c => c.url.endsWith('/run'))).toBe(false);

    await fireEvent.press(getByRole('button', { name: 'Price 80 pins. Up to 160 credits' }));
    await fireEvent.press(getByText('Start pricing'));
    await waitFor(() => expect(calls.find(c => c.url.endsWith('/run'))?.body).toMatchObject({ confirmCredits: 160, cacheDays: 30 }));
  });

  it('shows why a run is blocked and offers no run button', async () => {
    global.fetch = jest.fn((url: string) =>
      url.endsWith('/plan') ? respond(200, { plan, blockers: ['the 2026-11 Soldgraph budget is not a hard stop'] }) : respond(200, setup),
    ) as unknown as typeof fetch;
    const { getByRole, findByText, queryByText } = await render(<PricePinsScreen />);
    await findByText('UK, US');
    await fireEvent.press(getByRole('button', { name: 'Check cost' }));
    await findByText(/not a hard stop/);
    expect(queryByText('Price 80 pins')).toBeNull();
  });
});
