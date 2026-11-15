# Weekform — workout schedule generator

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

1. Choose 1–7 sessions per week. Use **Pin** mode to mark days that must contain a workout, or **Forbid** mode to mark days where a workout is impossible. A day is never both.
2. Every unique seven-day schedule containing exactly that many sessions and all pinned days, and containing no unavailable days, is generated and ranked.
3. The list shows every valid week. Full-recovery plans are marked `Full`; unavoidable or extra back-to-back pairs are shown as `1 adjacent`, `2 adjacent`, and so on.
4. The selected week opens a recovery ring, rest-gap values, pinned day and a copy action.
5. Impossible constraints show an actionable empty state; forced overlap shows one limitation note.
6. Unavailable days stay in the week as rest days for recovery calculations, and are marked in the table, ring and copied plan.
7. State is mirrored in the URL as `?sessions=3&fixed=sun&forbidden=sat`, so a view can be shared or reloaded.

## Ranking

- Treat the week as a cycle; Sunday and Monday are adjacent.
- Unavailable days are excluded from workouts but still count as rest in gap calculations.
- Adjacent pairs = workout pairs on consecutive days, counted around the loop.
- Primary sort: fewest adjacent pairs.
- Secondary: smallest variance of rest gaps around the loop (evenest spacing), then shortest longest-gap, then largest shortest-gap, then Monday-first mask order.
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