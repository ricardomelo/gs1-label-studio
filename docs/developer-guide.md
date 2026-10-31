# Developer guide

How GS1 Label Studio is built: its parts, its source files, how a label is made from what a person types, the tests
and how to extend it. Read [CLAUDE.md](../CLAUDE.md) for the working rules (language, commits, tests), then the
[architecture decision records](README.md#architecture-decision-records). Every exported name of the core is in the
[core's API reference](core-api.md); every test in the [inventory](test-inventory.md).

## Contents

1. [Architecture](#1-architecture)
2. [Repository layout](#2-repository-layout)
3. [Getting started](#3-getting-started)
4. [How a label is made](#4-how-a-label-is-made)
5. [The core (`packages/core`)](#5-the-core-packagescore)
6. [The web application (`apps/web`)](#6-the-web-application-appsweb)
7. [What the browser keeps](#7-what-the-browser-keeps)
8. [Continuous integration and publication](#8-continuous-integration-and-publication)
9. [Tests](#9-tests)
10. [Documents and indicators](#10-documents-and-indicators)
11. [How to extend](#11-how-to-extend)
12. [Conventions](#12-conventions)

## 1. Architecture

A static web application; everything runs in the browser ([ADR 0001](adr/0001-browser-first-architecture.md)):

```
apps/web (React 19 + Vite)          packages/core (TypeScript, no user interface)
┌───────────────────────────┐       ┌──────────────────────────────────────────────────────────┐
│ App.tsx — state, steps    │──────▶│ syntax.ts      GS1 Barcode Syntax Engine (WebAssembly)   │
│ IdentifyCard  step 1      │       │ identify.ts    key, qualifiers, attributes → data        │
│ ScanCard      step 2      │       │ guide.ts       decision tree, carriers, recommendation   │
│ LabelCard     step 3      │       │ specifications.ts / environments.ts  sizes by table      │
│ BulkCard, GeneratePanel   │       │ encode.ts      bwip-js, node-qrcode → geometry           │
│ PrinterSection, EpcSection│       │ layout.ts, gs1128.ts, logistic.ts, hri.ts  the label     │
│ SignSection, NfcWriter    │       │ svg/png/pdf/eps/zip/zpl.ts  exporters                    │
│ generate.worker.ts ───────┼──────▶│ batch.ts       every row from one design                 │
│ scan.ts (zxing-wasm)      │       │ epc.ts, gcp.ts, ndef.ts, sign.ts  RFID, NFC, signatures  │
└───────────────────────────┘       └──────────────────────────────────────────────────────────┘
```

- **The core** holds every GS1 rule, encoder and exporter. It runs in the browser, in a Web Worker and in Node 22 (the
  tests), so a command line or an HTTP API could use it later (backlog 5.1).
- **The web application** holds state and screens only; it calls the core and downloads what the core writes.
- **No server**: the product data never leaves the computer; GitHub Pages serves the files; a service worker keeps them
  for offline use.
- **One source per rule**: GS1's Syntax Engine for AI syntax and associations, the General Specifications' tables
  for sizes ([ADR 0003](adr/0003-product-scope-and-ux.md)), the resolver's code for what it already did
  ([ADR 0004](adr/0004-port-of-the-resolver-label-studio.md)), the printer's commands for ZPL
  ([ADR 0002](adr/0002-printer-output.md)).

## 2. Repository layout

| Path | What |
|---|---|
| `packages/core/src/` | The core's modules (section 5); `index.ts` exports its API |
| `packages/core/src/data/` | `gs1_dictionary.json` (the GS1 Barcode Syntax Dictionary as the resolver read it, release 1.4.1) and `epc_schemes.json` (the EPC schemes derived from GS1's Tag Data Translation artefacts) |
| `packages/core/assets/fonts/` | Liberation Sans (SIL Open Font License), for the human readable text as outlines |
| `packages/core/test/` | Vitest tests (`*.test.ts`), helpers (`files.ts`, `font.ts`, `png.ts`, `resolver.ts`) and fixtures |
| `packages/core/test/fixtures/resolver/` | The resolver's own answers, written by `scripts/resolver-reference/golden.py` |
| `packages/core/test/fixtures/bulk/` | A test workbook (`products.xlsx`) and the script that writes it |
| `apps/web/src/` | The application (section 6) |
| `apps/web/e2e/` | Playwright browser tests of the editor |
| `apps/web/test/` | Vitest unit tests of the web application: its languages |
| `apps/web/screenshots/` | The user guide's screenshots, written to `docs/images/guide/` |
| `apps/web/offline.ts` | The Vite plugin that writes the service worker |
| `apps/web/public/` | Web app manifest and icons |
| `docs/` | The documents ([index](README.md)); `docs/adr/` the decisions; `docs/metrics/` the indicators |
| `scripts/metrics.mjs` | Development indicators |
| `scripts/inventory.mjs` | The inventory of tests (`docs/test-inventory.*`) |
| `scripts/api-reference.mjs` | The core's API reference (`docs/core-api.md`) |
| `scripts/resolver-reference/golden.py` | Runs the resolver's Python and writes its answers as fixtures |
| `.github/workflows/` | `ci.yml` (checks), `pages.yml` (publication), `docs.yml` (the documents' test) |

## 3. Getting started

Node.js 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev                       # the application on http://localhost:5173
pnpm check                     # typecheck, tests and build — run before every push
pnpm --filter @gs1-label-studio/web e2e   # browser tests, after pnpm build (Playwright 1.63.0)
```

Some tests need programs outside Node: poppler's `pdftoppm` (PDFs drawn and read back) and Ghostscript (EPS); install
them with `apt-get install poppler-utils ghostscript`. The ZPL tests through Labelary run only with `LABELARY=1`
(behind a proxy also `NODE_USE_ENV_PROXY=1`):

```bash
cd packages/core && NODE_USE_ENV_PROXY=1 LABELARY=1 npx vitest run test/labelary.test.ts
```

## 4. How a label is made

1. **Input.** `syntaxEngine()` loads the GS1 Barcode Syntax Engine (`gs1encoder`, WebAssembly) once.
   `SyntaxEngine.parse()` takes whatever was pasted and returns a `ParsedInput` (each AI with its data title, the
   element string, the GS1 Digital Link URI) or an `InputError` with the characters at fault marked. `fieldsOf()` turns
   it into the editor's `Identification`: key, value, qualifiers, attributes, parameters.
2. **Identification.** As the person types, `identify(engine, id, stem)` writes the element string (`elementStringOf`:
   qualifiers in path order, decimal families resolved by `attributes.ts`), has the engine check it, and appends the
   URI's own parameters (`withParameters`). `checkKeyValue` and `checkDigitProblem` check digits on the row.
3. **Where it is scanned.** `walk(key, answers)` follows figure 5-68 to a leaf — a section 2 application with its
   symbol specification table; `guidance(leaf, identified)` lists the carriers in the standard's order and recommends
   one, using `carries()` (what each symbol can carry, GS1-128's 48 characters included). `specificationFor()` gives
   the table's row (X-dimension range, bar height, quiet zones).
4. **The design.** The editor's choices become a `LabelDesign` (symbol, size, text, version, error level, bearer bars,
   bar width reduction, text position and height, GS1-128 starts, QR mode, logistic label).
5. **The label.** `labelFor(identified, design, font)` derives the data the symbol carries (`dataFor`), builds
   `LabelOptions` and lays them out: `layoutLabel()` places the symbol (encoded by `encode()` through bwip-js, or
   node-qrcode for one QR mode), its quiet zone, the text as glyph outlines (`HriFont`), an EAN/UPC beside it, or the
   stacked GS1-128 symbols (`gs1128.ts`) or the GS1 Logistic Label (`logistic.ts`). The `Layout` is
   format-independent: rectangles, modules and paths in millimetres.
6. **Exports.** Every format draws the same `Layout`: `labelSvg`, `labelPng`/`pngAt`, `labelPdf`/`pdfDocument`,
   `labelEps`, `labelZip`. ZPL is different — the printer draws the symbol — so `zplOptionsFor(drawn, design, dpi,
   dots)` places it with the printer's commands and `zplLabel`/`zplTemplate`/`zplTestLabel` write it.
7. **Checking.** `expectedReads(options)` says what a reader should give back for each symbol; the scan test and the
   tests compare ZXing's reading with it.
8. **In bulk.** `parseTableFile`/`parseDelimited` read the rows, `guessMapping` maps columns to AIs, `checkRows` makes
   each row an `Identification` and checks it, `applyEdits`/`rowStatus` apply the report's fixes and skips, and
   `generateBatch(rows, request, font, progress)` draws every row with `labelFor` in a Web Worker and zips the files,
   PDF, sheets, ZPL and `generated.csv`.

## 5. The core (`packages/core`)

Each module, in the order of the flow above. 
### Input and identification

| Module | What it does |
|---|---|
| `syntax.ts` | The Syntax Engine: `SyntaxEngine.parse`, `dataFor` (what each symbol carries: the GTIN in its length, the element string, the URI), `zeroSuppress` (UPC-E), `encodedCount` (the caption's characters, FNC1 and separators) |
| `elementString.ts` | Bracketed element strings into AIs and values; `hasPredefinedLength` |
| `checkDigit.ts` | The GS1 check digit |
| `dictionary.ts` | The resolver's dictionary file: keys, qualifiers in path order, exclusive qualifier sets, AIs with their formats; `primaryKeys`, `isDigitalLinkKey` |
| `attributes.ts` | Data attributes as the resolver offered them, decimal families (310n, 392n…) and their conversion; dates with day zero |
| `identify.ts` | `Identification` → `Identified`: `identify`, `elementStringOf`, `fieldsOf`, `rowsOf`/`splitRows` (one list of qualifiers and attributes), `OTHER_KEYS` (the pairings of 4.13), `parametersProblem`, `withParameters`, `uriParameters` |

### Where it is scanned

| Module | What it does |
|---|---|
| `specifications.ts` | Every row of the symbol specification tables 1 to 13 (General Specifications 26.0, 5.12.3); `specificationFor`, `specSizesFor`, `baseX`, `minimumBarHeight` |
| `environments.ts` | The resolver's scanning environments (its `label.py`), sizes and checks; `environmentsFor` a key |
| `guide.ts` | `TREE`, `QUESTIONS`, `walk` (figure 5-68), `guidance` and `carries` (section 2's carriers), `gs1128DataCharacters` |

### Symbols and the label

| Module | What it does |
|---|---|
| `symbologies.ts` | The symbologies: id, name, bwip-js encoder, symbology identifier |
| `encode.ts` | `encode()` through bwip-js `raw()` → `SymbolGeometry` (bars or a module matrix); one QR mode through node-qrcode (`QR_MODES`, `qrModeProblem`); a cache of recent symbols |
| `linear.ts` | EAN/UPC as the resolver encoded them: guard bars, digits, quiet zones (`encodeLinear`, `symbolFor`) |
| `layout.ts` | `layoutLabel` (the resolver's `_layout` and `_place_linear`, and `layoutBars` for symbols sized by their table's row), `labelSvg`, the text's position and height, bar width reduction, ITF-14's bearer bars |
| `gs1128.ts` | `splitGs1128` and `dataCharacters` (48 data characters and 165.10 mm a symbol); the stack is laid out by `layout.ts` |
| `logistic.ts` | `logisticLabel`: the GS1 Logistic Label as one `Layout` (6.6) |
| `hri.ts` | `HriFont`: Liberation Sans through opentype.js, contours drawn as fontTools does, glyph points cached |
| `pyformat.ts` | `pyFixed`: Python's `%.3f` with ties to even, so the SVG equals the resolver's |
| `scan.ts` | `expectedReads`: the symbology identifier and data each symbol of a label should read as |

### Exports

| Module | What it does |
|---|---|
| `svg.ts`, `raster.ts` | The bare symbol as SVG; geometry to a bitmap (graphic fields and tests) |
| `png.ts` | `labelPng` (12 pixels a module, pHYs dpi), `pngAt` (300/600/1200 dpi), text rasterised from the outlines |
| `pdf.ts` | `labelPdf` (the resolver's `render_pdf` operators) and `pdfDocument` (several pages), DeviceCMYK |
| `eps.ts` | `labelEps`: the PDF's content stream under a PostScript prolog |
| `zip.ts`, `deflate.ts` | `labelZip` with its README; deflate through Compression Streams |
| `dots.ts` | `snapToDots`, `dotsWithin`: the printer's dot grid |
| `zpl.ts` | `zplLabel`, `zplTemplate`, `fillTemplate`, `zplTestLabel`, `gs1128FieldData` (mode N, FNC1, code sets), graphic fields in stripes |
| `printer.ts` | `GENERIC_PROFILES`, `profileProblem`, `moduleChoice`, `printWidthProblem` |

### In bulk

| Module | What it does |
|---|---|
| `table.ts` | `parseDelimited` (RFC 4180, delimiter detected), `parseXlsx` (the workbook's zip and XML), `parseTableFile` |
| `bulk.ts` | `guessColumn`/`guessMapping`, `normaliseCell`, `rowIdentification`, `checkRows` (columns at fault, hints) |
| `report.ts` | `CellEdits`, `applyEdits`, `editCell`, `rowStatus`, `reportCounts`, `reportCsv`, `correctedCsv` |
| `sequence.ts` | `sequenceValues`, `ssccFor`, `sequenceProblem`, `sequenceTable`, `withSequence` (at most `MAX_SEQUENCE` rows) |
| `sheets.ts` | Avery sheets with centred margins, `sheetProblem`, `fitsSheet` |
| `batch.ts` | `LabelDesign`, `labelFor`, `zplOptionsFor`, `patternName`, `generateBatch`, `upperCaseDomain` |

### RFID, NFC and signatures

| Module | What it does |
|---|---|
| `epc.ts` | Every EPC scheme for a key (the resolver's `epc.py`, schemes loaded lazily, BigInt), hexadecimal in 16-bit words, base 64, tag and pure identity URIs, NFC links |
| `gcp.ts` | `GcpTable`: GS1's GCP length table read without a DOM, kept compact |
| `ndef.ts` | `ndefUriMessage`, `ndefUri`: the NFC Forum URI record |
| `sign.ts` | `signedPayload`, `signJws`, `verifyJws`, `hideAuthenticationCode`, `keyCredential`, `productDataCredential`, `signCredential` (Web Crypto, ES256) |

## 6. The web application (`apps/web`)

| File | What it does |
|---|---|
| `src/main.tsx` | Registers the service worker; `Root` remounts `App` for *Start over* |
| `src/App.tsx` | The state of the editor (identification, answers, settings, bulk rows, edits, printer) and the label memo through `labelFor`; downloads; the destination shown on a phone or a tablet, each keeping its scroll, a link to another destination opening it |
| `src/layout.ts` | The layouts (backlog 1.21): the destinations (`Pane`), the phone's and the tablet's media queries, `useMedia`, `paneOf` |
| `src/TabBar.tsx` | The destinations' bar: at the bottom on a phone, a rail on a tablet held horizontally, hidden on a computer; a dot where something needs attention |
| `src/About.tsx` | About, at the foot of the page: the repository, the licence, the manuals, the version (`__BUILD__`, the commit the build was made from, set in `vite.config.ts`), the software it is made with |
| `src/IdentifyCard.tsx` | Step 1: paste box, key, the list of qualifiers and attributes (`AiCombo`), other keys, parameters |
| `src/AiCombo.tsx` | The AI field: every AI from its arrow, filtered by typing |
| `src/ScanCard.tsx` | Step 2: the tree's questions, the table, the recommended and allowed symbols, *Choose a symbol yourself* |
| `src/LabelCard.tsx` | Step 3: canvas, caption, zoom, *Fit / Real size*, scan test, Export bar, options, GS1-128 symbols, the coloured URI |
| `src/RealSize.tsx` | Rulers and the screen's calibration |
| `src/scan.ts` | The scan test: the SVG drawn on a canvas, read by zxing-wasm (its WebAssembly served by the application) |
| `src/BulkCard.tsx` | Step 1 in bulk: rows, column mapping, fixed values, the validation report |
| `src/SequenceForm.tsx` | Serial numbers and SSCCs |
| `src/GeneratePanel.tsx` | *Generate in bulk*: formats, name pattern, PDF, sheets, ZPL; its choices kept in localStorage |
| `src/generate.worker.ts` | `generateBatch` in a Web Worker, with progress; Cancel ends the worker |
| `src/PrinterSection.tsx` | Printer profiles, the module's dots, the test print |
| `src/EpcSection.tsx`, `src/NfcWriter.tsx` | RFID and NFC: the EPC formats, the GCP table, writing an NFC tag through Web NFC or the NDEF file |
| `src/SignSection.tsx` | The digital signature and credentials |
| `src/keep.ts` | IndexedDB for the GCP table |
| `src/texts.ts` | The page's texts kept apart from the code (keys, qualifiers, environments, guide, bulk), in English; `aiText`, `aiTitle` |
| `src/i18n.ts` | The languages: `t()` for the page's texts, `en()` to mark a constant, `tm()` for the core's and the engine's messages (exact, then by template, a hint part by part), `setLocale`, `initialLocale`, `formatNumber` |
| `src/locales/` | `pt-BR.json`, `es.json` (the page), `pt-BR.messages.json`, `es.messages.json` (the core and the Syntax Engine), `ai-titles.pt-BR.json` (the AIs' Portuguese names, the resolver's) |
| `test/i18n.test.ts`, `test/texts.ts` | Every text in each language: the page's `t()`/`en()` literals and texts.ts, the core's messages found in its sources, the engine's (`test/engine-messages.json`, release 1.4.1) |
| `src/styles.css` | Light and dark; the computer's layout, the phone's (one destination, a tab bar) and the tablet's (a rail, the label beside), by `data-pane` and `data-beside` |
| `offline.ts` | The Vite plugin writing `sw.js` with every built file: pages network-first, hashed files cache-first |

## 7. What the browser keeps

Nothing is sent anywhere. What the browser keeps, for convenience only — the page works without it:

| What | Where | Key |
|---|---|---|
| The screen's calibration | localStorage | set by `RealSize.tsx` |
| The columns chosen for a file's headers | localStorage | `gs1-label-studio.columns.<headers>` |
| The bulk generation's choices | localStorage | set by `GeneratePanel.tsx` |
| Printer profiles of one's own | localStorage | set by `PrinterSection.tsx` |
| GS1's GCP length table | IndexedDB `gs1-label-studio` / `kept` | `gcp` |
| Every file of the application | Cache Storage | `gs1-label-studio-<hash>` |

A signing key is never kept: the person saves it as a JWK and loads it again.

## 8. Continuous integration and publication

- **`ci.yml`** on every push to `main` (except documents) and every pull request: install, typecheck, install poppler
  and Ghostscript, the core's tests with `LABELARY=1` (failures also as annotations, for environments that cannot read
  the logs), build, then the browser tests against the build on a desktop, a phone and a tablet held horizontally.
- **`docs.yml`** when only documents change: the documents' test (`packages/core/test/docs.test.ts`).
- **`pages.yml`** on every push to `main`: builds with `BASE_PATH=/gs1-label-studio/` and publishes to GitHub Pages.
- After a push that changes code, read the run (`gh run list`, `gh run view --log-failed`, or the check run's
  annotations).
- Releases (backlog 0.4): `main` holds the stable version and `develop` the work in progress once there is a first
  release.

## 9. Tests

Every symbol an exporter produces is read back by ZXing (`zxing-wasm`), comparing the symbology identifier and the
data; PDFs are drawn by poppler's `pdftoppm`, EPS by Ghostscript, SVG by resvg, ZPL by Labelary, EPCs read back by
epc-tds and signatures verified by Node's crypto. Ported modules are compared with the resolver's own answers. A new
check is proven able to fail by a mutation (the file restored and its checksum compared). The test names are sentences
that say what is true; together they are the [inventory of features](test-inventory.md).

| File | What it tests | Tests |
|---|---|---:|
| `attributes` | data attributes and decimal families, against the resolver | 29 |
| `bars` | ITF-14, GS1-128 and GS1 DataBar laid out by their table, read back from SVG, PNG and PDF | 20 |
| `batch` | label sheets, several-page PDF, file names, generating every row | 9 |
| `bulk` | columns guessed from headers, cells normalised, rows checked | 37 |
| `checkDigit` | the GS1 check digit | 5 |
| `docs` | the documents in step with the code and the tests | 7 |
| `dots` | the printer's dot grid | 3 |
| `environments` | the resolver's scanning environments, its 2,970 answers | 4 |
| `epc` | EPC against the resolver and read back by epc-tds; the GCP length table | 113 |
| `gs1128` | GS1-128 over several symbols, in the label and in ZPL | 5 |
| `guide` | the decision tree, the carriers, the recommendation, GS1-128's 48 characters | 38 |
| `hriplace` | the human readable text's position and height, still read | 12 |
| `identifiers` | every identification key, (03), attributes of element strings only | 5 |
| `identify` | the editor's identification, one list, parameters, several keys | 14 |
| `labelary` | ZPL printed by Labelary and read back (LABELARY=1) | 40 |
| `labelsvg` | the label's SVG drawn by resvg and read back | 6 |
| `layout` | EAN/UPC and the label's layout against the resolver | 45 |
| `logistic` | the GS1 Logistic Label | 3 |
| `ndef` | NDEF URI records | 3 |
| `prepress` | EPS through Ghostscript, 100 % K, bar width reduction, PNG at a resolution | 10 |
| `printer` | the module in whole dots, profiles, the test label | 4 |
| `pyformat` | Python's fixed-point rounding | 2 |
| `qrmode` | QR Code's encoding modes and the domain in capitals | 7 |
| `render` | PNG, PDF and zip against the resolver, PDFs drawn by pdftoppm | 20 |
| `report` | the validation report and its CSVs | 11 |
| `roundtrip` | every symbology encoded, rasterised and read back; SVG; graphic fields | 22 |
| `sequence` | serial numbers and SSCCs | 6 |
| `sign` | the signed payload, JWS, workflows, saved keys, credentials | 8 |
| `specifications` | every row of tables 1 to 13 against the standard's text | 143 |
| `syntax` | input through the Syntax Engine, what each symbol carries, characters encoded | 15 |
| `table` | CSV and Excel read without a library | 9 |
| `zpl` | ZPL with the printer's commands, templates, GS1 DataBar, bearer bars | 15 |
| `i18n` | the interface's languages: every text translated, messages by template (apps/web/test) | 9 |
| `editor` | the editor in a browser, desktop, phone and tablet (Playwright) | 44 |
| `layouts` | the computer's, the phone's and the tablet's layouts, About (Playwright) | 5 |

The core's and the web application's unit tests run with `pnpm test` (Vitest); the browser tests with `pnpm --filter @gs1-label-studio/web e2e` after
`pnpm build`, each on a desktop, a phone and a tablet held horizontally (a test about one layout skipped in the others).

## 10. Documents and indicators

- `docs/test-inventory.md` and `.json`: `NODE_USE_ENV_PROXY=1 LABELARY=1 node scripts/inventory.mjs` after a change to
  the tests; it runs the core's tests (refusing to write if one fails) and lists the browser tests.
- `docs/core-api.md`: `node scripts/api-reference.mjs` after a change to the core's exports or their comments.
- `docs/images/guide/`: `pnpm --filter @gs1-label-studio/web screenshots` after `pnpm build`, when a screen changes.
- `docs/features.md`: a row for each new feature, naming at least one test.
- This guide's table of tests: the counts follow the inventory.
- `packages/core/test/docs.test.ts` fails when any of these is out of step
  ([ADR 0005](adr/0005-documentation-and-feature-inventory.md)).
- Indicators: `node scripts/metrics.mjs --write` at the end of each backlog item ([docs/metrics](metrics/README.md)).

## 11. How to extend

- **A symbology.** Add it to `symbologies.ts` (its bwip-js encoder and symbology identifier), to the tables of
  `specifications.ts` where the General Specifications list it, to `carries()` and the carriers of `guide.ts`, and to
  `layoutBars` or the 2D path of `layout.ts`. Read it back in `roundtrip.test.ts` and from every file in a test like
  `bars.test.ts`; a symbol no independent decoder reads is not offered (GS1 DotCode).
- **An export format.** Draw the `Layout` (rectangles, modules, paths in millimetres) as `pdf.ts` does; add it to
  `labelZip` and `generateBatch`; read the file back in a test through a program that draws it.
- **A printer language.** Follow ADR 0002: the printer's own commands, each symbol proven by a test that prints it and
  reads it back, refusals with their reason; a profile per language in `printer.ts`.
- **An AI or a key.** The Syntax Engine and the dictionary file decide; update `gs1encoder` and
  `src/data/gs1_dictionary.json` together and run the tests of `identify`, `identifiers` and `attributes`.
- **A screen.** Mock-ups first (Playwright screenshots of the real application), then the component in `apps/web/src`,
  a browser test in `e2e/editor.spec.ts`, and its screenshots for the user guide.
- **A text.** In English through `t("…")` (a constant marked `en("…")` or kept in `src/texts.ts`), with its
  translations in `src/locales/pt-BR.json` and `es.json`; a message the core writes is shown through `tm()` and
  translated in `*.messages.json` (the same text with `{placeholders}` where its `${…}` are, named after them).
  `pnpm --filter @gs1-label-studio/web test` lists what is missing ([ADR 0003](adr/0003-product-scope-and-ux.md)).
  The documentation stays in English.

## 12. Conventions

- British English in code, comments, identifiers, commits and documents.
- One topic per commit, a message that says why, an area prefix (`core:`, `web:`, `docs:`, `ci:`, `metrics:`); code and
  its documents in the same commit.
- `pnpm check` before every push; pushed commits are never rewritten.
- Comments say why, citing the section of the standard or the ADR.
- No copyrighted standard in the repository: the General Specifications, the ZPL guide and the EPC standards are read
  from the maintainer's references.
