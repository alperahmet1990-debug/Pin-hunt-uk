import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DeleteAccountScreen from '../delete-account';
import { requestAccountDeletion } from '@/utils/deleteAccount';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'tok' }, signOut: mockSignOut }),
}));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => new Proxy({}, { get: () => '#000000' }),
}));
jest.mock('@/utils/deleteAccount', () => ({
  ...jest.requireActual('@/utils/deleteAccount'),
  requestAccountDeletion: jest.fn(),
}));

const mockRequest = requestAccountDeletion as jest.Mock;

async function setup(typed?: string) {
  const utils = await render(<DeleteAccountScreen />);
  if (typed !== undefined) await fireEvent.changeText(utils.getByLabelText('Type DELETE to confirm'), typed);
  return utils;
}

describe('DeleteAccountScreen', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('disables confirm until DELETE is typed', async () => {
    const { getByRole } = await setup('delete');
    expect(getByRole('button', { name: 'Delete my account' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(getByRole('button', { name: 'Delete my account' }));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('signs out after a successful deletion', async () => {
    mockRequest.mockResolvedValue('deleted');
    const { getByRole } = await setup('DELETE');
    const button = getByRole('button', { name: 'Delete my account' });
    expect(button.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(button);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith('tok');
  });

  it('shows a retry message on failure and stays signed in', async () => {
    mockRequest.mockResolvedValue('retry');
    const { getByRole, findByText } = await setup('DELETE');
    await fireEvent.press(getByRole('button', { name: 'Delete my account' }));
    expect(await findByText(/couldn't delete your account/i)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getByRole('button', { name: 'Delete my account' })).toBeTruthy();
  });

  it('explains accounts that cannot be deleted in the app', async () => {
    mockRequest.mockResolvedValue('not_allowed');
    const { getByRole, findByText } = await setup('DELETE');
    await fireEvent.press(getByRole('button', { name: 'Delete my account' }));
    expect(await findByText(/can't be deleted in the app/i)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('signs out on 401', async () => {
    mockRequest.mockResolvedValue('unauthorized');
    const { getByRole } = await setup('DELETE');
    await fireEvent.press(getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});
