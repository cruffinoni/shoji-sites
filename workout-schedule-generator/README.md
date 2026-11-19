# Weekform — Training Planner

Single-page shoji site. Published files live in `dist/` and are served at
`/s/workout-schedule-generator/`.

## Files

- `dist/index.html` — published page; shoji renders `metadata.json` into its head.
- `dist/styles.css` — Daylight design system and responsive layout.
- `dist/logic.js` — pure schedule generation, cyclic metrics, ranking, copy formatting. UMD-exported for Node tests.
- `dist/app.js` — controls, table, ring, mobile disclosure, URL state, clipboard feedback.
- `dist/fonts/` — self-hosted Fraunces, Instrument Sans and IBM Plex Mono.
- `dist/favicon.svg` — seven-day ring mark.
- `metadata.json` — title, description and icon.
- `test/` — logic and CDP browser tests, plus a vendored axe-core build; not served. The browser suite writes its screenshots to the ignored `design/review/` directory.

## Behavior

1. Set the session count for Gym, Running, Cycling, and Swimming. The counts add up to the weekly total of 1–7 sessions. There is one session per training day.
2. Use each weekday dropdown to choose **Open**, **Pin**, **Rest**, or **Forbidden**. Pinned days require training, Rest days require recovery, and Forbidden days are excluded.
3. Every distinct valid sport assignment is ranked. Browse pages of up to 40 plans, open the selected week's recovery ring, or copy its daily assignments.
4. The URL stores the settings, for example `?sessions=3&fixed=sun&rest=mon&forbidden=sat&sports=1,1,1,0`. Links without sport counts use Gym for all sessions.

## Ranking

- Treat the week as a cycle; Sunday and Monday are adjacent.
- Forbidden days count toward the elapsed calendar gap between sessions.
- Adjacent pairs = training-day pairs on consecutive days, counted around the loop.
- Primary sort: fewest adjacent pairs.
- Secondary: smallest variance of calendar gaps around the loop (evenest spacing), then shortest longest-gap, then largest shortest-gap, then Monday-first mask order.
- `Full recovery` means zero adjacent pairs. When the session count makes that impossible, the top plans are `Minimum overlap`; remaining schedules stay listed as `More overlap`.
- Nothing is filtered out for having tighter spacing.

## Development

Run logic tests:

```sh
node test/logic.test.js
```

Run the browser suite (starts Xvfb + Chrome, checks desktop/tablet/mobile, pin/forbid interactions, copy, URL state and axe-core WCAG 2 A/AA):

```sh
node test/browser.test.js
```

Local preview (from the shoji repository root):

```sh
./shoji sync --data data
./shoji serve --addr :8090 --data data
# http://127.0.0.1:8090/s/workout-schedule-generator/
```

Only `dist/` is public. Everything else in this workspace is private.

## Design notes

Approved direction: **Daylight** — Almanac's cream/sage/terracotta surface, Matrix's
one-row-per-week comparison, Orbit's seven-day recovery ring, with minimal copy.
See `DESIGN.md` and `PRODUCT.md`.