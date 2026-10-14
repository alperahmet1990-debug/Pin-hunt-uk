import { tabScreenBottomPad, TAB_BAR_CLEARANCE, WEB_TAB_BAR_HEIGHT } from '../tabBarSpace';

// #260: on web the floating tab bar must never cover a tab screen's last item.
describe('tabScreenBottomPad', () => {
  it('clears the 84 pt web tab bar with room to spare', () => {
    expect(WEB_TAB_BAR_HEIGHT).toBe(84);
    expect(tabScreenBottomPad(0, 'web')).toBe(WEB_TAB_BAR_HEIGHT + TAB_BAR_CLEARANCE);
    expect(tabScreenBottomPad(0, 'web')).toBeGreaterThan(WEB_TAB_BAR_HEIGHT);
  });

  it('leaves native spacing exactly as the screen asked', () => {
    expect(tabScreenBottomPad(34 + 80, 'ios')).toBe(114);
    expect(tabScreenBottomPad(92, 'android')).toBe(92);
  });
});
