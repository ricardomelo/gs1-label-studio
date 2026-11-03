# ADR 0002 — Printer output: the dot grid, the printer's own commands, templates with placeholders

| | |
|---|---|
| Status | **Accepted** for ZPL (28 October 2026); for TSPL and EPL2 (31 October 2026) and DPL (2 November 2026) with an emulator standing in for the printer, as the owner chose |
| Languages | PDF (any printer with a driver), ZPL II, EPL2, TSPL/TSPL2, PPLA, PPLB, DPL — chosen by the owner |

## Context

The resolver's label studio exported PNG and SVG only; ZPL is new in this project. The goal is to reach as many label
printers as possible: Zebra and the many printers that emulate ZPL, and the families common in Brazil and elsewhere
that speak other languages — Argox and Elgin (PPLA, PPLB), TSC and most generic thermal printers (TSPL), older Zebras
and their emulations (EPL2), Datamax-O'Neil and Honeywell (DPL).

Facts that shape the design:

1. **The dot grid.** A thermal printer prints whole dots (152, 203, 300, 406 or 600 dpi). A module that is not a whole
   number of dots is rounded differently bar by bar and the symbol degrades. An EAN-13 at 100 % (0.330 mm) prints at
   0.375 mm on a 203 dpi printer (3 dots, 114 %) or 0.339 mm on 300 dpi (4 dots); at 80 % (0.264 mm) a 203 dpi
   printer must choose between 0.250 mm (below the minimum) and 0.375 mm.
2. **Native barcode commands differ in GS1 support**, between languages, firmware versions and emulations. A symbol
   the printer encodes may silently not be the GS1 symbol meant — the tests below found three such cases in ZPL.
3. **Size and integration.** A label as an image is large: a 100 × 150 mm label is about 240 KB at 203 dpi and 520 KB
   at 300 dpi as hexadecimal, hundreds of megabytes for a batch of a thousand, slow over serial or Bluetooth, and
   tied to one resolution. With the printer's commands it is well under a kilobyte, readable, editable, and a
   **template**: a system (an ERP, a WMS) keeps the ZPL with placeholders, replaces the values and sends it to print.

## Decision

1. **The printer's own commands for symbols and text, always.** Images (ZPL `^GF`) only for what is an image — a
   logo. *(First proposed the other way round — every symbol as an image, native commands once proven; the owner
   decided for native commands on 28 October 2026, for the size and for the templates.)*
2. **Only what is proven.** A symbology is offered in a printer language only when a test prints it (Labelary for ZPL,
   physical printers for the others) and an independent decoder reads back the same symbology identifier and data.
   What the language cannot print correctly is refused with an explanation and an alternative, never printed wrong.
   *For TSPL and EPL2 (the owner, 31 October 2026, of three options: an emulator, the manual alone, or the label as an
   image), and for DPL after them (2 November 2026): no physical printer and no simulator of the firmware exist, so the tests print them with **Labelize**, an
   open-source emulator (MIT, `@goodboy008/labelize-wasm` 1.10.0, a test dependency only), and read every symbol back
   with ZXing. The commands follow the manufacturer's manual; what Labelize does not print as the manual describes is
   refused, not offered on the manual's word alone. The studio tells the person that these files are checked in an
   emulator, not yet on a printer, and to print the test label first. A physical printer (3.9) outranks the emulator.*
3. **Templates with placeholders**: the same label with `{{01}}`, `{{10}}`… or `{{URI}}` where the values go, each
   described at the top of the file (ZPL `^FX` comments: what it takes, how to escape, an example). The structure that
   depends on the data (FNC1 separators, code sets) is laid out so that any value of the AI's format fits.
4. **A printer profile**: language, resolution, label width and height, gap or black mark, darkness and speed, and
   the origin offset. Only X-dimensions that are whole numbers of dots and within the application's symbol
   specification table are offered, with the X-dimension actually printed. The symbol must fit the label: checked
   before printing (a GS1-128 wider than the label prints nothing).
5. **Human readable text**: the printer's interpretation line where it follows the General Specifications (EAN/UPC,
   ITF-14); the studio's text lines in the printer's scalable font (`^A0`) where it does not (GS1-128 in mode N has no
   parentheses) and below 2D symbols.
