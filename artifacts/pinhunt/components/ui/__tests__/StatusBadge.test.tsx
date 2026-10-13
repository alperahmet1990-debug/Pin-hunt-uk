import React from 'react';
import { render } from '@testing-library/react-native';
import { StatusBadge } from '../StatusBadge';
import { StatusBadge as FromIndex } from '..';

// The components/ui index reaches the Supabase client, which needs AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('StatusBadge', () => {
  it.each([
    ['owned', 'Owned', 'Status: Owned'],
    ['wanted', 'ISO', 'Status: ISO, on your wishlist'],
    ['for_trade', 'For Trade', 'Status: For Trade'],
  ] as const)('shows a distinct, labelled marker for %s', async (status, text, label) => {
    const { getByText, getByLabelText } = await render(<StatusBadge status={status} />);
    expect(getByText(text)).toBeTruthy();
    expect(getByLabelText(label)).toBeTruthy();
  });

  it('renders nothing for pins not in the collection', async () => {
    for (const status of ['none', undefined] as const) {
      const { toJSON } = await render(<StatusBadge status={status} />);
      expect(toJSON()).toBeNull();
    }
  });

  it('is exported from components/ui', () => {
    expect(FromIndex).toBe(StatusBadge);
  });
});
