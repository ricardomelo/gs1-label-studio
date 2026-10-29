# GS1 Label Studio

Create GS1 barcodes — and, later, whole labels — in your browser, one at a time or thousands from a spreadsheet, and
export them as vector files for artwork or as print files for label printers (PDF, ZPL II, EPL2, TSPL, PPLA, PPLB,
DPL). Nothing you type or upload leaves your computer.

> **Status:** early development (29 October 2026). The resolver's editor in the browser: key, qualifiers and data
> attributes, where the code is scanned (the GS1 decision tree, the symbol recommended), the label beside its options,
> live — EAN/UPC, ITF-14, GS1-128, GS1 DataBar, GS1 DataMatrix and the QR code and Data Matrix with a GS1 Digital Link
> URI, each laid out as the GS1 General Specifications place it, seen at real size and read back by a scan test in the
> browser; SVG, PNG at a chosen resolution, PDF and EPS in process black, a bar width reduction, a zip of all, and ZPL
> with the printer's own commands (and as a template); EPC for RFID and NFC.
> See the backlog.

## Development

Requires Node.js 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # the web application on http://localhost:5173
pnpm check        # typecheck, tests and build — what CI runs
node scripts/metrics.mjs   # development indicators (docs/metrics/README.md)
```

| Path | What |
|---|---|
| `packages/core` | GS1 encoding, geometry, printer dot grid, exporters; no user interface; runs in browser and Node |
| `apps/web` | the web application (React + Vite) |
| `docs/adr` | architecture decision records |
| `docs/metrics` | development and management indicators, from day one |
| `scripts` | project tools; `resolver-reference/golden.py` writes the resolver's answers as test fixtures (ADR 0004) |

Decisions: [ADR 0001 — browser-first architecture](docs/adr/0001-browser-first-architecture.md),
[ADR 0002 — printer output](docs/adr/0002-printer-output.md),
[ADR 0003 — product scope and user experience](docs/adr/0003-product-scope-and-ux.md),
[ADR 0004 — the resolver's label studio as the starting point](docs/adr/0004-port-of-the-resolver-label-studio.md).

## Backlog

**Order from here** (29 October 2026): 2.2 → 1.10 → 2.4 → 1.11 → 1.12 → 2.3 → 1.13 → 2.5 → 1.14 → phase 3. The
editor's corrections (1.10) come first after 2.2, being small and seen every day; several keys (1.12) before the
generated SSCCs (2.3), which a logistic unit's label needs; GS1-128 over several symbols (1.13) after them, opening
the logistic label of phase 4.

**Phase 0 — setting up**

- 0.1 Repository, CI, publication on GitHub Pages — *done*
- 0.2 Development indicators from the first day (`docs/metrics`) — *done*
- 0.3 Walking skeleton: core encoding through bwip-js, read back by ZXing; printer dot grid; SVG; ZPL graphic — *done*

**Phase 1 — one code, right by construction** (ported from the resolver's label studio where it had it: ADR 0004)

- 1.1 Input: GS1 Barcode Syntax Engine; paste an element string, a GS1 Digital Link URI or a scanner's output; AIs
  named and checked; errors explained — *done (a "(" inside a value is refused: the barcode encoder cannot take it)*
- 1.2 Guided choice: what is identified → symbol specification table → symbols allowed and recommended; scanning
  environments table carried over from the resolver (General Specifications 26.0, section 5.12.3) — *table, sizes and
  checks ported (2 970 of the resolver's answers equal); done: every row of tables 1 to 13, with ITF-14, GS1-128, GS1
  DataBar and GS1 DotCode, tested against the standard's text; the decision tree (figure 5-68), section 2's carrier
  choices and a recommendation; the editor's step 2, "Where is it scanned?" (mock-up B); ITF-14 and GS1-128 at their
  table's sizes and bar height*
- 1.3 Every GS1 symbology: EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128, GS1 DataBar family, GS1 DataMatrix,
  QR and Data Matrix with a GS1 Digital Link URI, GS1 DotCode; composite components later. GS1 QR Code is encoded by
  the core but not offered in the editor: beside the QR code with a GS1 Digital Link URI it confuses (ADR 0003) —
  *done: ITF-14, GS1-128 and the GS1 DataBar family laid out by their table's row, ITF-14 with bearer bars, each read
  back by ZXing from the SVG, PNG and PDF. GS1 DotCode is not drawn: no independent decoder reads it back (ZXing does
  not), which every symbol needs before it is offered; GS1 DataMatrix is recommended for tobacco unit packs instead.
  Composite components later*
- 1.4 Layout and human readable text as the General Specifications place them: the resolver's 2D symbol with an EAN/UPC
  beside it, guard bars, quiet zones, digits in OCR-B, text as outlines or as text; QR version and error correction —
  *ported and checked against the resolver (ADR 0004); an EAN/UPC alone too; GS1-128, ITF-14 and DataBar with 1.3*
- 1.5 Exports: SVG, PNG with dpi, PDF (vector, real size, written without a library, as the resolver's), EPS, zip;
  prepress options (bar width reduction, 100 % K) — *done: SVG, PNG (12 pixels per module, its dpi recorded), PDF and
  zip with README ported from the resolver and checked against it, for every symbol from its layout (1.3); EPS (the
  PDF's drawing in PostScript, read back through Ghostscript); PDF and EPS in process black alone; a bar width
  reduction for linear symbols; the PNG at 300, 600 or 1200 dpi. Margins and crop marks later, with the labels of
  phase 4*
- 1.6 Preview at real size with a ruler and a scan test; light and dark; phone width (the tool is in English) — *done:
  the editor screen (preview beside the options, live, desktop and phone, light and dark); the preview at real size
  between rulers in millimetres, the screen calibrated against a bank card; a scan test that reads the label back with
  ZXing in the browser (mock-up A)*
- 1.7 Offline (PWA) — *done: a service worker written at build time keeps every file of the application (the
  engines' WebAssembly, the font, the EPC schemes) on the first visit; a web app manifest and icons, so it installs*
- 1.8 EPC for RFID and NFC: every key with a TDS scheme, from the resolver's TDT-derived schemes; the GS1 Company
  Prefix's length from GS1's GCP length table, loaded by the user and kept in the browser — *done, checked against the
  resolver and read back by epc-tds; the tag's hexadecimal filled to the 16-bit word*
- 1.9 Data attributes in the GS1 Digital Link URI, with the resolver's decimal families (e.g. a net weight typed as
  1,25 kg); the URI's domain — *done: ported with the resolver's editor (key, qualifiers, attributes), checked against it*

*The owner's review of 29 October 2026 added items 1.10 to 1.14.*

- 1.10 The editor, corrected: (a) it takes the whole width of the screen (today at most 1 400 px, centred); (b) every
  list of AIs in alphabetical order of the name it shows — the identifier types (today in the dictionary's order,
  GDTI first), the attributes (today the common ones first, then by AI) and the bulk columns' AIs; (c) the screen's
  calibration (1.6) usable at its whole range: the bar outgrows the options column near the slider's maximum, so it
  cannot be measured, and the slider is coarse — the bar where there is room, and a fine adjustment
- 1.11 Every identifier and qualifier: every GS1 key the dictionary has (the 16 GS1 Digital Link primary keys are
  offered today) and every qualifier of each, from the current GS1 Digital Link URI syntax; the four main qualifiers
  on the screen and the rest behind "+ Add qualifier", as the attributes are; checked against the GS1 General
  Specifications 2026 and the GS1 Digital Link standard in `references`
- 1.12 Several keys in one symbol. An element string may carry more than one key; the Syntax Engine already checks the
  pairs the General Specifications forbid (e.g. (01) with (02) or (37); (8017) with (8018)) and require ((02) needs
  (37); (8020) and (415) go together). The cases to support: a logistic unit, SSCC (00) with the content's GTIN (02)
  and count (37), or with a GTIN (01) when the unit is itself a trade item, or with (8026) and (37); the transport
  keys beside it — consignment GINC (401), shipment GSIN (402), routing (403), ship to GLN (410); a trade item that is
  also an asset (GTIN with GRAI (8003) or GIAI (8004), e.g. a returnable keg). Today another key can only be added as
  a data attribute. To do: the cases confirmed against sections 3 and 4.13–4.14 of the General Specifications, the
  editor's "other keys" with their check digits, the GS1 Digital Link URI with one key in its path and the others in
  its query string, and the HRI
- 1.13 GS1-128 over several symbols: when the data passes 48 characters (section 5.4.4.3), split it into as many
  GS1-128 symbols as needed, the key in the first and the rest in data-only symbols without a key, in the
  standard's order, stacked as the GS1 Logistic Label stacks them; the person can also move element strings between
  the symbols. Each symbol read back. Prepares 4.1
- 1.14 QR Code's encoding modes: today bwip-js chooses the segments itself (numeric, alphanumeric, byte, mixed, for the
  smallest symbol). Offer automatic (as today) or one mode for the whole data — numeric, alphanumeric, byte — as ISO/IEC
  18004 defines them, alphanumeric only when the data allow it (upper case: a GS1 Digital Link URI's scheme and domain
  may be upper case, its path and values are case-sensitive). bwip-js has no option for it: an encoder that takes
  segments is needed (to choose), and every mode read back by ZXing

**Phase 2 — in bulk**

- 2.1 CSV, Excel and pasted rows; column mapping remembered by header; fixed values — *done: "In bulk" beside "One
  code" (mock-up A): CSV (comma, semicolon or tab), pasted rows and Excel workbooks read without a library; each
  column's AI guessed from its header and remembered for the same headers; values for every row; each row checked by
  the Syntax Engine, its label in the preview*
- 2.2 Validation report; fix or skip rows
- 2.3 Generated sequences: serial numbers, SSCCs
- 2.4 Outputs: zip by row with a name pattern, multi-page PDF, laser label sheets (Pimaco, Avery, custom), one print
  file per printer language, CSV of what was generated
- 2.5 Web Workers with progress and cancel; a measured performance target

**Phase 3 — printers** (ADR 0002)

- 3.1 Printer profiles; whole-dot X-dimensions within the table's range; test print
- 3.2 ZPL II with the printer's commands and templates with placeholders — *EAN/UPC, ITF-14, GS1-128, GS1 DataMatrix,
  QR and Data Matrix with a GS1 Digital Link URI done (checked through Labelary); GS1 DataBar through `^BR` and
  ITF-14's bearer bars through `^GB` done, with what `^BR` cannot print refused (ADR 0002); the label layout to do*
- 3.3 TSPL/TSPL2 · 3.4 PPLB · 3.5 PPLA · 3.6 EPL2 · 3.7 DPL
- 3.8 Direct printing: WebUSB, Zebra Browser Print; a local agent for network printers
- 3.9 Compatibility matrix from tests on physical printers

**Phase 4 — labels**

- 4.1 Templates: GS1 Logistic Label (SSCC), product labels, healthcare labels
- 4.2 Designer: text, images, lines, several symbols, fields bound to spreadsheet columns
- 4.3 Templates saved and shared as files

**Phase 5 — beyond the browser** (if needed)

- 5.1 CLI and HTTP API from the same core

## Licence

[Apache License 2.0](LICENSE). Uses [bwip-js](https://github.com/metafloor/bwip-js) (MIT), GS1's
[Barcode Syntax Engine](https://github.com/gs1/gs1-syntax-engine) (`gs1encoder`, Apache-2.0),
[opentype.js](https://github.com/opentypejs/opentype.js) (MIT) and the Liberation Sans font (SIL Open Font License,
`packages/core/assets/fonts/OFL.txt`); the EPC schemes derived from GS1's EPC Tag Data Translation artefacts;
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT) for the editor's scan test and the tests; for tests,
[resvg-js](https://github.com/yisibl/resvg-js) (MPL-2.0), [epc-tds](https://github.com/sergiss/epc-tds) (MIT), [Playwright](https://playwright.dev) (Apache-2.0) and
poppler's `pdftoppm` (GPL-2.0) and Ghostscript (AGPL-3.0), both run as separate programs.
