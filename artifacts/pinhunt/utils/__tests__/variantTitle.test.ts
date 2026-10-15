import { variantTitle } from '../variantTitle';

describe('variantTitle (B-P1-17)', () => {
  const set = 'Mickey Mouse Icons';

  it.each([
    ['Mickey Mouse Icons - Buzz Lightyear', 'Buzz Lightyear'],
    ['Mickey Mouse Icons – Steamboat Willie', 'Steamboat Willie'],
    ['Mickey Mouse Icons — Sorcerer', 'Sorcerer'],
    ['Mickey Mouse Icons: Classic', 'Classic'],
    ['Mickey Mouse Icons | Gold', 'Gold'],
    ['mickey mouse  icons - Lowercase set', 'Lowercase set'],
    ['  Mickey Mouse Icons -  Spaced  ', 'Spaced'],
  ])('strips the set prefix: %s', (title, expected) => {
    expect(variantTitle(title, set)).toBe(expected);
  });

  it.each([
    ['Buzz Lightyear', 'no prefix'],
    ['Mickey Mouse Iconsville - Other', 'set name only as part of a longer word'],
    ['Mickey Mouse Icons Buzz', 'prefix with no separator'],
    ['Mickey Mouse Icons', 'title is just the set name'],
    ['Mickey Mouse Icons - ', 'nothing after the separator'],
  ])('leaves the title as it is: %s (%s)', title => {
    expect(variantTitle(title, set)).toBe(title);
  });

  it('leaves titles alone when there is no set name', () => {
    expect(variantTitle('Mickey Mouse Icons - Buzz', undefined)).toBe('Mickey Mouse Icons - Buzz');
    expect(variantTitle('Mickey Mouse Icons - Buzz', '  ')).toBe('Mickey Mouse Icons - Buzz');
  });
});
