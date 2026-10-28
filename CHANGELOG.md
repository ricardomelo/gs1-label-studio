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
- Decisions: ADR 0001 (browser-first architecture), ADR 0002 (printer output), ADR 0003 (scope and user experience).
