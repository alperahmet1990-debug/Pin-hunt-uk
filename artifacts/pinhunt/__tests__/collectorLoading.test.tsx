import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CollectorProfileScreen from '../app/collector/[username]';

// UX-045: the collector profile loads with a header placeholder in the
// hero's place (compact for a match entry), then trade-match rows.
let mockEntry: string | undefined;
let resolveProfile: (p: unknown) => void = () => {};
let mockProfileFails = false;
const mockGetPublicProfile = jest.fn(() => (mockProfileFails
  ? Promise.reject(new TypeError('Failed to fetch'))
  : new Promise(resolve => { resolveProfile = resolve; })));
let resolveTrades: (t: unknown[]) => void = () => {};
const mockRepo = {
  getTraderRating: () => Promise.resolve({ positive: 0, total: 0 }),
  getPotentialTrades: () => new Promise<unknown[]>(resolve => { resolveTrades = resolve; }),
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ username: 'pinpal', entry: mockEntry }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ getPublicProfile: mockGetPublicProfile }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me' }) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));

const profile = { id: 'u2', username: 'pinpal', displayName: 'Pin Pal' };

beforeEach(() => { mockEntry = undefined; mockProfileFails = false; });

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
