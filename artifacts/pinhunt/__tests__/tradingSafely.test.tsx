import React from 'react';
import { render, screen } from '@testing-library/react-native';
import TradingSafelyScreen from '../app/trading-safely';
import { TRADING_SAFELY_INTRO, TRADING_SAFELY_SECTIONS } from '../utils/tradingSafely';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const allCopy = (sections = TRADING_SAFELY_SECTIONS) =>
  sections.flatMap(s => [s.title, ...s.points]).join(' ').toLowerCase();

describe('Trading safely guide (UX-032, #144)', () => {
  it('shows every section, with the planned one marked as not available yet', async () => {
    await render(<TradingSafelyScreen />);
    expect(screen.getByText(TRADING_SAFELY_INTRO)).toBeTruthy();
    for (const s of TRADING_SAFELY_SECTIONS) expect(screen.getByRole('header', { name: s.title })).toBeTruthy();
    expect(screen.getAllByText('NOT AVAILABLE YET')).toHaveLength(TRADING_SAFELY_SECTIONS.filter(s => s.comingLater).length);
  });

  it('says each collector buys their own postage and PinHunt handles no payments or escrow', () => {
    const copy = allCopy();
    expect(copy).toContain('pays for your own postage');
    expect(copy).toMatch(/never handles money between collectors/);
    expect(copy).toMatch(/escrow/);
  });

  it('only mentions label purchase and tracking in the trade under "Coming later"', () => {
    const now = allCopy(TRADING_SAFELY_SECTIONS.filter(s => !s.comingLater));
    expect(now).not.toMatch(/royal mail|inpost|buy your own .*label/);
    const later = allCopy(TRADING_SAFELY_SECTIONS.filter(s => s.comingLater));
    expect(later).toMatch(/royal mail/);
    expect(later).toMatch(/inpost/);
  });
});
