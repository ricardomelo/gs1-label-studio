# Changelog

## Unreleased

- Project set up: pnpm monorepo (`packages/core`, `apps/web`), TypeScript, Vitest, CI and GitHub Pages workflows.
- Core: GS1 check digit; encoding of EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128, GS1 DataMatrix, GS1 QR Code and
  QR / Data Matrix with a GS1 Digital Link URI through bwip-js; printer dot-grid snapping; rasteriser; SVG at real size;
  ZPL II graphic field. Every symbol read back by ZXing in the tests.
- Web: one symbol, preview, X-dimension at the printer's resolution, SVG and ZPL downloads.
- Development indicators from day one: `scripts/metrics.mjs`, `docs/metrics/` (sessions, the owner's hours, snapshots).
- The interface is in English; ZPL output checked through Labelary in CI.
- ZPL: images larger than a graphic field (99 999 bytes, the ZPL II guide's limit for `^GF`) are sent as stripes.
- ZPL with the printer's own commands instead of images (ADR 0002): `^BE`, `^B8`, `^BU`, `^B9`, `^B2`, `^BC` (mode N,
  FNC1 and code sets written by the studio), `^BX` (GS1 and plain), `^BQ`; GS1 QR Code refused (no FNC1 in `^BQ`).
  ZPL templates with `{{AI}}` placeholders described in `^FX` comments, for systems that fill in the values.
- Input through the GS1 Barcode Syntax Engine (`gs1encoder` 1.4.1, engine build of 28 May 2026; backlog item 1.1): a
  GTIN, an element string with or without brackets, a GS1 Digital Link URI or a scanner's output; each AI with its data
  title; errors in the engine's words with the characters at fault marked; the data each symbol carries derived from
  it (the GTIN in the symbol's length, UPC-E by zero suppression, the element string, the GS1 Digital Link URI), with
  the reason when a symbol cannot carry it.
- The resolver's label studio is the starting point, ported to TypeScript (ADR 0004): its scanning environments
  (General Specifications 26.0 symbol specification tables), sizes and checks first, with the resolver's own answers
  as test fixtures (`scripts/resolver-reference/golden.py`).
- The label's layout ported from the resolver (item 1.4): a 2D symbol with its quiet zone and text, an EAN/UPC beside it
  with guard bars and digits, sizes by scanning environment, QR version and error correction; human readable text as
  glyph outlines identical to the resolver's, or as text; the SVG; an EAN/UPC alone. On the page: scanning environment,
  size, EAN/UPC beside, its own size, QR error correction, text on or off and as outlines or text.
- The editor (items 1.9, 1.6): what the code identifies on the left — paste anything, the key with its check digit,
  its qualifiers, data attribute rows with the resolver's decimal families and hints —, the label beside its options
  on the right, redrawn as anything changes, with the GS1 Digital Link URI coloured by part and its domain; a small
  live preview fixed at the top on phones; light and dark. Browser tests (Playwright) at desktop and phone widths in CI.
- RFID and NFC (EPC), item 1.8: every key the EPC Tag Data Standard encodes (SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN,
  GSRNP, GDTI, SGCN, CPI, ITIP) as scheme, hexadecimal as on the tag (16-bit words), base 64, tag URI, pure identity
  URI and the NFC links /eh… and /ex… on the chosen domain; the company prefix's length chosen, or from GS1's GCP length
  table loaded once and kept in the browser; the filter.
- PNG, PDF and zip, item 1.5, ported from the resolver: the PNG at 12 pixels per module with its DPI recorded, the PDF
  one page the size of the label (vector modules and bars, the text as glyph outlines, no fonts; written without a
  library), the zip with SVG, PNG, PDF and a README of the data, the symbol, its sizes and how to print; files named
  after the symbol, the key and its qualifiers. Symbols without the label layout yet get them too.
- The GS1 symbol specification tables 1 to 13 in full (item 1.2): X-dimensions, bar heights, quiet zones and quality
  for every symbol they name, ITF-14, GS1-128, GS1 DataBar and GS1 DotCode included, each row tested against the
  General Specifications 26.0. The guided choice in the core: the decision tree of figure 5-68 asked one question at a
  time, the key answering what it can; each leaf's carrier choices from section 2; what each symbol can carry
  (GS1-128's 48 data characters, DataBar Limited, the GS1 Digital Link URI) and the symbol recommended.
- The editor's step 2, "Where is it scanned?" (item 1.2): the tree's questions with Yes and No, the table reached, the
  symbols it allows for the data with the recommended one drawn, those only in addition, those coming with item 1.3;
  ITF-14 and GS1-128 at their table's sizes and minimum bar height; "Choose a symbol yourself" keeps the former fields.
- ITF-14, GS1-128 and the GS1 DataBar family laid out (item 1.3): sized by their row of the symbol specification table
  (X-dimension, minimum bar height, quiet zones); ITF-14 with bearer bars (a 4.83 mm frame, or 2X bars at the top and
  bottom) at the wide-to-narrow ratio 2.5 and its 14 digits below; GS1-128 and GS1 DataBar with their element strings
  below, never broken over two lines; the seven GS1 DataBar symbols drawn, the stacked ones grown to the table's
  height. Their SVG, PNG, PDF and zip are labels; 2D symbols of tables 12 and 13 too. Step 2 offers GS1 DataBar; at a
  till GS1 DataBar Expanded carries the attributes of a variable measure item only (section 2.1.12.1). Choosing a symbol
  yourself sizes it by a table of the key's scanning environments. ZPL refuses GS1 DataBar until `^BR` is proven.
- The preview at real size and the scan test (item 1.6, mock-up A): "Fit" or "Real size", rulers in millimetres, the
  screen calibrated against a bank card and kept in the browser; "Scan test" reads the label's SVG back with ZXing in
  the browser and says whether each symbol carries what it should (symbology identifier and data).
- Prepress, the rest of item 1.5: EPS (the PDF's content stream through a PostScript prolog), PDF and EPS in process
  black alone (DeviceCMYK 0 0 0 1), a bar width reduction of 0.010 to 0.050 mm for linear symbols, the PNG at 300, 600
  or 1200 dpi with whole pixels a module; the zip holds the EPS too.
- ZPL (item 3.2): GS1 DataBar through `^BR` (13 digits, or Expanded's element strings), refused where a table asks a
  taller symbol than `^BR` prints or Expanded would need a separator; ITF-14's bearer bars through `^GB` with its digits
  below. Every one printed through Labelary and read back.
- Offline (item 1.7): a service worker written at build time keeps every file on the first visit — pages from the
  network first, everything else from the cache —; a web app manifest and icons. A browser test reloads the editor
  with the network off and runs the scan test.
- Decisions: ADR 0001 (browser-first architecture), ADR 0002 (printer output), ADR 0003 (scope and user experience).
