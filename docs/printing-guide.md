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
8. [Other printer languages](#8-other-printer-languages)

## 1. Which file for which printing

| Printing | File | Why |
|---|---|---|
| Packaging, printed by a converter (offset, flexography, gravure) | **PDF** or **EPS**, with a bar width reduction if the printer asks | Vector, at real size, in process black alone |
| Artwork in a design application | **SVG** (text as outlines), **PDF** or **EPS** | Placed at 100 %, never scaled |
| A web page, a document, a screen | **SVG** or **PNG** | PNG at the label's size or at 300, 600 or 1200 dpi |
| An office or laser printer | **PDF**, one label a page or on **label sheets** | Printed at 100 % ("actual size") |
| A thermal label printer (Zebra and printers that emulate ZPL) | **ZPL** | The printer's own commands, at its resolution |
| A system (ERP, WMS) that prints labels | **ZPL template** | Placeholders the system fills in |
| Every file of one label, to send to someone | **Zip of all** | SVG, PNG, PDF, EPS and a README of the data, sizes and how to print |

## 2. Artwork and prepress: SVG, PDF, EPS

- **Never scale a symbol.** Its size was chosen within the symbol specification table's range; scaling it moves it out
  of the range or breaks the module grid. Change the **Size** in the studio and export again.
- **Process black.** The PDF and the EPS paint in DeviceCMYK, black as 0 0 0 100 % (K only), never as a grey or a
  rich black: one plate, no registration between plates.
- **Bar width reduction.** Printing spreads ink: the bars come out wider than drawn. A converter knows by how much for
  its press and substrate and asks for a reduction (for example 0.03 mm). The studio takes it off every bar of a linear
  symbol, half on each side, and says it in the SVG and the README; ITF-14's bearer bars are left as they are. It is not
  applied to 2D symbols.
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

1. **Choose the printer** in *Printer (ZPL)*: a generic profile at its resolution, or a profile of your own with its
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
| QR code and Data Matrix with a GS1 Digital Link URI | `^BQ` model 2, `^BX` | At the label's error correction level |
| GS1 DataBar | `^BR` | At its fixed heights; refused where the table asks for more |
| Human readable text | `^A0` with `^FB` | Below, above or split, at the label's height |

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
| The GS1 Logistic Label | Not written in ZPL yet: print its PDF at its size |

## 8. Other printer languages

EPL2, TSPL/TSPL2, PPLA, PPLB and DPL are planned (backlog 3.3 to 3.7) under the same rule: a symbol is offered in a
language only once a test prints it and reads back the same data. They wait for their manuals and for a way to check
the output (no simulator like Labelary is known for them) or physical printers. Meanwhile, printers of these families
print the PDF through their driver.
