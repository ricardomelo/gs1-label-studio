# ADR 0004 — The resolver's label studio as the starting point: ported to TypeScript, kept as the reference

| | |
|---|---|
| Status | **Accepted** (28 October 2026), the owner's choice among three options |
| Reference | GS1 Digital Link Resolver CE Expansion Pack, `ricardomelo/GS1_DigitalLink_Resolver_CE`, commit `eab13aa` (v3.1.0, 23 October 2026), `portal/` |

## Context

The resolver's portal has a mature label studio (its ADR 0010 and amendments): QR code, Data Matrix and GS1
DataMatrix with an EAN/UPC beside them; sizes by the scanning environments of the GS1 General Specifications' symbol
specification tables (release 26.0, checked against section 5.12.3); the EAN/UPC's own size; human readable text as
outlines or as text; SVG, PNG with its dpi, a PDF written without a library and a zip; QR version and error correction;
data attributes in the GS1 Digital Link URI, with decimal families; an EPC for every key that has one, from GS1's EPC
Tag Data Translation artefacts; the GS1 Company Prefix's length from GS1's GCP length table. About 1 300 lines of Python
(`label.py`, `linear.py`, `epc.py`, `gcp.py`), 550 KB of EPC scheme data and 1 100 lines of tests.

This project began by rewriting rather than reusing it (ADR 0001, item 6, carried over its *knowledge*). The owner asked
for its code to be the starting point.

## Decision

1. **Port it to TypeScript, module by module, into `packages/core`**, keeping the browser-first architecture (ADR
   0001): nothing leaves the user's computer, no server, bulk generation on the user's machine. Data files are reused
   as they are; logic is translated, its comments with it.
2. **The resolver's code is the reference.** `scripts/resolver-reference/golden.py` runs it at the pinned commit and
   writes what it answers as JSON fixtures (`packages/core/test/fixtures/resolver/`); the tests replay them against
   the port. A difference is either a defect of the port or a deliberate change, recorded in this ADR's table below.
3. **What this project already does better stays**: bwip-js for encoding (every GS1 symbology, not only QR, Data
   Matrix and EAN/UPC), the GS1 Barcode Syntax Engine in the browser as the input gate, ZPL with the printer's commands
   and templates (ADR 0002).

## Port map

| Resolver | Here | Backlog | State |
|---|---|---|---|
| `label.py`: `ENVIRONMENTS`, `environments_for`, `sizes_for`, `linear_sizes_for`, `check_environment` | `environments.ts` | 1.2 | **ported**, 2 970 checks equal |
| `label.py`: layout (2D symbol with EAN/UPC beside, quiet zones, margins), QR smallest version and error correction | `layout.ts` | 1.4 | to do |
| `linear.py`: EAN/UPC guard bars, quiet zones, bar heights, digits under the bars (OCR-B), UPC-E from UPC-A, `symbol_for` | `layout.ts` (bars from bwip-js) | 1.4 | to do; `zeroSuppress` already here |
| `label.py`: HRI as glyph outlines (Liberation Sans, fontTools) or as text; text height (2 mm minimum) | `hri.ts` | 1.4 | to do |
| `label.py`: `render_svg`, `render_png` (dpi), `render_pdf` (no library), `render_zip` (README) | `svg.ts`, `png.ts`, `pdf.ts`, `zip.ts` | 1.5 | to do |
| `epc.py` + `epc_schemes.json`: EPC for every key (SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GDTI, SGCN, CPI, ITIP) | `epc.ts` + the same JSON | 1.8 (new) | to do |
| `gcp.py`: GCP length table (GS1's restricted XML) | `gcp.ts`: the user loads the file, kept in the browser | 1.8 | to do |
| `app.js`: label options, data attributes with decimal families, domain (stem) | the one-code screen | 1.2, 1.6 | mock-ups first |
| `gs1dict.py`, `gs1_dictionary.json`, `syntax.py`, `engine_messages.json` | the Syntax Engine's own dictionary; English only | — | not ported |
| `sheet.py` (spreadsheets of resolver records, i.e. links) | — (bulk labels are a different model) | 2.1 | ideas only |

## Deliberate differences

| Point | Resolver | Here, and why |
|---|---|---|
| Symbol names | `qr`, `dm`, `gs1dm` | `dl-qrcode`/`gs1-qrcode`, `dl-datamatrix`, `gs1-datamatrix` (`RESOLVER_SYMBOL_OF`): this project also draws GS1 QR Codes and linear symbols beyond EAN/UPC |
| Message codes | `label.*` codes translated in twelve languages | the same codes, English texts only (ADR 0003) |

## Consequences

- The golden script needs Python 3, the resolver's checkout at the pinned commit and its packages (`segno`,
  `zint-bindings`, `fonttools`, `pillow`); fixtures are regenerated only when the reference moves, which is a decision.
- The port is checked at the level of answers (sizes, codes, EPC values, geometry), not of pixels: bwip-js and libzint
  may choose different, equally valid, encodations; where they do, both are read back by ZXing.
