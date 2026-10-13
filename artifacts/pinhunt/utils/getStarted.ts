/**
 * New-collector "Get started" checklist (UX-002, #109): four steps that
 * teach the core loop (add pins → ISO → For Trade → matches) and tick
 * themselves off from the collection. Pure rules; the card lives in
 * components/GetStartedCard.tsx.
 */
import type { Href } from 'expo-router';
import { ADD_PINS_ROUTE } from '@/utils/addPinsOnboarding';

/** Accounts with this many collection entries on first check never see the checklist. */
export const NEW_COLLECTOR_MAX_ENTRIES = 5;

export const getStartedKey = (userId: string) => `@pinhunt_get_started_v1:${userId}`;

/** What's remembered per account. `eligible` is decided once, on first check. */
export interface GetStartedState {
  eligible: boolean;
  dismissed?: boolean;
  matchesSeen?: boolean;
}

export type GetStartedStepId = 'add' | 'iso' | 'trade' | 'matches';

export interface GetStartedStep {
  id: GetStartedStepId;
  title: string;
  detail: string;
  route: Href;
  done: boolean;
}

type Status = string | undefined;

export function getStartedSteps(statuses: Status[], matchesSeen: boolean): GetStartedStep[] {
  const has = (...wanted: string[]) => statuses.some(s => s !== undefined && wanted.includes(s));
  return [
    {
      id: 'add',
      title: 'Add the pins you own',
      detail: 'Pick them from the catalogue, no scanning needed',
      route: ADD_PINS_ROUTE,
      done: has('owned', 'for_trade'),
    },
    {
      id: 'iso',
      title: 'Add a pin to your ISO',
      detail: 'ISO: pins you’re looking for',
      route: '/search',
      done: has('wanted'),
    },
    {
      id: 'trade',
      title: 'Mark a spare For Trade',
      detail: 'Collectors looking for it can find you',
      route: { pathname: '/(tabs)/collection', params: { tab: 'traders' } },
      done: has('for_trade'),
    },
    {
      id: 'matches',
      title: 'See your trade matches',
      detail: 'Who has your ISO pins, and who wants your spares',
      route: '/find-trades',
      done: matchesSeen,
    },
  ];
}

/** Accounts older than this never see the checklist (their pins may still be syncing on a new device). */
export const NEW_ACCOUNT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** First check for an account: only new accounts that are just starting get the checklist. */
export function initialGetStartedState(entryCount: number, accountCreatedAt?: string, now = Date.now()): GetStartedState {
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  const newAccount = !Number.isNaN(created) && now - created < NEW_ACCOUNT_WINDOW_MS;
  return { eligible: newAccount && entryCount < NEW_COLLECTOR_MAX_ENTRIES };
}

export function shouldShowGetStarted(state: GetStartedState | null, steps: GetStartedStep[]): boolean {
  if (!state || !state.eligible || state.dismissed) return false;
  return steps.some(s => !s.done);
}

export function parseGetStartedState(raw: string | null): GetStartedState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.eligible === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}
