import React from 'react';
import { render } from '@testing-library/react-native';
import { CompactPinTile } from '../CompactPinTile';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const pin = { id: 'p1', title: 'Test Pin' } as never;
const noop = () => {};

describe('CompactPinTile status markers', () => {
  it.each([
    ['owned', true, 'Test Pin, Owned'],
    ['for_trade', true, 'Test Pin, For Trade'],
    ['wanted', false, 'Test Pin, ISO'],
  ] as const)('labels a %s tile for screen readers', async (status, owned, label) => {
    const { getByLabelText } = await render(
      <CompactPinTile pin={pin} owned={owned} status={status} size={95} onPress={noop} />,
    );
    expect(getByLabelText(label)).toBeTruthy();
  });

  it('shows ×N and includes copies in the label when more than one is owned', async () => {
    const { getByText, getByLabelText } = await render(
      <CompactPinTile pin={pin} owned status="for_trade" copies={3} size={95} onPress={noop} />,
    );
    expect(getByText('×3')).toBeTruthy();
    expect(getByLabelText('Test Pin, For Trade, 3 copies')).toBeTruthy();
  });

  it('shows no ×N for a single copy', async () => {
    const { queryByText } = await render(
      <CompactPinTile pin={pin} owned status="owned" copies={1} size={95} onPress={noop} />,
    );
    expect(queryByText('×1')).toBeNull();
  });

  it('has no marker for a missing pin that is not on the ISO', async () => {
    const { getByLabelText } = await render(
      <CompactPinTile pin={pin} owned={false} status="none" size={95} onPress={noop} />,
    );
    expect(getByLabelText('Test Pin')).toBeTruthy();
  });

  it('still marks owned pins when no status is passed (Pin detail set strip)', async () => {
    const { getByLabelText } = await render(
      <CompactPinTile pin={pin} owned size={95} onPress={noop} />,
    );
    expect(getByLabelText('Test Pin, Owned')).toBeTruthy();
  });
});
