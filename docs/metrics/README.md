# Development and management indicators

Recorded from the first day so that the project's closing report ("GS1 Label Studio in numbers") can be built from
measurements rather than reconstructed afterwards. The report follows the one made for the GS1 Digital Link Resolver
CE Expansion Pack: what was delivered, how much was processed, how long it took and how long it would take a team of
people alone, what worked and what weighed.

## What is recorded, and where

| Indicator | Measured or estimated | Source | Recorded |
|---|---|---|---|
| Commits, days with commits, calendar days, commits per day | measured | git history | `node scripts/metrics.mjs` |
| Lines by category: code, tests, docs, data and translations, configuration | measured | tracked files | `node scripts/metrics.mjs` |
| Automated tests | measured | the test suites | `node scripts/metrics.mjs` |
| Sessions: start, end, Claude's working minutes, commits, backlog items | measured | each session | `sessions.csv`, by Claude at the end of each session |
| The owner's hours: decisions, tests on printers, staging, reviews | **measured by the owner** | a simple time sheet | `hours.csv`, by the owner (or dictated to Claude) |
| Tokens and cost at API list prices | measured where the session records usage | the session IDs in `sessions.csv` | at the closing |
| Delivered scope: symbologies, formats, printer languages, printers tested | measured | the backlog and the CHANGELOG | at each release |
| Effort of a team of people alone | estimated | lines × typical rates (below) | at the closing |

A snapshot is saved with `node scripts/metrics.mjs --write` at the end of each backlog item and at each release
(`snapshots/<date>.json`), so the evolution can be drawn without rewriting history.

## Line categories

Defined once in `scripts/metrics.mjs` and not changed without a note here, so that the figures stay comparable:

- **code**: application and library sources, scripts;
- **tests**: everything under `test/`, `tests/`, `e2e/` and `*.test.*`, `*.spec.*`;
- **docs**: Markdown and everything under `docs/` (except the snapshots);
- **data**: translations (`locales/`), data tables (`data/`), CSV;
- **config**: package manifests, TypeScript and Vite settings, workflows, dot files;
- **generated** (lock file, snapshots) and **excluded** (licence, binaries) are not weighed.

## The owner's time sheet (`hours.csv`)

One line per block of work, in minutes; it takes a few seconds and is what the previous project lacked ("measure the
hours from the first day, with a simple time sheet"). Activities:

- `requirements` — decisions, answering options, reading GS1 standards;
- `testing` — trying deliveries in the browser, staging, exports;
- `printers` — tests on physical printers (one line per printer and language is welcome in *notes*);
- `review` — reading documents and code;
- `meetings` — with customers, GS1 staff, printer vendors;
- `other`.

Example: `2026-10-28,45,requirements,"stack, repository and printer languages"`.

## Estimating a team of people alone (at the closing)

The same rates as the previous report, for reviewed, tested and documented work: code 50–100 lines a day, tests
150–250, documentation 200–300, plus research into the GS1 standards and printer languages and coordination; days of
8 hours. Printer testing on physical devices is counted from `hours.csv`, not estimated.

## Usage quota

The previous project stopped three sessions at the weekly limit. Each session's notes say when it ended at a limit, so
the closing can show how use was spread over the week.
