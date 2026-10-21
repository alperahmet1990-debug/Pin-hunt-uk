/**
 * Hiding blocked collectors (B-P0-05b, #17).
 *
 * The database already stops new contact in both directions once a block
 * exists (migration 050). These helpers hide what was already there: posts,
 * comments, conversations and trade matches from users the viewer blocked.
 * Pure functions, so every screen filters the same way and tests cover it.
 */
import type { Conversation, UserReport } from '@workspace/pin-repository';

export type BlockedIds = ReadonlySet<string>;

/** Items whose owner (per `ownerOf`) is not blocked. Returns the same array when nothing is hidden. */
export function withoutBlocked<T>(
  items: readonly T[],
  blockedIds: BlockedIds,
  ownerOf: (item: T) => string | null | undefined,
): T[] {
  if (blockedIds.size === 0) return items as T[];
  const kept = items.filter(item => {
    const owner = ownerOf(item);
    return !owner || !blockedIds.has(owner);
  });
  return kept.length === items.length ? (items as T[]) : kept;
}

/** Community posts and comments: hidden when the author is blocked. */
export function withoutBlockedAuthors<T extends { authorId: string }>(items: readonly T[], blockedIds: BlockedIds): T[] {
  return withoutBlocked(items, blockedIds, item => item.authorId);
}

/** For Trade inventory and set traders: hidden when the trader is blocked. */
export function withoutBlockedTraders<T extends { traderId: string }>(items: readonly T[], blockedIds: BlockedIds): T[] {
  return withoutBlocked(items, blockedIds, item => item.traderId);
}

/** Profiles (traders, collectors): hidden when the profile itself is blocked. */
export function withoutBlockedProfiles<T extends { id: string }>(items: readonly T[], blockedIds: BlockedIds): T[] {
  return withoutBlocked(items, blockedIds, item => item.id);
}

/** The participant who isn't the viewer. */
export function otherParticipantId(conv: Conversation, viewerId: string | null | undefined): string | undefined {
  if (conv.otherParticipant?.id) return conv.otherParticipant.id;
  if (!viewerId) return undefined;
  return conv.participantAId === viewerId ? conv.participantBId : conv.participantAId;
}

/** Conversations: hidden when the other participant is blocked. */
export function withoutBlockedConversations(
  convs: readonly Conversation[],
  blockedIds: BlockedIds,
  viewerId: string | null | undefined,
): Conversation[] {
  return withoutBlocked(convs, blockedIds, conv => otherParticipantId(conv, viewerId));
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/** Reasons offered when reporting a collector or a message. Kept short for the admin queue. */
export const USER_REPORT_REASONS = [
  'Spam',
  'Scam or fraud',
  'Harassment or bullying',
  'Inappropriate content',
  'Other',
] as const;

export type UserReportReason = (typeof USER_REPORT_REASONS)[number];

/** Matches the user_reports.reason check (500 characters). */
export const USER_REPORT_REASON_MAX = 500;

/** The stored reason: the chosen category, plus any details the reporter added. */
export function buildReportReason(reason: UserReportReason, details?: string): string {
  const extra = details?.trim().replace(/\s+/g, ' ') ?? '';
  const text = extra ? `${reason}: ${extra}` : reason;
  return text.slice(0, USER_REPORT_REASON_MAX);
}

/** Admin queue label for a report. */
export function userReportLabel(report: Pick<UserReport, 'target'>): string {
  return report.target === 'message' ? 'Message reported' : 'Profile reported';
}

/** How many reports each user has against them, so admins can spot repeat reports. */
export function countReportsByUser(reports: readonly Pick<UserReport, 'reportedUserId'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.reportedUserId, (counts.get(r.reportedUserId) ?? 0) + 1);
  return counts;
}
