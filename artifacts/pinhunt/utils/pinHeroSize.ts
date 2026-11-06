/**
 * Pin detail hero sizing (B-P2-07, #62). The hero is capped at 45% of the
 * screen height so the title and "Add to Collection" stay above the fold on
 * small phones (320×568), and the image card keeps a margin inside it.
 *
 * The hero runs up behind the status bar, so that strip isn't usable (#455).
 * It is added to the hero up to the cap and taken off the card's space; the
 * screen pads the hero by the same amount, so the pin clears the status bar
 * and the floating Back button.
 */
const HERO_SIDE_MARGIN = 32;
const CARD_SIDE_MARGIN = 40;
/** Space above and below the card inside the hero. */
const CARD_VERTICAL_MARGIN = 28;

export function pinHeroSize(width: number, height: number, topInset = 0): { hero: number; card: number } {
  const hero = Math.floor(Math.min(width - HERO_SIDE_MARGIN + topInset, 0.45 * height));
  const card = Math.floor(Math.min(width - CARD_SIDE_MARGIN, hero - topInset - CARD_VERTICAL_MARGIN * 2));
  return { hero, card };
}