6. **Delivery of the print file**: download (`.zpl`, `.prn`, `.txt`), copy to clipboard, and direct printing where the
   browser allows it — WebUSB (Chromium), Zebra Browser Print — and later a small local agent for network printers
   (raw TCP 9100) and Windows shared printers.
7. **PDF at the exact label size** for every printer with a driver, and for laser sheets.
8. **A compatibility matrix** (`docs/printers.md`, later): printer model, firmware, language, symbologies, result,
   date and who tested. It is the evidence behind "works with".

## ZPL II: commands chosen and what the tests found

Checked through Labelary and read back by ZXing (`packages/core/test/labelary.test.ts`):

| Symbol | Command | Notes |
|---|---|---|
| EAN-13, EAN-8, UPC-A | `^BE`, `^B8`, `^BU` | Field data without the check digit (12, 7, 11 digits): the printer adds it. Given one digit more, the printer drops the first — a template says so. |
| UPC-E | `^B9` | Field data is the UPC-A's 10 manufacturer and product digits, not the 8 of UPC-E: expanded by `upcaManufacturerAndProduct()`. |
| ITF-14 | `^B2` | Wide-to-narrow ratio 3 (whole dots for any module, within GS1's 2.25 to 3). With the label's bearer bars (item 1.3), drawn with `^GB`: a frame 4.83 mm thick around the symbol and its quiet zones, or bars of 2X at the top and bottom; the 14 digits printed below them, 1.02 mm away, by the studio, since the printer's interpretation line would fall under the bottom bar; the symbol then takes the whole GTIN-14 with no check digit computed, so that symbol and text carry the same value in a template. Without bearer bars: 13 digits, the printer adds the check digit. |
| GS1-128 | `^BC` mode **N** | FNC1 (`>8`) first and after each variable-length element string, code sets chosen by the studio (`gs1128FieldData()`; an even run of digits stays in C, since 2 November 2026), `>` written `>0`; the symbol's width is counted from that field data (`gs1128Modules()`), which may take a codeword more than the encoder's, and the label made as wide. **Mode D** (UCC/EAN) joins the element strings without FNC1 — "(10)ABC(21)X" reads as "(10)ABC21X" — and cannot carry a `>`; **mode A** prints `>8` as text. Text below the bars by the studio. |
| GS1 DataMatrix | `^BX` quality 200 | FNC1 is `_1` with `_` declared as the escape character: its default changed between firmware versions (`~` before V60.13.0.12), and `~1` was not read. `_` in data is `__`. |
| Data Matrix and QR with a GS1 Digital Link URI | `^BX`, `^BQ` model 2 | Plain data. `^BQ` takes the label's error correction level (it was always M before 31 October 2026); Labelary treats it as a minimum, raising M to Q where the version has room. Its manual input in one mode (N, A, B and a byte count) is not offered: Labelary printed the same version for 46 bytes in byte mode as in alphanumeric (version 2 at level L, where byte mode needs version 3), so it chooses the modes itself and nothing shows a printer would honour one (backlog 1.14). `^BQ` prints the symbol as far below `^FO` as the bar height `^BY` last set (Labelary, 2 November 2026): a one-dot `^BY` goes before it, `^FO` a dot higher. |
| GS1-128 over several symbols (backlog 1.13) | one `^BC` a symbol | Stacked from the top, each with its element strings as text below, a quiet zone of 10X between one symbol's text and the next; the label as wide as the widest symbol. Read back through Labelary, every symbol. |
| Human readable text (backlog 1.16) | `^A0` with `^FB` | At the label's height, its capitals' (^A0's capitals are 0.78 of the height it is given, measured through Labelary, so it is given 1/0.78 of it; until 2 November 2026 they came out 22 % short); below the symbol, above it, or split (the key's line below, the others above), with the gaps of the layout. Not beside it: the printer's scalable font sets the text's width, which the studio does not know, so left and right are refused. |
| **GS1 QR Code** | — | `^BQ` has no FNC1: refused, with GS1 DataMatrix or the QR code with a GS1 Digital Link URI offered instead. |
| GS1 DataBar | `^BR` | Orientation N given (its default is R). Omnidirectional, Truncated, Stacked, Stacked Omnidirectional and Limited take the GTIN's first 13 digits and add the check digit (given 14, nothing is read); Expanded takes the element strings without brackets, Expanded Stacked is Expanded with 4 segments a row. `^BR` prints each at a fixed height — Omnidirectional 33 modules, Stacked Omnidirectional 69, Truncated and Stacked 13, Limited 10, Expanded 34 a row — and its height parameter is for composite symbols only: where a table asks for more (tables 1 and 3: 46 and 95 modules at a till) the ZPL is refused and the PDF offered. No separator was read back between an element string of no predefined length and the next ("#" printed other data; a GS byte through `^FH` was not read), so Expanded carries such an element string last only. The element strings are printed below as text (a template has `{{01}}` for the symbol's 13 digits and `{{GTIN}}` for the text). Checked through Labelary, every symbol at 203 and 300 dpi (29 October 2026). |
| The GS1 Logistic Label (backlog 4.1) | `^BC`, `^A0`, `^GB`, `^BQ`, `^BX` | Each GS1-128 as the editor's `^BC` at the profile's whole dots, its element strings below at 3 mm (rule 5c); the label's own text — who sends and receives it, the data titles and contents — with `^A0` at its capitals' height (3.5, 2.5 and 7 mm); the rules between the blocks with `^GB`. Everything where the layout puts it, its millimetres turned into dots; a symbol keeps its centre, its width following the printer's module. The label is the page in dots (`^PW`, `^LL`): A6 and A5 are wider than a 4-inch printer prints, so a 4 × 6 in label or a wider printer. Every symbol read back from the whole label through Labelary (A5 at 203 dpi, 6 × 8 in at 300 dpi, 2 November 2026). The 2D symbol beside the middle block as the editor's `^BQ` or `^BX`, at the whole dots within table 5's 0.743 to 1.50 mm nearest the layout's module, its right edge and top where the layout puts them; read back with the GS1-128 and placed within a module (a GS1 DataMatrix at 203 dpi, a QR code at 300 dpi). ZPL only for now; no template. |

