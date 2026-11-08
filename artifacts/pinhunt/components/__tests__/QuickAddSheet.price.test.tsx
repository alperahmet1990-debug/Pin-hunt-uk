import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ToastProvider } from '@/components/ui/Toast';
import { QuickAddSheet } from '../QuickAddSheet';

// CV-03 (#514): Manage Collection offers "Your price" only for pins owned or For Trade.

let mockStatus: string | null = null;
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    getEntry: () => (mockStatus ? { pinId: 'p1', status: mockStatus, quantity: 1, notes: '', dateAdded: 'd' } : undefined),
    setStatus: jest.fn(), restoreEntry: jest.fn(), adjustQuantity: jest.fn(),
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), addPinToBoard: jest.fn(), removePinFromBoard: jest.fn(), getBoardPins: () => [] }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/lib/communityPriceService', () => ({
  getCommunityPriceService: () => ({ getMyPinPrices: async () => [], getCommunityPrice: async () => null }),
}));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardStickyView: require('react-native').View }));
jest.mock('../KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: require('react-native').ScrollView }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const PIN = { id: 'p1', title: 'Test Pin', collection: 'Test Set' } as never;
const show = () => render(<ToastProvider><QuickAddSheet pin={PIN} onClose={() => {}} /></ToastProvider>);

describe('Manage Collection: Your price', () => {
  it.each(['owned', 'for_trade'])('offered for %s pins', async status => {
    mockStatus = status;
    await show();
    expect(await screen.findByTestId('your-price-editor')).toBeTruthy();
  });

  it.each(['wanted', null])('not offered for %p', async status => {
    mockStatus = status;
    await show();
    await waitFor(() => expect(screen.queryByText('Copies')).toBeNull());
    expect(screen.queryByTestId('your-price-editor')).toBeNull();
  });
});
