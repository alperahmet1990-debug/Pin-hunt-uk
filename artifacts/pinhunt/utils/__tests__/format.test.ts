import { formatDate, formatDayMonth, formatMoney, setFormatMarket } from '../format';

// HM-03 (#563): money and dates by home market. UK output must not change.

const d = new Date('2026-11-08T14:05:00');

afterEach(() => setFormatMarket('UK'));

describe('UK (default): identical to the old hard-coded en-GB output', () => {
  it.each([
    ['short', { day: 'numeric', month: 'short' }],
    ['medium', { day: 'numeric', month: 'short', year: 'numeric' }],
    ['long', { day: 'numeric', month: 'long', year: 'numeric' }],
  ] as const)('%s', (style, opts) => {
    expect(formatDate(d, style)).toBe(d.toLocaleDateString('en-GB', opts as Intl.DateTimeFormatOptions));
  });

  it('numeric and time', () => {
    expect(formatDate(d, 'numeric')).toBe(d.toLocaleDateString('en-GB'));
    expect(formatDate(d, 'time')).toBe(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  });

  it('reads ISO strings, and is empty for nonsense', () => {
    expect(formatDate('2026-11-08T14:05:00', 'medium')).toBe('8 Nov 2026');
    expect(formatDate('not a date')).toBe('');
  });
});

describe('US', () => {
  it('month first, US style', () => {
    setFormatMarket('US');
    expect(formatDate(d, 'medium')).toBe('Nov 8, 2026');
    expect(formatDate(d, 'long')).toBe('November 8, 2026');
    expect(formatDate(d, 'short')).toBe('Nov 8');
    expect(formatDate(d, 'numeric')).toBe('11/08/2026');
  });

  it('a market can be asked for directly', () => {
    expect(formatDate(d, 'medium', { market: 'US' })).toBe('Nov 8, 2026');
    expect(formatDate(d, 'medium')).toBe('8 Nov 2026');
  });

  it('date pills keep the same shape', () => {
    expect(formatDayMonth(d)).toEqual({ day: '08', month: 'NOV' });
    expect(formatDayMonth(d, 'US')).toEqual({ day: '08', month: 'NOV' });
  });
});

describe('money', () => {
  it('currency decides the symbol; whole amounts drop pence', () => {
    expect(formatMoney(14, 'GBP')).toBe('£14');
    expect(formatMoney(13.5, 'GBP')).toBe('£13.50');
    expect(formatMoney(20, 'USD')).toBe('$20');
    expect(formatMoney(9.49, 'GBP', { whole: true })).toBe('£9');
  });
});
