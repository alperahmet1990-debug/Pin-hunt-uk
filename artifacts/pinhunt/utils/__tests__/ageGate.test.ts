import { ageGateFor } from '../profileState';
import { CONFIRM_AGE_ROUTE, NOT_ELIGIBLE_ROUTE, resolveGuardTarget, UPDATE_PASSWORD_ROUTE } from '../recoveryLink';

// LP-8 (#530): AuthGuard sends unconfirmed accounts to Confirm age, and
// declined accounts to the not-eligible screen (plus Delete account) only.

describe('ageGateFor', () => {
  it('moves only on a status the server returned', () => {
    expect(ageGateFor({ hasSession: true, ageStatus: 'unconfirmed' })).toEqual({ needsAgeConfirmation: true, ageDeclined: false });
    expect(ageGateFor({ hasSession: true, ageStatus: 'declined' })).toEqual({ needsAgeConfirmation: false, ageDeclined: true });
    for (const ageStatus of ['confirmed', 'unavailable', null] as const) {
      expect(ageGateFor({ hasSession: true, ageStatus })).toEqual({ needsAgeConfirmation: false, ageDeclined: false });
    }
    expect(ageGateFor({ hasSession: false, ageStatus: 'declined' })).toEqual({ needsAgeConfirmation: false, ageDeclined: false });
  });
});

describe('resolveGuardTarget with the age gate', () => {
  const base = { hasSession: true, isRecovery: false, needsUsername: false };

  it('sends an unconfirmed account to Confirm age from anywhere, before the username', () => {
    for (const segments of [['(tabs)'], ['(auth)', 'login'], ['complete-profile'], ['pin', '[id]'], ['not-eligible']]) {
      expect(resolveGuardTarget({ ...base, needsAgeConfirmation: true, segments })).toBe(CONFIRM_AGE_ROUTE);
      expect(resolveGuardTarget({ ...base, needsUsername: true, needsAgeConfirmation: true, segments })).toBe(CONFIRM_AGE_ROUTE);
    }
    expect(resolveGuardTarget({ ...base, needsAgeConfirmation: true, segments: ['confirm-age'] })).toBeNull();
  });

  it('keeps a declined account on the not-eligible screen and Delete account only', () => {
    for (const segments of [['(tabs)'], ['confirm-age'], ['complete-profile'], ['legal', '[doc]'], ['community', 'chat', '[id]'], ['(auth)', 'login']]) {
      expect(resolveGuardTarget({ ...base, ageDeclined: true, segments })).toBe(NOT_ELIGIBLE_ROUTE);
    }
    expect(resolveGuardTarget({ ...base, ageDeclined: true, segments: ['not-eligible'] })).toBeNull();
    expect(resolveGuardTarget({ ...base, ageDeclined: true, segments: ['delete-account'] })).toBeNull();
    // Declined wins over an unconfirmed flag and a missing username.
    expect(resolveGuardTarget({ ...base, needsUsername: true, needsAgeConfirmation: true, ageDeclined: true, segments: ['(tabs)'] })).toBe(NOT_ELIGIBLE_ROUTE);
  });

  it('moves a confirmed account off the age screens', () => {
    expect(resolveGuardTarget({ ...base, segments: ['confirm-age'] })).toBe('/(tabs)');
    expect(resolveGuardTarget({ ...base, segments: ['not-eligible'] })).toBe('/(tabs)');
    expect(resolveGuardTarget({ ...base, needsUsername: true, segments: ['confirm-age'] })).toBe('/complete-profile');
  });

  it('leaves password recovery and signed-out redirects as they were', () => {
    expect(resolveGuardTarget({ ...base, isRecovery: true, ageDeclined: true, segments: ['not-eligible'] })).toBe(UPDATE_PASSWORD_ROUTE);
    expect(resolveGuardTarget({ ...base, hasSession: false, ageDeclined: true, needsAgeConfirmation: true, segments: ['(tabs)'] })).toBe('/(auth)/login');
    expect(resolveGuardTarget({ ...base, hasSession: false, needsAgeConfirmation: true, segments: ['(auth)', 'register'] })).toBeNull();
  });
});
