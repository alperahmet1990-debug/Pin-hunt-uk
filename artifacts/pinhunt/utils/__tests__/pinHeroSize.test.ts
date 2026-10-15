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
});
