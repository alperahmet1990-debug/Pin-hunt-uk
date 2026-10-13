import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('offers its next action as a 44pt button', async () => {
    const onAction = jest.fn();
    const { getByRole } = await render(
      <EmptyState title="No ISO pins yet" actionLabel="Find a pin to add" onAction={onAction} />,
    );
    const button = getByRole('button', { name: 'Find a pin to add' });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows no button without an action', async () => {
    const { queryByRole } = await render(<EmptyState title="No pins found" subtitle="Try a different search." />);
    expect(queryByRole('button')).toBeNull();
  });
});
