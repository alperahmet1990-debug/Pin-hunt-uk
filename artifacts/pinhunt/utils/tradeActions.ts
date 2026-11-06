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
  /** The server only takes trade messages while a trade is pending or accepted. */
  canMessage: boolean;
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
    canMessage: isParticipant && (pending || accepted),
    nextStep: nextStep(),
  };
}

export function otherUserIdFor(trade: Trade | null, userId: string | null | undefined): string | undefined {
  if (!trade) return undefined;
  return trade.initiatorId === userId ? trade.recipientId : trade.initiatorId;
}

/** Trade messages are refused by database rules, so never show that wording. */
export function sendFailureLine(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /row-level security|permission denied/i.test(message)
    ? "This message can't be sent on this trade right now."
    : 'Check your connection and try again.';
}

/** The server's own wording for a refused proposal, if it's one written for collectors. */
export function proposalRefusalLine(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : '';
  return /in progress|already a proposal|too many proposals|isn't available/i.test(message) ? message : undefined;
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

const TRADE_STATUS_LABEL: Record<Trade['status'], string> = {
  pending: 'Proposed',
  accepted: 'In progress',
  problem: 'Problem reported',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

export function tradeStatusLabel(status: Trade['status']): string {
  return TRADE_STATUS_LABEL[status];
}

/** Trades still needing someone to act. Accepted and problem trades also hold account deletion. */
export function isOpenTrade(status: Trade['status']): boolean {
  return status === 'pending' || status === 'accepted' || status === 'problem';
}

/** Active trades first, then past ones. Each group keeps its given order. */
export function groupTrades(trades: Trade[]): { active: Trade[]; past: Trade[] } {
  return {
    active: trades.filter(t => isOpenTrade(t.status)),
    past: trades.filter(t => !isOpenTrade(t.status)),
  };
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
