# Tire EU simulator

Single-page shoji site for decoding European tyre markings.

The published page is `dist/index.html`, originally saved as
`marquage-pneus.html`. Its three section icons are referenced directly from
`dist/` after removing the stale `marquage-pneus_files/` prefix.

- `dist/index.html` — published page; shoji renders `metadata.json` into its head.
- `dist/icon-tyre-*.png` — section illustrations.
- `metadata.json` — title and description overrides.
- `README.md` — private notes; not served.

Only `dist/` is public.
