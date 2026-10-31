# Third-party software, data and licences

What GS1 Label Studio is made of besides its own code, under which licence, and what that means for anyone who uses
it, publishes it again or builds on it, commercially or not. A summary for orientation, not legal advice: the licences
themselves decide.

## In short

- **The studio is free and open source under the Apache License 2.0** ([LICENSE](../LICENSE)). Anyone may use, change
  and redistribute it, for profit or not, without paying anyone and without asking.
- **Everything the published application contains is under a permissive licence** (Apache 2.0, MIT, SIL OFL). Nothing
  in them forbids commercial use.
- **The tools used only by the tests** run as separate programs and are not part of the application; their licences
  (including GPL and AGPL for poppler and Ghostscript) do not reach the studio's code or the files it makes.
- **The files the studio makes are yours.** The barcodes, labels, ZPL and signatures carry your data; no licence of a
  component applies to them.
- **GS1's name and standards**: the licences give no right to the GS1 name or logo; the studio is maintained by its
  community, not by GS1. The GS1 standards are GS1's and are not in this repository; GS1's GCP length table is
  obtained from GS1 under its own terms.
- **No warranty**: the software is provided "as is" (Apache 2.0, sections 7 and 8). Check a printed symbol before a
  production run.

## In the application (shipped to the browser)

| Component | Version | Used for | Licence |
|---|---|---|---|
| [bwip-js](https://github.com/metafloor/bwip-js) | 4.11.4 | encoding every symbology | MIT |
| [GS1 Barcode Syntax Engine](https://github.com/gs1/gs1-syntax-engine) (`gs1encoder`, WebAssembly) | 1.4.1 | parsing and checking element strings and GS1 Digital Link URIs | Apache 2.0, © GS1 AISBL |
| [node-qrcode](https://github.com/soldair/node-qrcode) (`qrcode`) and its `dijkstrajs` | 1.5.4 | a QR code in one encoding mode | MIT |
| [opentype.js](https://github.com/opentypejs/opentype.js) | 2.0.0 | the human readable text as glyph outlines | MIT |
| [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (zxing-cpp in WebAssembly) | 3.1.6 | the editor's scan test | MIT (zxing-cpp: Apache 2.0) |
| [React](https://react.dev) and React DOM | 19.3.1 | the user interface | MIT |
| Liberation Sans (`packages/core/assets/fonts/`) | — | the human readable text | SIL Open Font License 1.1 (`OFL.txt` beside it) |

## Data

| Data | Source | Licence or terms |
|---|---|---|
| `packages/core/src/data/gs1_dictionary.json` | The GS1 Barcode Syntax Dictionary, as the GS1 Digital Link Resolver CE's portal read it (release 1.4.1) | Apache 2.0, © GS1 AISBL |
| `packages/core/src/data/epc_schemes.json` | Derived from GS1's EPC Tag Data Translation artefacts, through the resolver | Apache 2.0 with the resolver; the standard itself is GS1's |
| The symbol specification tables in `specifications.ts`, the decision tree in `guide.ts` | Facts taken from the GS1 General Specifications 26.0, cited by section | The standard is GS1's; the code is the project's |
| GS1's GCP length table | Loaded by the user, kept in their browser, never in the repository | GS1's terms |

## The project's own code and its origin

| Part | Licence | Notes |
|---|---|---|
| GS1 Label Studio (core, application, scripts, tests, documents) | Apache 2.0 | |
| Modules ported from the GS1 Digital Link Resolver CE — Expansion Pack (its label studio: `label.py`, `linear.py`, `epc.py`, `gcp.py`, `syntax.py`) | Apache 2.0, as the resolver | [ADR 0004](adr/0004-port-of-the-resolver-label-studio.md); the resolver's answers are test fixtures |

## Tools for development and tests only

| Tool | Used for | Licence |
|---|---|---|
| [TypeScript](https://www.typescriptlang.org), [Vite](https://vite.dev), [Vitest](https://vitest.dev), pnpm | building and testing | Apache 2.0, MIT |
| [Playwright](https://playwright.dev) and Chromium | browser tests and the guide's screenshots | Apache 2.0; Chromium BSD-3-Clause and others |
| [resvg-js](https://github.com/yisibl/resvg-js) | drawing the SVGs the tests read back | MPL 2.0 |
| [epc-tds](https://github.com/sergiss/epc-tds) | reading EPCs back | MIT |
| poppler's `pdftoppm` | drawing the PDFs the tests read back, run as a program | GPL 2.0 |
| Ghostscript | drawing the EPS the tests read back, run as a program | AGPL 3.0 |
| The resolver's Python (segno, zint-bindings, fontTools, Pillow) | writing the fixtures (`scripts/resolver-reference/golden.py`) | BSD, MIT, PSF-style |

## Services

| Service | Used for | Notes |
|---|---|---|
| [Labelary](https://labelary.com) | rendering ZPL in CI to read it back | Called by the tests only (`LABELARY=1`), with test data; the studio never calls it |
| GitHub Pages | publishing the application | Static files; no data of users reaches it beyond the request for the page |
