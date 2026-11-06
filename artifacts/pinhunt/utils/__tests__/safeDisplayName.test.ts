import { safeDisplayName } from '../../../../lib/pin-repository/src/display-name';

describe('safeDisplayName', () => {
  it('keeps a real name, trimmed', () => {
    expect(safeDisplayName('  Sam Lee ')).toBe('Sam Lee');
  });

  it('drops an email address stored as the name', () => {
    expect(safeDisplayName('collector@example.com')).toBeUndefined();
  });

  it('drops blank and missing values', () => {
    expect(safeDisplayName('')).toBeUndefined();
    expect(safeDisplayName('   ')).toBeUndefined();
    expect(safeDisplayName(null)).toBeUndefined();
    expect(safeDisplayName(undefined)).toBeUndefined();
  });
});
