import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, IconButton, MIN_TOUCH } from '../Button';

const flat = (el: ReturnType<typeof screen.getByRole>) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

describe('Button (UX-039)', () => {
  it('is a button with its label and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Scan Pin" icon="camera" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Scan Pin' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  }, 20_000);

  it.each([
    ['primary', 'regular', 50],
    ['secondary', 'compact', MIN_TOUCH],
    ['destructive', 'regular', 50],
    ['text', 'regular', MIN_TOUCH],
  ] as const)('%s / %s is at least %i pt tall', async (variant, size, height) => {
    await render(<Button label="Go" variant={variant} size={size} onPress={jest.fn()} />);
    expect(flat(screen.getByRole('button', { name: 'Go' })).minHeight).toBe(height);
  });

  it('disabled and loading block presses and say so', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" disabled onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('loading is busy', async () => {
    await render(<Button label="Save" loading onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('reads a subtitle as part of the name', async () => {
    await render(<Button label="Find the 3 missing" subtitle="2 available from collectors" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Find the 3 missing. 2 available from collectors' })).toBeTruthy();
  });
});

describe('IconButton', () => {
  it('is a 44 pt target with a required spoken name', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="chevron-left" accessibilityLabel="Back" onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'Back' });
    expect(flat(btn)).toMatchObject({ width: MIN_TOUCH, height: MIN_TOUCH });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalled();
  });

  it('marks an active toggle as selected', async () => {
    await render(<IconButton icon="search" accessibilityLabel="Close search" active onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Close search' }).props.accessibilityState).toMatchObject({ selected: true });
  });
});
