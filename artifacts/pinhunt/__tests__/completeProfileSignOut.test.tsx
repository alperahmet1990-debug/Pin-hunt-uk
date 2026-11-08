import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CompleteProfileScreen from '../app/complete-profile';

// Someone signed in to the wrong account can leave Complete Profile (#463).
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
const mockUpdate = jest.fn();
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ updateMyProfile: mockUpdate, checkUsernameAvailable: jest.fn(() => Promise.resolve(true)) }),
}));

describe('Complete Profile sign-out (#463)', () => {
  it('signs out with the existing signOut()', async () => {
    await render(<CompleteProfileScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});

describe('Complete Profile save errors (TestFlight, 8 Nov)', () => {
  it('shows plain words, not the database message', async () => {
    jest.useFakeTimers();
    try {
      mockUpdate.mockRejectedValue(new Error('permission denied for table profiles'));
      await render(<CompleteProfileScreen />);
      await fireEvent.changeText(screen.getByPlaceholderText('yourname'), 'alper1990');
      await act(async () => { jest.advanceTimersByTime(1_000); });
      await fireEvent.press(screen.getByText('Continue'));
      expect(await screen.findByText(/^Couldn’t save your profile/)).toBeTruthy();
      expect(screen.queryByText(/permission denied/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

