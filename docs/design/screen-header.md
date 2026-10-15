# Screen header

One header for screens that open straight onto content (UX-040, #153):
`components/ui/ScreenHeader.tsx`.

## What it gives you

- **Back:** 44 pt, read as "Back". It goes back, or Home when there's nothing
  to go back to. Pass `onBack` to change that (Search goes to Find a Pin).
- **Title:** optional, one line, read as a header.
- **Up to two trailing controls** in `right`: `IconButton`s, a compact
  `Button` or a chip.
- **`children`:** content that takes the title's place, such as Search's
  field.
- **`overlay`:** floats the header over a hero image with no background, with
  Back on a surface disc (pin detail).
- **Safe area:** pads for the status bar. Pass `safeArea={false}` when the
  screen already does.

## When to use it

| Use `ScreenHeader` (hide the native header with `headerShown: false`) | Keep the native stack header (`stackHeaderOptions` in `app/_layout.tsx`) |
|---|---|
| Pin detail, set detail, board, Search, collector profile, Find Trades. Any screen that opens straight onto pins or a person, or has an image hero. | Forms and flows (Add Pin, Edit Profile, submissions, Sell), community (posts, chat, messages), settings-style pages (About, My Listings), and admin. |

Don't hand-roll a back button. If a screen needs something the header
doesn't do, extend `ScreenHeader`.
