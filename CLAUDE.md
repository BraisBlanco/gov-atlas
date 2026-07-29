# Working in this repo

Read [docs/METHODOLOGY.md](docs/METHODOLOGY.md) before changing anything under `data/`, and
[docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md) before adding a country.

## The invariants

These are not style preferences. Breaking one breaks the project's only real claim.

1. **Never type a count into a data file.** Every published figure is derived in
   `scripts/lib/derive.ts` from the curated entity lists. If you find yourself wanting a
   `ministries_count` field in YAML, the answer is no.
2. **Never add a datum without a source.** `scripts/validate.ts` enforces it; do not weaken a
   rule to make a file pass. If a rule is wrong, change the rule deliberately, with a test.
3. **Never invent an archive URL or a quote.** Check that a snapshot exists (the Wayback
   availability API works fine) and copy quotes verbatim. A fabricated citation is worse than
   a missing one, because it is invisible.
4. **`ministries_count` and `cabinet_seats_count` are different numbers.** Never add them,
   never present one as the other, and always say which a chart uses.
5. **Taxonomy ids are frozen during parallel work.** Adding a policy area changes every
   country's comparison row. Propose it; don't add it mid-fan-out.

## Commands

```bash
npm run validate     # the CI gate — run this before you finish anything data-related
npm test             # includes negative tests asserting each rule actually fires
npm run build:data   # regenerate site/public/data (required before building the site)
npm run build        # validate -> typecheck -> data -> site
npm run build:geo    # refetch map geometry from Eurostat GISCO; output is committed
```

`build:geo` is not part of `build`, on purpose: the map's coastlines are vendored in
`site/src/geo/europe-paths.json` so the site builds offline and reproducibly. Run it only to
adopt a newer GISCO release, and never hand-edit its output.

## Conventions

- **Two identifier alphabets, deliberately.** Record ids are kebab-case (`boe-rd-829-2023`);
  taxonomy ids are snake_case (`foreign_affairs`). A paste between the two fails validation
  instead of creating a plausible dangling reference.
- **Dates are `YYYY-MM-DD` strings** end to end. Never `Date` objects — see the guard in
  `scripts/lib/load.ts`.
- **No barrel files.** Import components by their own path. A barrel is a file every parallel
  track has to edit.
- **Charts:** load the `dataviz` skill first. Colours come from `site/src/styles/tokens.css`
  and nowhere else; the palette is validated, so do not re-step it by eye. Every chart wraps
  `ChartFrame`, which supplies the table view, the CSV download and the real citations.
- **The choropleth's ramp is a validator result, not a preference.** Which `--seq-*` steps
  each mode uses, and why the light ramp cannot start at `--seq-100`, is recorded at the top
  of `ChoroplethEurope.css`. Changing a step means re-running the validator for both modes.
- **Type-only imports cross into `scripts/` and `data/`** from the site on purpose, so the
  site consumes exactly the types the pipeline emits.
- **Nothing user-visible is monolingual.** `assertParity()` fails the build on a missing
  translation key.

## When data and a source disagree

Follow the higher-tier source, record the discrepancy in the country's `methodology_notes` in
both languages, and say so in your hand-off notes. Silently picking one is the failure this
repo is designed to prevent.