Reserved characters (`^`, `~`, `\`) go through `^FH`. In templates, values are placed in the code set any value of the
AI's format fits: element strings of predefined length (all digits, even length) in code set C, other values in code
set B; a Data Matrix keeps the sample's size so that the text below it stays clear.

## TSPL/TSPL2: commands chosen and what Labelize showed

Reference: TSC's *TSPL/TSPL2 Programming Manual*, 31-0000001-00 version 3.0 (2025). `packages/core/src/tspl.ts`;
tests in `packages/core/test/printlangs.test.ts`.

| Symbol | Command | Notes |
|---|---|---|
| EAN-13 | `BARCODE …,"EAN13"` | 12 digits; the printer adds the check digit and prints its interpretation line. |
| ITF-14 | `BARCODE …,"ITF14"` | 13 digits, narrow to wide 1:3; bearer bars as `BOX` (frame) or `BAR` (bars), the 14 digits as `TEXT` below them. The manual's `"25"` (Interleaved 2 of 5) is not drawn by Labelize. Whether a TSC printer adds bearer bars of its own to ITF14 the manual does not say. |
| GS1 DataMatrix, Data Matrix with a URI | `DMATRIX …,c126,x{dots},{rows},{cols}` | `~` declared the escape character: `~1` is FNC1, first and after each element string of no predefined length that is not the last (the manual's own GS1 example); `~` in data is `~~`. The size forced to the layout's. |
| QR code with a URI | `QRCODE x,y,{level},{dots},A,0` | The label's error correction level, automatic mode; one mode for the data is not offered yet. |
| Text | `TEXT` with the dot fonts 1 to 5 | The multiplier whose cell is nearest the text height; centred with alignment 2. Font "0" (scalable) is TSPL2 only and not drawn by Labelize. A double quote is written `\["]`, read back. |
| **GS1-128** | — | The manual writes FNC1 as `!102` in a `128M` bar code (its own GS1 example), but Labelize encodes `!102` as text: not offered until a printer or the emulator shows it. |
| **EAN-8, UPC-A, UPC-E, GS1 DataBar (`RSS`)** | — | Not drawn by Labelize: not offered yet. |
| **GS1 QR Code** | — | `QRCODE` has no FNC1. |

The file: `SIZE` in mm, `CODEPAGE UTF-8`, `CLS`, the commands, `PRINT`, each line ending CR LF. `GAP` is not sent:
the printer keeps the gap it was calibrated for.

## EPL2: commands chosen and what Labelize showed

Reference: Zebra's *EPL Programming Guide*, 14245L-003 Rev. A (2013). `packages/core/src/epl.ts`; the same tests.

| Symbol | Command | Notes |
|---|---|---|
| EAN-13, EAN-8, UPC-A, UPC-E | `B…,E30`, `E80`, `UA0`, `UE0` | 12, 7, 11 and 7 digits (UPC-E: number system and the six digits); the printer adds the check digit and its interpretation line. The guide allows a narrow bar of 2 to 4 dots only: other X-dimensions are refused. |
| ITF-14 | `B…,2` | The 14 digits, narrow to wide 1:3; bearer bars as `X` (frame) or `LO` (bars), the digits as text below. |
| GS1-128 | `B…,1E` (UCC/EAN 128) | The printer puts FNC1 first. No separator between element strings was read back (the guide's ASCII 06 delimiter was not), so an element string of no predefined length goes last only, as with ZPL's GS1 DataBar Expanded. Over several symbols, stacked as in ZPL. |
| Data Matrix with a URI | `b…,D,c{cols},r{rows},h{dots}` | The guide says the printer draws a quiet zone of one module around the symbol, so the command starts a module before the layout's corner; Labelize draws none — the difference is tested in sight. |
| Text | `A` with fonts 1 to 5 | Their cells differ at 203 and 300 dpi (the guide's table); centred by the font's pitch. The capitals are 0.75 of the cell (Labelize, 2 November 2026, every font at 203 dpi; at 300 dpi Labelize draws the 203 dpi cells), so the cell asked is 1/0.75 of the text height, a narrower font where the taller one would be wider than the symbol; until 2 November 2026 the text came out 25 % short. |
| The GS1 Logistic Label (backlog 4.1) | `B…,1E`, `A`, `LO`, `b` | As in ZPL: each GS1-128 at the profile's dots, kept centred, its element strings below at 3 mm; the label's own text in the font whose capitals come nearest its height within the width the layout gave it (the printer's fixed pitch is wider than the layout's font); the rules with `LO`; a Data Matrix with a URI beside the data. Element strings of no predefined length must end their symbol; GS1 DataMatrix and QR refused as above. Read back through Labelize (4 × 6 in at 203 dpi; A5 with a Data Matrix at 300 dpi, 3 November 2026). |
| **A double quote or a backslash in a symbol's data** | — | The guide escapes them with a backslash, which Labelize encodes too: refused (a URI percent-encodes them). |
| **GS1 DataMatrix** | — | EPL2's Data Matrix has no FNC1. |
| **QR code** | — | Japanese printer models only (the guide). |
| **GS1 DataBar** | — | `R14` is not drawn by Labelize: not offered yet. |

The file: a blank line, `N`, `q` (the print width in dots), the commands, `P`, each line ending CR LF. `Q` (label
length and gap) is not sent: the printer keeps the length it sensed.

## DPL: commands chosen and what Labelize showed

Reference: Datamax's *Class Series 2 Programmer's Manual*, 88-2341-01 Rev. B (2008), public on datamax-printers.com;
Honeywell's current *Command Reference User Guide: DPL* (DPL-EN-CR Rev H, March 2026) is behind a sign-in. `packages/core/src/dpl.ts`;
the same tests.

A DPL label format is `<STX>L`, label formatting commands, one **record** a field — a 15-character header (rotation,
font or bar code, two multipliers, height, row, column), the data, a carriage return — then `Q` (the quantity) and `E`.
Rows and columns are counted from the label's **bottom left corner**, in tenths of a millimetre after `m`; the studio's
dots, counted from the top, are turned into them, within half a tenth of a millimetre (0.4 dots at 203 dpi). So the
printer must know the label's length (it senses the gap), as rows depend on it. Modules and bars are in whole dots,
1 to 24 (the multipliers 1 to 9 and A to O, where the manual and Labelize agree).

| Symbol | Record | Notes |
|---|---|---|
| EAN-13, EAN-8, UPC-A, UPC-E | `F`, `G`, `B`, `C` | 12, 7, 11 and 6 digits (UPC-E: the six digits, number system 0); the printer adds the check digit and, in upper case, its human readable digits. The row is the guard bars' bottom, 5X below the others as the layout draws them; Labelize extends them 12 dots instead, so there its bars start 12 − 5X dots higher — tested in sight. |
| ITF-14 | `d` (Interleaved 2 of 5) | The 14 digits, narrow to wide 1:3 (the manual allows 2:1 to 3:1); bearer bars as an `X` record's box `b` (frame) or lines `l` (bars), the digits as text below. |
| GS1-128 | `q` (UCC/EAN Code 128) | **An SSCC (00) alone**: the manual's 19 digits, `00` and the SSCC's first 17, the printer adding FNC1 and the check digit (Labelize reads back the SSCC whole); lower case leaves out the printer's text, which it puts above, and the studio's text goes where asked. Every other element string is refused: FNC1 written `&G` in Code 128 (`E`) is encoded as text by Labelize and EAN 128 with automatic subsets (`W1I`) is not drawn. Not over several symbols. |
| Data Matrix with a URI | `W1c` | ECC 200, its rows and columns given (square only), the module in dots. |
| QR code with a URI | `W1D` | Manual formatting: the label's error correction level, `A` (automatic input), the data, two carriage returns. The module is given in tenths of a millimetre, not dots: the nearest, refused when it would not print the layout's dots. Labelize draws the symbol eight modules higher than its bottom left corner (its image's quiet zone, as for ZPL's `^FO`) — tested in sight. One encoding mode for the whole data (backlog 1.14) is refused. |
| Text | Internal fonts 0 to 2 | Fixed pitch, their cells and spacing in dots at 203, 300, 406 and 600 dpi (the manual's tables C-2 to C-5); the multiplier whose cell is nearest the text height; centred by the pitch, as the `J` command is for scalable fonts on display-equipped models only. `z` takes the slash out of the zeros. |
| **GS1 DataMatrix** | — | The manual gives no FNC1 for `W1c`. |
| **GS1 DataBar** | — | `W1k` (RSS) is not drawn by Labelize: not offered yet. |
| **A line break in the data** | — | It would end the record. |

The file: `<STX>L`, `m` (metric), `D11` (each dot once), `z`, the records, `Q0001`, `E`, each ending CR. System-level
commands (label length, sensor, speed, heat) are not sent: the printer keeps its configuration.

## References and verification

- ZPL: Zebra's *ZPL II, ZBI 2, Set-Get-Do, Mirror, WML Programming Guide*, P1134473-11EN Rev A
  (https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/zpl-zbi2-pg-en.pdf).
  Its `^GF` takes byte counts from 1 to 99999: a larger image (a logo) is sent as horizontal stripes, one graphic
  field each (`graphicFields()`).
- No physical printer is available for now. ZPL is checked with **Labelary** (labelary.com), which renders what
  Zebra firmware prints; emulations by other brands are proven only on their own hardware.
- TSPL, EPL2 and DPL are checked with **Labelize** (github.com/GOODBOY008/labelize), an open-source emulator. It is young (version 1.10.0, October 2026) and an approximation of the firmware, which it says itself;
  where it and the manual disagree the symbol is refused, and a print from a physical printer always outranks it.
- PPLA and PPLB have no simulator known; their manuals are still to be gathered.

## Order of work

ZPL II (done for the symbols above, GS1 DataBar and ITF-14's bearer bars included; the label layout next), then TSPL
and EPL2 (31 October 2026, the symbols above), DPL (2 November 2026, the symbols above), then PPLB and PPLA (manuals to
gather).
The order can change with the printers the owner has at hand for tests.

## Open points for the owner

- Physical printers for tests (model, resolution, language): none for now; to be listed when available.
- Manuals: TSPL's, EPL2's and DPL's (Datamax's Class Series 2) are the manufacturers' public PDFs (above); Honeywell's
  current DPL reference needs a sign-in; PPLA's and PPLB's to be gathered before their items. Copies go in the Drive `references` folder, never in this repository.
- A printer whose ZPL emulation fails a symbol: refuse it for that printer profile, or offer the image as an exception?
  To be decided with the first such printer.
