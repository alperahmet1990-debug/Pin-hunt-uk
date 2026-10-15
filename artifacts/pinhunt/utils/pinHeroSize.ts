/**
 * Pin detail hero sizing (B-P2-07, #62). The hero is capped at 45% of the
 * screen height so the title and "Add to Collection" stay above the fold on
 * small phones (320×568), and the image card keeps a margin inside it.
 */
const HERO_SIDE_MARGIN = 32;
const CARD_SIDE_MARGIN = 40;
/** Space above and below the card inside the hero. */
const CARD_VERTICAL_MARGIN = 28;

export function pinHeroSize(width: number, height: number): { hero: number; card: number } {
  const hero = Math.floor(Math.min(width - HERO_SIDE_MARGIN, 0.45 * height));
  const card = Math.floor(Math.min(width - CARD_SIDE_MARGIN, hero - CARD_VERTICAL_MARGIN * 2));
  return { hero, card };
}
