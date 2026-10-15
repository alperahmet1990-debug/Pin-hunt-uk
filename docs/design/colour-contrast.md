# Colour contrast (UX-049)

Every Storybook text/background pair the app documents, with its WCAG AA
minimum. The source of truth is `artifacts/pinhunt/constants/contrastPairs.ts`;
`constants/__tests__/contrastPairs.test.ts` checks every pair in light and dark
and fails if this table and the code drift apart.

**Minimums:** body text 4.5:1. Large text (18 pt and up, or 14 pt bold and up) and
icons 3:1. When a pair fails, use a different existing token for that use.
Never change palette values without a design decision (memory note
`pinhunt-visual-direction`).

| Pair | Foreground on background | Role | Light | Dark | Used for |
|---|---|---|---|---|---|
| `ink-canvas` | homeInk on homeBackground | text | 10.20 | 14.45 | Body text and titles on the page |
| `ink-surface` | homeInk on homeSurface | text | 10.98 | 12.98 | Text on cards and sheets |
| `ink-subtle` | homeInk on homeAqua | text | 8.99 | 11.73 | Secondary button labels, chips, search fields |
| `muted-canvas` | homeMuted on homeBackground | text | 4.78 | 7.00 | Metadata and captions on the page |
| `muted-surface` | homeMuted on homeSurface | text | 5.15 | 6.28 | Metadata on cards and sheets |
| `muted-subtle` | homeMuted on homeAqua | text | **4.22** | 5.68 | Inactive segment labels, placeholders, neutral chips |
| `primary-label` | homeSurface on homeCoral | text | 4.75 | 6.11 | Primary button label |
| `text-action-canvas` | homeCoralDeep on homeBackground | text | 7.31 | 8.67 | Text buttons and links on the page |
| `text-action-surface` | homeCoralDeep on homeSurface | text | 7.87 | 7.78 | Text buttons and links on cards |
| `primary-icon` | homeCoral on homeSurface | icon | 4.75 | 6.11 | Active icons and selection marks |
| `danger-label` | destructiveForeground on destructive | text | **4.29** | **4.29** | Destructive button label (15 pt bold) |
| `danger-text` | destructive on homeSurface | text | **4.29** | **3.54** | Error messages and "Delete" rows |
| `treasure-warm` | homeSandInk on homeWarmSurface | text | 6.23 | 5.76 | Official callouts, seed-record banner |
| `treasure-surface` | homeSandInk on homeSurface | text | 7.30 | 6.13 | LE and completion accents on cards |
| `hero-title-deep` | homeHeroText on homeCoralDeep | large | 7.58 | **1.88** | Home hero "Find a Pin" (28 pt bold) |
| `hero-title` | homeHeroText on homeCoral | large | 4.58 | **2.39** | Home hero "Find a Pin" (28 pt bold) |
| `hero-subtitle` | homeHeroSubtitle on homeCoral | text | **4.26** | **2.23** | Home hero subtitle (13 pt) |
| `collect-title` | homeCollectText on homeTeal | text | 9.92 | 12.49 | Continue Collecting set name |
| `collect-detail` | homeHeroMuted on homeTeal | text | 9.32 | 11.73 | Continue Collecting "3 of 5 collected" |
| `teal-icon` | homeTealSoft on homeSurface | icon | 6.73 | **1.70** | Community shortcut and "Based on your collection" icons |
| `owned-marker` | homeSurface on owned | icon | 3.38 | 4.49 | Owned tick on pin tiles |
| `wanted-marker` | homeSurface on wanted | icon | 3.14 | 4.83 | ISO bookmark on pin tiles |
| `trade-marker` | homeSurface on forTrade | icon | 4.34 | 3.50 | For Trade arrows on pin tiles |

Bold ratios are below the minimum: these are the known gaps below.

## Known gaps (need a design decision)

`KNOWN_CONTRAST_GAPS` in the same file lists these. The test fails if any of
them gets worse, and asks for the entry to be removed once it passes.

1. **Home hero in dark mode** (`hero-title-deep`, `hero-title`, `hero-subtitle`: 1.9–2.4:1).
   The dark palette's hero gradient is light periwinkle under white text.
   Options:
   - (a) In dark mode, give the hero the light palette's gradient tokens.
   - (b) In dark mode, set the hero text in `homeBackground` (dark text on light periwinkle).
   - (c) Darken the dark-mode `homeCoral`/`homeCoralDeep`. This is a palette change.
2. **Muted labels on the subtle surface, light mode** (`muted-subtle`: 4.22:1).
   This covers inactive segment labels (12.5 pt bold), placeholders and neutral chips.
   Options:
   - (a) Use `homeInk` for inactive segment labels.
   - (b) Accept 4.2:1 for placeholders only.
3. **Destructive red** (`danger-label` 4.29:1, `danger-text` 3.54–4.29:1).
   There's no deeper red token yet. Options:
   - (a) Add a deeper red. This is a palette decision.
   - (b) Make destructive labels 16 pt bold or larger, so the 3:1 large-text rule applies to the button. Error text would still need (a).
4. **Teal accent icons, dark mode** (`teal-icon`: 1.70:1).
   The Community shortcut and the Find Trades "Based on your collection" icons are almost invisible on dark cards.
   Options:
   - (a) In dark mode, use `homeMuted` or `homeCoral` for these icons.
   - (b) Lighten the dark-mode `homeTealSoft`. This is a palette change.
5. **Hero subtitle, light mode** (`hero-subtitle`: 4.26:1 over the gradient's lighter middle).
   This is fixed by whichever option item 1 chooses for the hero, or by using `homeHeroText` for the subtitle.

## Fixed in UX-049

- **Continue Collecting "3 of 5 collected"** used `homeAqua` on `homeTeal`, which is about 1:1 in dark mode (invisible).
  It now uses `homeHeroMuted`: 9.3:1 in light and 11.7:1 in dark.

## Fixed in UX-062 (#277)

- **Deep teal type in Dark Side.** `homeTeal` is near-black (#103138) in dark mode, but it was used as a text and icon colour in about 15 places, which were all close to invisible on dark cards. Examples: the board's "Auto-updated from your collection" chip and its Edit button, the collector-value line on Pin detail, the market value "Show more" toggle, `Chip` and `SegmentedControl` in the `teal` tone, and the admin research review. They now use `homeInk`, which is the same #16424A in Light Side (so nothing changes there) and near-white in Dark Side. `homeTeal` stays a fill colour only. `constants/__tests__/tealText.test.js` fails if it's used for text or an icon again.
