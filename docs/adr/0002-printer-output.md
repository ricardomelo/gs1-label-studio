# ADR 0002 — Printer output: the dot grid first, a graphic in every language, native commands where proven

| | |
|---|---|
| Status | **Proposed** (28 October 2026); languages chosen by the owner |
| Languages | PDF (any printer with a driver), ZPL II, EPL2, TSPL/TSPL2, PPLA, PPLB, DPL |

## Context

The resolver's last version added ZPL. The goal now is to reach as many label printers as possible: Zebra and the
many printers that emulate ZPL, and the families common in Brazil and elsewhere that speak other languages — Argox and
Elgin (PPLA, PPLB), TSC and most generic thermal printers (TSPL), older Zebras and their emulations (EPL2), Datamax-O'Neil
and Honeywell (DPL).

Three facts shape the design:

1. **The dot grid.** A thermal printer prints whole dots (152, 203, 300, 406 or 600 dpi). A module that is not a whole
   number of dots is rounded differently bar by bar and the symbol degrades. An EAN-13 at 100 % (0.330 mm) prints at
   0.375 mm on a 203 dpi printer (3 dots, 114 %) or 0.339 mm on 300 dpi (4 dots); at 80 % (0.264 mm) a 203 dpi
   printer must choose between 0.250 mm (below the minimum) and 0.375 mm.
2. **Native barcode commands differ in GS1 support.** Each language has its own way, or none, to put FNC1 in first
   position and as separator, and to choose GS1 mode in QR and Data Matrix; firmware versions and emulations differ
   again. A symbol the printer encodes may silently not be a GS1 symbol.
3. **Every language prints a monochrome graphic** (ZPL `^GF`, EPL2 `GW`, TSPL `BITMAP`, PPLA and DPL graphics, PPLB
   `GW`), and a graphic of the symbol drawn by the studio carries exactly the geometry the tests read back.

## Decision

1. **A printer profile**: language, resolution, label width and height, gap or black mark, darkness and speed, and
   the origin offset. The studio offers only the X-dimensions that are whole numbers of dots and lie within the range
   of the application's symbol specification table, and shows the X-dimension that will actually be printed and its
   magnification.
2. **Graphic mode first, for every language**: the symbol (and later the whole label) rasterised at the printer's
   resolution with whole dots per module, sent as the language's graphic. One renderer, one set of tests, the same
   symbol on every printer.
3. **Native mode per symbology and language, once proven**: smaller files, faster printing, and the printer's own
   counters for serial numbers. A native command is offered only when a test shows it produces the same symbol (data,
   FNC1, symbology identifier) — for ZPL by rendering with Labelary or a reference printer and decoding; for the other
   languages on physical printers. Until then the graphic is used, without the user having to know.
4. **Human readable text**: drawn by the studio (part of the graphic) by default, so it is the same everywhere; printer
   fonts as an option where native mode is used.
5. **Delivery of the print file**: download (`.zpl`, `.prn`, `.txt`), copy to clipboard, and direct printing where the
   browser allows it — WebUSB (Chromium), Zebra Browser Print — and later a small local agent for network printers
   (raw TCP 9100) and Windows shared printers.
6. **PDF at the exact label size** for every printer with a driver (the most universal route), and for laser sheets.
7. **A compatibility matrix** (`docs/printers.md`, later): printer model, firmware, language, mode, symbologies,
   result, date and who tested. It is the evidence behind "works with".

## Order of work

ZPL II (graphic, then native EAN/UPC, GS1-128, GS1 DataMatrix, QR), then TSPL, PPLB, PPLA, EPL2, DPL. The order can
change with the printers the owner has at hand for tests.

## Open points for the owner

- Which physical printers (model, resolution, language) are available for tests?
- ZPL from the resolver's last version: its code is not in the public repository (`gs1br/develop` and `master` at
  `eab13aa`, 23 October). Where is it, to carry its decisions over?
