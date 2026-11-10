import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../(auth)/register';

// LP-8 (#530): under 18 creates no account and sends nothing.
const mockSignUp = jest.fn().mockResolvedValue({ error: null, needsEmailConfirmation: true });
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ signUp: mockSignUp }) }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));

function pad(n: number) { return String(n).padStart(2, '0'); }

async function fill(day: string, month: string, year: string) {
  const utils = await render(<RegisterScreen />);
  await fireEvent.changeText(utils.getByPlaceholderText('Email'), 'a@example.test');
  await fireEvent.changeText(utils.getByPlaceholderText('Password (min 8 characters)'), 'longpassword1');
  await fireEvent.changeText(utils.getByPlaceholderText('Confirm password'), 'longpassword1');
  await fireEvent.changeText(utils.getByLabelText('Day of birth'), day);
  await fireEvent.changeText(utils.getByLabelText('Month of birth'), month);
  await fireEvent.changeText(utils.getByLabelText('Year of birth'), year);
  // The heading and the button both say "Create account"; the button is last.
  const labels = utils.getAllByText('Create account');
  await fireEvent.press(labels[labels.length - 1]);
  return utils;
}

describe('Register date of birth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the date of birth field empty, with the hint', async () => {
    const { getByText, getByLabelText } = await render(<RegisterScreen />);
    expect(getByText('Date of birth')).toBeTruthy();
    expect(getByText(/We only keep confirmation of your age, not your date of birth/)).toBeTruthy();
    expect(getByLabelText('Day of birth').props.value).toBe('');
    expect(getByLabelText('Year of birth').props.value).toBe('');
  });

  it('under 18: no account, nothing sent', async () => {
    const now = new Date();
    const { findByText } = await fill(pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear() - 10));
    expect(await findByText('Sorry, PinHunt is for collectors aged 18 and over.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('18th birthday today: signs up with only the age flag', async () => {
    const now = new Date();
    await fill(pad(now.getDate()), pad(now.getMonth() + 1), String(now.getFullYear() - 18));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('a@example.test', 'longpassword1', { ageConfirmed: true }));
    expect(JSON.stringify(mockSignUp.mock.calls)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('invalid date: explains and sends nothing', async () => {
    const { findByText } = await fill('31', '04', '1990');
    expect(await findByText(/Enter a real date of birth/)).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
