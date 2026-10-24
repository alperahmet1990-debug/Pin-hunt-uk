import type { Conversation } from '@workspace/pin-repository';
import {
  USER_REPORT_REASON_MAX,
  buildReportReason,
  countReportsByUser,
  otherParticipantId,
  userReportLabel,
  withoutBlocked,
  withoutBlockedAuthors,
  withoutBlockedConversations,
  withoutBlockedProfiles,
  withoutBlockedTraders,
} from '../blockedUsers';

const blocked = new Set(['bad']);

function conv(id: string, a: string, b: string, other?: string): Conversation {
  return {
    id,
    participantAId: a,
    participantBId: b,
    createdAt: '2026-10-01T00:00:00Z',
    otherParticipant: other ? ({ id: other, username: other } as Conversation['otherParticipant']) : undefined,
  };
}

describe('withoutBlocked', () => {
  it('returns the same array when nothing is blocked, so memoised lists keep identity', () => {
    const items = [{ authorId: 'a' }, { authorId: 'b' }];
    expect(withoutBlocked(items, new Set(), i => i.authorId)).toBe(items);
    expect(withoutBlocked(items, blocked, i => i.authorId)).toBe(items);
  });

  it('drops items owned by a blocked user and keeps items with no owner', () => {
    const items = [{ o: 'a' }, { o: 'bad' }, { o: undefined }, { o: null }];
    expect(withoutBlocked(items, blocked, i => i.o)).toEqual([{ o: 'a' }, { o: undefined }, { o: null }]);
  });
});

describe('feed, comment, trader and profile helpers', () => {
  it('hides posts and comments by blocked authors', () => {
    const posts = [{ id: 'p1', authorId: 'bad' }, { id: 'p2', authorId: 'friend' }];
    expect(withoutBlockedAuthors(posts, blocked).map(p => p.id)).toEqual(['p2']);
  });

  it('hides For Trade inventory and set traders from blocked collectors', () => {
    const inventory = [{ pinId: 'x', traderId: 'bad' }, { pinId: 'y', traderId: 'friend' }, { pinId: 'z', traderId: 'bad' }];
    expect(withoutBlockedTraders(inventory, blocked).map(i => i.pinId)).toEqual(['y']);
  });

  it('hides blocked trader profiles', () => {
    expect(withoutBlockedProfiles([{ id: 'bad' }, { id: 'ok' }], blocked)).toEqual([{ id: 'ok' }]);
  });

  it('unblocking restores everything (empty set keeps the full list)', () => {
    const posts = [{ authorId: 'bad' }, { authorId: 'friend' }];
    expect(withoutBlockedAuthors(posts, new Set())).toEqual(posts);
  });
});

describe('conversations', () => {
  it('finds the other participant from the joined profile, else from the participant ids', () => {
    expect(otherParticipantId(conv('c', 'me', 'them', 'them'), 'me')).toBe('them');
    expect(otherParticipantId(conv('c', 'me', 'them'), 'me')).toBe('them');
    expect(otherParticipantId(conv('c', 'them', 'me'), 'me')).toBe('them');
    expect(otherParticipantId(conv('c', 'them', 'me'), null)).toBeUndefined();
  });

  it('hides conversations with a blocked collector in either participant slot', () => {
    const list = [
      conv('c1', 'me', 'bad'),
      conv('c2', 'bad', 'me'),
      conv('c3', 'me', 'friend', 'friend'),
      conv('c4', 'me', 'x', 'bad'),
    ];
    expect(withoutBlockedConversations(list, blocked, 'me').map(c => c.id)).toEqual(['c3']);
  });

  it("never hides a conversation because of the viewer's own id", () => {
    expect(withoutBlockedConversations([conv('c1', 'me', 'friend')], new Set(['me']), 'me')).toHaveLength(1);
  });
});

describe('reports', () => {
  it('stores the reason, plus tidied details when given', () => {
    expect(buildReportReason('Spam')).toBe('Spam');
    expect(buildReportReason('Spam', '   ')).toBe('Spam');
    expect(buildReportReason('Scam or fraud', '  asked for\n money  first ')).toBe('Scam or fraud: asked for money first');
  });

  it('keeps the stored reason within the database limit', () => {
    expect(buildReportReason('Other', 'x'.repeat(2000))).toHaveLength(USER_REPORT_REASON_MAX);
  });

  it('labels profile and message reports for the admin queue', () => {
    expect(userReportLabel({ target: 'profile' })).toBe('Profile reported');
    expect(userReportLabel({ target: 'message' })).toBe('Message reported');
  });

  it('counts open reports per reported user', () => {
    const counts = countReportsByUser([{ reportedUserId: 'a' }, { reportedUserId: 'b' }, { reportedUserId: 'a' }]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });
});
