import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorState } from '../ErrorState';

const offline = { kind: 'offline' as const, title: "You're offline", message: 'Check your connection and try again.' };

describe('ErrorState (UX-046)', () => {
  it('announces the problem and offers Retry', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={offline} onRetry={onRetry} />);
    expect(screen.getByRole('alert', { name: "You're offline. Check your connection and try again." })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('can offer a second way forward', async () => {
    const onPress = jest.fn();
    await render(<ErrorState compact error={offline} onRetry={jest.fn()} secondary={{ label: 'Search instead', onPress }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Search instead' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows no buttons when there is nothing to retry', async () => {
    await render(<ErrorState error={offline} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
