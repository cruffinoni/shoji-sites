# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JavaScript in a shoji site. No build step, backend, account or external request. Fonts are self-hosted under `dist/fonts/`.

## Users

People arranging one to seven training sessions across a week, especially those with fixed commitments — a class, a team session, a long run — who want to see what recovery is possible before committing to a plan.

## Product Purpose

Generate every valid weekly workout schedule for a chosen frequency and set of fixed days, rank them by recovery, and make the trade-offs visible. Success is a user who can choose a week with confidence because they have seen the whole solution space, not a filtered highlight reel.

## Positioning

The product is exhaustive and cyclic: every seven-day combination is retained, Sunday and Monday are neighbours, and the ordering is based on measurable adjacent-pair and rest-gap properties rather than a hidden score. A simpler planner could suggest a week; this one shows why every alternative was ranked where it was.

## Operating Context

Used at a desk or on a phone while planning a training week. The user changes frequency and pinned days, scans the ranked list, opens a week's recovery ring, and copies the chosen plan into a note, message or calendar. No account, network or stored training history is required.

## Capabilities and Constraints

- 1–7 sessions per week; zero or more fixed weekdays and zero or more unavailable weekdays.
- Fixed and unavailable states are mutually exclusive per day; the UI clears the other state when switching.
- Every unique schedule with exactly the requested session count, all fixed days, and no unavailable days.
- Unavailable days remain in the week as rest for recovery and gap calculations.
- Cyclic adjacency (Sunday–Monday), rest-gap variance, and deterministic ordering.
- All valid weeks shown; full-recovery and compromise plans distinguished.
- Actionable empty state when fixed days exceed sessions or unavailable days leave too few possible workout days.
- Copy a week as a human-readable, fixed-width text plan.
- URL state (`?sessions=3&fixed=sun&forbidden=sat`) for reloadable/shareable views.
- No persistence, accounts, analytics or external API calls.

## Brand Commitments

Working name **Weekform**. Voice is calm, precise and non-promotional. The seven-day ring is the signature mark. No invented testimonials, outcomes or medical claims.

## Evidence on Hand

Requirements and scenario definitions only. Scenario A–D are illustrative examples, not user data. The UI uses synthetic schedule data generated in the browser; no training advice is claimed beyond the rest-spacing rules implemented.

## Product Principles

1. Show the whole solution space; never hide a valid week because it scores lower.
2. Make the cyclic week visible; Sunday and Monday are one edge.
3. Explain a limitation only when it exists, and name the number that matters.
4. Prefer legible evidence over explanatory prose.
5. Keep planning reversible: every input updates results immediately and the view is shareable.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Keyboard-operable controls and rows, visible focus, semantic groups and labels, live result/selection/copy feedback, reduced-motion support, large, touch-friendly controls and full-row selection targets, and tested layouts at 320, 390, 768, 1024 and 1440 CSS pixels.