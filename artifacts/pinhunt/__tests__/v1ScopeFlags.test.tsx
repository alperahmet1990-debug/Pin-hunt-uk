// V1 scope (LP-7, #525): Nearby, postcode, in-person and international trading are
// hidden behind FEATURES flags. Routes stay registered; direct links go back safely.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
let mockFlags = { marketplaceListings: false, collectorsNearby: false, inPersonTrading: false, internationalTrading: false };

jest.mock('@/constants/features', () => ({
  get FEATURES() { return mockFlags; },
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

const mockProfile = {
  username: 'sam',
  bio: '',
  tradingRegion: '',
  internationalTradingEnabled: true,
  allowTradeRequests: true,
  allowMessages: true,
  profileVisibility: 'public',
  town: 'Watford',
  county: 'Hertfordshire',
  country: 'England',
  postcode: 'WD17 1AB',
  hasLocationSet: true,
  nearbyDiscoveryEnabled: true,
  preferredRadiusMiles: 50,
  openToLocalTrades: true,
  openToPostalTrades: false,
  happyToTravel: true,
};
const mockUpdate = jest.fn(async () => mockProfile);
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({
    profile: mockProfile,
    updateMyProfile: mockUpdate,
    checkUsernameAvailable: jest.fn(async () => true),
    refreshProfile: jest.fn(async () => {}),
  }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'test-jwt' } }) }));

import { FeatureOffRedirect } from '../components/FeatureOffRedirect';
import NearbyRoute from '../app/nearby';
import SellRoute from '../app/sell/[pinId]';
import MyListingsRoute from '../app/my-listings';
import EditProfileScreen from '../app/edit-profile';

const HIDDEN_KEYS = ['internationalTradingEnabled', 'nearbyDiscoveryEnabled', 'preferredRadiusMiles', 'openToLocalTrades', 'happyToTravel'];

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  mockFlags = { marketplaceListings: false, collectorsNearby: false, inPersonTrading: false, internationalTrading: false };
});

describe('FeatureOffRedirect', () => {
  it('goes back when there is history', async () => {
    await render(<FeatureOffRedirect />);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes Home on a cold deep link', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<FeatureOffRedirect />);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('hidden routes redirect while their flag is off', () => {
  it.each([
    ['/nearby', NearbyRoute],
    ['/sell/[pinId]', SellRoute],
    ['/my-listings', MyListingsRoute],
  ])('%s goes back', async (_route, Route) => {
    const view = await render(<Route />);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(view.toJSON()).toBeNull();
  });
});

describe('Edit Profile (V1 scope)', () => {
  it('hides postcode, Nearby, in-person and international settings', async () => {
    await render(<EditProfileScreen />);
    for (const label of ['UK Postcode', 'Update UK Postcode', 'Appear in Collectors Nearby', 'Open to Local Trades', 'Happy to Travel', 'International Trading', 'Discovery Radius']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText('Open to Postal Trades')).toBeTruthy();
    expect(screen.getByText('Town / City')).toBeTruthy();
    expect(screen.getByText('County / Region')).toBeTruthy();
    expect(screen.getByText('Country')).toBeTruthy();
  });

  it('saving leaves hidden values unchanged and skips geocoding', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await render(<EditProfileScreen />);
    await act(async () => { await fireEvent.press(screen.getByText('Save Changes')); });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const input = (mockUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    for (const key of HIDDEN_KEYS) expect(input).not.toHaveProperty(key);
    expect(input).toMatchObject({ town: 'Watford', county: 'Hertfordshire', country: 'England', openToPostalTrades: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('turning the flags on restores the settings and saves them', async () => {
    mockFlags = { ...mockFlags, collectorsNearby: true, inPersonTrading: true, internationalTrading: true };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await render(<EditProfileScreen />);
    for (const label of ['Update UK Postcode', 'Appear in Collectors Nearby', 'Open to Local Trades', 'Happy to Travel', 'International Trading', 'Discovery Radius']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await act(async () => { await fireEvent.press(screen.getByText('Save Changes')); });
    const input = (mockUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      internationalTradingEnabled: true,
      nearbyDiscoveryEnabled: true,
      preferredRadiusMiles: 50,
      openToLocalTrades: true,
      happyToTravel: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('geocode'), expect.anything());
    fetchSpy.mockRestore();
  });
});
