# ADR 0003 — Product scope and user experience

| | |
|---|---|
| Status | **Proposed** (28 October 2026), for discussion with the owner; the interface language, the one-code screen and the symbols offered **decided** (below) |

## Who it is for

- A small company printing its first GS1 barcodes: wants the right symbol for its product without reading the General
  Specifications.
- A designer or prepress studio: wants a vector file at the right size, with bar width reduction and 100 % black.
- An operations or logistics team: wants hundreds or thousands of labels from a spreadsheet, on a thermal printer.
- Healthcare and industry: GS1 DataMatrix with batch, expiry and serial number, on their printers.

## Principles

1. **Ask what is being identified, not which symbology.** "A product sold at a till", "a medicine or medical device",
   "a pallet or carton (logistic unit)", "a location", "an asset" — the studio follows the General Specifications'
   decision tree (figure 5-68) to the symbol specification table, offers the symbols it allows and recommends one.
   Experts can still pick a symbology directly. *In the core since 28 October 2026 (`guide.ts`, item 1.2): the tree's
   questions one at a time, those the key answers left out; each leaf is a section 2 application whose carrier choices
   give the order; the recommendation is the first carrier the studio draws that carries all the data, or — where only
   the GTIN fits, as EAN/UPC at a till — that carrier with the first symbol allowed in addition that carries the rest
   (a QR code with a GS1 Digital Link URI at retail). A symbol in addition is never recommended alone. On the page since
   29 October 2026: the editor's step 2 (mock-up B, the owner's choice among three). With GS1 DataBar drawn (item 1.3,
   29 October 2026), two refinements: at a retail point of sale (tables 1 and 3) GS1 DataBar Expanded carries all the
   data only for a variable measure item — a variable count or trade measure, AIs (30), (31nn), (32nn), (35nn), (36nn),
   section 2.1.12.1 —, since a fixed measure item's carriers carry its GTIN and its attributes go in a 2D symbol in
   addition (section 2.1.3); and a pair whose GTIN carrier is not an EAN/UPC (ITF-14 or GS1 DataBar with a 2D symbol)
   is named but not recommended, because the label lays a symbol in addition out beside an EAN/UPC only until labels of
   several symbols (phase 4): either symbol can be chosen alone.*
