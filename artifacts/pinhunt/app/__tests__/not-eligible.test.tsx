import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import NotEligibleScreen from '../not-eligible';

let mockEmail = '';
jest.mock('@/constants/appConfig', () => ({
  get SUPPORT_EMAIL() { return mockEmail; },
  hasSupportContact: (e: string) => e.trim().length > 0,
  feedbackMailtoUrl: (e: string, subject: string) =>
    e.trim() ? `mailto:${e.trim()}?subject=${encodeURIComponent(subject)}` : null,
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));

describe('NotEligibleScreen support contact', () => {
  it('does not promise support when no address is set', async () => {
    mockEmail = '';
    const { queryByText, queryByRole } = await render(<NotEligibleScreen />);
    expect(queryByText(/contact PinHunt support/i)).toBeNull();
    expect(queryByRole('link')).toBeNull();
  });

  it('shows a tappable mailto link when an address is set', async () => {
    mockEmail = 'help@example.test';
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText, getByRole } = await render(<NotEligibleScreen />);
    expect(getByText(/contact PinHunt support/i)).toBeTruthy();
    await fireEvent.press(getByRole('link'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('mailto:help@example.test'));
    spy.mockRestore();
  });
});
