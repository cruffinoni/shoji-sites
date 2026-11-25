# Notification partitions

An educational single-page guide to how **notification-hub** partitions its
notification tables into nine rotating partitions, and what the midnight
rotation does.

Published page: **/s/notification-partitions/**

## Files

- **dist/index.html** — the published page.
- **dist/styles.css** — page styles. Warm editorial palette, no external fonts.
- **dist/app.js** — the date model, ring rendering, table, language switching and controls.
- **dist/i18n.js** — the English, French and Spanish copy.
- **dist/favicon.svg** — the nine-dot site icon.
- **metadata.json** — title, description and icon for shoji.
- **README.md** — this file; private and not served.

Only **dist/** is public.

## Who this is for

The page is written for mixed technical and non-technical readers. The first
sections explain the idea without assuming database knowledge:

1. A partition is a numbered slice of the notification table.
2. Each day gets a slot in a fixed nine-day cycle.
3. At midnight the service clears the incoming slot, clears anything older
   than retention, and writes the new day.
4. The page models a single environment; retention is 7 days + today.

Technical details (formula, table names, retry behaviour) are progressively
disclosed at the bottom.

## Rules modelled by the page

- There are nine partitions, numbered **p0 to p8**.
- A day's partition is:

      slot = ((days since 2000-01-01) mod 9 + 9) mod 9

- Retention is the number of past days kept, not counting today:
  - **7 days + today** (8 slots in use, 1 empty)
- The rotation runs every day at **00:00 Europe/Paris**:
  1. Truncate the partition for the new day (the incoming slot).
  2. Truncate any partition older than the retention window.
  3. Write the new day's notifications into its partition.
- The same partition number is used in the notification-hub tables:
  - notifications (rows and primary metadata)
  - status_history (SENT, PENDING, …)
  - payload (notification payload)
- The cleanup job runs hourly and retries at the next hour if it cannot get
  the lock. The page labels 00:00 as the scheduled time and documents the
  retry in the technical details; it does not simulate a delayed run.

Only one slot changes from in-use to empty per midnight. A slot that ages out
is truncated again when it comes back around as the incoming slot.

## What the page computes

The page is a **static model**, not a live dashboard. It does not query the
database or the cleanup job.

- The default date is today in Europe/Paris.
- The selected date is treated as the "today" of the model.
- The page models **a single environment only**; there is no environment switch.
- The date range is 2000-01-01 to 2100-12-31.
- The selected date is stored in the URL as **date**; the page removes any
  legacy **env** parameter.
- The ring, the four state cards, the nine-row schedule table, and the
  selected-slot highlights are all computed from the same state object.
- A small timer advances the model at Paris midnight if the selected date was
  the real today. It does not otherwise refresh.

## Maintenance

Retention constants live in **dist/app.js**:

    const RETENTION = 7;

The visible retention panel, retention fact and rule text live in
**dist/index.html**. If the service configuration changes, update both
together, and update **metadata.json** if the description changes.

The featured numbers in the page copy are intentionally hard-coded; this is a
small guide, not a configuration loader.

Dark mode is available from the header icon. The choice is stored in
localStorage under **notification-partitions:theme**; light is the default.

## Languages

The flag button in the header switches between **English**, **Français** and
**Español**. The choice is stored in localStorage under
**notification-partitions:lang** and in the URL as **lang**. Static copy lives
in **dist/i18n.js**; dates are formatted with the matching `Intl` locale.
English is the fallback.

## Packaging and serving

The workspace follows the shoji layout:

    notification-partitions/
      dist/
        index.html
        styles.css
        app.js
        i18n.js
        favicon.svg
      metadata.json
      README.md

After changing the page, reconcile the local lifecycle database and verify the
rendered site:

    ./shoji sync --data data
    curl -I http://127.0.0.1:8090/s/notification-partitions/

Shoji renders the metadata head into the managed page; edit **metadata.json**
for title, description or icon changes rather than editing the injected head.

## Known limitations

- The model is illustrative; it does not know whether a real cleanup run
  succeeded.
- The hourly retry is documented but not visualised as a delay.
- Retention is fixed in the source, by decision.
- The ring is decorative for assistive technology; the same state is available
  as text in the state cards, captions and schedule table.
