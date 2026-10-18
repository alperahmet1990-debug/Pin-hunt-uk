import { parseRecoveryLink, resolveGuardTarget, UPDATE_PASSWORD_ROUTE } from '../recoveryLink';
import { redirectSystemPath } from '../../app/+native-intent';

describe('parseRecoveryLink', () => {
  it('reads implicit-flow tokens from the fragment', () => {
    expect(
      parseRecoveryLink('pinhunt://reset#access_token=a&refresh_token=r&type=recovery'),
    ).toEqual({ kind: 'tokens', accessToken: 'a', refreshToken: 'r' });
  });
  it('reads a PKCE code from the query', () => {
    expect(parseRecoveryLink('pinhunt://reset?code=abc')).toEqual({ kind: 'code', code: 'abc' });
  });
  it('rejects non-recovery types, other paths and empty input', () => {
    expect(parseRecoveryLink('pinhunt://reset#access_token=a&refresh_token=r&type=signup')).toBeNull();
    expect(parseRecoveryLink('pinhunt://pin/1#access_token=a&refresh_token=r&type=recovery')).toBeNull();
    expect(parseRecoveryLink('pinhunt://reset')).toBeNull();
    expect(parseRecoveryLink(null)).toBeNull();
  });
});

describe('resolveGuardTarget', () => {
  const base = { hasSession: true, isRecovery: false, needsUsername: false };

  it('sends a recovery session to update-password from any other screen', () => {
    for (const segments of [['(tabs)'], ['complete-profile'], ['(auth)', 'login'], ['pin', '[id]']]) {
      expect(resolveGuardTarget({ ...base, isRecovery: true, segments })).toBe(UPDATE_PASSWORD_ROUTE);
    }
  });
  it('lets a recovery session stay on update-password, even with no username', () => {
    expect(
      resolveGuardTarget({ ...base, isRecovery: true, needsUsername: true, segments: ['(auth)', 'update-password'] }),
    ).toBeNull();
  });
  it('keeps normal redirects unchanged', () => {
    expect(resolveGuardTarget({ ...base, hasSession: false, segments: ['(tabs)'] })).toBe('/(auth)/login');
    expect(resolveGuardTarget({ ...base, hasSession: false, segments: ['(auth)', 'login'] })).toBeNull();
    expect(resolveGuardTarget({ ...base, segments: ['(auth)', 'login'] })).toBe('/(tabs)');
    expect(resolveGuardTarget({ ...base, needsUsername: true, segments: ['(auth)', 'login'] })).toBe('/complete-profile');
    expect(resolveGuardTarget({ ...base, needsUsername: true, segments: ['(tabs)'] })).toBe('/complete-profile');
    expect(resolveGuardTarget({ ...base, segments: ['complete-profile'] })).toBe('/(tabs)');
    expect(resolveGuardTarget({ ...base, segments: ['(tabs)'] })).toBeNull();
  });
});

describe('redirectSystemPath', () => {
  it('maps the reset link to update-password and leaves other paths alone', () => {
    expect(redirectSystemPath({ path: 'pinhunt://reset#access_token=a', initial: true })).toBe(UPDATE_PASSWORD_ROUTE);
    expect(redirectSystemPath({ path: '/reset', initial: false })).toBe(UPDATE_PASSWORD_ROUTE);
    expect(redirectSystemPath({ path: '/pin/1', initial: false })).toBe('/pin/1');
  });
});

// #398: the contributor website's reset emails come back to https://<site>/reset.
describe('parseRecoveryLink on the website', () => {
  it('reads the tokens from the site\'s own /reset address', () => {
    expect(parseRecoveryLink('https://contribute.example.test/reset#access_token=a&refresh_token=r&type=recovery'))
      .toEqual({ kind: 'tokens', accessToken: 'a', refreshToken: 'r' });
    expect(parseRecoveryLink('https://contribute.example.test/reset?code=c')).toEqual({ kind: 'code', code: 'c' });
  });
});
