import { IDLE_VIEWFINDER_MAX, IDLE_VIEWFINDER_MIN, idleViewfinderHeight } from '../scanLayout';

// WP3: on a 320×568 screen the actions must not sit under the viewfinder.
describe('idleViewfinderHeight', () => {
  // Web: 67 pt top inset + 16 pt padding; 104 pt for the floating tab bar.
  const top = 83;
  const bottom = 104;

  it('keeps the full card on a 390×844 phone', () => {
    expect(idleViewfinderHeight(844, top, bottom)).toBe(IDLE_VIEWFINDER_MAX);
  });

  it('shrinks the card on a 568 pt screen so the actions fit above the tab bar', () => {
    const h = idleViewfinderHeight(568, top, bottom);
    expect(h).toBeLessThan(IDLE_VIEWFINDER_MAX);
    expect(top + 64 + h + 16 + 168 + bottom).toBeLessThanOrEqual(568);
  });

  it('never goes below the minimum on a very short window', () => {
    expect(idleViewfinderHeight(400, top, bottom)).toBe(IDLE_VIEWFINDER_MIN);
  });
});
