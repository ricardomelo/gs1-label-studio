# GS1 Label Studio

Create GS1 barcodes — and, later, whole labels — in your browser, one at a time or thousands from a spreadsheet, and
export them as vector files for artwork or as print files for label printers (PDF, ZPL II, EPL2, TSPL, PPLA, PPLB,
DPL). Nothing you type or upload leaves your computer.

> **Status:** early development (28 October 2026). One symbol at a time from data in any GS1 form, checked by the GS1
> Barcode Syntax Engine; SVG, and ZPL with the printer's own commands (and as a template). See the backlog.

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
| `scripts` | project tools |

Decisions: [ADR 0001 — browser-first architecture](docs/adr/0001-browser-first-architecture.md),
[ADR 0002 — printer output](docs/adr/0002-printer-output.md),
[ADR 0003 — product scope and user experience](docs/adr/0003-product-scope-and-ux.md).

## Backlog

**Phase 0 — setting up**

- 0.1 Repository, CI, publication on GitHub Pages — *done*
- 0.2 Development indicators from the first day (`docs/metrics`) — *done*
- 0.3 Walking skeleton: core encoding through bwip-js, read back by ZXing; printer dot grid; SVG; ZPL graphic — *done*

**Phase 1 — one code, right by construction**

- 1.1 Input: GS1 Barcode Syntax Engine; paste an element string, a GS1 Digital Link URI or a scanner's output; AIs
  named and checked; errors explained — *done (a "(" inside a value is refused: the barcode encoder cannot take it)*
- 1.2 Guided choice: what is identified → symbol specification table → symbols allowed and recommended; scanning
  environments table carried over from the resolver (General Specifications 26.0, section 5.12.3)
- 1.3 Every GS1 symbology: EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128, GS1 DataBar family, GS1 DataMatrix,
  GS1 QR Code, QR and Data Matrix with a GS1 Digital Link URI, GS1 DotCode; composite components later
- 1.4 Human readable text as the General Specifications place it (EAN/UPC digits and guard bars, element strings)
- 1.5 Exports: SVG, PNG with dpi, PDF (vector, real size), EPS, zip; prepress options (bar width reduction, 100 % K)
- 1.6 Preview at real size with a ruler and a scan test; light and dark; phone width (the tool is in English)
- 1.7 Offline (PWA)

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
[Barcode Syntax Engine](https://github.com/gs1/gs1-syntax-engine) (`gs1encoder`, Apache-2.0) and, for tests,
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT).
