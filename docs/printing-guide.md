# Printing guide

How to get the studio's files printed right: by a printer of packaging (artwork and prepress), on an office or laser
printer (PDF and label sheets), or on a thermal label printer (ZPL). How to make the files: the
[user guide](user-guide.md). Why the printer files are as they are: [ADR 0002](adr/0002-printer-output.md).

## Contents

1. [Which file for which printing](#1-which-file-for-which-printing)
2. [Artwork and prepress: SVG, PDF, EPS](#2-artwork-and-prepress-svg-pdf-eps)
3. [Office and laser printers: PDF and label sheets](#3-office-and-laser-printers-pdf-and-label-sheets)
4. [Thermal label printers: ZPL](#4-thermal-label-printers-zpl)
5. [ZPL templates for systems](#5-zpl-templates-for-systems)
6. [Checking a printed symbol](#6-checking-a-printed-symbol)
7. [What ZPL refuses, and why](#7-what-zpl-refuses-and-why)
8. [TSPL, EPL2 and DPL, and the other printer languages](#8-tspl-epl2-and-dpl-and-the-other-printer-languages)

## 1. Which file for which printing

| Printing | File | Why |
|---|---|---|
| Packaging, printed by a converter (offset, flexography, gravure) | **PDF** or **EPS**, with a bar width reduction if the printer asks | Vector, at real size, in process black alone |
| Artwork in a design application | **SVG** (text as outlines), **PDF** or **EPS** | Placed at 100 %, never scaled |
| A web page, a document, a screen | **SVG** or **PNG** | PNG at the label's size or at 300, 600 or 1200 dpi |
| An office or laser printer | **PDF**, one label a page or on **label sheets** | Printed at 100 % ("actual size") |
| A thermal label printer (Zebra and printers that emulate ZPL) | **ZPL** | The printer's own commands, at its resolution |
| A TSC or generic thermal printer, an older Zebra, a Datamax-O'Neil or Honeywell | **TSPL**, **EPL2** or **DPL** (section 8) | The printer's own commands, checked in an emulator: test-print first |
| A system (ERP, WMS) that prints labels | **ZPL template** | Placeholders the system fills in |
| Every file of one label, to send to someone | **Zip of all** | SVG, PNG, PDF, EPS and a README of the data, sizes and how to print; the PNG at the resolution chosen |

## 2. Artwork and prepress: SVG, PDF, EPS

- **Never scale a symbol.** Its size was chosen within the symbol specification table's range; scaling it moves it out
  of the range or breaks the module grid. Change the **Size** in the studio and export again.
- **Process black.** The PDF and the EPS paint in DeviceCMYK, black as 0 0 0 100 % (K only), never as a grey or a
  rich black: one plate, no registration between plates.
- **Bar width reduction.** Printing spreads ink: the bars come out wider than drawn. A converter knows by how much for
  its press and substrate and asks for a reduction (for example 0.03 mm). The studio takes it off every bar of a linear
  symbol, half on each side, and says it in the SVG and the README; ITF-14's bearer bars are left as they are. It is not
  applied to 2D symbols.
- **Crop marks.** For a label printed on a larger sheet and cut out, choose *Crop marks*: the PDF and the EPS then have
  a page 10 mm larger on every side, and at each corner of the label two hairlines (0.25 pt) start 3 mm outside its
  edges, on the lines of those edges, 5 mm long — clear of a 3 mm bleed. They are in process black, the one ink the
  file uses, not in registration colour. The PDF's TrimBox and BleedBox are the label, nothing bleeding past it, so
  imposition software places it by them. Leave them off for a file placed in packaging artwork, which has its own.
- **Text.** In the SVG the human readable text is glyph outlines by default (no font needed). *Text, editable* writes
  real text, which needs Liberation Sans (and OCR-B for EAN/UPC digits) where it is printed.
- **Quiet zones.** Keep the margins the label includes free of print; the label is laid out with them.
- **Colours.** Dark bars on a light background; if the artwork changes the colours, check the contrast with the
  printer (General Specifications 5.12.3, the quality grade in each table).

## 3. Office and laser printers: PDF and label sheets

- Print the PDF at **100 %** — *actual size*, never *fit to page* — and check the result with a ruler against the
  label's size (in the caption and the README).
- **Label sheets** (Generate in bulk): Avery L7160, L7163, L7651 (A4), 5160 (Letter), or a custom sheet measured from
  the sheet itself (page size, label size, columns, rows, margins and pitch). Labels are placed at 100 % centred in
  their place; a label larger than the sheet's labels is refused. Print a page on plain paper first and hold it against
  a sheet to the light.
- Laser printers print at 600 dpi or more, so the module grid matters less than on a thermal printer; the smallest
  sizes of a table still need a good printer.

## 4. Thermal label printers: ZPL

A thermal printer prints whole dots (152, 203, 300, 406 or 600 dpi). A module that is not a whole number of dots is
rounded differently bar by bar and the symbol degrades: an EAN-13 at 100 % (0.330 mm) prints as 3 dots (0.375 mm) at
203 dpi or 4 dots (0.339 mm) at 300 dpi.

1. **Choose the printer** in *Printer (ZPL, TSPL, EPL2, DPL)*: a generic profile at its resolution, or a profile of your own with its
   print width (the printer's specification sheet gives both).
2. **Choose the module**: the studio offers the whole numbers of dots within the table's range and says the
   X-dimension that prints. If none fits, the nearest is printed and said.
3. **Print a test**: *Test print (ZPL)* adds a 50 mm ruler and the settings under the label. Measure the ruler: if it is
   not 50 mm, the printer's resolution or its scale setting differs from the profile.
4. **Send the ZPL** to the printer: copy the `.zpl` file to it (on Windows, `copy /b label.zpl \\computer\printer`
   to a shared printer; on Linux and macOS, `lp -d printer -o raw label.zpl`), or through the printer's own utility.
   Direct printing from the browser (WebUSB, Zebra Browser Print) is planned (backlog 3.8).

The ZPL is the printer's own commands, not an image: a few hundred bytes a label, printed at the printer's resolution,
readable and editable. Each symbol was printed by Labelary, which renders what Zebra firmware prints, and read back
(see the table below). Printers of other brands that emulate ZPL are proven only on their own hardware: print a test and
scan it before a production run.

| Symbol | ZPL command | Notes |
|---|---|---|
| EAN-13, EAN-8, UPC-A, UPC-E | `^BE`, `^B8`, `^BU`, `^B9` | The printer adds the check digit |
| ITF-14 | `^B2`, bearer bars as `^GB` | Ratio 3; the 14 digits printed below the bearer bar by the studio |
| GS1-128 | `^BC` mode N | FNC1 and code sets written by the studio; several symbols stacked |
| GS1 DataMatrix | `^BX` quality 200 | FNC1 as `_1` with `_` declared as the escape character |
| QR code and Data Matrix with a GS1 Digital Link URI | `^BQ` model 2, `^BX` | At the label's error correction level; `^BY1,3.0,1` before `^BQ`, which prints the symbol as far below `^FO` as `^BY`'s bar height |
| GS1 DataBar | `^BR` | At its fixed heights; refused where the table asks for more |
| Human readable text | `^A0` with `^FB` | Below, above or split, its capitals at the label's height; every element string, the key's alone or none, as chosen for the label |
| A label of one's own | As the symbol alone, `^A0`, `^GB` | Each barcode with its own commands at the whole dots nearest to its X-dimension, its bars where the label puts them; each line of text at its capitals' height; each line and box with `^GB`, its edges at the nearest dots (in EPL2 `LO` and `X`, in TSPL `BAR` and `BOX`, in DPL an `X` record's line and box); each image (a logo) as `^GFA` at the printer's dots, in black and white and in ZPL's own compression (a photo's greys as dots, dithered again at the printer's dots) (in EPL2 `GW`, in TSPL `BITMAP`; not in DPL); a turned barcode or text with its field orientation (`R`, `I`, `B`; in EPL2 `A`'s and `B`'s rotation; in TSPL `BARCODE`'s, `TEXT`'s and `DMATRIX`'s; in DPL each record's rotation) |

To see a ZPL file without a printer, paste it into Labelary's viewer (<https://labelary.com/viewer.html>) with the
printer's resolution (8 dpmm is 203 dpi, 12 dpmm is 300 dpi).

## 5. ZPL templates for systems

*ZPL template* writes the same label with placeholders where the values go — `{{01}}`, `{{10}}`, `{{17}}`, `{{21}}` or
`{{URI}}` — each described in a `^FX` comment at the top: what it takes, how to escape it, an example. A system keeps the
template, replaces each placeholder with the row's value (escaping reserved characters as the comment says) and sends
the result to the printer. The structure that depends on the data (FNC1 separators, code sets) is laid out so that any
value of the AI's format fits. For GS1 DataBar, `{{01}}` is the GTIN's first 13 digits for the symbol and `{{GTIN}}` the
whole GTIN for the text.

## 6. Checking a printed symbol

- **Before printing**: the *Scan test* reads the label back in the browser with ZXing and compares each symbol with
  what it should carry.
- **After printing**: scan it with a barcode scanner set to send the symbology identifier (`]C1`, `]d2`, `]Q1`…) and
  paste what it typed into the studio's *Paste it* box (a group separator written `{GS}`): the studio recognises it and fills in the fields, which should
  be the data you printed.
- **Quality**: the tables of the General Specifications set a minimum print quality grade (ISO/IEC 15416 and 15415)
  for each application, measured with a barcode verifier. A scanner reading the symbol is not a verification.

## 7. What ZPL refuses, and why

The studio never prints a symbol wrong: what ZPL cannot print as the standard asks is refused with its reason, and the
PDF offered instead.

| Refused | Why |
|---|---|
| GS1 QR Code | `^BQ` has no FNC1 (not offered in the editor anyway) |
| GS1 DataBar at a till (tables 1 and 3) | `^BR` prints each DataBar at a fixed height, below the table's minimum there |
| GS1 DataBar Expanded with an element string of no predefined length before another | No separator was read back from `^BR` |
| A QR code in one encoding mode | Nothing showed a printer honours the mode (Labelary chose its own) |
| Text left or right of the symbol | The printer's font sets the text's width, which the studio does not know |
| A label wider than the printer prints | It would be cut |
| The GS1 Logistic Label | In ZPL and EPL2; in TSPL and DPL for an SSCC alone (their GS1-128 carries nothing else yet); not as a template: print its PDF meanwhile. In EPL2, an element string of no predefined length must end its symbol, and the 2D symbol can only be a Data Matrix with a URI. A6 and A5 are wider than a 4-inch printer prints: a 4 × 6 in label, or a wider printer's profile |
| A label of one's own | In ZPL, EPL2, TSPL and DPL (not as a template). EPL2, TSPL and DPL refuse what they refuse for a symbol alone (in TSPL: GS1-128, EAN-8, UPC, GS1 DataBar; in DPL: GS1 DataMatrix, GS1-128 but for an SSCC alone, GS1 DataBar). DPL places each record in tenths of a millimetre from the label's bottom left corner, so the printer must know the label's length (it senses the gap) and an edge can land a dot off at 300 dpi; DPL refuses an image (it prints one stored in the printer first, which Labelize does not draw): print its PDF, or another language, meanwhile. A turned barcode or text goes in DPL with its record's rotation (2, 3, 4: 90°, 180°, 270° clockwise), turned about its bottom left corner as the manual's figure 8-1 shows, which Labelize places otherwise (the tests move it for Labelize), not yet seen on a Datamax or Honeywell printer: print a test label turned before a production run; Labelize does not turn DPL's Data Matrix or QR code, so a turned one is refused. In TSPL an image goes as `BITMAP`, whose dots are raw bytes as `GW`'s (a dot whose bit is 0 prints black, as Labelize draws it): send that file unchanged too. A turned barcode or text goes in TSPL with `BARCODE`'s, `TEXT`'s and `DMATRIX`'s rotation, turned about its point of origin as the manual's own example prints it (four symbols from one point, each in its own quarter), which Labelize places otherwise (the tests move it for Labelize), not yet seen on a TSC printer: print a test label turned before a production run; Labelize does not turn `QRCODE`, so a turned QR code is refused in TSPL. A barcode whose bars, or a line, box or image, would run past the label's edge at the printer's dots is refused. An image goes in EPL2 as `GW`, whose dots are raw bytes: send that file to the printer unchanged, as a binary file (not opened and saved in a text editor, nor sent line by line); a dot whose bit is 0 prints black, as Zebra says (Labelize, the emulator of the tests, prints them the other way round, so its tests invert them), not yet seen on an EPL2 printer; if an image prints wrapped or not at all, the printer's Windows mode should be off (`WN`, the guide's default). A turned barcode or text goes in EPL2 with `A`'s and `B`'s rotation, its point of origin turned with it (the guide's figure 2: at 90° the origin is the field's top right corner), which Labelize places otherwise (the tests move it for Labelize), not yet seen on an EPL2 printer: print a test label turned before a production run; a Data Matrix has no rotation in EPL2 (`b`), so one turned is refused there; a QR code is printed upright (ZPL's `^BQ` has no orientation) |

## 8. TSPL, EPL2 and DPL, and the other printer languages

Besides ZPL, the studio writes **TSPL/TSPL2** (TSC and most generic thermal printers; `.prn`), **EPL2** (older
Zebras and printers that emulate it; `.epl`) and **DPL** (Datamax-O'Neil and Honeywell printers; `.dpl`) with the
printer's own commands (backlog 3.3 and 3.6, 31 October 2026; 3.7, 2 November 2026). Choose a TSPL, EPL2 or DPL profile
under *Printer (ZPL, TSPL, EPL2, DPL)*: the Export bar's button, the test print and the bulk print file then use that
language.

**How they are checked.** No simulator renders TSPL, EPL2 or DPL the way Labelary renders ZPL from Zebra's firmware.
The tests print them with **Labelize**, an open-source emulator of these languages, and read every symbol back with
ZXing, as ZPL is checked through Labelary; the commands follow each manufacturer's manual (TSC's *TSPL/TSPL2
Programming Manual* 3.0, Zebra's *EPL Programming Guide* 14245L-003, Datamax's *Class Series 2 Programmer's Manual*
88-2341-01). An emulator is not the printer's firmware: **print the test label on your printer and scan it before a
production run**. The studio says so beside a TSPL, EPL2 or DPL profile.

| Symbol | ZPL | TSPL | EPL2 | DPL |
|---|---|---|---|---|
| EAN-13 | ✓ | ✓ | ✓ | ✓ |
| EAN-8, UPC-A, UPC-E | ✓ | not yet: Labelize does not draw them | ✓ | ✓ |
| ITF-14, with bearer bars | ✓ | ✓ | ✓ | ✓ |
| GS1-128 | ✓, over several symbols too | an SSCC (00) alone (`EAN128`); the rest not yet: Labelize encodes TSPL's `!102` (FNC1) as text | ✓, an element string of no predefined length last only; several symbols too | an SSCC (00) alone; the rest not yet: Labelize does not draw DPL's ways to write FNC1 |
| GS1 DataBar | ✓ (see section 7) | not yet: Labelize does not draw `RSS` | not yet: Labelize does not draw `R14` | not yet: Labelize does not draw `W1k` |
| GS1 DataMatrix | ✓ | ✓ | ✗ EPL2's Data Matrix has no FNC1 | ✗ the manual gives DPL's Data Matrix no FNC1 |
| Data Matrix with a GS1 Digital Link URI | ✓ | ✓ | ✓, without a double quote or a backslash | ✓, square |
| QR code with a GS1 Digital Link URI | ✓ | ✓ | ✗ Japanese models only (the guide) | ✓, its module in tenths of a millimetre |
| Text below or above the symbol | `^A0`, its capitals at the label's height | dot fonts 1 to 5, their capitals at the nearest height | fonts 1 to 5, their capitals at the nearest height | fonts 0 to 2, their capitals at the nearest height |
| Templates with `{{AI}}` | ✓ | — | — | — |
| Checked with | Labelary | Labelize | Labelize | Labelize |

What a language cannot print, or what no test has read back, is refused with the reason, never printed wrong; the PDF
or ZPL print it meanwhile. TSPL, EPL2 and DPL at 203 and 300 dpi are offered as generic profiles; a profile of your own
takes any language.

**DPL counts from the label's bottom.** A DPL record places a field by its bottom left corner, measured from the
label's bottom left corner in tenths of a millimetre. The studio turns its positions into those, so the printer must
know the label's length: calibrate it to the labels loaded (it senses the gap) before printing. The QR code's module is
also given in tenths of a millimetre; a module that would not print as whole dots is refused, with another size to
choose.

**PPLA and PPLB** (Argox and Elgin) come next (backlog 3.4, 3.5): they wait for their manuals. Meanwhile their printers print the PDF through their driver, and
many Argox and Elgin printers also understand EPL2 (PPLB is close to it) — check with the test label.
