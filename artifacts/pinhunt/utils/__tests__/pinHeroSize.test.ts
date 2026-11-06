import { radius } from '@/constants/theme';
import { pinHeroSize } from '../pinHeroSize';

// B-P2-07 (#62): the pin detail hero never takes more than 45% of the screen.
describe('pinHeroSize', () => {
  it('caps the hero at 45% of the height on a 320×568 phone', () => {
    const { hero, card } = pinHeroSize(320, 568);
    expect(hero).toBeLessThanOrEqual(0.45 * 568);
    expect(hero).toBe(255);
    expect(card).toBe(199);
  });

  it('caps by width on a tall phone (390×844)', () => {
    expect(pinHeroSize(390, 844)).toEqual({ hero: 358, card: 302 });
  });

  it('keeps the card inside the hero with a margin, at any size', () => {
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024]]) {
      const { hero, card } = pinHeroSize(w, h);
      expect(hero).toBeLessThanOrEqual(Math.min(w - 32, 0.45 * h) + 0.5);
      expect(card).toBeLessThanOrEqual(hero - 56);
      expect(card).toBeLessThanOrEqual(w - 40);
      expect(card).toBeGreaterThan(0);
    }
  });

  // #455: the hero sits behind the status bar, so the card must start below it.
  it('keeps the card clear of the status bar and Back button on notched phones', () => {
    const BACK_LEFT = 16;
    const BACK_SIZE = 44;
    const BACK_TOP_GAP = 10;
    // Back only reaches the card's rounded corner, which is empty.
    const CARD_CORNER = radius.xl;
    for (const [w, h, inset] of [[320, 568, 20], [390, 844, 47], [402, 874, 62], [430, 932, 59]]) {
      const { hero, card } = pinHeroSize(w, h, inset);
      const cardTop = inset + (hero - inset - card) / 2;
      const cardLeft = (w - card) / 2;
      const backBottom = inset + BACK_TOP_GAP + BACK_SIZE;
      expect(hero).toBeLessThanOrEqual(0.45 * h);
      expect(cardTop).toBeGreaterThanOrEqual(inset + 28);
      expect(cardTop >= backBottom || cardLeft + CARD_CORNER >= BACK_LEFT + BACK_SIZE).toBe(true);
    }
  });

  it('matches the iPhone 17 Pro the report came from', () => {
    expect(pinHeroSize(402, 874, 62)).toEqual({ hero: 393, card: 275 });
  });

  it('does not change a screen with no inset', () => {
    expect(pinHeroSize(390, 844, 0)).toEqual(pinHeroSize(390, 844));
  });
});
