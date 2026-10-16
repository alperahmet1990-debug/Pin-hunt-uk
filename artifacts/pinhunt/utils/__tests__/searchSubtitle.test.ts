import { searchResultSubtitle, titleIncludesSet } from '../searchSubtitle';

const pin = (over: Partial<Parameters<typeof searchResultSubtitle>[0]>) => ({
  title: 'Tinker Bell', collection: 'Pixie Hollow', brand: 'Disneyland Paris', ...over,
});

describe('searchResultSubtitle', () => {
  it('shows the set when the title does not already say it', () => {
    expect(searchResultSubtitle(pin({}))).toBe('Pixie Hollow');
    expect(searchResultSubtitle(pin({ releaseYear: 2024 }))).toBe('Pixie Hollow · 2024');
  });

  it('never repeats a set the title already contains; shows year and edition instead', () => {
    const p = pin({ title: 'Pixie Hollow – Tinker Bell', releaseYear: 2023, edition: 'LE 500' });
    expect(searchResultSubtitle(p)).toBe('2023 · LE 500');
    expect(searchResultSubtitle(pin({ title: 'PIXIE HOLLOW: Silvermist', edition: 'Open Edition' }))).toBe('Open Edition');
  });

  it('falls back to the brand when there is nothing else to say', () => {
    expect(searchResultSubtitle(pin({ title: 'Pixie Hollow Tinker Bell' }))).toBe('Disneyland Paris');
    expect(searchResultSubtitle(pin({ collection: '' }))).toBe('Disneyland Paris');
  });
});

describe('titleIncludesSet', () => {
  it('matches whole words only, ignoring case and punctuation', () => {
    expect(titleIncludesSet('Park Icons: Castle', 'park icons')).toBe(true);
    expect(titleIncludesSet('Parkside Icons', 'Park')).toBe(false);
    expect(titleIncludesSet('Anything', '')).toBe(false);
  });
});
