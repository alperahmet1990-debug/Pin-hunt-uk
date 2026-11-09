import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RegisterScreen from '../app/(auth)/register';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signUp: jest.fn() }) }));
// Plain-text links that expose where they go, so the test can check the targets.
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Link: ({ href, children, asChild }: { href: string; children: React.ReactNode; asChild?: boolean }) =>
      asChild ? children : <Text accessibilityRole="link" accessibilityHint={href}>{children}</Text>,
  };
});

describe('Sign-up links to the Terms and Privacy Policy', () => {
  it('says creating an account means agreeing, with both documents linked', async () => {
    await render(<RegisterScreen />);
    expect(screen.getByText(/By creating an account you agree to our/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms of Use' }).props.accessibilityHint).toBe('/legal/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).props.accessibilityHint).toBe('/legal/privacy');
  });
});
