/**
 * The steps a trade has been through, from the viewer's side, for the trade
 * screen's timeline. Built from the trade row's own timestamps (057), so it
 * needs no extra reads. Steps without a timestamp (accepted, declined,
 * cancelled) show without a time.
 */
import type { Trade } from '@workspace/pin-repository';

export interface TradeTimelineStep {
  key: string;
  label: string;
  at?: string;
}

export function tradeTimeline(trade: Trade, viewerId: string | null | undefined, otherName = 'They'): TradeTimelineStep[] {
  const viewerIsInitiator = trade.initiatorId === viewerId;
  const mine = (initiatorValue?: string, recipientValue?: string) =>
    viewerIsInitiator ? initiatorValue : recipientValue;
  const theirs = (initiatorValue?: string, recipientValue?: string) =>
    viewerIsInitiator ? recipientValue : initiatorValue;

  const steps: TradeTimelineStep[] = [
    { key: 'proposed', label: viewerIsInitiator ? 'You proposed the trade' : `${otherName} proposed the trade`, at: trade.createdAt },
  ];
  const wentAhead = ['accepted', 'completed', 'problem'].includes(trade.status)
    || !!trade.initiatorPostedAt || !!trade.recipientPostedAt;
  if (wentAhead) {
    steps.push({ key: 'accepted', label: viewerIsInitiator ? `${otherName} accepted` : 'You accepted' });
  }
  if (trade.status === 'rejected') {
    steps.push({ key: 'declined', label: viewerIsInitiator ? `${otherName} declined` : 'You declined', at: trade.updatedAt });
  }

  const posted: TradeTimelineStep[] = [];
  const myPosted = mine(trade.initiatorPostedAt, trade.recipientPostedAt);
  const theirPosted = theirs(trade.initiatorPostedAt, trade.recipientPostedAt);
  const myReceived = mine(trade.initiatorReceivedAt, trade.recipientReceivedAt);
  const theirReceived = theirs(trade.initiatorReceivedAt, trade.recipientReceivedAt);
  if (myPosted) posted.push({ key: 'my-posted', label: 'You posted your pins', at: myPosted });
  if (theirPosted) posted.push({ key: 'their-posted', label: `${otherName} posted their pins`, at: theirPosted });
  if (myReceived) posted.push({ key: 'my-received', label: 'You received their pins', at: myReceived });
  if (theirReceived) posted.push({ key: 'their-received', label: `${otherName} received your pins`, at: theirReceived });
  posted.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  steps.push(...posted);

  if (trade.problemReportedAt) {
    steps.push({ key: 'problem', label: 'A problem was reported', at: trade.problemReportedAt });
  }
  if (trade.status === 'completed') {
    const at = [trade.initiatorReceivedAt, trade.recipientReceivedAt].filter(Boolean).sort().pop() ?? trade.updatedAt;
    steps.push({ key: 'completed', label: 'Trade complete', at });
  }
  if (trade.status === 'cancelled') {
    steps.push({ key: 'cancelled', label: 'Trade cancelled', at: trade.updatedAt });
  }
  return steps;
}
