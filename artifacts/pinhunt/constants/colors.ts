const colors = {
  light: {
    // ── Golden Era palette (legacy) ─────────────────────────────────────────
    // Warm amber-honey tones from before Storybook. No shared component uses
    // these any more (UX-038b, #151); some older screens (admin, forms) still
    // do. Don't use them in new code: use the Storybook `home*` tokens or
    // `useColors().tokens`. The status colours below (owned, wanted,
    // forTrade) are current and shared by both palettes.
    text: '#2D1800',
    tint: '#E07800',
    background: '#FFF8EE',
    foreground: '#2D1800',
    card: '#FFFFFF',
    cardForeground: '#2D1800',
    primary: '#E07800',
    primaryForeground: '#FFFFFF',
    // Gradient pair for scan button, hero banners, active pills
    primaryGradientStart: '#FFC84A',
    primaryGradientEnd: '#E07800',
    secondary: '#FFF0D0',
    secondaryForeground: '#5C3A00',
    muted: '#FFF0D0',
    mutedForeground: '#B08040',
    accent: '#3A5FA0',
    accentForeground: '#FFFFFF',
    destructive: '#D9463E',
    destructiveForeground: '#FFFFFF',
    border: '#F0E0C0',
    input: '#F0E0C0',
    // Semantic status colours
    owned: '#2D9E6B',
    wanted: '#D97832',
    forTrade: '#5B6EE8',
    gold: '#E07800',
    // ── Storybook palette (collector app-wide, formerly Sea Glass & Coral) ──
    // Warm ivory canvas, white surfaces, deep teal type, dusty lavender for
    // selection, muted periwinkle for primary actions, plum reserved for
    // treasure moments (LE badges, set completion, "official" callouts).
    // Token names kept as `home*` for compatibility with existing call sites.
    homeBackground: '#FAF6F0',
    homeSurface: '#FFFFFF',
    homeInk: '#16424A',
    homeMuted: '#6E6B80',
    homeLine: '#E9E2ED',
    homeAqua: '#E9E7F3',
    homeCoral: '#6C6FA0',
    homeCoralDeep: '#4C4E78',
    homeSand: '#8C3A5C',
    homeSandInk: '#8C3A5C',
    homeTeal: '#16424A',
    homeTealSoft: '#3E6169',
    homeWarmSurface: '#F5EAF0',
    homeWarmLine: '#E3C9D6',
    homeHeroText: '#FBFAFF',
    homeHeroMuted: '#F0EAF7',
    homeHeroSubtitle: '#F5F1FA',
    homeCollectText: '#F5F2FA',
    homeShadow: '#3A2E42',
  },
  dark: {
    text: '#EDE8DF',
    tint: '#D4AC54',
    background: '#0E0E1A',
    foreground: '#EDE8DF',
    card: '#1A1A2E',
    cardForeground: '#EDE8DF',
    primary: '#D4AC54',
    primaryForeground: '#0E0E1A',
    primaryGradientStart: '#D4AC54',
    primaryGradientEnd: '#A87730',
    secondary: '#222236',
    secondaryForeground: '#EDE8DF',
    muted: '#222236',
    mutedForeground: '#9494A8',
    accent: '#5B80D4',
    accentForeground: '#FFFFFF',
    destructive: '#D9463E',
    destructiveForeground: '#FFFFFF',
    border: '#2A2A40',
    input: '#2A2A40',
    // Semantic status colours (same in both schemes)
    owned: '#2D9E6B',
    wanted: '#D97832',
    forTrade: '#5B6EE8',
    gold: '#D4AC54',
    // ── Storybook palette (collector app-wide, formerly Sea Glass & Coral) ──
    homeBackground: '#1B1B2E',
    homeSurface: '#242438',
    homeInk: '#EEECF6',
    homeMuted: '#A7A4BE',
    homeLine: '#34344A',
    homeAqua: '#2B2B44',
    homeCoral: '#9EA0D6',
    homeCoralDeep: '#B3B6E8',
    homeSand: '#D98FAE',
    homeSandInk: '#D98FAE',
    homeTeal: '#103138',
    homeTealSoft: '#2C4F55',
    homeWarmSurface: '#3A2430',
    homeWarmLine: '#6B3F52',
    homeHeroText: '#FBFAFF',
    homeHeroMuted: '#F0EAF7',
    homeHeroSubtitle: '#F5F1FA',
    homeCollectText: '#F5F2FA',
    homeShadow: '#000000',
  },
  radius: 16,
};

export type Palette = typeof colors.light;

/**
 * Semantic names for the Storybook palette (UX-038a, #150). Each one is the
 * same value as an existing `home*` token, in light and dark, so nothing
 * changes on screen. New code should use these: the `home*` names describe
 * the retired Sea Glass & Coral palette (`homeCoral` is periwinkle,
 * `homeSand` is plum, `homeAqua` is a lavender surface) and stay only so old
 * call sites keep working. Available as `useColors().tokens`.
 */
export function semanticColors(p: Palette) {
  return {
    bg: {
      /** Warm ivory page background. */
      canvas: p.homeBackground,
      /** Cards and sheets. */
      surface: p.homeSurface,
      /** Lavender-tinted subtle fill: chips, image wells, tracks. */
      subtle: p.homeAqua,
      /** Plum-tinted surface for treasure moments. */
      treasure: p.homeWarmSurface,
    },
    text: {
      primary: p.homeInk,
      muted: p.homeMuted,
      /** Text on the hero gradient and other dark fills. */
      onHero: p.homeHeroText,
      onHeroMuted: p.homeHeroMuted,
    },
    line: {
      default: p.homeLine,
      treasure: p.homeWarmLine,
    },
    action: {
      /** Periwinkle: primary buttons, links, selection. */
      primary: p.homeCoral,
      /** Deeper periwinkle for text-style actions and icons on light fills. */
      primaryDeep: p.homeCoralDeep,
    },
    accent: {
      /** Plum, reserved for treasure moments (LE badges, set completion, official callouts). */
      treasure: p.homeSand,
      treasureInk: p.homeSandInk,
      /** Deep teal fill (Continue Collecting card). */
      teal: p.homeTeal,
      tealSoft: p.homeTealSoft,
    },
    status: {
      owned: p.owned,
      wanted: p.wanted,
      forTrade: p.forTrade,
    },
    danger: p.destructive,
    shadow: p.homeShadow,
  } as const;
}

export type SemanticColors = ReturnType<typeof semanticColors>;

export default colors;
