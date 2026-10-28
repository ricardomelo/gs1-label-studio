# GS1 Label Studio

Create GS1 barcodes — and, later, whole labels — in your browser, one at a time or thousands from a spreadsheet, and
export them as vector files for artwork or as print files for label printers (PDF, ZPL II, EPL2, TSPL, PPLA, PPLB,
DPL). Nothing you type or upload leaves your computer.

> **Status:** early development (28 October 2026). The resolver's editor in the browser: key, qualifiers and data
> attributes, the label beside its options, live; SVG, PNG, PDF and zip, and ZPL with the printer's own commands (and
> as a template); EPC for RFID and NFC.
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

**Phase 0 — setting up**

- 0.1 Repository, CI, publication on GitHub Pages — *done*
- 0.2 Development indicators from the first day (`docs/metrics`) — *done*
- 0.3 Walking skeleton: core encoding through bwip-js, read back by ZXing; printer dot grid; SVG; ZPL graphic — *done*

**Phase 1 — one code, right by construction** (ported from the resolver's label studio where it had it: ADR 0004)

- 1.1 Input: GS1 Barcode Syntax Engine; paste an element string, a GS1 Digital Link URI or a scanner's output; AIs
  named and checked; errors explained — *done (a "(" inside a value is refused: the barcode encoder cannot take it)*
- 1.2 Guided choice: what is identified → symbol specification table → symbols allowed and recommended; scanning
  environments table carried over from the resolver (General Specifications 26.0, section 5.12.3) — *table, sizes and
  checks ported (2 970 of the resolver's answers equal); every row of tables 1 to 13, with ITF-14, GS1-128, GS1 DataBar
  and GS1 DotCode, tested against the standard's text; the decision tree (figure 5-68), section 2's carrier choices and
  a recommendation in the core; the screen to do, mock-ups first*
- 1.3 Every GS1 symbology: EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128, GS1 DataBar family, GS1 DataMatrix,
  QR and Data Matrix with a GS1 Digital Link URI, GS1 DotCode; composite components later. GS1 QR Code is encoded by
  the core but not offered in the editor: beside the QR code with a GS1 Digital Link URI it confuses (ADR 0003)
- 1.4 Layout and human readable text as the General Specifications place them: the resolver's 2D symbol with an EAN/UPC
  beside it, guard bars, quiet zones, digits in OCR-B, text as outlines or as text; QR version and error correction —
  *ported and checked against the resolver (ADR 0004); an EAN/UPC alone too; GS1-128, ITF-14 and DataBar to do with 1.3*
- 1.5 Exports: SVG, PNG with dpi, PDF (vector, real size, written without a library, as the resolver's), EPS, zip;
  prepress options (bar width reduction, 100 % K) — *SVG, PNG (12 pixels per module, its dpi recorded), PDF and zip
  with README ported from the resolver and checked against it; a chosen dpi, EPS and the prepress options to do*
- 1.6 Preview at real size with a ruler and a scan test; light and dark; phone width (the tool is in English) — *the
  editor screen done (preview beside the options, live, desktop and phone, light and dark); ruler and scan test to do*
- 1.7 Offline (PWA)
- 1.8 EPC for RFID and NFC: every key with a TDS scheme, from the resolver's TDT-derived schemes; the GS1 Company
  Prefix's length from GS1's GCP length table, loaded by the user and kept in the browser — *done, checked against the
  resolver and read back by epc-tds; the tag's hexadecimal filled to the 16-bit word*
- 1.9 Data attributes in the GS1 Digital Link URI, with the resolver's decimal families (e.g. a net weight typed as
  1,25 kg); the URI's domain — *done: ported with the resolver's editor (key, qualifiers, attributes), checked against it*

**Phase 2 — in bulk**

- 2.1 CSV, Excel and pasted rows; column mapping remembered by header; fixed values
- 2.2 Validation report; fix or skip rows
- 2.3 Generated sequences: serial numbers, SSCCs
- 2.4 Outputs: zip by row with a name pattern, multi-page PDF, laser label sheets (Pimaco, Avery, custom), one print
  file per printer language, CSV of what was generated
- 2.5 Web Workers with progress and cancel; a measured performance target

**Phase 3 — printers** (ADR 0002)

- 3.1 Printer profiles; whole-dot X-dimensions within the table's range; test print
- 3.2 ZPL II with the printer's commands and templates with placeholders — *EAN/UPC, ITF-14, GS1-128, GS1 DataMatrix,
  QR and Data Matrix with a GS1 Digital Link URI done (checked through Labelary); DataBar, bearer bars, layout to do*
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
`packages/core/assets/fonts/OFL.txt`); the EPC schemes derived from GS1's EPC Tag Data Translation artefacts; for
tests, [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT), [resvg-js](https://github.com/yisibl/resvg-js)
(MPL-2.0), [epc-tds](https://github.com/sergiss/epc-tds) (MIT), [Playwright](https://playwright.dev) (Apache-2.0) and
poppler's `pdftoppm` (GPL-2.0, run as a separate program).
