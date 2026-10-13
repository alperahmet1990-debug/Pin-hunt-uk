import {
  getStartedSteps,
  initialGetStartedState,
  NEW_ACCOUNT_WINDOW_MS,
  parseGetStartedState,
  shouldShowGetStarted,
} from '../getStarted';

const done = (statuses: (string | undefined)[], matches = false) =>
  Object.fromEntries(getStartedSteps(statuses, matches).map(s => [s.id, s.done]));

describe('getStartedSteps (UX-002)', () => {
  it('ticks each step from the collection', () => {
    expect(done([])).toEqual({ add: false, iso: false, trade: false, matches: false });
    expect(done(['owned'])).toEqual({ add: true, iso: false, trade: false, matches: false });
    expect(done(['wanted'])).toEqual({ add: false, iso: true, trade: false, matches: false });
    // A For Trade pin is owned too.
    expect(done(['for_trade'])).toEqual({ add: true, iso: false, trade: true, matches: false });
    expect(done(['owned', 'wanted', 'for_trade'], true)).toEqual({ add: true, iso: true, trade: true, matches: true });
  });

  it('explains ISO on first mention and opens the right screens', () => {
    const steps = getStartedSteps([], false);
    expect(steps[1].detail).toBe('ISO: pins you’re looking for');
    expect(steps.map(s => s.route)).toEqual([
      { pathname: '/browse-catalogue', params: { mode: 'add' } },
      '/search',
      { pathname: '/(tabs)/collection', params: { tab: 'traders' } },
      '/find-trades',
    ]);
  });
});

describe('who sees it', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const fresh = new Date(now - 60_000).toISOString();
  const old = new Date(now - NEW_ACCOUNT_WINDOW_MS - 1).toISOString();

  it('new accounts with fewer than 5 entries, decided once', () => {
    expect(initialGetStartedState(0, fresh, now)).toEqual({ eligible: true });
    expect(initialGetStartedState(4, fresh, now)).toEqual({ eligible: true });
    expect(initialGetStartedState(5, fresh, now)).toEqual({ eligible: false });
    expect(initialGetStartedState(0, old, now)).toEqual({ eligible: false });
    expect(initialGetStartedState(0, undefined, now)).toEqual({ eligible: false });
  });

  it('hides when dismissed, ineligible, unknown or all done', () => {
    const open = getStartedSteps(['owned'], false);
    const allDone = getStartedSteps(['owned', 'wanted', 'for_trade'], true);
    expect(shouldShowGetStarted({ eligible: true }, open)).toBe(true);
    expect(shouldShowGetStarted({ eligible: true, dismissed: true }, open)).toBe(false);
    expect(shouldShowGetStarted({ eligible: false }, open)).toBe(false);
    expect(shouldShowGetStarted(null, open)).toBe(false);
    expect(shouldShowGetStarted({ eligible: true }, allDone)).toBe(false);
  });

  it('reads stored state defensively', () => {
    expect(parseGetStartedState(null)).toBeNull();
    expect(parseGetStartedState('nope')).toBeNull();
    expect(parseGetStartedState('{"x":1}')).toBeNull();
    expect(parseGetStartedState('{"eligible":true,"matchesSeen":true}')).toEqual({ eligible: true, matchesSeen: true });
  });
});
