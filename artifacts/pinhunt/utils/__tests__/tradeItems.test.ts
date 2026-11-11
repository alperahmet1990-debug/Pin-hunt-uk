/**
 * WP1 / #32: the pins in a trade, from the viewer's side (migration 070).
 */
import type { ConversationMessage, PotentialTradePin, TradeItem } from '@workspace/pin-repository';
import {
  chatPinChoices, choiceKey, directionFor, matchPinChoices, mergeChoices, preselectedKeys,
  selectionProblem, sideFor, toTradeItemInputs, tradeHasPins, tradeItemChoices,
} from '../tradeItems';

const share = (id: string, senderId: string, pinIds: string[], minute: number): ConversationMessage => ({
  id, conversationId: 'c1', senderId, body: '', messageType: 'pin_share', pinIds, forTradePinIds: [], photoUrls: [],
  createdAt: `2026-11-09T10:${String(minute).padStart(2, '0')}:00Z`,
});

describe('sides and directions', () => {
  it("maps the viewer's give/get to the server's offered/requested, whichever side they are on", () => {
    expect(directionFor('give', true)).toBe('offered');
    expect(directionFor('get', true)).toBe('requested');
    expect(directionFor('give', false)).toBe('requested');
    expect(directionFor('get', false)).toBe('offered');
    for (const initiator of [true, false]) {
      for (const side of ['give', 'get'] as const) expect(sideFor(directionFor(side, initiator), initiator)).toBe(side);
    }
  });
});

describe('chatPinChoices', () => {
  it('puts my shares on give and theirs on get, newest first, once each', () => {
    const msgs = [
      share('m1', 'me', ['PHUK-1', 'PHUK-2'], 1),
      share('m2', 'them', ['PHUK-3'], 2),
      share('m3', 'me', ['PHUK-2'], 3),
      { ...share('m4', 'them', [], 4), messageType: 'text' as const, body: 'hi' },
    ];
    expect(chatPinChoices(msgs, 'me')).toEqual([
      { pinhuntId: 'PHUK-2', side: 'give' },
      { pinhuntId: 'PHUK-3', side: 'get' },
      { pinhuntId: 'PHUK-1', side: 'give' },
    ]);
  });
});

describe('choosing what to tick', () => {
  const match: PotentialTradePin[] = [
    { direction: 'i_have_they_want', pinId: 'u1', pinhuntId: 'PHUK-8', title: 'Mine' },
    { direction: 'they_have_i_want', pinId: 'u2', pinhuntId: 'PHUK-9', title: 'Theirs' },
  ];

  it('prefers the pins shared in chat, and falls back to the collection match', () => {
    const chat = [{ pinhuntId: 'PHUK-1', side: 'give' as const }];
    expect([...preselectedKeys(chat, matchPinChoices(match))]).toEqual(['give:PHUK-1']);
    expect([...preselectedKeys([], matchPinChoices(match))]).toEqual(['give:PHUK-8', 'get:PHUK-9']);
  });

  it('ticks at most 12 each way', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ pinhuntId: `PHUK-${i}`, side: 'give' as const }));
    expect(preselectedKeys(many, []).size).toBe(12);
  });

  it('merges lists without duplicates and fills in titles', () => {
    const merged = mergeChoices([{ pinhuntId: 'PHUK-8', side: 'give' }], matchPinChoices(match));
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ pinhuntId: 'PHUK-8', side: 'give', title: 'Mine' });
  });
});

describe('sending and checking a selection', () => {
  const choices = [
    { pinhuntId: 'PHUK-1', side: 'give' as const },
    { pinhuntId: 'PHUK-2', side: 'get' as const },
  ];

  it('sends only ticked pins, as the server directions', () => {
    const selected = new Set([choiceKey(choices[1])]);
    expect(toTradeItemInputs(choices, selected, true)).toEqual([{ pinhuntId: 'PHUK-2', direction: 'requested' }]);
    expect(toTradeItemInputs(choices, selected, false)).toEqual([{ pinhuntId: 'PHUK-2', direction: 'offered' }]);
  });

  it('needs at least one pin, and at most 12 each way', () => {
    expect(selectionProblem(choices, new Set())).toBe('Choose at least one pin.');
    expect(selectionProblem(choices, new Set(['give:PHUK-1']))).toBeNull();
    const many = Array.from({ length: 13 }, (_, i) => ({ pinhuntId: `P${i}`, side: 'get' as const }));
    expect(selectionProblem(many, new Set(many.map(choiceKey)))).toBe('Up to 12 pins each way.');
  });

  it('reads the pins already in a trade back from the viewer side', () => {
    const items: TradeItem[] = [
      { id: 'i1', tradeId: 't1', direction: 'offered', pinhuntId: 'PHUK-1', title: 'A', quantity: 1, createdAt: '' },
      { id: 'i2', tradeId: 't1', direction: 'requested', pinhuntId: 'PHUK-2', quantity: 1, createdAt: '' },
    ];
    expect(tradeItemChoices(items, false).map(choiceKey)).toEqual(['get:PHUK-1', 'give:PHUK-2']);
    expect(tradeHasPins(items)).toBe(true);
    expect(tradeHasPins(undefined)).toBe(false);
  });
});
