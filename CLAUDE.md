# Working on this repository with Claude Code

GS1 Label Studio: GS1 barcodes and labels generated in the browser, exported for artwork and for label printers.
Read the maintainer's handover first, then `README.md` (backlog) and `docs/adr/`. The handover, the maintainer's
time sheet and reference manuals live in the maintainer's Google Drive, folder `ClaudeAI/gs1-label-studio` (find it
with the Drive search tool); update the handover at the end of each session, newest first. Nothing private goes into
this public repository.

## Language

- Code, comments, identifiers, commit messages and documents: **British English**.
- User-facing texts: **English, Brazilian Portuguese and Spanish** (the owner, 31 October 2026; ADR 0003). Write each
  text in English through `t("…")` (or `en("…")` for a constant, `tm()` for a message of the core) and add its
  translations to `apps/web/src/locales/` (`pt-BR.json` and `es.json` for the page, `*.messages.json` for the core's
  and the engine's messages); `apps/web/test/i18n.test.ts` fails when one is missing. The files made stay in English.
- Documentation: **English only**, whatever languages the tool speaks (the owner, 31 October 2026).
- The conversation with the maintainer is in Portuguese.

## Commits and delivery

- `main` is the development branch until the first release; then `main` holds the stable version and `develop` the
  work in progress (backlog 0.4, as in the resolver's project). Fetch and rebase before pushing; pushed commits are
  never rewritten.
- A cloud session may be given a branch of its own: its work goes to `main` by a fast-forward push once `pnpm check`
  passes, so that CI runs and the published tool shows it (the owner, 29 October 2026).
- One topic per commit, with a message that explains why, and an area prefix (`core:`, `web:`, `docs:`, `ci:`,
  `metrics:`). Code and its technical documents go in the same commit.
- After a push that changes code, read the CI run (`gh run list`, `gh run view --log-failed`). Failures are also
  annotations (`gh api repos/ricardomelo/gs1-label-studio/check-runs/JOB_ID/annotations`), for an environment whose
  network does not reach the log storage.
- `pnpm check` (typecheck, tests, build) must pass before a push.

## Indicators (docs/metrics/README.md) — from day one

- At the start of a session add its line to `docs/metrics/sessions.csv` (session id, date, start time in UTC); at
  the end fill in the end time, Claude's working minutes, the commits and the backlog items, and whether the session
  stopped at a usage limit.
- When the maintainer reports time spent (decisions, tests, printers, reviews), add it to the time sheet in Drive
  (`Owner time sheet — gs1-label-studio`).
- At the end of each backlog item and at each release: `node scripts/metrics.mjs --write` and commit the snapshot.
- Do not change the line categories in `scripts/metrics.mjs` without recording why in `docs/metrics/README.md`.

## Tests

- Every symbol an exporter produces is read back by ZXing (`zxing-wasm`) in the tests: symbology identifier and data.
- Prove that a new check can fail (mutation); restore the file and compare checksums.
- Printer languages: a native command is offered only once a test shows it gives the same symbol (ADR 0002).
- There is no physical printer for tests: ZPL is checked with Labelary (`packages/core/test/labelary.test.ts`, run in
  CI with `LABELARY=1`). Locally: `NODE_USE_ENV_PROXY=1 LABELARY=1 npx vitest run test/labelary.test.ts` in
  `packages/core` (the cloud environment has full internet access since 28 October 2026). The maintainer uses
  Labelary's viewer (https://labelary.com/viewer.html) for manual checks.
- ZPL reference: Zebra's *ZPL II, ZBI 2, Set-Get-Do, Mirror, WML Programming Guide*, P1134473-11EN Rev A
  (https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/zpl-zbi2-pg-en.pdf; a
  copy in the maintainer's Drive, `references`). For searching: download it and run `pdftotext -layout` in the
  scratchpad.
- Also in `references`: GS1 General Specifications 2026; EPC Tag Data Standard 2.3 (October 2025), EPC Tag Data
  Translation 2.3 (February 2025), EPC Radio-Frequency Identity V3 (February 2026). Copyrighted documents: never in the
  repository.
- The editor has browser tests: `pnpm --filter @gs1-label-studio/web e2e` after `pnpm build` (Playwright 1.63.0, the
  version of this sandbox's browser).

## Documents (ADR 0005)

- `docs/README.md` indexes the documents by reader. A feature delivered gets its row in `docs/features.md` naming the
  tests that prove it, and its steps in `docs/user-guide.md` (and `docs/printing-guide.md` for printing).
- After changing tests: `NODE_USE_ENV_PROXY=1 LABELARY=1 node scripts/inventory.mjs` (the inventory and the developer
  guide's counts). After changing the core's exports or their comments: `node scripts/api-reference.mjs`. After
  changing a screen: `pnpm build` then `pnpm --filter @gs1-label-studio/web screenshots`.
- `packages/core/test/docs.test.ts` fails when the documents are out of step; it also runs alone when only documents
  change (`.github/workflows/docs.yml`).

## Working with the maintainer

- New to Git: give step-by-step instructions with the expected output.
- Questions: 2–3 options with the recommended one first. Always take the recommended option without waiting (the
  maintainer, 29 October 2026): say so at the top of the work, and carry on; the maintainer can still change it.
- Before implementing a screen, show mock-ups (Playwright screenshots of the real application); then implement the
  recommended one.
- At the end of a backlog item, or when the conversation has grown long, write a handover for the next session.
- Whenever a piece of work is finished, an updated test plan for the maintainer (the maintainer, 29 October 2026), as
  in the resolver's project: a Claude Docs doc with checkboxes, one section per delivery with its commit, each step in
  the published tool (https://ricardomelo.github.io/gs1-label-studio/) with its expected result; what is still
  untested from earlier plans carried over. Its link goes in the handover.
