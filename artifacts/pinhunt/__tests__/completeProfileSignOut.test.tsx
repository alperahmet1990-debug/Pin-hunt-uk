import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CompleteProfileScreen from '../app/complete-profile';

// Someone signed in to the wrong account can leave Complete Profile (#463).
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ updateMyProfile: jest.fn(), checkUsernameAvailable: jest.fn(() => Promise.resolve(true)) }),
}));

describe('Complete Profile sign-out (#463)', () => {
  it('signs out with the existing signOut()', async () => {
    await render(<CompleteProfileScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});
