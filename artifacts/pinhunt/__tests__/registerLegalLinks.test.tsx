import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RegisterScreen from '../app/(auth)/register';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockSignUp = jest.fn(async () => ({ error: null, needsEmailConfirmation: true }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signUp: mockSignUp }) }));
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

describe('Sign-up is for adults (18+)', () => {
  const fill = async () => {
    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@example.org');
    await fireEvent.changeText(screen.getByPlaceholderText('Password (min 8 characters)'), 'Pinhunt-2026!');
    await fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'Pinhunt-2026!');
  };

  // LP-8 (#530) replaced the "I'm 18 or over" tick box with a date of birth.
  it('will not create an account until an adult date of birth is entered', async () => {
    mockSignUp.mockClear();
    await render(<RegisterScreen />);
    await fill();
    // No date of birth yet: nothing is sent.
    await fireEvent.press(screen.getAllByText('Create account').at(-1)!);
    expect(screen.getByText(/Enter a real date of birth/)).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Day of birth'), '01');
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '01');
    await fireEvent.changeText(screen.getByLabelText('Year of birth'), '1990');
    await fireEvent.press(screen.getAllByText('Create account').at(-1)!);
    expect(mockSignUp).toHaveBeenCalledWith('a@example.org', 'Pinhunt-2026!', { ageConfirmed: true });
  });
});
