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
| — (the resolver kept one 2D range and the EAN/UPC range per table) | `specifications.ts`, `guide.ts` | 1.2 | **new**: every row of tables 1 to 13, each tested against the General Specifications' text, and the resolver's summary checked against them; the decision tree and section 2's carrier choices |
| `label.py`: layout (2D symbol with EAN/UPC beside, quiet zones, margins), QR smallest version and error correction, `DoesNotFit` | `layout.ts` | 1.4 | **ported**: 23 layouts, positions within 1e-9 |
| `linear.py`: EAN/UPC modules, guard bars, quiet zones, bar heights, digits under the bars, UPC-E from UPC-A, `symbol_for` | `linear.ts` | 1.4 | **ported**: 10 encodings equal, and equal to bwip-js's bars |
| `label.py`: HRI as glyph outlines (Liberation Sans, fontTools) or as text (OCR-B for EAN/UPC); text height (2 mm minimum) | `hri.ts` (opentype.js), `pyformat.ts` | 1.4 | **ported**: metrics equal, outlines equal character for character |
| `label.py`: `render_svg` | `labelSvg()` in `layout.ts` | 1.4 | **ported**; every symbol on the drawn SVG read back by ZXing |
| `label.py`: `render_png` (dpi), `render_pdf` (no library), `render_zip` (README) | `png.ts`, `pdf.ts`, `zip.ts`, `deflate.ts` | 1.5 | **ported**: 6 labels — the PDF's page and operators equal after the 2D symbol's modules, the PNG's size, DPI and pixels equal outside the 2D symbol and the text, the README equal; every symbol in the PNG and in the PDF (drawn by poppler) read back by ZXing |
| `epc.py` + `epc_schemes.json`: EPC for every key (SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GDTI, SGCN, CPI, ITIP) | `epc.ts` + the same JSON, loaded when needed | 1.8 | **ported**: 51 encodings in 19 schemes and 7 refusals equal; 45 read back by epc-tds |
| `gcp.py`: GCP length table (GS1's restricted XML) | `gcp.ts`: the person loads the file, which stays in the browser (IndexedDB) | 1.8 | **ported**: parsing, refusals and longest-prefix lookup equal |
| `app.js`: the EPC block of the label panel | `apps/web/src/EpcSection.tsx` | 1.8 | **ported**, with the pure identity URI and the base 64 shown |
| `app.js`: the editor — key, qualifiers, data attribute rows, the label panel beside the preview, the coloured URI, the domain | `apps/web/src/IdentifyCard.tsx`, `LabelCard.tsx` | 1.2, 1.6, 1.9 | **ported** without records and publishing, after mock-ups approved on 28 October 2026; browser tests at desktop and phone widths |
| `gs1_dictionary.json`, `gs1dict.py` (keys, qualifiers, formats, titles) | `src/data/gs1_dictionary.json` (the same file), `dictionary.ts` | 1.9 | **ported**: the same release (1.4.1) and path AIs |
| `syntax.py`: data attributes, decimal families, day 00, refusals | `attributes.ts`, `identify.ts` | 1.9 | **ported**: 216 AIs offered in the same order, 20 decimal and 6 day-zero cases equal |
| `syntax.py`'s engine calls, `engine_messages.json` | the Syntax Engine in the browser (`syntax.ts`); its English messages | — | not needed |
| `sheet.py` (spreadsheets of resolver records, i.e. links) | — (bulk labels are a different model) | 2.1 | ideas only |

## Deliberate differences

| Point | Resolver | Here, and why |
|---|---|---|
| Symbol names | `qr`, `dm`, `gs1dm` | `dl-qrcode`/`gs1-qrcode`, `dl-datamatrix`, `gs1-datamatrix` (`RESOLVER_SYMBOL_OF`): this project also draws GS1 QR Codes and linear symbols beyond EAN/UPC |
| Message codes | `label.*` codes translated in twelve languages | the same codes, English texts only (ADR 0003) |
| QR version | segno: one encoding mode for the whole URI | bwip-js splits the data into modes (the GTIN's digits numeric), so at some levels the QR code is a version smaller (at H, "https://id.gs1.org/01/09506000134352" is version 4, not 5): a smaller symbol, equally valid. The tests check that the layout then moves by exactly the modules saved, and that it is never larger. |
| Modules of 2D symbols | segno and libzint | bwip-js: the same sizes (or smaller, above), not necessarily the same masks or encodation; ZXing reads both |
| An EAN/UPC alone | not drawn (the resolver always drew a 2D symbol) | laid out the same way in units of its own module, at the environment's linear target times the size |
| Data attributes that are not GS1 Digital Link attributes | refused (the resolver drew Digital Link QR codes only) | kept: an element string symbol (GS1 DataMatrix, GS1-128) carries them; the URI says why it cannot |
| EPC hexadecimal | the binary string filled to 4 bits (a SGTIN-198 in 50 digits) | `hex` zero-filled to the 16-bit word, as the tag's EPC field holds it and an encoder takes it (TDS 2.3: the PC bits' Length counts 16-bit words); `linkHex` keeps the resolver's form for the NFC link /eh…. Found when epc-tds could not read SGLN-195, GRAI-170 and GIAI-202 in the shorter form |
| Qualifier hints | the resolver's policy for its records (unaccented letters, digits, full stop, hyphen, underscore) | the GS1 format of the AI from the dictionary ("up to 20 characters") |
| PNG | RGB, the text drawn by Pillow through FreeType (hinted) | 8-bit grey, the text filled from the same outlines as the SVG and the PDF, anti-aliased, unhinted: the same glyphs within about a pixel (the tests compare the text's dark pixels and their overlap); everything else pixel for pixel |
| PDF and zip | `/Producer (GS1 Resolver CE portal)`; files named `qrcode_…`, `datamatrix_…`, `gs1datamatrix_…`; README names the symbols "GS1 Digital Link QR code", "Data Matrix with a GS1 Digital Link URI" | `/Producer (GS1 Label Studio)`; files named after this project's symbol ids (`dl-qrcode_01_…`), the same characters allowed; this project's symbol names. Compression by the platform's deflate (Compression Streams), so the compressed bytes differ and the tests compare the inflated content |
| Symbols without the label layout yet | — | ITF-14, GS1-128 and the others have a PNG, a PDF and a zip too: the symbol and its quiet zones (`symbolLayout()`), until item 1.3 lays them out |
| Text outlines | fontTools draws the glyphs | opentype.js reads the font; `hri.ts` draws the contours as fontTools does (start point, implied points after the transform) and `pyFixed()` rounds ties to even as Python does, so the paths are identical |

## Consequences

- The golden script needs Python 3, the resolver's checkout at the pinned commit and its packages (`segno`,
  `zint-bindings`, `fonttools`, `pillow`); fixtures are regenerated only when the reference moves, which is a decision.
- The port is checked at the level of answers (sizes, codes, EPC values, geometry), not of pixels: bwip-js and libzint
  may choose different, equally valid, encodations; where they do, both are read back by ZXing.
