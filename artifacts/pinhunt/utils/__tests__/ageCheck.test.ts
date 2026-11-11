import { ageOn, checkBirthDate, digitsOnly, MINIMUM_AGE } from '../ageCheck';

// LP-8 (#530): Register checks the date on the device; under 18 sends nothing.
const today = new Date(2026, 10, 9); // 9 November 2026, local

describe('checkBirthDate', () => {
  it('uses one threshold of 18', () => {
    expect(MINIMUM_AGE).toBe(18);
  });

  it('accepts an 18th birthday today', () => {
    expect(checkBirthDate('9', '11', '2008', today)).toEqual({ kind: 'ok', isoDate: '2008-11-09' });
  });

  it('refuses one day short of 18', () => {
    expect(checkBirthDate('10', '11', '2008', today)).toEqual({ kind: 'under_age', isoDate: '2008-11-10' });
  });

  it('refuses children and accepts older adults', () => {
    expect(checkBirthDate('01', '01', '2015', today).kind).toBe('under_age');
    expect(checkBirthDate('31', '12', '1950', today)).toEqual({ kind: 'ok', isoDate: '1950-12-31' });
  });

  it('rejects invalid dates', () => {
    for (const [d, m, y] of [
      ['', '', ''],
      ['31', '04', '1990'], // 31 April
      ['29', '02', '2003'], // not a leap year
      ['0', '5', '1990'],
      ['5', '13', '1990'],
      ['5', '5', '90'], // two-digit year
      ['5', '5', '1899'],
      ['10', '11', '2026'], // tomorrow
      ['a', '5', '1990'],
    ]) {
      expect(checkBirthDate(d, m, y, today)).toEqual({ kind: 'invalid' });
    }
  });

  it('counts a 29 February birthday from 1 March in other years', () => {
    expect(ageOn({ year: 2008, month: 2, day: 29 }, new Date(2026, 1, 28))).toBe(17);
    expect(ageOn({ year: 2008, month: 2, day: 29 }, new Date(2026, 2, 1))).toBe(18);
    expect(checkBirthDate('29', '02', '2008', new Date(2026, 1, 28)).kind).toBe('under_age');
  });
});

describe('digitsOnly', () => {
  it('keeps digits up to the limit', () => {
    expect(digitsOnly('1a2/3', 2)).toBe('12');
    expect(digitsOnly('19900', 4)).toBe('1990');
  });
});
