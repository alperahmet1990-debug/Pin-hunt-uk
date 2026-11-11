import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

const mockPush = jest.fn();
let mockConfig = { SUPPORT_EMAIL: '', RATE_APP_ENABLED: false, EXPORT_COLLECTION_ENABLED: true };
let mockFlags = { marketplaceListings: false, collectorsNearby: false, inPersonTrading: false, internationalTrading: false };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/constants/features', () => ({ get FEATURES() { return mockFlags; } }));
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ profile: { username: 'sam', hasLocationSet: true, nearbyDiscoveryEnabled: true, preferredRadiusMiles: 25 }, loading: false }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn(), user: null }) }));
jest.mock('@/context/SubmissionNotificationsContext', () => ({ useSubmissionNotifications: () => ({ unseenCount: 0 }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [{ id: 'p1', title: 'Dumbo' }] }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: { p1: { pinId: 'p1', status: 'owned', quantity: 1, notes: '', dateAdded: '' } } }),
}));
jest.mock('@/constants/appConfig', () => {
  const real = jest.requireActual('@/constants/appConfig');
  return {
    get SUPPORT_EMAIL() { return mockConfig.SUPPORT_EMAIL; },
    get RATE_APP_ENABLED() { return mockConfig.RATE_APP_ENABLED; },
    get EXPORT_COLLECTION_ENABLED() { return mockConfig.EXPORT_COLLECTION_ENABLED; },
    feedbackMailtoUrl: () => real.feedbackMailtoUrl(mockConfig.SUPPORT_EMAIL),
  };
});

import ProfileScreen from '../app/(tabs)/profile';

describe('Profile support rows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { SUPPORT_EMAIL: '', RATE_APP_ENABLED: false, EXPORT_COLLECTION_ENABLED: true };
    mockFlags = { marketplaceListings: false, collectorsNearby: false, inPersonTrading: false, internationalTrading: false };
  });

  it('hides the Collectors Nearby banner and My Marketplace Listings for V1 (#525)', async () => {
    await render(<ProfileScreen />);
    expect(screen.queryByText(/Collectors Nearby/)).toBeNull();
    expect(screen.queryByText(/Discoverable/)).toBeNull();
    expect(screen.queryByText('My Marketplace Listings')).toBeNull();
  });

  it('restores the Nearby banner and listings row when their flags are on', async () => {
    mockFlags = { ...mockFlags, collectorsNearby: true, marketplaceListings: true };
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Discoverable · Within 25 miles'));
    expect(mockPush).toHaveBeenCalledWith('/nearby');
    expect(screen.getByText('My Marketplace Listings')).toBeTruthy();
  });

  it('hides Send Feedback without a support email and hides Rate by default', async () => {
    await render(<ProfileScreen />);
    expect(screen.queryByText('Send Feedback')).toBeNull();
    expect(screen.queryByText('Rate the App')).toBeNull();
    expect(screen.getByText('About PinHunt')).toBeTruthy();
  });

  it('About opens the About screen', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('About PinHunt'));
    expect(mockPush).toHaveBeenCalledWith('/about');
  });

  it('shows Send Feedback and opens mailto when configured; Rate follows its flag', async () => {
    mockConfig = { ...mockConfig, SUPPORT_EMAIL: 'help@example.com', RATE_APP_ENABLED: true };
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<ProfileScreen />);
    expect(screen.getByText('Rate the App')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send Feedback'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^mailto:help@example\.com/));
  });

  it('Export Collection shares a plain-text list, and can be hidden by flag', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    const view = await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Export Collection'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('- Dumbo (p1)') }));
    await view.unmount();
    mockConfig.EXPORT_COLLECTION_ENABLED = false;
    await render(<ProfileScreen />);
    expect(screen.queryByText('Export Collection')).toBeNull();
  });
});
