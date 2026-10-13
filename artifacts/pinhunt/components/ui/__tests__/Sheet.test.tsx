import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Sheet } from '../Sheet';
import { ConfirmDialog } from '../ConfirmDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Sheet (UX-041)', () => {
  it('shows a title and a Close button that closes it', async () => {
    const onClose = jest.fn();
    await render(<Sheet visible title="New board" onClose={onClose}><Text>Body</Text></Sheet>);
    expect(screen.getByRole('header', { name: 'New board' })).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('keeps the backdrop a sibling: a tap inside the sheet does not close it', async () => {
    const onClose = jest.fn();
    const onRow = jest.fn();
    await render(
      <Sheet visible title="Options" onClose={onClose}>
        <TouchableOpacity accessibilityRole="button" onPress={onRow}><Text>Rename</Text></TouchableOpacity>
      </Sheet>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Rename' }));
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the footer', async () => {
    await render(<Sheet visible title="Rename" onClose={jest.fn()} footer={<Text>Save</Text>}><Text>Field</Text></Sheet>);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('renders nothing while hidden', async () => {
    await render(<Sheet visible={false} title="Hidden" onClose={jest.fn()}><Text>Body</Text></Sheet>);
    expect(screen.queryByText('Body')).toBeNull();
  });
});

describe('ConfirmDialog (UX-041)', () => {
  it('confirms and cancels through in-app buttons', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ConfirmDialog visible destructive title="Delete Board?" message="Your pins stay." confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(screen.getByRole('header', { name: 'Delete Board?' })).toBeTruthy();
    expect(screen.getByText('Your pins stay.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a backdrop tap cancels, never confirms', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<ConfirmDialog visible title="Remove Pin?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByTestId('confirm-backdrop', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
