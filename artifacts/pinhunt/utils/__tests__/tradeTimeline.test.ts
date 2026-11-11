/**
 * WP1 step 2: the trade screen's timeline, from the viewer's side.
 */
import type { Trade } from '@workspace/pin-repository';
import { tradeTimeline } from '../tradeTimeline';

const base: Trade = {
  id: 't1', initiatorId: 'a', recipientId: 'b', status: 'pending',
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
};
const labels = (t: Trade, viewer: string) => tradeTimeline(t, viewer).map(s => s.label);

describe('tradeTimeline', () => {
  it('a waiting proposal, from each side', () => {
    expect(labels(base, 'a')).toEqual(['You proposed the trade']);
    expect(labels(base, 'b')).toEqual(['They proposed the trade']);
  });

  it('a completed trade lists each step in time order', () => {
    const done: Trade = {
      ...base, status: 'completed',
      recipientPostedAt: '2026-11-02T09:00:00Z', initiatorPostedAt: '2026-11-03T09:00:00Z',
      initiatorReceivedAt: '2026-11-04T09:00:00Z', recipientReceivedAt: '2026-11-05T09:00:00Z',
    };
    expect(labels(done, 'a')).toEqual([
      'You proposed the trade', 'They accepted', 'They posted their pins', 'You posted your pins',
      'You received their pins', 'They received your pins', 'Trade complete',
    ]);
    expect(tradeTimeline(done, 'a').at(-1)?.at).toBe('2026-11-05T09:00:00Z');
  });

  it('declined and cancelled trades say so', () => {
    expect(labels({ ...base, status: 'rejected' }, 'b')).toEqual(['They proposed the trade', 'You declined']);
    expect(labels({ ...base, status: 'cancelled' }, 'a')).toEqual(['You proposed the trade', 'Trade cancelled']);
  });

  it('a problem report shows', () => {
    const problem: Trade = { ...base, status: 'problem', initiatorPostedAt: '2026-11-02T09:00:00Z', problemReportedAt: '2026-11-06T09:00:00Z' };
    expect(labels(problem, 'b')).toEqual(['They proposed the trade', 'You accepted', 'They posted their pins', 'A problem was reported']);
  });
});
