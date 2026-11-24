import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EditProfileScreen from '../app/edit-profile';

// Clearing a text field must clear it (UXR-17): `undefined` is skipped by the repository.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' }, access_token: 't' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false }));

const mockUpdate = jest.fn();
let mockProfile: Record<string, unknown>;
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({
    profile: mockProfile,
    updateMyProfile: mockUpdate,
    checkUsernameAvailable: jest.fn(() => Promise.resolve(true)),
    refreshProfile: jest.fn(() => Promise.resolve()),
  }),
}));

const base = { username: 'alper1990', profileVisibility: 'public' };

describe('Edit Profile: clearing text fields (UXR-17)', () => {
  beforeEach(() => mockUpdate.mockReset().mockResolvedValue({}));

  it('sends an empty string for emptied fields that had a value', async () => {
    mockProfile = { ...base, bio: 'Hello', tradingRegion: 'London', town: 'Watford', county: 'Herts', country: 'England' };
    await render(<EditProfileScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Tell other collectors about yourself…'), '');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. London, UK'), '  ');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Watford'), '');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Hertfordshire'), '');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. England'), '');
    await fireEvent.press(screen.getByText('Save Changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ bio: '', tradingRegion: '', town: '', county: '', country: '' }),
    );
  });

  it('does not send fields that were empty and stay empty', async () => {
    mockProfile = { ...base };
    await render(<EditProfileScreen />);
    await fireEvent.press(screen.getByText('Save Changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const payload = mockUpdate.mock.calls[0][0];
    for (const k of ['bio', 'tradingRegion', 'town', 'county', 'country']) expect(payload[k]).toBeUndefined();
  });

  it('still sends trimmed values that were typed', async () => {
    mockProfile = { ...base, bio: 'Old' };
    await render(<EditProfileScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Tell other collectors about yourself…'), '  New bio ');
    await fireEvent.press(screen.getByText('Save Changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].bio).toBe('New bio');
  });
});
