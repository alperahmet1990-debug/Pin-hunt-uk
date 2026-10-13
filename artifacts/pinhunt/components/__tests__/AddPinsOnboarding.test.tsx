import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AddPinsCard } from '../AddPinsCard';
import { AddPinsWelcomeSheet } from '../AddPinsWelcomeSheet';

const mockPush = jest.fn();
let mockCollection: Record<string, unknown> = {};
let mockCreatedAt: string | undefined;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { createdAt: mockCreatedAt } }) }));

const ADD_ROUTE = { pathname: '/browse-catalogue', params: { mode: 'add' } };

beforeEach(async () => {
  mockPush.mockClear();
  mockCollection = {};
  mockCreatedAt = new Date().toISOString();
  await AsyncStorage.removeItem('@pinhunt_welcome_add_pins_v1:u1');
});

describe('AddPinsCard', () => {
  it('shows for an empty collection and opens add mode', async () => {
    await render(<AddPinsCard />);
    await fireEvent.press(screen.getByRole('button', { name: /Add the pins you own/ }));
    expect(mockPush).toHaveBeenCalledWith(ADD_ROUTE);
  });

  it('hides once anything is collected', async () => {
    mockCollection = { p1: { status: 'owned' } };
    await render(<AddPinsCard />);
    expect(screen.queryByText('Add the pins you own')).toBeNull();
  });
});

describe('AddPinsWelcomeSheet', () => {
  it('offers to a new account; Skip closes it and remembers the answer', async () => {
    await render(<AddPinsWelcomeSheet />);
    await waitFor(() => expect(screen.getByText('Already collecting?')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByText('Already collecting?')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem('@pinhunt_welcome_add_pins_v1:u1')).toBe('1'));
  });

  it('Add pins you own opens add mode and remembers the answer', async () => {
    await render(<AddPinsWelcomeSheet />);
    await waitFor(() => expect(screen.getByText('Already collecting?')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Add pins you own' }));
    expect(mockPush).toHaveBeenCalledWith(ADD_ROUTE);
    await waitFor(async () => expect(await AsyncStorage.getItem('@pinhunt_welcome_add_pins_v1:u1')).toBe('1'));
  });

  it('is not offered again once answered', async () => {
    await AsyncStorage.setItem('@pinhunt_welcome_add_pins_v1:u1', '1');
    await render(<AddPinsWelcomeSheet />);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByText('Already collecting?')).toBeNull();
  });

  it('is not offered to an older account', async () => {
    mockCreatedAt = '2025-01-01T00:00:00Z';
    await render(<AddPinsWelcomeSheet />);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByText('Already collecting?')).toBeNull();
  });
});
