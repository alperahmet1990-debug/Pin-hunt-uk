import { profileSaveErrorLine } from '../userError';

// Profile saves never show the database's own text (TestFlight, 8 Nov 2026).

describe('profileSaveErrorLine', () => {
  it('the TestFlight case: a refused save gets plain words', () => {
    const line = profileSaveErrorLine(new Error('permission denied for table profiles'));
    expect(line).toBe('Couldn’t save your profile. Please try again. If it keeps happening, make sure you have the latest version of PinHunt.');
    expect(line).not.toMatch(/table|permission denied/);
  });

  it('a taken username', () => {
    expect(profileSaveErrorLine(new Error('duplicate key value violates unique constraint "profiles_username_key"')))
      .toBe('That username is already taken. Try another one.');
    expect(profileSaveErrorLine({ code: '23505', message: 'x' })).toMatch(/already taken/);
  });

  it('a username the database won’t accept', () => {
    expect(profileSaveErrorLine(new Error('new row for relation "profiles" violates check constraint "username_format"')))
      .toMatch(/^Something in your profile isn’t allowed/);
  });

  it('offline, timeout and signed-out use the app’s usual words', () => {
    expect(profileSaveErrorLine(new TypeError('Network request failed'))).toBe("You're offline. Check your connection and try again.");
    expect(profileSaveErrorLine(new Error('JWT expired'))).toBe('Please sign in again. Your session has ended. Sign in again to carry on.');
  });

  it('anything else is a plain "couldn’t save"', () => {
    expect(profileSaveErrorLine(new Error('relation "x" does not exist'))).toBe('Couldn’t save your profile. Please try again.');
  });
});
