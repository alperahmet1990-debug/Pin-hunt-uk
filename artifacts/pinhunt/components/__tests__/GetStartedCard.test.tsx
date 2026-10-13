import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GetStartedCard } from '../GetStartedCard';

const mockPush = jest.fn();
let mockCollection: Record<string, { status: string }> = {};
let mockCreatedAt: string | undefined;
const KEY = '@pinhunt_get_started_v1:u1';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { createdAt: mockCreatedAt } }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));

beforeEach(async () => {
  mockPush.mockClear();
  mockCollection = {};
  mockCreatedAt = new Date().toISOString();
  await AsyncStorage.removeItem(KEY);
});

describe('GetStartedCard (UX-002)', () => {
  // First render of the file compiles the card tree; give a cold cache room.
  it('shows the four steps to a new collector, next step first, and replaces the Add pins card', async () => {
    await render(<GetStartedCard />);
    await waitFor(() => expect(screen.getByText('Get started')).toBeTruthy());
    expect(screen.getByText('0 of 4 done')).toBeTruthy();
    expect(screen.getByText('ISO: pins you’re looking for')).toBeTruthy();
    expect(screen.queryByText('Add the pins you own: pick from the catalogue')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Add the pins you own\./ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/browse-catalogue', params: { mode: 'add' } });
    // The decision is saved for this account.
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ eligible: true });
  }, 20_000);

  it('ticks steps from the collection', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ eligible: true }));
    mockCollection = { a: { status: 'owned' }, b: { status: 'wanted' } };
    await render(<GetStartedCard />);
    await waitFor(() => expect(screen.getByText('2 of 4 done')).toBeTruthy());
    expect(screen.getByRole('button', { name: /^Add the pins you own\..* Done\.$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Mark a spare For Trade\./ })).toBeTruthy();
  });

  it('See your trade matches opens Find Trades and ticks itself', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ eligible: true }));
    await render(<GetStartedCard />);
    await waitFor(() => expect(screen.getByText('0 of 4 done')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: /^See your trade matches\./ }));
    expect(mockPush).toHaveBeenCalledWith('/find-trades');
    expect(screen.getByText('1 of 4 done')).toBeTruthy();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!).matchesSeen).toBe(true));
  });

  it('Hide puts the Add pins card back and is remembered', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ eligible: true }));
    await render(<GetStartedCard />);
    await waitFor(() => expect(screen.getByText('Get started')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Hide Get started' }));
    expect(screen.queryByText('Get started')).toBeNull();
    expect(screen.getByText('Add the pins you own')).toBeTruthy();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!).dismissed).toBe(true));
  });

  it('never shows for an existing collector (5+ pins or an older account)', async () => {
    mockCollection = { a: { status: 'owned' }, b: { status: 'owned' }, c: { status: 'owned' }, d: { status: 'owned' }, e: { status: 'wanted' } };
    await render(<GetStartedCard />);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByText('Get started')).toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ eligible: false });
  });
});
