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

The page checks DeepSeek's weekday peak windows in UTC, weekend pricing, 2026 Chinese public holidays, and rates for Flash and V4 Pro. Rates and the 2026 holiday dates are embedded in the page; the UI links to the published sources.

## Requested next revision

- Make the current local time and its DeepSeek peak/off-peak status the immediate focus.
- Show the next price change in the visitor's timezone and explain peak hours in that timezone.
- Remove the UTC timeline and trim explanatory copy and whitespace.
- Make the token prices compact and keep custom date/time lookup secondary.