2. **Paste anything.** A GTIN, an element string with or without brackets, a GS1 Digital Link URI, or what a scanner
   types (with GS separators): the studio recognises it, shows each AI with its name and checks it, and explains an
   error in plain words (the GS1 Syntax Engine's messages, translated).
3. **Right by construction.** Only sizes within the table's range; check digits computed or checked; quiet zones and
   human readable text as the General Specifications place them; for printers, only whole-dot X-dimensions.
4. **See it at real size.** A preview at 1:1 with a ruler, the X-dimension, the symbol's printed size, and a "scan
   test" that reads the symbol back with the same decoder the tests use. *On the page since 29 October 2026 (item 1.6,
   mock-up A of three, the recommended one, taken under the owner's rule while the owner was away): "Fit" or "Real
   size" above the preview, rulers in millimetres along the label at real size, the screen calibrated against the short
   side of a bank card (ISO/IEC 7810 ID-1, 53.98 mm) and kept in the browser; "Scan test" draws the label's SVG in the
   browser and reads it with ZXing (zxing-wasm, its WebAssembly served by the application), comparing the symbology
   identifier and the data of every symbol with what the label should carry (`expectedReads()`).*
5. **Private.** Nothing leaves the browser; said on the page.
6. **Accessible.** Keyboard and screen reader, light and dark, phone width.
7. **In English, Brazilian Portuguese and Spanish.** The owner first fixed the tool in English (28 October 2026): one
   language to write, test and document, the texts kept apart from the code so that a translation remained possible.
   *On 31 October 2026 the owner asked for Brazilian Portuguese and Spanish besides English, the documentation staying
   in English only. Decided then, the recommended option on each point: a language menu in the header, each language
   named in itself (mock-up A of three; B was EN/PT/ES buttons, C links in a footer); the browser's language on the
   first visit, the choice kept in the browser afterwards; changing it redraws the page in place, keeping what was
   typed. The English text is the key (`t("Fill in")`), each language a catalogue of the page's texts and one of the
   messages the core and the GS1 Barcode Syntax Engine write in English, translated where they are shown (`tm()`, by
   template); the engine's messages, the keys', qualifiers' and attributes' texts and the Portuguese names of the AIs
   come from the resolver's catalogues (ADR 0004), Spanish keeping GS1's English data titles as the resolver does. A
   test fails when a text of the page or a message of the core lacks its translation or its placeholders differ. The
   files made (README, CSV, ZPL notes, SVG descriptions) stay in English, as data exchanged with other systems. The
   translations are drafts by Claude, to be reviewed by native speakers (the owner for Portuguese).*

## Screens

1. **One code** — the resolver's editor without its records (decided with mock-ups on 28 October 2026, ADR 0004): on the
   left what the code identifies — a box to paste anything, the key, its qualifiers, data attribute rows —, on the right
   the label panel, sticky, with the preview beside its options (step 3; step 2, "Where is it scanned?", sits under the
   identification since 29 October 2026 and chooses the symbol), the GS1 Digital Link URI coloured by part, the element
   string and the downloads, redrawn as anything changes; RFID and NFC (EPC) below the options. On a phone the fields
   come first, with a small live preview fixed at the top. *Since 30 October 2026 (the owner's request, mock-up B of three): the page
   takes the screen's whole width, and step 3 shows the label in its own area across the step, its tools over it and
   an Export bar below it, the options below them; the label designer of phase 4 grows from that area.* *Since 31
   October 2026 (the owner's request, backlog 1.21, mock-up A of three, taken under the owner's rule): the computer's
   layout stays as it is; a phone, a tablet held upright or a narrow window (900 pixels or less) shows one column and
   one destination at a time — Data, Scan, Label, Export, More — in a tab bar at the bottom, as phone apps do, the
   language and *Install the app* under More, Start over a round reload icon beside the live preview (the owner, who
   kept layout A the same day); a touch screen held horizontally up to 1,366 pixels shows a navigation rail, the
   destination on the left and the label with its tools and Export bar always on the right. One page serves them all:
   its parts are marked with their destination (`data-pane`) and the styles hide the others, so turning a device keeps
   what was typed. The alternatives were one long column with step chips and a floating download button (B) and a
   drawer menu (C), which hides the destinations behind a button. About sits at the foot of the page (under More on a
   phone): the repository, the licence, the manuals, the version published and the software it is made with.*
2. **In bulk** — a wizard: upload CSV or Excel (or paste), map columns to AIs (remembered by header), fixed values for
   the columns that do not change, validation with a report of the rows in error (fix or skip), preview of the first
   labels, generate. *Since 29 October 2026 (item 2.1, mock-up A of three, the recommended one, taken under the owner's
   rule while the owner was away): not a wizard but a mode of the editor — "One code | In bulk" in the header; in bulk,
   step 1 is the rows (a file dropped or chosen, or rows pasted), each column's AI and the values every row takes, with
   the rows ready and those in error (each a link to it); steps 2 and 3 stay the editor's, so the label is designed once
   and its preview steps through the rows. The columns are kept in localStorage for files with the same headers.
   The report of the rows in error (item 2.2, mock-up A of three, taken under the owner's rule) stays in step 1: each
   row in error shows its cells with the one at fault outlined, fixed in place — the file is not changed, the
   corrected rows are downloaded to fix it at its source —, or skipped.*
3. **Labels** (later) — templates and a designer: text, images, lines, several symbols, fields bound to columns; ready
   templates such as the GS1 Logistic Label (SSCC) in A6 and 100 × 150 mm.
4. **Printers** — profiles (ADR 0002) and a test print.

**Symbols offered** (decided by the owner, 28 October 2026): GS1 QR Code (the element string in a QR code, FNC1 in
first position) is not offered. Beside the QR code with a GS1 Digital Link URI it confuses: both are "a GS1 QR code" to
most people, and the Digital Link one is what GS1 recommends for consumer products. The core still encodes and lays it
out, so that bringing it back is a choice in the editor only.

## Bulk generation

*Since 29 October 2026 (item 2.1, core): rows from a CSV (comma, semicolon or tab, whichever the header row has most
of; RFC 4180 quotes), from rows pasted from a spreadsheet, or from the first worksheet of an Excel workbook read without
a library (its zip and XML; dates as YYYY-MM-DD, numbers to 15 significant digits as Excel shows them). Each column's
AI is guessed from its header — written as an AI, as a GS1 data title, or in common English, Portuguese and Spanish
words — and dates become YYMMDD from ISO and day-first forms. Each row becomes the editor's identification (the first
key column, its qualifiers, the rest as attributes, the fixed values last) and is checked by the Syntax Engine.*

- Inputs: CSV, XLSX, pasted rows; sequences generated by the studio — serial numbers from a start and a count, SSCCs
  from a company prefix and an extension digit with their check digits.
- Outputs: a zip with one file per row (names from a pattern, e.g. `{01}_{10}.svg`), one multi-page PDF (a label a
  page), PDF sheets for laser printers (A4 and Letter label sheets: Pimaco, Avery, custom grid), one print file per
  printer language with every label, and a CSV of what was generated (with the HRI and the GS1 Digital Link URI).
- Performance: generation in Web Workers with progress and cancel; target to be measured (for example 10 000 labels
  without freezing the page).

## Export formats

SVG (vector, real size, text as outlines or as text), PNG (at a chosen dpi, carrying the dpi), PDF (vector, real
size), EPS (prepress), zip of all; options for prepress: bar width reduction, colour (100 % K), margins and crop marks;
printer languages (ADR 0002). *Since 29 October 2026 (item 1.5): EPS (the PDF's content stream through a PostScript
prolog), PDF and EPS in process black alone (DeviceCMYK 0 0 0 1), a bar width reduction of 0.010 to 0.050 mm taken off
every bar of a linear symbol (2D modules left as they are: their reduction would need the dark areas' outlines), and a
PNG at 300, 600 or 1200 dpi with a whole number of pixels a module, the X-dimension it prints at said. Margins and
crop marks to do.*
