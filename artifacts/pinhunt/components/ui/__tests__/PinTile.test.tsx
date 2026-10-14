import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PinTile, pinTileLabel } from '../PinTile';
import { pinGridColumns, pinTileSize, PIN_GRID_GUTTER } from '../PinGrid';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const noop = () => {};

describe('pinTileLabel', () => {
  it('reads title, status, copies and photo need in one line', () => {
    expect(pinTileLabel({ title: 'Stitch', status: 'owned', copies: 2, photoNeeded: true }))
      .toBe('Stitch, Owned, 2 copies, photo needed');
  });

  it('leaves out what is not there', () => {
    expect(pinTileLabel({ title: 'Stitch' })).toBe('Stitch');
    expect(pinTileLabel({ title: 'Stitch', status: 'none', copies: 1 })).toBe('Stitch');
    expect(pinTileLabel({ title: 'Stitch', status: 'wanted' })).toBe('Stitch, ISO');
    expect(pinTileLabel({ title: 'Stitch', missing: true })).toBe('Stitch, missing');
  });
});

describe('PinTile', () => {
  it('is a button outside select mode and shows the photo badge label', async () => {
    const { getByRole } = await render(<PinTile title="Stitch" size={95} photoNeeded onPress={noop} />);
    expect(getByRole('button', { name: 'Stitch, photo needed' })).toBeTruthy();
  }, 20_000);

  it('is a checked checkbox in select mode', async () => {
    const { getByRole } = await render(<PinTile title="Stitch" size={95} selected onPress={noop} />);
    expect(getByRole('checkbox').props.accessibilityState).toEqual({ checked: true });
  });

  it('marks a tile that cannot be selected as disabled', async () => {
    const { getByRole } = await render(
      <PinTile title="Stitch" size={95} status="owned" selected={false} selectionDisabled onPress={noop} />,
    );
    expect(getByRole('checkbox').props.accessibilityState).toEqual({ checked: false, disabled: true });
  });

  it('quick add calls its own handler, not the tile press', async () => {
    const onPress = jest.fn();
    const onQuickAdd = jest.fn();
    const { getByLabelText } = await render(
      <PinTile title="Stitch" size={95} onPress={onPress} onQuickAdd={onQuickAdd} />,
    );
    fireEvent.press(getByLabelText('Quick add Stitch'), { stopPropagation: noop });
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hides quick add in select mode', async () => {
    const { queryByLabelText } = await render(
      <PinTile title="Stitch" size={95} selected={false} onPress={noop} onQuickAdd={noop} />,
    );
    expect(queryByLabelText('Quick add Stitch')).toBeNull();
  });
});

describe('pin grid sizing', () => {
  it('uses 3 columns on phones and 4 from 600 pt', () => {
    expect(pinGridColumns(320)).toBe(3);
    expect(pinGridColumns(430)).toBe(3);
    expect(pinGridColumns(600)).toBe(4);
  });

  it('fits columns, gutters and side padding inside the width', () => {
    for (const w of [320, 390, 430, 768]) {
      const cols = pinGridColumns(w);
      const size = pinTileSize(w, cols, 16);
      expect(size * cols + PIN_GRID_GUTTER * (cols - 1) + 32).toBeLessThanOrEqual(w);
    }
    expect(pinTileSize(390, 3, 16)).toBe(114);
  });
});
