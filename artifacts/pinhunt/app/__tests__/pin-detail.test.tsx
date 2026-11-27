import React from 'react';
import { render } from '@testing-library/react-native';
import PinDetailScreen from '../pin/[id]';

// UXR-01 (#667): an uncached pin is fetched by id; hook order must stay stable.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));
jest.mock('@/context/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ blockedIds: [] }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: {}, getEntry: () => undefined, markViewed: jest.fn(), setStatus: jest.fn() }),
}));
jest.mock('@/context/BoardsContext', () => ({ useBoards: () => ({ customBoards: [] }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: null }) }));
jest.mock('@/components/ui/ScreenHeader', () => ({ ScreenHeader: () => null, useHeaderTopInset: () => 0 }));
jest.mock('@/components/ui', () => {
  const { View, Text } = require('react-native');
  const Stub = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return {
    ScreenContainer: Stub, Chip: Stub, MetaRow: Stub, ValueDisplay: Stub, PrimaryActionBar: Stub,
    SetProgressBar: Stub, CompactPinTile: Stub, __esModule: true, Text,
  };
});
jest.mock('@/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('@/components/YourPriceEditor', () => ({ YourPriceEditor: () => null }));
jest.mock('@/components/locations/WhereItLivesRow', () => ({ WhereItLivesRow: () => null }));
jest.mock('@/lib/pinLocationService', () => ({ getPinLocationService: () => ({}) }));
jest.mock('@/components/YourPriceRow', () => ({ YourPriceRow: () => null, useHasMyPrice: () => false }));
jest.mock('@/components/SoldPriceCard', () => ({ SoldPriceCard: () => null }));
jest.mock('@/components/ui/PinImage', () => ({ PinImage: () => null }));
jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false }));

let mockRepo: { getPinById: jest.Mock };
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: [], repository: mockRepo, ensureCollections: jest.fn().mockResolvedValue(undefined) }),
}));

const pin = { id: 'p1', title: 'Test Pin Title', collection: undefined, characters: [], tags: [] };

describe('Pin detail: uncached pin', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errorSpy.mockRestore());

  it('shows a spinner, then the pin, with no hook-order error', async () => {
    let resolve!: (p: unknown) => void;
    mockRepo = { getPinById: jest.fn(() => new Promise(r => { resolve = r; })) };
    const { queryByText, findByText, queryByTestId } = await render(<PinDetailScreen />);
    expect(queryByTestId('pin-loading')).toBeTruthy();
    expect(queryByText('Pin not found.')).toBeNull();
    resolve(pin);
    expect(await findByText('Test Pin Title')).toBeTruthy();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('shows "Pin not found." only after the fetch resolves to null', async () => {
    let resolve!: (p: unknown) => void;
    mockRepo = { getPinById: jest.fn(() => new Promise(r => { resolve = r; })) };
    const { queryByText, findByText } = await render(<PinDetailScreen />);
    expect(queryByText('Pin not found.')).toBeNull();
    resolve(null);
    expect(await findByText('Pin not found.')).toBeTruthy();
  });
});
