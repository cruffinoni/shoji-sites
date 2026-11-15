# DeepSeek Price Window

Single-page shoji site. The published page lives in `dist/` and is served at
`/s/deepseek-price-window-handoff/`.

## Files

- `dist/index.html` — published page; shoji renders `metadata.json` into its head.
- `dist/favicon.svg` — page icon.
- `metadata.json` — title, description, and icon overrides.
- `README.md` — private notes; not served.

Only `dist/` is public. Everything else in this workspace is private.

## Current behavior

The page puts the current rate window first: a live clock in the visitor's
timezone, a plain-language peak/off-peak answer, the next transition in local
time, and a fixed 00–24 local-day strip with peak blocks. There is no
persistent header; the timezone control sits beside the headline. Token prices
are current-first, with a compact Flash / V4 Pro switch. A collapsed
"Check another time" panel handles date and time lookups without replacing
the live view.

Peak windows are Monday–Friday, 01:00–04:00 and 06:00–10:00 UTC. Weekends and
2026 Chinese public holidays are off-peak. A lookup outside 2026 offers a
manual holiday switch. Prices and holiday dates are embedded in the page; the
footer links to the published sources.

## Design notes

- Times use the visitor's device timezone by default. The top-bar control
  changes the timezone for the whole page, not just the lookup panel.
- The schedule strip covers the current local day from 00:00 to 24:00. The now
  marker moves through the day, so the shape of the day stays stable.
- Local-day bounds and peak blocks are derived through the selected timezone,
  so daylight-saving changes and zones with midnight transitions stay correct.
- The live view keeps running while a future time is checked; the lookup has
  its own result state.
- The 2026 holiday calendar is built in. For other years, the lookup exposes a
  manual holiday switch and the footer states the UTC source windows.
