import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { setFormatMarket, formatDate } from '../utils/format';
import { marketFromDeviceRegion, isHomeMarketUnavailable } from '../utils/homeMarket';
import { resetPriceCurrencyForTests, usePriceCurrency } from '../hooks/usePriceCurrency';
import HomeMarketScreen from '../app/settings/home-market';

// HM-02 (#562) and HM-04 (#564): choosing a home market, and prices and
// dates following it.

let mockProfile: { homeMarket: 'UK' | 'US' } = { homeMarket: 'UK' };
const mockUpdate = jest.fn();
const mockToast = jest.fn();
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ profile: mockProfile, updateMyProfile: mockUpdate }),
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

beforeEach(async () => {
  jest.clearAllMocks();
  mockProfile = { homeMarket: 'UK' };
  await act(async () => resetPriceCurrencyForTests());
});

describe('starting choice from the phone', () => {
  it('US region -> US, anything else -> UK', () => {
    expect(marketFromDeviceRegion('en-US')).toBe('US');
    expect(marketFromDeviceRegion('en_US')).toBe('US');
    expect(marketFromDeviceRegion('en-GB')).toBe('UK');
    expect(marketFromDeviceRegion('fr-FR')).toBe('UK');
    expect(marketFromDeviceRegion('')).toBe('UK');
  });

  it('recognises the "not available yet" save error', () => {
    expect(isHomeMarketUnavailable(new Error('Choosing a home market isn’t available yet.'))).toBe(true);
    expect(isHomeMarketUnavailable(new Error('boom'))).toBe(false);
  });
});

describe('prices follow the home market (HM-04)', () => {
  it('starts on the home market currency', async () => {
    const { result } = await renderHook(() => usePriceCurrency());
    expect(result.current[0]).toBe('GBP');
    await act(async () => setFormatMarket('US'));
    expect(result.current[0]).toBe('USD');
    expect(result.current[2]).toBe('USD');
  });

  it('switching is a peek that resets when the home market changes', async () => {
    const { result } = await renderHook(() => usePriceCurrency());
    await act(async () => result.current[1]('USD'));
    expect(result.current[0]).toBe('USD');
    expect(result.current[2]).toBe('GBP'); // home unchanged
    await act(async () => setFormatMarket('US'));
    await act(async () => setFormatMarket('UK'));
    expect(result.current[0]).toBe('GBP');
  });

  it('dates follow too', async () => {
    const d = new Date('2026-11-08T12:00:00');
    expect(formatDate(d, 'medium')).toBe('8 Nov 2026');
    await act(async () => setFormatMarket('US'));
    expect(formatDate(d, 'medium')).toBe('Nov 8, 2026');
  });
});

describe('Profile → Home market (HM-02)', () => {
  it('shows the current market and changes it in one tap', async () => {
    mockUpdate.mockResolvedValue({});
    await render(<HomeMarketScreen />);
    expect(screen.getByRole('radio', { name: /United Kingdom/ }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: /United States/ }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ homeMarket: 'US' }));
    expect(mockToast).toHaveBeenCalledWith({ message: 'Home market: United States' });
  });

  it('tapping the current market does nothing', async () => {
    await render(<HomeMarketScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /United Kingdom/ }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('a failed save says so in plain words', async () => {
    mockUpdate.mockRejectedValue(new Error('permission denied for table profiles'));
    await render(<HomeMarketScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /United States/ }));
    expect(await screen.findByText(/^Couldn’t save your profile/)).toBeTruthy();
  });
});
