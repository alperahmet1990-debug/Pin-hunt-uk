import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import StartConversationScreen from '../app/community/start-conversation';

const mockStart = jest.fn(async () => ({ id: 'conv-1' }));
const mockSend = jest.fn(async () => ({}));
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
// Stable across renders, like useMarketplace's memoised repository.
const mockCommunity = {
  userId: 'me',
  repo: {
    getPotentialTrades: async () => [
      { direction: 'they_have_i_want', pinId: 'u1', pinhuntId: 'PHUK-1', title: 'Dumbo Blue Sky' },
      { direction: 'they_have_i_want', pinId: 'u2', pinhuntId: 'PHUK-2', title: 'Stitch Aloha' },
      { direction: 'i_have_they_want', pinId: 'u3', pinhuntId: 'PHUK-3', title: 'Tinker Bell Trail' },
    ],
    startConversation: (...a: unknown[]) => mockStart(...(a as [])),
    sendConversationMessage: (...a: unknown[]) => mockSend(...(a as [])),
  },
};
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => mockCommunity }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: { 'PHUK-3': { pinId: 'PHUK-3', status: 'for_trade', quantity: 1 } } }),
}));

describe('Start conversation from a trade match', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { recipientId: 'them', recipientName: 'pinpal', matchTheyHave: '2', matchIHave: '1' };
  });

  it('pre-fills an editable message and attaches removable matched pins, sending nothing yet', async () => {
    await render(<StartConversationScreen />);
    await act(async () => {});
    const input = screen.getByDisplayValue(/you have 2 pins on my ISO, and I have 1 pin you're after/);
    expect(screen.getByText('Dumbo Blue Sky')).toBeTruthy();
    expect(screen.getByText('Tinker Bell Trail')).toBeTruthy();
    expect(screen.getByText('3 pins will be shared after your message.')).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();

    await act(async () => { fireEvent.changeText(input, 'Hello! Swap?'); });
    expect(screen.getByDisplayValue('Hello! Swap?')).toBeTruthy();
  });

  it('on Send: text first, then one pin_share with the remaining pins and the sender’s For Trade flags', async () => {
    await render(<StartConversationScreen />);
    await act(async () => {});
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Remove Stitch Aloha' })); });
    expect(screen.queryByText('Stitch Aloha')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText('Send Message')); });

    expect(mockStart).toHaveBeenCalledWith('me', expect.objectContaining({
      recipientId: 'them',
      openingMessage: expect.stringContaining('Fancy a swap?'),
    }));
    expect(mockSend).toHaveBeenCalledWith('conv-1', 'me', '', {
      messageType: 'pin_share',
      pinIds: ['PHUK-1', 'PHUK-3'],
      forTradePinIds: ['PHUK-3'],
    });
    expect(mockReplace).toHaveBeenCalled();
  });

  it('sends only the text when every pin is removed', async () => {
    await render(<StartConversationScreen />);
    await act(async () => {});
    for (const title of ['Dumbo Blue Sky', 'Stitch Aloha', 'Tinker Bell Trail']) {
      await act(async () => { fireEvent.press(screen.getByRole('button', { name: `Remove ${title}` })); });
    }
    await act(async () => { fireEvent.press(screen.getByText('Send Message')); });
    expect(mockStart).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('starts blank, with no pins, when not opened from a match', async () => {
    mockParams = { recipientId: 'them', recipientName: 'pinpal' };
    await render(<StartConversationScreen />);
    await act(async () => {});
    expect(screen.queryByText(/will be shared/)).toBeNull();
    expect(screen.getByPlaceholderText('Hi! I saw your post and…').props.value).toBe('');
  });
});
