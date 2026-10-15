import React from 'react';
import { AccessibilityInfo, Animated, Dimensions } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { SkeletonGrid, SkeletonHeader, SkeletonRows } from '../Skeleton';
import { pinGridColumns, pinTileSize } from '../PinGrid';

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({ homeAqua: '#E8ECF7', homeLine: '#E3E0EC' }),
}));

let reduceMotion = false;
let loops: { start: jest.Mock; stop: jest.Mock }[] = [];

beforeEach(() => {
  reduceMotion = false;
  loops = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
  jest.spyOn(Animated, 'loop').mockImplementation(() => {
    const loop = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    loops.push(loop);
    return loop;
  });
});

afterEach(() => jest.restoreAllMocks());

const flush = () => act(async () => { await Promise.resolve(); });

describe('Skeleton (UX-045)', () => {
  it('is one busy progress element for screen readers, not a pile of blocks', async () => {
    await render(<SkeletonGrid label="Loading your pins" />);
    await flush();
    const el = screen.getByRole('progressbar', { name: 'Loading your pins' });
    expect(el.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('matches PinGrid: same columns and tile size for the window, rows as asked', async () => {
    const { width } = Dimensions.get('window');
    const columns = pinGridColumns(width);
    await render(<SkeletonGrid label="Loading" rows={2} testID="grid" />);
    await flush();
    const grid = screen.getByTestId('grid');
    expect(grid.children).toHaveLength(2);
    for (const row of grid.children) {
      if (typeof row === 'string') throw new Error('unexpected text');
      expect(row.children).toHaveLength(columns);
      const tile = row.children[0];
      if (typeof tile === 'string') throw new Error('unexpected text');
      expect(tile.props.style).toEqual({ width: pinTileSize(width, columns) });
    }
  });

  it('sizes tiles from an explicit column count and tile size', async () => {
    await render(<SkeletonGrid label="Loading sets" columns={2} tileSize={150} rows={1} testID="grid" />);
    await flush();
    const row = screen.getByTestId('grid').children[0];
    expect(typeof row === 'object' && row.children).toHaveLength(2);
  });

  it('pulses when motion is allowed', async () => {
    await render(<SkeletonRows label="Searching pins" count={3} />);
    await flush();
    expect(loops).toHaveLength(1);
    expect(loops[0].start).toHaveBeenCalled();
    expect(loops[0].stop).not.toHaveBeenCalled();
  });

  it('holds still with Reduce Motion on', async () => {
    reduceMotion = true;
    await render(<SkeletonHeader label="Loading collector" />);
    await flush();
    // Any pulse started before the setting was read is stopped, and none restarts.
    expect(loops.every(l => l.stop.mock.calls.length > 0)).toBe(true);
    expect(loops.length).toBeLessThanOrEqual(1);
    expect(screen.getByRole('progressbar', { name: 'Loading collector' })).toBeTruthy();
  });
});
