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
| `label.py`: layout (2D symbol with EAN/UPC beside, quiet zones, margins), QR smallest version and error correction, `DoesNotFit` | `layout.ts` | 1.4 | **ported**: 23 layouts, positions within 1e-9 |
| `linear.py`: EAN/UPC modules, guard bars, quiet zones, bar heights, digits under the bars, UPC-E from UPC-A, `symbol_for` | `linear.ts` | 1.4 | **ported**: 10 encodings equal, and equal to bwip-js's bars |
| `label.py`: HRI as glyph outlines (Liberation Sans, fontTools) or as text (OCR-B for EAN/UPC); text height (2 mm minimum) | `hri.ts` (opentype.js), `pyformat.ts` | 1.4 | **ported**: metrics equal, outlines equal character for character |
| `label.py`: `render_svg` | `labelSvg()` in `layout.ts` | 1.4 | **ported**; every symbol on the drawn SVG read back by ZXing |
| `label.py`: `render_png` (dpi), `render_pdf` (no library), `render_zip` (README) | `png.ts`, `pdf.ts`, `zip.ts` | 1.5 | to do |
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
| QR version | segno: one encoding mode for the whole URI | bwip-js splits the data into modes (the GTIN's digits numeric), so at some levels the QR code is a version smaller (at H, "https://id.gs1.org/01/09506000134352" is version 4, not 5): a smaller symbol, equally valid. The tests check that the layout then moves by exactly the modules saved, and that it is never larger. |
| Modules of 2D symbols | segno and libzint | bwip-js: the same sizes (or smaller, above), not necessarily the same masks or encodation; ZXing reads both |
| An EAN/UPC alone | not drawn (the resolver always drew a 2D symbol) | laid out the same way in units of its own module, at the environment's linear target times the size |
| Text outlines | fontTools draws the glyphs | opentype.js reads the font; `hri.ts` draws the contours as fontTools does (start point, implied points after the transform) and `pyFixed()` rounds ties to even as Python does, so the paths are identical |

## Consequences

- The golden script needs Python 3, the resolver's checkout at the pinned commit and its packages (`segno`,
  `zint-bindings`, `fonttools`, `pillow`); fixtures are regenerated only when the reference moves, which is a decision.
- The port is checked at the level of answers (sizes, codes, EPC values, geometry), not of pixels: bwip-js and libzint
  may choose different, equally valid, encodations; where they do, both are read back by ZXing.
