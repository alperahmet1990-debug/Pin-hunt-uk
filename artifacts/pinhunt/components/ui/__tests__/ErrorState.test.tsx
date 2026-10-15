import React from 'react';
import { StyleSheet } from 'react-native';
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

  // UX-058 (#261): two actions side by side wrap their labels on a 320 pt screen.
  describe('compact actions by screen width', () => {
    const RN = require('react-native');
    const actionsDirection = () => StyleSheet.flatten(screen.getByTestId('error-actions').props.style)?.flexDirection;
    afterEach(() => jest.restoreAllMocks());

    it.each([[320, undefined], [390, 'row']])('at %i pt the actions are %s', async (width, direction) => {
      jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width, height: 700, scale: 2, fontScale: 1 });
      await render(<ErrorState compact error={offline} onRetry={jest.fn()} secondary={{ label: 'Search instead', onPress: jest.fn() }} />);
      expect(actionsDirection()).toBe(direction);
    });
  });
});
