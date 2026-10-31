# ADR 0002 — Printer output: the dot grid, the printer's own commands, templates with placeholders

| | |
|---|---|
| Status | **Accepted** for ZPL (28 October 2026); the other languages follow the same principle, confirmed when each starts |
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
| GS1-128 | `^BC` mode **N** | FNC1 (`>8`) first and after each variable-length element string, code sets chosen by the studio (`gs1128FieldData()`), `>` written `>0`. **Mode D** (UCC/EAN) joins the element strings without FNC1 — "(10)ABC(21)X" reads as "(10)ABC21X" — and cannot carry a `>`; **mode A** prints `>8` as text. Text below the bars by the studio. |
| GS1 DataMatrix | `^BX` quality 200 | FNC1 is `_1` with `_` declared as the escape character: its default changed between firmware versions (`~` before V60.13.0.12), and `~1` was not read. `_` in data is `__`. |
| Data Matrix and QR with a GS1 Digital Link URI | `^BX`, `^BQ` model 2 | Plain data. `^BQ` takes the label's error correction level (it was always M before 31 October 2026); Labelary treats it as a minimum, raising M to Q where the version has room. Its manual input in one mode (N, A, B and a byte count) is not offered: Labelary printed the same version for 46 bytes in byte mode as in alphanumeric (version 2 at level L, where byte mode needs version 3), so it chooses the modes itself and nothing shows a printer would honour one (backlog 1.14). |
| GS1-128 over several symbols (backlog 1.13) | one `^BC` a symbol | Stacked from the top, each with its element strings as text below, a quiet zone of 10X between one symbol's text and the next; the label as wide as the widest symbol. Read back through Labelary, every symbol. |
| **GS1 QR Code** | — | `^BQ` has no FNC1: refused, with GS1 DataMatrix or the QR code with a GS1 Digital Link URI offered instead. |
| GS1 DataBar | `^BR` | Orientation N given (its default is R). Omnidirectional, Truncated, Stacked, Stacked Omnidirectional and Limited take the GTIN's first 13 digits and add the check digit (given 14, nothing is read); Expanded takes the element strings without brackets, Expanded Stacked is Expanded with 4 segments a row. `^BR` prints each at a fixed height — Omnidirectional 33 modules, Stacked Omnidirectional 69, Truncated and Stacked 13, Limited 10, Expanded 34 a row — and its height parameter is for composite symbols only: where a table asks for more (tables 1 and 3: 46 and 95 modules at a till) the ZPL is refused and the PDF offered. No separator was read back between an element string of no predefined length and the next ("#" printed other data; a GS byte through `^FH` was not read), so Expanded carries such an element string last only. The element strings are printed below as text (a template has `{{01}}` for the symbol's 13 digits and `{{GTIN}}` for the text). Checked through Labelary, every symbol at 203 and 300 dpi (29 October 2026). |

Reserved characters (`^`, `~`, `\`) go through `^FH`. In templates, values are placed in the code set any value of the
AI's format fits: element strings of predefined length (all digits, even length) in code set C, other values in code
set B; a Data Matrix keeps the sample's size so that the text below it stays clear.

## References and verification

- ZPL: Zebra's *ZPL II, ZBI 2, Set-Get-Do, Mirror, WML Programming Guide*, P1134473-11EN Rev A
  (https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/zpl-zbi2-pg-en.pdf).
  Its `^GF` takes byte counts from 1 to 99999: a larger image (a logo) is sent as horizontal stripes, one graphic
  field each (`graphicFields()`).
- No physical printer is available for now. ZPL is checked with **Labelary** (labelary.com), which renders what
  Zebra firmware prints; emulations by other brands are proven only on their own hardware.
- The other languages have no comparable simulator: their commands wait for manuals and physical printers.

## Order of work

ZPL II (done for the symbols above, GS1 DataBar and ITF-14's bearer bars included; the label layout next), then TSPL,
PPLB, PPLA, EPL2, DPL.
The order can change with the printers the owner has at hand for tests.

## Open points for the owner

- Physical printers for tests (model, resolution, language): none for now; to be listed when available.
- Manuals of the other languages (TSPL, PPLA, PPLB, EPL2, DPL), to be gathered before their items.
- A printer whose ZPL emulation fails a symbol: refuse it for that printer profile, or offer the image as an exception?
  To be decided with the first such printer.
