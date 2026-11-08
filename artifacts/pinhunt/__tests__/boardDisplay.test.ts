import {
  autoLayout,
  BOARD_ASPECT,
  boardGrid,
  hashUnit,
  movePlacement,
  pinSizeFraction,
  placementsFor,
  prunePlacements,
} from '../utils/boardDisplay';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `PHUK-${String(i + 1).padStart(8, '0')}`);

describe('realistic boards: layout', () => {
  it('fits any number of pins in rows on a 4:3 board', () => {
    expect(boardGrid(1)).toEqual({ cols: 2, rows: 1 });
    expect(boardGrid(10)).toEqual({ cols: 4, rows: 3 });
    for (const n of [1, 3, 8, 10, 25, 60]) {
      const { cols, rows } = boardGrid(n);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
    }
  });

  it('sizes pins so they never overlap their row or column', () => {
    for (const n of [1, 2, 8, 10, 25, 60]) {
      const { cols, rows } = boardGrid(n);
      const s = pinSizeFraction(n);
      expect(s).toBeLessThanOrEqual(1 / cols);
      expect(s * BOARD_ASPECT).toBeLessThanOrEqual(1 / rows);
    }
    // A few pins don't turn giant.
    expect(pinSizeFraction(1)).toBeLessThanOrEqual(0.3);
  });

  it('places every pin on the board, the same way every time', () => {
    const pins = ids(10);
    const a = autoLayout(pins, 'cork');
    expect(autoLayout(pins, 'cork')).toEqual(a);
    for (const id of pins) {
      expect(a[id].x).toBeGreaterThan(0);
      expect(a[id].x).toBeLessThan(1);
      expect(a[id].y).toBeGreaterThan(0);
      expect(a[id].y).toBeLessThan(1);
      expect(Math.abs(a[id].r)).toBeLessThanOrEqual(6);
    }
  });

  it('mounts shadow box pins nearly straight', () => {
    const a = autoLayout(ids(10), 'shadowbox');
    for (const p of Object.values(a)) expect(Math.abs(p.r)).toBeLessThanOrEqual(1.5);
  });

  it('keeps hand-arranged pins where they were put, auto-places the rest', () => {
    const pins = ids(3);
    const mine = { x: 0.9, y: 0.1, r: 0 };
    const out = placementsFor(pins, { style: 'cork', placements: { [pins[1]]: mine } });
    expect(out[pins[1]]).toEqual(mine);
    expect(out[pins[0]]).toEqual(autoLayout(pins, 'cork')[pins[0]]);
  });

  it('moves a dragged pin by the drag distance, and never off the board', () => {
    const start = { x: 0.5, y: 0.5, r: 3 };
    const moved = movePlacement(start, 100, 75, 1000, 0.1);
    expect(moved.x).toBeCloseTo(0.6);
    expect(moved.y).toBeCloseTo(0.5 + 75 / (1000 / BOARD_ASPECT));
    expect(moved.r).toBe(3);
    const flung = movePlacement(start, 5000, -5000, 1000, 0.1);
    expect(flung.x).toBeCloseTo(0.95);
    expect(flung.y).toBeCloseTo((0.1 * BOARD_ASPECT) / 2);
  });

  it('forgets positions of pins taken off the board', () => {
    expect(prunePlacements({ a: { x: 0.1, y: 0.1, r: 0 }, b: { x: 0.2, y: 0.2, r: 0 } }, ['b'])).toEqual({ b: { x: 0.2, y: 0.2, r: 0 } });
  });

  it('seeds wobble from the pin id', () => {
    expect(hashUnit('Figment')).toBe(hashUnit('Figment'));
    expect(hashUnit('Figment')).not.toBe(hashUnit('Stitch'));
    expect(hashUnit('x')).toBeGreaterThanOrEqual(0);
    expect(hashUnit('x')).toBeLessThan(1);
  });
});
