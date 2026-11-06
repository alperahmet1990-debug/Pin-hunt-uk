import { needsUsernameFor } from '../profileState';

const base = { hasSession: true, profileLoaded: true, loadFailed: false };

describe('needsUsernameFor', () => {
  it('asks for a username only when a loaded profile has none', () => {
    expect(needsUsernameFor({ ...base, username: null })).toBe(true);
    expect(needsUsernameFor({ ...base, username: 'alex' })).toBe(false);
  });

  it('never treats a failed load as a missing username', () => {
    expect(needsUsernameFor({ ...base, loadFailed: true, username: null })).toBe(false);
  });

  it('waits for the load and for a session', () => {
    expect(needsUsernameFor({ ...base, profileLoaded: false })).toBe(false);
    expect(needsUsernameFor({ ...base, hasSession: false })).toBe(false);
  });
});
