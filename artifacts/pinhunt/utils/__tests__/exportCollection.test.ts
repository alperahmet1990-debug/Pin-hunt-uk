import { buildCollectionExportText } from '../exportCollection';
import { feedbackMailtoUrl } from '@/constants/appConfig';

const e = (pinId: string, status: any, quantity = 1) => ({ pinId, status, quantity, notes: '', dateAdded: '' });

describe('buildCollectionExportText', () => {
  it('groups Owned, For Trade and ISO separately and skips none', () => {
    const text = buildCollectionExportText(
      { a: e('a', 'owned', 2), b: e('b', 'for_trade'), c: e('c', 'wanted'), d: e('d', 'none') },
      { a: 'Alpha', b: 'Beta', c: 'Gamma' },
    )!;
    expect(text).toContain('Owned (1)\n- Alpha (a) x2');
    expect(text).toContain('For Trade (1)\n- Beta (b)');
    expect(text).toContain('ISO (In Search Of) (1)\n- Gamma (c)');
    expect(text).not.toContain('(d)');
  });
  it('returns null when empty', () => {
    expect(buildCollectionExportText({}, {})).toBeNull();
  });
});

describe('feedbackMailtoUrl', () => {
  it('is null when unset', () => {
    expect(feedbackMailtoUrl('')).toBeNull();
    expect(feedbackMailtoUrl('  ')).toBeNull();
  });
  it('builds a mailto link', () => {
    expect(feedbackMailtoUrl('hi@x.uk', 'A B')).toBe('mailto:hi@x.uk?subject=A%20B');
  });
});
