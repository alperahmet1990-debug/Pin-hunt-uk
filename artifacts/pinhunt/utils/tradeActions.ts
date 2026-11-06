import type { Trade } from '@workspace/pin-repository';

export interface TradeActions {
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canMarkPosted: boolean;
  /** Already posted, and can still add or correct the tracking details. */
  canUpdateTracking: boolean;
  canMarkReceived: boolean;
  canReportProblem: boolean;
  /** One line saying what the trade is waiting for, from this user's side. */
  nextStep?: string;
}

/**
 * What this user can do next. It mirrors the rules migration 057 enforces, so
 * buttons only appear when they will work. The server still decides.
 */
export function tradeActionsFor(trade: Trade, userId: string | null | undefined): TradeActions {
  const isInitiator = trade.initiatorId === userId;
  const isRecipient = trade.recipientId === userId;
  const isParticipant = isInitiator || isRecipient;

  const iPosted = Boolean(isInitiator ? trade.initiatorPostedAt : trade.recipientPostedAt);
  const theyPosted = Boolean(isInitiator ? trade.recipientPostedAt : trade.initiatorPostedAt);
  const iReceived = Boolean(isInitiator ? trade.initiatorReceivedAt : trade.recipientReceivedAt);
  const accepted = trade.status === 'accepted';
  const pending = trade.status === 'pending';

  const nextStep = (): string | undefined => {
    if (!isParticipant) return undefined;
    if (trade.status === 'problem') return 'PinHunt is reviewing this problem report.';
    if (pending) return isInitiator ? 'Waiting for the other collector to respond.' : undefined;
    if (!accepted) return undefined;
    if (!iPosted) return 'Post your pins, then mark them as posted.';
    if (!theyPosted) return 'Waiting for the other collector to post their pins.';
    if (!iReceived) return 'Mark their pins as received when they arrive.';
    return 'Waiting for the other collector to confirm they received your pins.';
  };

  return {
    canAccept: isRecipient && pending,
    canDecline: isRecipient && pending,
    canCancel: (isInitiator && pending) || (isParticipant && accepted && !iPosted && !theyPosted),
    canMarkPosted: isParticipant && accepted && !iPosted,
    canUpdateTracking: isParticipant && accepted && iPosted,
    canMarkReceived: isParticipant && accepted && theyPosted && !iReceived,
    canReportProblem: isParticipant && accepted && (iPosted || theyPosted),
    nextStep: nextStep(),
  };
}

/** The other collector's tracking details, if they gave any. */
export function otherSideTracking(trade: Trade, userId: string | null | undefined): string | undefined {
  const isInitiator = trade.initiatorId === userId;
  const carrier = isInitiator ? trade.recipientCarrier : trade.initiatorCarrier;
  const tracking = isInitiator ? trade.recipientTracking : trade.initiatorTracking;
  return [carrier, tracking].filter(Boolean).join(' · ') || undefined;
}

/**
 * Whether a chat can offer Propose Trade: there's no trade yet, or the last one
 * has finished. While the status of a linked trade is loading, the answer is no.
 */
export function canProposeInChat(tradeId: string | null | undefined, status: Trade['status'] | undefined): boolean {
  if (!tradeId) return true;
  return status === 'rejected' || status === 'cancelled' || status === 'completed';
}

/** The chat card's heading for a linked trade. */
export function tradeCardTitle(status: Trade['status'] | undefined): string {
  switch (status) {
    case 'pending': return 'Trade proposed';
    case 'accepted': return 'Trade agreed ✓';
    case 'completed': return 'Trade completed ✓';
    case 'problem': return 'Problem reported';
    case 'rejected': return 'Trade declined';
    case 'cancelled': return 'Trade cancelled';
    default: return 'Trade';
  }
}
