---
name: PinHunt visual direction
description: The user-approved palette and interaction character to preserve in future PinHunt visual work (Storybook, approved 12 Oct 2026).
---

Use the **Storybook** palette as the approved PinHunt visual identity across the whole collector app: warm ivory canvas, white surfaces, deep teal text, muted periwinkle for primary actions, dusty lavender for selection, and plum reserved for treasure moments (LE badges, set completion, official callouts). Keep rounded, image-first cards and subtle lightweight motion.

The values live in `artifacts/pinhunt/constants/colors.ts` (the `home*` tokens) and spacing/radius/shadow in `constants/theme.ts`. Do not change those values without a new explicit decision.

**Why:** The maintainer approved Storybook as the PinHunt design direction on 12 Oct 2026 (UX review decision D-01). It replaced the earlier Sea Glass & Coral palette (pale aqua, coral, sand) in commit `eec777e` (6 Sep 2026). Do not revert to Sea Glass & Coral.

**How to apply:** Build every new or restyled screen with the existing `home*` tokens and `components/ui/*`. Do not reintroduce aqua/coral/sand values or the legacy "Golden Era" tokens (amber/honey). Beware misleading token names kept for compatibility: `homeCoral` is the periwinkle primary, `homeCoralDeep` the deep periwinkle, `homeSand` / `homeSandInk` the plum accent, `homeAqua` the lavender-tinted subtle surface. Renaming them to semantic names is a separate approved-later task (UX-038); until then use them by role, not by name. Preserve each screen's behaviour and accessibility, and check light and dark mode.
