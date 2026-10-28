# Working on this repository with Claude Code

GS1 Label Studio: GS1 barcodes and labels generated in the browser, exported for artwork and for label printers.
Read `README.md` (backlog), `docs/adr/` and the maintainer's handover at the start of each session.

## Language

- Code, comments, identifiers, commit messages and documents: **British English**.
- User-facing texts: **pt-BR and English** to begin with, every text in both; more languages later.
- The conversation with the maintainer is in Portuguese.

## Commits and delivery

- `main` is the development branch until a release process is decided. Fetch and rebase before pushing; pushed
  commits are never rewritten.
- One topic per commit, with a message that explains why, and an area prefix (`core:`, `web:`, `docs:`, `ci:`,
  `metrics:`). Code and its technical documents go in the same commit.
- After a push that changes code, read the CI run (`gh run list`, `gh run view --log-failed`).
- `pnpm check` (typecheck, tests, build) must pass before a push.

## Indicators (docs/metrics/README.md) — from day one

- At the start of a session add its line to `docs/metrics/sessions.csv` (session id, date, start time in UTC); at
  the end fill in the end time, Claude's working minutes, the commits and the backlog items, and whether the session
  stopped at a usage limit.
- When the maintainer reports time spent (decisions, tests, printers, reviews), add it to `docs/metrics/hours.csv`.
- At the end of each backlog item and at each release: `node scripts/metrics.mjs --write` and commit the snapshot.
- Do not change the line categories in `scripts/metrics.mjs` without recording why in `docs/metrics/README.md`.

## Tests

- Every symbol an exporter produces is read back by ZXing (`zxing-wasm`) in the tests: symbology identifier and data.
- Prove that a new check can fail (mutation); restore the file and compare checksums.
- Printer languages: a native command is offered only once a test shows it gives the same symbol (ADR 0002).

## Working with the maintainer

- New to Git: give step-by-step instructions with the expected output.
- Questions: 2–3 options with the recommended one first. When the maintainer is away, take the recommended option,
  say so at the top of the work, and carry on.
- Before implementing a screen, show mock-ups (Playwright screenshots of the real application).
- At the end of a backlog item, or when the conversation has grown long, write a handover for the next session.
