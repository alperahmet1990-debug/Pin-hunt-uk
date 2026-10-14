import colors from '@/constants/colors';
import { stackHeaderOptions } from '../stackHeader';

// #262: native stack headers follow the app palette in both appearances.
describe('stackHeaderOptions', () => {
  it.each([['light', colors.light], ['dark', colors.dark]] as const)('uses the %s palette', (_name, palette) => {
    expect(stackHeaderOptions(palette)).toEqual({
      headerBackTitle: 'Back',
      headerStyle: { backgroundColor: palette.homeSurface },
      headerTintColor: palette.homeInk,
      headerTitleStyle: { color: palette.homeInk },
    });
  });

  it('gives the dark header a dark background and light text', () => {
    const dark = stackHeaderOptions(colors.dark);
    expect(dark.headerStyle.backgroundColor).not.toBe(colors.light.homeSurface);
    expect(dark.headerTintColor).toBe(colors.dark.homeInk);
  });
});
