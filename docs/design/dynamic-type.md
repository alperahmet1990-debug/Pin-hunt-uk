# Dynamic Type

How PinHunt text responds to the iOS text size setting (Settings → Display &
Brightness → Text Size, and Accessibility → Larger Text). Added for B-P2-15
(#69).

## The rule

**Text scales with the system size by default.** Don't turn scaling off
(`allowFontScaling={false}`), and don't cap body text, titles, buttons, form
fields or list rows. Those layouts should grow or wrap instead.

**Cap only text inside fixed-size, dense UI.** Use the tokens in
`constants/theme.ts` as `maxFontSizeMultiplier`:

| Token | Cap | Use for | Examples |
|---|---|---|---|
| `fontScale.badge` | 1.2× | Labels sitting on a pin image or inside a fixed-height control | ×N copies and "Missing" on `PinTile`; LE / NEW on `PinCard`; `SegmentedControl` labels |
| `fontScale.dense` | 1.35× | One-line captions and chips in grids and strips, which grow a little and then truncate | `PinTile` names; `Chip` / `StatusBadge`; `CollectionBadge`; brand badges on `PinCard`; "Suggested" on `BoardCard`; Home's Recently added strip |

Pair a capped caption with `numberOfLines`, so a long title truncates
rather than pushing the tile taller than its neighbours.

## Adding a new dense component

1. Ask: is the text inside a box whose size doesn't follow the text, such as
   an image overlay, a fixed-height pill or a grid tile? If not, leave it
   uncapped.
2. If it is, add `maxFontSizeMultiplier={fontScale.badge}` (on an image or in
   a fixed-height control) or `fontScale.dense` (a caption or chip).
3. Extend `components/ui/__tests__/dynamicType.test.tsx` if it's a shared
   primitive.

## Checking

Web builds ignore the system text size, so check on an iPhone. Go to
Settings → Accessibility → Display & Text Size → Larger Text, turn on Larger
Accessibility Sizes, and drag to the largest size. Then look at:
- Collection (grid and sets);
- set detail;
- Home's Recently added strip;
- Browse Catalogue;
- Boards.
