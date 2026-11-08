import { hasSidePanel, layoutClass, REGULAR_MIN_WIDTH, WIDE_MIN_WIDTH } from '../utils/deviceLayout';

describe('layoutClass (iPad layouts follow the window, not the device)', () => {
  it('keeps phones, Slide Over and narrow Split View compact', () => {
    expect(layoutClass(320)).toBe('compact');
    expect(layoutClass(430)).toBe('compact');
    expect(layoutClass(REGULAR_MIN_WIDTH - 1)).toBe('compact');
  });

  it('treats iPad portrait as regular', () => {
    expect(layoutClass(REGULAR_MIN_WIDTH)).toBe('regular');
    expect(layoutClass(834)).toBe('regular');
    expect(layoutClass(WIDE_MIN_WIDTH - 1)).toBe('regular');
  });

  it('treats iPad landscape and wider as wide, with room for a side panel', () => {
    expect(layoutClass(1180)).toBe('wide');
    expect(layoutClass(1366)).toBe('wide');
    expect(hasSidePanel(1194)).toBe(true);
    expect(hasSidePanel(834)).toBe(false);
  });
});
