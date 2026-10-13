/**
 * "Add pins you own" onboarding rules (UX-055, #207).
 *
 * Collectors build their collection fastest by picking pins from the
 * catalogue (Select all per set) rather than scanning each one. New accounts
 * get a one-time offer on Home; anyone with an empty collection gets a card.
 */
import type { Href } from 'expo-router';

/** Where every "Add pins you own" entry point goes: the catalogue in add mode. */
export const ADD_PINS_ROUTE = { pathname: '/browse-catalogue', params: { mode: 'add' } } as const satisfies Href;

/** Accounts younger than this get the one-time welcome offer. */
export const WELCOME_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export const welcomeSeenKey = (userId: string) => `@pinhunt_welcome_add_pins_v1:${userId}`;

/**
 * Show the one-time welcome offer only to new accounts with nothing collected
 * yet. The account-age check keeps it away from an existing collector whose
 * pins are still syncing on a new device.
 */
export function shouldOfferWelcome(opts: {
  pinCount: number;
  accountCreatedAt?: string;
  seen: boolean;
  now?: number;
}): boolean {
  const { pinCount, accountCreatedAt, seen, now = Date.now() } = opts;
  if (seen || pinCount > 0 || !accountCreatedAt) return false;
  const created = Date.parse(accountCreatedAt);
  if (Number.isNaN(created)) return false;
  return now - created < WELCOME_WINDOW_MS;
}
