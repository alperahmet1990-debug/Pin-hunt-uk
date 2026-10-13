import { shouldOfferWelcome, WELCOME_WINDOW_MS } from '../addPinsOnboarding';

const now = Date.parse('2026-10-13T12:00:00Z');
const created = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('shouldOfferWelcome (UX-055)', () => {
  it('offers to a new account with nothing collected', () => {
    expect(shouldOfferWelcome({ pinCount: 0, accountCreatedAt: created(60_000), seen: false, now })).toBe(true);
  });

  it.each([
    ['already answered', { pinCount: 0, accountCreatedAt: created(60_000), seen: true }],
    ['has pins', { pinCount: 3, accountCreatedAt: created(60_000), seen: false }],
    ['older account (pins may still be syncing)', { pinCount: 0, accountCreatedAt: created(WELCOME_WINDOW_MS + 1), seen: false }],
    ['no creation date', { pinCount: 0, accountCreatedAt: undefined, seen: false }],
    ['unparseable date', { pinCount: 0, accountCreatedAt: 'soon', seen: false }],
  ])('does not offer when %s', (_label, opts) => {
    expect(shouldOfferWelcome({ ...opts, now })).toBe(false);
  });
});
