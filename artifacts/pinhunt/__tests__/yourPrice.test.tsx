import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CommunityPrice, MyPinPrice } from '@workspace/pin-repository';
import { parsePriceInput, priceNoteKey, YourPriceEditor } from '../components/YourPriceEditor';
import CommunityPricesSettingScreen from '../app/settings/community-prices';
import { resetCommunityPriceCacheForTests } from '../hooks/useCommunityPrice';
import { resetMyPinPriceCacheForTests } from '../hooks/useMyPinPrice';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// CV-03 (#514): "Your price" for pins in the collection or For Trade.

const mockPush = jest.fn();
let mockService: Record<string, jest.Mock> | null = null;
let mine: MyPinPrice[] = [];
let community: CommunityPrice | null = null;

jest.mock('@/lib/communityPriceService', () => ({ getCommunityPriceService: () => mockService }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { access_token: 't' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

function makeService() {
  return {
    getMyPinPrices: jest.fn(async () => mine),
    setMyPinPrice: jest.fn(async (pinId: string, currency: 'GBP' | 'USD', amount: number) => {
      mine = [...mine.filter(p => p.currency !== currency), { pinId, currency, amount, updatedAt: 'now' }];
      community = { pinId, currency, collectorCount: 3, median: 13.5, low: 12, high: 15, step: 'confident' };
    }),
    clearMyPinPrice: jest.fn(async (_pinId: string, currency: string) => { mine = mine.filter(p => p.currency !== currency); }),
    getCommunityPrice: jest.fn(async () => community),
    getCommunityPrices: jest.fn(async () => (community ? [community] : [])),
    getMyCommunityPriceSetting: jest.fn(async () => true),
    setMyCommunityPriceSetting: jest.fn(async () => {}),
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCommunityPriceCacheForTests();
  resetMyPinPriceCacheForTests();
  resetPriceCurrencyForTests();
  mine = [];
  community = { pinId: 'p1', currency: 'GBP', collectorCount: 2, median: 11, low: 10, high: 12, entries: [10, 12], step: 'early' };
  mockService = makeService();
});

describe('reading a typed price', () => {
  it.each([['12', 12], ['12.5', 12.5], ['£12.50', 12.5], ['1,200', 1200]])('%s → %s', (text, n) => {
    expect(parsePriceInput(text)).toBe(n);
  });
  it.each(['', '0', 'abc', '12.555', '-4', '100001'])('refuses %p', text => {
    expect(parsePriceInput(text)).toBeNull();
  });
});

describe('Your price (CV-03)', () => {
  it('shows nothing without a price source', async () => {
    mockService = null;
    await render(<YourPriceEditor pinId="p1" />);
    expect(screen.queryByTestId('your-price-editor')).toBeNull();
  });

  it('never shows the community price before saving, then reveals it', async () => {
    await render(<YourPriceEditor pinId="p1" />);
    await screen.findByTestId('your-price-editor');
    expect(screen.queryByText(/Community price/)).toBeNull();
    expect(screen.queryByText(/£11/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Your price in pounds'), '15');
    await fireEvent.press(screen.getByRole('button', { name: 'Save your price' }));
    await waitFor(() => expect(mockService!.setMyPinPrice).toHaveBeenCalledWith('p1', 'GBP', 15));
    expect(await screen.findByText('Saved. Community price: £13.50 from 3 collectors.')).toBeTruthy();
  });

  it('edits and removes an existing price', async () => {
    mine = [{ pinId: 'p1', currency: 'GBP', amount: 12, updatedAt: 'x' }];
    await render(<YourPriceEditor pinId="p1" />);
    await waitFor(() => expect(screen.getByLabelText('Your price in pounds').props.value).toBe('12'));
    // Unchanged: Save does nothing.
    expect(screen.getByRole('button', { name: 'Save your price' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove my price' }));
    await waitFor(() => expect(mockService!.clearMyPinPrice).toHaveBeenCalledWith('p1', 'GBP'));
    expect(await screen.findByText('Your price is removed.')).toBeTruthy();
  });

  it('dollars are a separate price', async () => {
    await render(<YourPriceEditor pinId="p1" />);
    await screen.findByTestId('your-price-editor');
    await fireEvent.press(screen.getByRole('radio', { name: 'Dollars' }));
    await fireEvent.changeText(screen.getByLabelText('Your price in dollars'), '20');
    await fireEvent.press(screen.getByRole('button', { name: 'Save your price' }));
    await waitFor(() => expect(mockService!.setMyPinPrice).toHaveBeenCalledWith('p1', 'USD', 20));
  });

  it('won\'t save a price it can\'t read', async () => {
    await render(<YourPriceEditor pinId="p1" />);
    await screen.findByTestId('your-price-editor');
    await fireEvent.changeText(screen.getByLabelText('Your price in pounds'), 'twelve');
    expect(screen.getByRole('button', { name: 'Save your price' })).toBeDisabled();
    expect(mockService!.setMyPinPrice).not.toHaveBeenCalled();
  });

  it('shows the anonymity note until the first save, then never again', async () => {
    await render(<YourPriceEditor pinId="p1" />);
    expect(await screen.findByText(/Nobody sees it's yours/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Change this in Privacy' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/community-prices');

    await fireEvent.changeText(screen.getByLabelText('Your price in pounds'), '9');
    await fireEvent.press(screen.getByRole('button', { name: 'Save your price' }));
    await screen.findByText(/^Saved\./);
    await waitFor(async () => expect(await AsyncStorage.getItem(priceNoteKey('u1'))).toBe('1'));
    expect(screen.queryByText(/Nobody sees it's yours/)).toBeNull();
  });

  it('no note once it has been seen', async () => {
    await AsyncStorage.setItem(priceNoteKey('u1'), '1');
    await render(<YourPriceEditor pinId="p1" />);
    await screen.findByTestId('your-price-editor');
    await waitFor(() => expect(mockService!.getMyPinPrices).toHaveBeenCalled());
    expect(screen.queryByText(/Nobody sees it's yours/)).toBeNull();
  });

  it('hides itself when community prices are not available yet', async () => {
    const { PinRepositoryError } = jest.requireActual('@workspace/pin-repository');
    mockService!.getMyPinPrices.mockRejectedValue(new PinRepositoryError('NOT_FOUND', 'Community prices are not available yet.'));
    await render(<YourPriceEditor pinId="p1" />);
    await waitFor(() => expect(screen.queryByTestId('your-price-editor')).toBeNull());
  });
});

describe('Community prices setting (CV-03)', () => {
  it('is on by default and turns off', async () => {
    await render(<CommunityPricesSettingScreen />);
    const toggle = await screen.findByLabelText('Include my prices in community prices');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    await waitFor(() => expect(mockService!.setMyCommunityPriceSetting).toHaveBeenCalledWith(false));
    expect(screen.getByText('Off. Your prices are kept for you only.')).toBeTruthy();
  });

  it('says so when prices are not available', async () => {
    mockService = null;
    await render(<CommunityPricesSettingScreen />);
    expect(screen.getByText("Community prices aren't available yet.")).toBeTruthy();
  });
});
