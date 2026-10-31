# ADR 0005 — The project's documentation and an inventory of features drawn from the tests

| | |
|---|---|
| Status | **Accepted** (31 October 2026). Implemented in one delivery |
| Decided by | the owner asked for complete documentation like the resolver's project (its ADR 0016); the recommended option taken on each point below, under the owner's rule |

## 1. Context

The documents grew one item at a time: the README's backlog, four ADRs, a changelog and a history. Nothing told a
person how to use the studio step by step, how to print its files, or how it is built; nothing tied a feature to the
proof that it works. The resolver's project answered the same need with manuals by reader, a list of features each
naming the checks that prove it, an inventory drawn from the tests, and a test that keeps them in step (its ADR 0016).

The studio's tests are about 670 in the core (Vitest) and 42 in the browser (Playwright), each named by a sentence that
says what is true — *refuses a GS1 QR Code: ^BQ has no FNC1* —: already the most complete and current description of
what the software does.

## 2. Decision

1. **The inventory is drawn from the tests**: `node scripts/inventory.mjs` runs the core's and the web application's
   unit tests with Vitest's JSON reporter (refusing to write when one fails; with `LABELARY=1` the ZPL through Labelary
   runs too), lists the documents' own test — which checks the inventory, so it runs after it is written — and lists
   the browser tests with `playwright test --list`; it writes `docs/test-inventory.md` (every test by area and file, with
   counts) and `docs/test-inventory.json` (the same, for the documents' test), and brings the developer guide's counts
   up to date. It is run by the delivery that changes the tests.
2. **Every feature names the tests that prove it**: `docs/features.md`, one table an area, with *Since* (the commit)
   and *Tests* — `` `file` `` or `` `file`: words ``, the words found in one of that file's test names.
3. **A test keeps the documents in step** (`packages/core/test/docs.test.ts`): a feature naming no test, or a test that
   does not exist, fails; so do a test file missing from the inventory, a count of the developer guide that differs from
   the inventory, a relative link to a file that does not exist, and a core API reference that differs from the
   sources.
4. **The core's API reference is generated** from `packages/core/src/index.ts` and the JSDoc above each name
   (`node scripts/api-reference.mjs` → `docs/core-api.md`): for integrators of the core, as the resolver's API reference
   was generated from its OpenAPI description.
5. **Manuals by reader**, indexed in `docs/README.md`:
   - people who make labels — `user-guide.md`, every step with screenshots;
   - people who print — `printing-guide.md` (artwork, laser sheets, thermal printers, ZPL templates);
   - integrators — `core-api.md`;
   - developers — `developer-guide.md`, the ADRs, the inventory;
   - everyone — `features.md`, `conformance.md` (each standard, section by section, with the evidence),
     `third-party.md` (components and licences).
6. **The guide's screenshots are generated** from the built application (`pnpm --filter @gs1-label-studio/web
   screenshots`, `apps/web/screenshots/`, a Playwright configuration of its own, not run by CI) into
   `docs/images/guide/`, so that they can be taken again when a screen changes.
7. **British English only**, as CLAUDE.md says, whatever languages the interface speaks.

## 3. Options considered

| Point | Chosen (recommended) | Not chosen |
|---|---|---|
| Source of the inventory | a run of the tests (Vitest's JSON report) and Playwright's list | `vitest list`, which leaves out tests made inside loops over fixtures loaded at collection; a list written by hand (drifts) |
| Where a feature's proof is named | a *Tests* column in `features.md`, checked | a separate mapping file (two places to keep together) |
| The API reference | generated from the sources and checked | TypeDoc (a dependency and a site of its own to publish); written by hand (drifts) |
| The documents' test | in the core's Vitest suite, so `pnpm check` runs it; a workflow of its own when only documents change (CI ignores them) | a separate script (one more command to remember) |
| The browser tests in the inventory | listed, not run, by the script (CI runs them) | run by the script (a build and a browser for each inventory) |

## 4. Consequences

- A delivery that adds, renames or removes tests runs the inventory script; the documents' test says so when it is
  forgotten (a feature naming a renamed test, a count that differs).
- A new feature row needs at least one test; a change to the core's exports or their comments needs the API reference
  written again.
- A screen that changes has its screenshots taken again.
