# Collecting vocabulary

The words PinHunt uses for collection states and groupings, in every
user-facing label, button, empty state and accessibility label. Approved by
the maintainer on 2026-10-13 (#108).

| Concept | Stored value | Say | Don't say |
|---|---|---|---|
| A pin you have | `owned` | **Owned**, "You own 2" | "In Collection" |
| A pin you want | `wanted` | **ISO**; "Add to ISO", "On your ISO" | "In your ISO", "On Your ISO", "Wishlist" as a label |
| A pin you'll trade | `for_trade` | **For Trade** as a label or tab; "for trade" inside a sentence ("You own 2 · all for trade") | "Traders" (for the tab), "Trade" (as a filter or post type) |
| How many of a pin you have | `quantity` | **Copies** | "Quantity" |
| Groupings you create | — | **Boards** | — |
| Catalogue groupings | — | **Sets** | "Collection" when it means a set |
| Everything you have | — | **Your collection** | — |

Notes:

- **ISO** stays as the collector term. Its meaning is explained once by the
  ISO explainer (#65). Screen readers hear "ISO, on your wishlist"
  (`STATUS_BADGE` in `components/ui/StatusBadge.tsx`).
- ISO and For Trade are different states. Never merge them in copy.
- Stored values and route keys don't change. For example, the Collection tab
  key stays `traders` (`?tab=traders`) while its label reads "For Trade".
- "Traders" and "collectors" are fine for *people* ("3 collectors offering
  this for trade"). The rule above is about the state.
- For Trade copies count as owned (Pin detail, Sets, Home progress).
- `__tests__/glossary.test.ts` fails if a retired label comes back.
