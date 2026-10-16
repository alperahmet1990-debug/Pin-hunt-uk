import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CollectorProfileScreen from '../app/collector/[username]';

// UX-045: the collector profile loads with a header placeholder in the
// hero's place (compact for a match entry), then trade-match rows.
let mockEntry: string | undefined;
const mockPush = jest.fn();
let resolveProfile: (p: unknown) => void = () => {};
let mockProfileFails = false;
const mockGetPublicProfile = jest.fn(() => (mockProfileFails
  ? Promise.reject(new TypeError('Failed to fetch'))
  : new Promise(resolve => { resolveProfile = resolve; })));
let resolveTrades: (t: unknown[]) => void = () => {};
let mockForTrade: unknown[] = [];
const mockGetForTrade = jest.fn(() => Promise.resolve(mockForTrade));
const mockRepo = {
  getTraderRating: () => Promise.resolve({ positive: 0, total: 0 }),
  getPotentialTrades: () => new Promise<unknown[]>(resolve => { resolveTrades = resolve; }),
  getCollectorForTradePins: mockGetForTrade,
};
let mockCollection: Record<string, { pinId: string; status: string }> = {};
const mockSetStatus = jest.fn();
const mockToast = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ username: 'pinpal', entry: mockEntry }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ getPublicProfile: mockGetPublicProfile }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me' }) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection, setStatus: mockSetStatus }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));

const profile = { id: 'u2', username: 'pinpal', displayName: 'Pin Pal' };

beforeEach(() => {
  mockEntry = undefined; mockProfileFails = false; mockForTrade = []; mockCollection = {};
  jest.clearAllMocks();
});

describe('Collector profile while loading (UX-045)', () => {
  it('shows a header placeholder until the profile arrives', async () => {
    await render(<CollectorProfileScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading collector' })).toBeTruthy();
    await act(async () => { resolveProfile(profile); });
    expect(screen.queryByRole('progressbar', { name: 'Loading collector' })).toBeNull();
    // The header title and the profile hero both name the collector.
    expect(screen.getAllByText('@pinpal').length).toBeGreaterThan(0);
  });

  it('shows placeholder rows while trade matches load', async () => {
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    expect(screen.getByRole('progressbar', { name: 'Loading trade matches' })).toBeTruthy();
    await act(async () => { resolveTrades([]); });
    expect(screen.queryByRole('progressbar', { name: 'Loading trade matches' })).toBeNull();
  });

  it('shows trade-match pins at 56 pt or more, with or without a photo (B-P1-20)', async () => {
    const { StyleSheet } = require('react-native');
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    await act(async () => {
      resolveTrades([
        { direction: 'they_have_i_want', pinId: 'a', pinhuntId: 'PHUK-1', title: 'Stitch Surfing', imageUrl: 'https://example.test/a.jpg' },
        { direction: 'i_have_they_want', pinId: 'b', pinhuntId: 'PHUK-2', title: 'Dumbo Blue Sky' },
      ]);
    });
    const thumbs = screen.getAllByTestId('trade-pin-thumb');
    expect(thumbs).toHaveLength(2);
    thumbs.forEach(t => {
      const { width, height } = StyleSheet.flatten(t.props.style);
      expect(width).toBeGreaterThanOrEqual(56);
      expect(height).toBeGreaterThanOrEqual(56);
    });
  });

  it('"Trading safely" opens the guide instead of doing nothing (#144)', async () => {
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    await act(async () => {
      resolveTrades([{ direction: 'they_have_i_want', pinId: 'a', pinhuntId: 'PHUK-1', title: 'Stitch Surfing' }]);
    });
    await fireEvent.press(screen.getByRole('link', { name: 'Trading safely guide' }));
    expect(mockPush).toHaveBeenCalledWith('/trading-safely');
  });

  it('uses the same loading label for a match entry', async () => {
    mockEntry = 'match';
    await render(<CollectorProfileScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading collector' })).toBeTruthy();
  });

  it('a failed load is not "Profile Not Found": it says why and retries (UX-046)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockProfileFails = true;
    await render(<CollectorProfileScreen />);
    expect(await screen.findByRole('alert', { name: "You're offline. Check your connection and try again." })).toBeTruthy();
    expect(screen.queryByText('Profile Not Found')).toBeNull();
    mockProfileFails = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => { resolveProfile(profile); });
    expect(screen.getAllByText('@pinpal').length).toBeGreaterThan(0);
  });
});

describe('Collector profile: their whole For Trade list (UX-027, #139)', () => {
  const forTrade = [
    { pinId: 'PHUK-3', title: 'Castle Fireworks' },
    { pinId: 'PHUK-1', title: 'Stitch Surfing' },
    { pinId: 'PHUK-2', title: 'Ariel Shell' },
  ];

  it('shows every pin they have for trade, pins on my ISO first', async () => {
    mockForTrade = forTrade;
    mockCollection = { 'PHUK-1': { pinId: 'PHUK-1', status: 'wanted' } };
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    await act(async () => { resolveTrades([]); });
    expect(mockGetForTrade).toHaveBeenCalledWith('pinpal');
    expect(screen.getByRole('header', { name: 'FOR TRADE (3)' })).toBeTruthy();
    const tiles = screen.getAllByRole('button', { name: /^(Castle Fireworks|Stitch Surfing|Ariel Shell)/ })
      .map(t => t.props.accessibilityLabel);
    expect(tiles).toEqual(['Stitch Surfing, ISO', 'Ariel Shell', 'Castle Fireworks']);
    await fireEvent.press(screen.getByRole('button', { name: 'Ariel Shell' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'PHUK-2' } });
  });

  it('long-press adds a pin to my ISO, with Undo', async () => {
    mockForTrade = forTrade;
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    await fireEvent(screen.getByRole('button', { name: 'Ariel Shell' }), 'longPress');
    expect(mockSetStatus).toHaveBeenCalledWith('PHUK-2', 'wanted');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Added Ariel Shell to your ISO' }));
  });

  it('long-press never changes a pin I already have', async () => {
    mockForTrade = forTrade;
    mockCollection = { 'PHUK-3': { pinId: 'PHUK-3', status: 'owned' } };
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    await fireEvent(screen.getByRole('button', { name: 'Castle Fireworks' }), 'longPress');
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ message: 'You already have Castle Fireworks' });
  });

  it('shows no For Trade section when they have nothing for trade (or the profile is private)', async () => {
    mockForTrade = [];
    await render(<CollectorProfileScreen />);
    await act(async () => { resolveProfile(profile); });
    expect(screen.queryByTestId('collector-for-trade')).toBeNull();
  });
});

