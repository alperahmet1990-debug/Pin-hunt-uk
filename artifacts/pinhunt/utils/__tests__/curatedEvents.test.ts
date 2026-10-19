import { EVENTS } from '@/mock-data/events';

// The curated Home events (#352) are typed in by hand and drop off once
// they're over. This fails when every one has passed, so the list gets
// topped up before Home runs out of events again.
describe('curated Home events', () => {
  it('still has at least one event to come (top up mock-data/events.ts if this fails)', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(EVENTS.some(e => !e.rumour && (e.endDate ?? e.eventDate) >= today)).toBe(true);
  });

  it('each event has a real date, a source and a unique id', () => {
    expect(new Set(EVENTS.map(e => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (e.endDate) expect(e.endDate >= e.eventDate).toBe(true);
      expect(e.hasScheduledDate).toBe(true);
      // A link where there is one; events confirmed by hand still name their source.
      if (e.sourceUrl) expect(e.sourceUrl).toMatch(/^https:\/\//);
      else expect(e.rumour).toBeFalsy();
      expect(e.sourceName).toBeTruthy();
      // A rumour always says roughly when, and is labelled as one.
      if (e.rumour) expect([e.whenText, e.badgeLabel]).toEqual([expect.any(String), 'TBA']);
    }
  });
});

describe('selectUpcomingEvents with rumours (#352)', () => {
  it('lists dated events first, then rumours, and drops past ones', () => {
    const { selectUpcomingEvents } = require('@/utils/events');
    const base = { description: '', eventType: '', badgeLabel: '', sourceType: 'imported', hasScheduledDate: true, createdAt: '' };
    const out = selectUpcomingEvents([
      { ...base, id: 'rumour', eventDate: '2999-01-01', endDate: '2999-12-31', rumour: true, title: 'r' },
      { ...base, id: 'later', eventDate: '2999-06-01', title: 'l' },
      { ...base, id: 'past', eventDate: '2000-01-01', title: 'p' },
      { ...base, id: 'soon', eventDate: '2999-02-01', title: 's' },
    ]);
    expect(out.map((e: { id: string }) => e.id)).toEqual(['soon', 'later', 'rumour']);
  });
});
