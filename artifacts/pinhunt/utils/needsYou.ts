/**
 * Home's single "needs you" line (Home redesign G, Nov 2026). It folds trades
 * waiting, unread messages and submission updates into one slim row. The row
 * opens the first thing that is waiting, in this order of urgency.
 */
import { tradesWaitingLine } from '@/hooks/useTradesWaiting';

export type NeedsYouKind = 'trades' | 'messages' | 'submissions';

export interface NeedsYouPart {
  kind: NeedsYouKind;
  text: string;
  route: '/my-trades' | '/community/conversations' | '/my-submissions';
}

export function needsYouParts(counts: { trades: number; messages: number; submissions: number }): NeedsYouPart[] {
  const { trades, messages, submissions } = counts;
  return [
    trades > 0 ? { kind: 'trades', text: tradesWaitingLine(trades), route: '/my-trades' } : null,
    messages > 0 ? { kind: 'messages', text: `${messages} unread message${messages === 1 ? '' : 's'}`, route: '/community/conversations' } : null,
    submissions > 0 ? { kind: 'submissions', text: `${submissions} submission update${submissions === 1 ? '' : 's'}`, route: '/my-submissions' } : null,
  ].filter((part): part is NeedsYouPart => part !== null);
}
