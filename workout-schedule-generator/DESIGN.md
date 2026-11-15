# Design — Daylight

The approved visual direction for Weekform. It combines the Almanac surface, the
Matrix comparison model and the Orbit recovery ring, with copy reduced to what
the interface cannot say by itself.

## World

A quiet training almanac. Warm paper, ink, sage and terracotta; a serif voice for
the week, a grotesk for the interface, monospaced data for days and gaps. No dark
panels, gradients, glass or decorative illustration. The ring is the one
signature object.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| cream | #F6F0E3 | page ground |
| paper | #FFFBF2 | cards, controls |
| ink | #1D2A22 | primary text, pinned days |
| muted | #5E6559 | secondary text |
| soft | #666C60 | tertiary labels |
| line | #DED4C1 | rules |
| sage | #2E5A43 | workout, selection, full recovery |
| sage-soft | #E8EFDF | selected row |
| terracotta | #B9552F | unavailable days, adjacent ring arcs |
| terracotta-ink | #9D4425 | small terracotta text |
| sage-badge | #F0F5EA | full-recovery badge |

Type: **Fraunces** (display, 500), **Instrument Sans** (interface, 400–700),
**IBM Plex Mono** (day labels, ranks, gaps, numeric data). Body 14px; H1 58px desktop /
30–42px smaller viewports; all secondary text at least 4.5:1 contrast.

## Layout

- Slim header: seven-dot wordmark + "How ranking works" disclosure.
- One-line H1 and one instruction line.
- A compact control rule: sessions radio group, seven fixed-day toggles, Clear.
- Results: count + concise recovery meta, one legend line, then one row per week.
- Desktop: results table left, sticky selected-week ring card right.
- Mobile (<820px): single column; the ring card is inserted directly beneath the selected row and collapsed to a compact summary. "Show recovery ring" reveals the ring.

## Components

**Week row:** rank, seven aligned day dots (sage workout, ink pinned with a cream notch, terracotta-slashed unavailable, outlined rest), recovery status (`Full` or `N adjacent`), chevron. The selected row is tinted sage. Row buttons carry a full accessible label.

**Recovery ring:** Monday at top, seven nodes, sage arcs for rest gaps and terracotta arcs where sessions are adjacent. Gap lengths are labelled in days. Centre shows session count. The selected-week card carries badge, day list, rest gaps, pinned day and copy.

**Controls:** native radios for frequency; a **Pin / Forbid** mode group; seven day buttons with three states (available, pinned, unavailable) and `aria-pressed`; Clear disabled when no constraints exist. Pinned days are ink with a small cream pin notch; unavailable days are terracotta-tinted with a slash. The same notch marks pinned days in the control tile, row dot, ring node, legend and inspector. Fixed and unavailable are mutually exclusive. Immediate regeneration.

**Unavailable days:** excluded from workouts but retained in the week as rest, so they affect rest gaps. Marked in the control row, results column header, row dots, legend, recovery ring (slashed node), selected-week detail and copied plan.

**States:** hover, focus-visible, selected, disabled Clear, empty/impossible, forced-overlap note, copied feedback. Empty states explain pinned-over-sessions, too-few-available-days and contradictory day states, with actions to resolve. No loading state because generation is synchronous.

## Motion

One restrained moment: the selected-week card lifts 3px when it changes. Ring toggle chevron rotates. Copy label changes to "Copied" for 1.8s. All motion respects `prefers-reduced-motion`.

## Content rules

- Keep: control labels, result count, recovery status, the selected week's day list/gaps/pinned day/unavailable day, one "All N valid weeks shown" line, one disclosure, limitation text only when forced.
- Cut: taglines, repeated assurances, descriptions of what the eye can see, per-row gap prose, card notes, and duplicate status lines.
- Limitations name the concrete cause and the minimum number of adjacent pairs.