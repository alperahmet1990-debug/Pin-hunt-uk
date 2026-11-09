/**
 * The pins in a trade (migration 070), from the viewer's side.
 *
 * The server stores 'offered' (from the collector who proposed) and
 * 'requested' (from the other collector). On screen the viewer sees
 * "I'll give" and "I'd like", whichever side of the trade they are on.
 * All pins are identified by PinHunt ID, as chat pin shares are.
 */
import type {
  ConversationMessage, PotentialTradePin, TradeItem, TradeItemInput,
} from '@workspace/pin-repository';

export type TradeSide = 'give' | 'get';

/** A pin that can be put in the trade, and the side it would go on. */
export interface TradePinChoice {
  pinhuntId: string;
  side: TradeSide;
  title?: string;
  imageUrl?: string;
}

/** Up to 12 pins each way (trade_write_items). */
export const MAX_TRADE_PINS_PER_SIDE = 12;

export function directionFor(side: TradeSide, viewerIsInitiator: boolean): TradeItem['direction'] {
  return (side === 'give') === viewerIsInitiator ? 'offered' : 'requested';
}

export function sideFor(direction: TradeItem['direction'], viewerIsInitiator: boolean): TradeSide {
  return (direction === 'offered') === viewerIsInitiator ? 'give' : 'get';
}

/** Choice key: the same pin can be on both sides. */
export const choiceKey = (c: { pinhuntId: string; side: TradeSide }) => `${c.side}:${c.pinhuntId}`;

/**
 * Pins shared in the chat: the viewer's own shares are pins they could give,
 * the other collector's are pins they could get. Newest share first.
 */
export function chatPinChoices(messages: ConversationMessage[], viewerId: string | null | undefined): TradePinChoice[] {
  const out: TradePinChoice[] = [];
  const seen = new Set<string>();
  const newestFirst = [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const msg of newestFirst) {
    if (msg.messageType !== 'pin_share') continue;
    const side: TradeSide = msg.senderId === viewerId ? 'give' : 'get';
    for (const pinhuntId of msg.pinIds) {
      const key = choiceKey({ pinhuntId, side });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pinhuntId, side });
    }
  }
  return out;
}

/** The collection match between the two collectors (get_potential_trades). */
export function matchPinChoices(pins: PotentialTradePin[]): TradePinChoice[] {
  return pins.map(p => ({
    pinhuntId: p.pinhuntId,
    side: p.direction === 'i_have_they_want' ? 'give' : 'get',
    title: p.title,
    imageUrl: p.imageUrl,
  }));
}

/** The pins already in a trade, from the viewer's side. */
export function tradeItemChoices(items: TradeItem[] | undefined, viewerIsInitiator: boolean): TradePinChoice[] {
  return (items ?? [])
    .filter(i => !!i.pinhuntId)
    .map(i => ({ pinhuntId: i.pinhuntId!, side: sideFor(i.direction, viewerIsInitiator), title: i.title }));
}

/** Merge lists, first one wins for each pin and side; later lists fill in titles and images. */
export function mergeChoices(...lists: TradePinChoice[][]): TradePinChoice[] {
  const byKey = new Map<string, TradePinChoice>();
  for (const list of lists) {
    for (const c of list) {
      const key = choiceKey(c);
      const had = byKey.get(key);
      byKey.set(key, had ? { ...had, title: had.title ?? c.title, imageUrl: had.imageUrl ?? c.imageUrl } : c);
    }
  }
  return [...byKey.values()];
}

/**
 * What to tick before the collector changes anything: the pins shared in the
 * chat if there are any, otherwise the collection match. At most 12 each way.
 */
export function preselectedKeys(chat: TradePinChoice[], match: TradePinChoice[]): Set<string> {
  const source = chat.length > 0 ? chat : match;
  const counts: Record<TradeSide, number> = { give: 0, get: 0 };
  const keys = new Set<string>();
  for (const c of source) {
    if (counts[c.side] >= MAX_TRADE_PINS_PER_SIDE) continue;
    counts[c.side] += 1;
    keys.add(choiceKey(c));
  }
  return keys;
}

/** The server payload for the ticked choices. */
export function toTradeItemInputs(
  choices: TradePinChoice[], selected: Set<string>, viewerIsInitiator: boolean,
): TradeItemInput[] {
  return choices
    .filter(c => selected.has(choiceKey(c)))
    .map(c => ({ pinhuntId: c.pinhuntId, direction: directionFor(c.side, viewerIsInitiator) }));
}

/** Why the selection can't be sent yet, or null when it can. */
export function selectionProblem(choices: TradePinChoice[], selected: Set<string>): string | null {
  const picked = choices.filter(c => selected.has(choiceKey(c)));
  if (picked.length === 0) return 'Choose at least one pin.';
  for (const side of ['give', 'get'] as const) {
    if (picked.filter(c => c.side === side).length > MAX_TRADE_PINS_PER_SIDE) {
      return `Up to ${MAX_TRADE_PINS_PER_SIDE} pins each way.`;
    }
  }
  return null;
}

/** Proposals from builds before 070, and trades with no pins yet. */
export function tradeHasPins(items: TradeItem[] | undefined): boolean {
  return (items?.length ?? 0) > 0;
}
