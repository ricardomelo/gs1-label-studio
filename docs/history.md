# History

How the project grew, session by session, with the decisions taken on the way. The indicators of each session are in
`docs/metrics/sessions.csv`.

## Session 1 — 28 October 2026: kick-off

Started from the label studio of the GS1 Digital Link Resolver CE Expansion Pack (its ADR 0010), to offer the barcode
generator on its own. The owner chose a browser-first TypeScript application (ADR 0001), the name `gs1-label-studio`,
a public repository under Apache-2.0, and — beyond PDF and ZPL — PPLA/PPLB, TSPL/TSPL2, EPL2 and DPL (ADR 0002). Asked
during the session to record development and management indicators from the start, for a closing report like the
resolver's ("Resolver CE em números"): `docs/metrics/`. Walking skeleton delivered: encoding through bwip-js, every
symbol read back by ZXing, the printer dot grid, SVG and a ZPL graphic.

The owner then created the repository (with a licence commit, identical to the local one; the work was rebased onto
it), and decided: every document in English and the tool fixed in English. The resolver had no ZPL (PNG and SVG
only); the reference is Zebra's ZPL II programming guide. With no printer at hand the owner uses Labelary's viewer, so
the CI sends the studio's ZPL to Labelary and reads the rendered symbol back (the sandbox's network does not reach
labelary.com or zebra.com).

The owner then gave the environment full internet access and put the ZPL guide in the Drive folder. The guide's
99 999-byte limit on `^GF` led to stripes. Asked whether ZPL would be an image or commands, the owner decided: the
printer's commands always, images only for images such as a logo — for the size and so that systems can use the ZPL as
a template with placeholders. Testing every command through Labelary found three traps a manual alone would not show:
GS1-128's mode D joins element strings without FNC1, `^BQ` cannot make a GS1 QR Code, and the Data Matrix escape
character changed between firmware versions (ADR 0002).

Item 1.1 followed: the GS1 Barcode Syntax Engine became the input gate. It recognises a GTIN, an element string with or
without brackets, a GS1 Digital Link URI or a scanner's output, names each AI, and explains errors with the characters
at fault marked ("(17)27|13|31": no month 13); the data each symbol carries is derived from what it accepted.

The owner then asked why the resolver's label studio — environments from the General Specifications, every AI, EPC,
data attributes — was not the starting point. It had been used for its knowledge only. Of three ways (port it to
TypeScript keeping it as the reference; run its Python on a server; run Python in the browser), the owner chose the
first (ADR 0004). Its Python runs in the sandbox, so a script writes its answers as fixtures; the first module ported,
the scanning environments, gives the same answer in all 2 970 combinations.

Item 1.4 followed: `linear.py` and the layout of `label.py`, with the SVG. Twenty-three layouts, ten EAN/UPC
encodings and four text outlines from the resolver are the fixtures; positions agree within 1e-9 and the outlines
character for character, once two details were matched — the point where fontTools starts each glyph contour, and
Python rounding ties to even (9.3125 → 9.312) where JavaScript rounds up. One deliberate difference appeared: bwip-js
makes some QR codes a version smaller than segno did, by encoding the GTIN's digits in numeric mode.

The owner then asked for the resolver's editor itself: the key and its qualifiers, the attribute rows, the compact
panel beside the preview, live — and the EPC formats. Mock-ups (a static page with a real label and EPC values from
the resolver's code, at desktop and phone widths) were approved with the order proposed: the editor with key,
qualifiers and attributes first, then EPC (1.8), then PNG, PDF and zip (1.5). The resolver's dictionary file and its
attribute logic were ported and checked against it; two things it did not need came up — keeping AIs that are not
Digital Link attributes for element string symbols, and refusing qualifiers of different alternatives (TPX with a
batch), which its form prevented. The owner added the GS1 General Specifications 2026 and the EPC TDS 2.3, TDT 2.3
and RFID standards to the Drive folder.

Step 2, the EPC (item 1.8): the resolver's epc.py and gcp.py ported, every one of its 51 encodings and 7 refusals equal.
Reading them back with epc-tds, an independent decoder, showed what the resolver had shown wrongly: its hexadecimal was
filled to 4 bits, while the EPC field of a tag is zero-filled to the 16-bit word (TDS 2.3), so a SGTIN-198 came out as
50 digits where an encoder writes 52. The page shows the tag's form; the NFC link keeps the resolver's.

Two requests came between steps. The resolver's hexadecimal was taken back to the resolver as a fix of its own, in a
session on its repository (the owner: no one uses its API yet, so the field itself may change). And the owner asked
for GS1 QR Code to leave the list of symbols: beside the QR code with a GS1 Digital Link URI, it confuses.

Step 3, PNG, PDF and zip (item 1.5): `render_png`, `render_pdf` and `render_zip` ported, with six of the resolver's
labels as fixtures. The PDF's operators are the resolver's one for one after the 2D symbol's modules (whose masks
bwip-js may choose differently); the PNG's pixels are the resolver's outside the 2D symbol and the text, the text
within about a pixel (Pillow hints it, the port does not). The PDFs are drawn by poppler's pdftoppm in the tests and
read back by ZXing, like the PNGs. Compression comes from the platform (Compression Streams), so no library was added.

Session 2 began with item 1.2, as the owner had chosen. The ranges of ITF-14, GS1-128 and GS1 DataBar came from the GS1
General Specifications 2026 itself: every row of its thirteen symbol specification tables was transcribed and each
tested against the text of the PDF, read by a parser of its own; the resolver's summary (one 2D range and the EAN/UPC
range a table) agreed with them. Table 13 (durable marking for long distances) gives no target X-dimension, and the
encoder accepts a GS1-128 longer than the 48 data characters the standard allows — both found on the way. The guided
choice followed the decision tree of figure 5-68 node by node, its leaves the applications of section 2, whose carrier
choices give the order of the recommendation; healthcare has two (table 2-11 puts GS1 DataMatrix first, table 2-15
GS1-128 in distribution), and the tree's path tells them apart. Of three mock-ups the owner took the recommended one,
a step of its own, and asked that the recommended option always be taken from now on.

Session 3 took item 1.3 as the handover had it. The General Specifications placed the text: section 4.14 asks for the
element strings beside the symbol, never one broken over two lines, the AIs in parentheses; section 5.3.2 gives
ITF-14 its bearer bars — a 4.83 mm frame for printing plates, at least 2X at the top and bottom without them — and
1.02 mm to its digits. Two findings on the way: bwip-js draws ITF-14 at a wide-to-narrow ratio of 2, below the 2.25 the
standard allows, so the layout widens the wide elements to the target 2.5; and it returns a stacked GS1 DataBar as its
distinct rows only, so their heights come from ISO/IEC 24724. Drawing GS1 DataBar changed two recommendations, both
settled from section 2: at a till GS1 DataBar Expanded carries a fixed measure item's GTIN only (2.1.3), its batch and
dates going in a 2D symbol in addition, and carries everything for a variable measure item (2.1.12.1); and a GTIN
carrier other than an EAN/UPC is not recommended with a 2D symbol beside it, since the label cannot lay that pair out
yet — a defect of item 1.2 that showed only once DataBar could be the carrier.

Item 1.6 followed while the owner slept, with the owner's leave to take the recommended option. Of three mock-ups
(the check in the preview itself, a step 4, a dialog) the first was taken: the ruler and the scan test sit where the
label is looked at. The scan test reads the label as the browser draws its SVG, with the decoder the tests use; its
WebAssembly is served by the application, so the test sends nothing anywhere. A bank card's long side was too wide
for the preview's column on a laptop, so the calibration matches its short side.

Then the rest of item 1.5. The EPS was written as the PDF's own content stream under a PostScript prolog that defines
its few operators, so the two cannot drift apart; Ghostscript joined poppler in CI to draw it for ZXing. Black became
process black in DeviceCMYK rather than the resolver's DeviceGray, and the bar width reduction stays with linear
symbols: narrowing a 2D symbol's dark areas would need their outlines, not their rows of modules.

With the symbols laid out, ZPL followed them (item 3.2). Labelary showed what Zebra's guide leaves out: `^BR` wants the
GTIN's first 13 digits and nothing is read from 14; it prints each GS1 DataBar at one height, so the retail tables'
taller Omnidirectional symbols cannot come from it; and no way was found to put a separator between two variable
element strings in Expanded. Those cases are refused with the reason, as ADR 0002 asks, and the PDF is offered. ITF-14's
bearer bars became `^GB` boxes, which moved its digits from the printer's interpretation line to the studio's text.

Item 1.7 came next: offline. A plugin of the build writes the service worker with the list of every file the build
makes, so nothing is forgotten when a file is added; it needed no library. The first browser test offline failed:
the preview server answers "Vary: Origin" and a module script is fetched with an Origin, so the cache did not match
until the worker was told to ignore Vary, which is safe for files whose names carry their content's hash.

Phase 2 began with item 2.1. Of three mock-ups — a mode of the editor, a wizard, a dialog — the first was taken: the
label is designed once, in the editor's own steps, and the rows are stepped through in its preview. Excel workbooks are
read from their zip and XML like the GCP table before them; a workbook written by openpyxl is the test's, with a
custom date format and Excel's built-in one, since the first mutation of the date formats went unnoticed with only
the custom one. Headers are matched in Portuguese and Spanish as well as English: the interface is in English, but a
spreadsheet is in its author's language.

The owner's review of 29 October brought eight notes. Placed in the backlog rather than done at once, each went where
it is cheapest: the editor's small corrections (full width, AI lists in alphabetical order, a calibration that fits)
as 1.10, every key and qualifier as 1.11, several keys in one symbol before the generated SSCCs that need them (1.12),
GS1-128 over several symbols as the opening of the logistic label (1.13), and QR Code's encoding modes last (1.14),
since bwip-js chooses its segments itself and offers no way to force one. The dictionary answered the question on
several keys: every GS1 key may be a GS1 Digital Link data attribute, and the Syntax Engine already refuses the pairs
the standard forbids, so the work is the editor's, not the checks'.

Item 2.2 followed, with mock-up A of three: the report in the rows card, the cell at fault fixed where it is shown.
Two details came from using it: a row fixed while its value is typed would vanish from the list of errors at the
first valid character, so a row touched stays until another filter is chosen; and the report's class names first met
the page's own `.error` and `.fixed`, painting labels red. The hint about Excel's 15 digits needed a second test
after its mutation to 16 digits went unnoticed.

On 30 October the owner tested the published tool and wrote on the test plan; each comment became a change pushed the
same hour: headers written as AIs, every AI choice as "(AI) abbreviation name", the calibration across step 3, the
whole width with the label on its own canvas (mock-up B), zoom, and the caption's modules and characters encoded.
Item 1.11 then took its list from the General Specifications 26.0 rather than from the Digital Link dictionary:
section 1.3 gives every GS1 identifier with the AIs that qualify it in element strings and in the Digital Link, which
named the Made-to-Order GTIN (03) as the one key of element strings only and showed the HIDRI (8014) to be an
attribute of a GTIN. An earlier answer to the owner had counted (8040) to (8043) among the identifiers; the section
corrected it.

On 30 October evening (session 5) the owner, away until 9 November, asked for the work to go on with the recommended
options and placed five ideas in the backlog (1.15 to 1.19). In one session: the outputs in bulk (2.4) with one design
drawn for every row; qualifiers and attributes in one list (1.15); the URI's own parameters (1.17); several keys (1.12),
which the Syntax Engine already enforced; serial numbers and SSCCs made in the studio (2.3); the text placed and sized
(1.16); GS1-128 over several symbols (1.13); generation three times faster and in a Web Worker (2.5), measured first;
QR Code's encoding modes through node-qrcode (1.14); GS1 digital signatures and credentials (1.18); NFC tags (1.19);
then ZPL caught up with the label, printer profiles (3.1) and the GS1 Logistic Label (4.1). Pimaco's sheets waited for
margins its catalogue does not give. A push went out with a typecheck failing because the check's output was read
instead of its exit status; the exit status is read since.

## Session 6 — 31 October 2026: the documentation

The owner asked for complete documentation, like the resolver's project (ADR 0005). As there, the tests' names became
the inventory of what the studio does — 712 tests, the ZPL through Labelary included —, each feature names the tests
that prove it, and a test keeps the documents in step with the code. Manuals by reader: a user guide with screenshots
taken from the built application by a script, a printing guide (artwork, label sheets, thermal printers and ZPL), the
core's API reference generated from its sources, a developer guide, a conformance review standard by standard, and the
third-party licences. `vitest list` would have been simpler than a run, but it leaves out the tests made inside loops
over fixtures; the inventory comes from a complete run, and refuses to be written when a test fails — including a test
file that fails as a whole, which its first version missed. The owner then asked for the interface in Brazilian
Portuguese and Spanish besides English, the documentation staying in English.

The interface came next. Of three mock-ups of the language switch — a menu in the header, buttons, links in a footer —
the menu was taken. Every text of the page went through `t()`, with English as the key, and the messages the core
writes in English are translated where they are shown, by template. The resolver's catalogues gave the Syntax Engine's
211 messages and the keys' and qualifiers' texts in both languages; the rest, some 650 texts, were drafted for this
delivery. Two traps appeared in the first screenshots in Portuguese: a short template of the page, "{first} to {last}",
matched a hint ("up to 20 characters" became "up a 20 characters"), so the core's messages have a catalogue of their
own; and two values of one name in a message ("({label} × {label} mm)") were told apart by numbering them. A test now
refuses a text without its translation, and the documentation stays in English.

## Session 7 — 31 October 2026: phones, tablets and About

The owner asked for a design for phones — one column — and, where possible, a horizontal one for tablets, the
computer's left as it was; an app-style menu if it helped; About at the foot of the page with the repository, the
licence and the software of others; and a README that presents the tool and makes the manuals easy to find. Three
mock-ups were drawn over the real application: a tab bar at the bottom with one destination a screen, one long column
with step chips and a floating download button, and a drawer menu. The tab bar was taken, with a navigation rail for a
tablet held horizontally and the label always beside the destination. One page serves every layout: its parts carry
the destination they belong to, and the styles hide the others, so turning a device keeps what was typed. The browser
tests run on a phone and a tablet as well as a desktop, moving between the destinations as a person would; on the
desktop the page is pixel for pixel what it was.

Later that evening the owner asked for the other printer languages. None has a simulator like Labelary, and there is
no printer at hand, so the owner chose among three ways: the manuals with an open-source emulator (Labelize, a few weeks
old) standing in for the printer, the manuals alone, or the label as an image. With Labelize, TSPL and EPL2 came first.
The emulator and the manuals did not always agree: TSC's own GS1-128 example writes FNC1 as `!102`, which Labelize
prints as text, so GS1-128 waits in TSPL; Zebra's guide says EPL2 draws a Data Matrix's quiet zone itself, which
Labelize does not, so the manual was followed and the difference kept in a test. Each refusal names its reason.

## Session 8 — 2 November 2026: DPL

The owner asked whether a label designer like ZebraDesigner, NiceLabel or BarTender — barcodes, text and images placed
freely, each field edited — could be built and kept efficient. It could: it is backlog item 4.2, and the label's
`Layout`, which every export already draws and which the GS1 Logistic Label composes from several symbols, text and
lines, is where it starts. The owner kept it in its place in the backlog and asked to go on item by item until the next
week, when the tests can be done.

The next item was DPL (3.7). Honeywell's current DPL reference needs a sign-in, so the commands follow Datamax's public
Class Series 2 Programmer's Manual. DPL counts from the label's bottom left corner, in tenths of a millimetre, where the
studio counts dots from the top: the positions are turned over, within half a tenth of a millimetre. Labelize read back
every symbol the manual describes for GS1 data except two ways of writing FNC1 in GS1-128 — `&G` in Code 128 and EAN 128
with automatic subsets — so DPL's GS1-128 carries an SSCC alone, through the manual's UCC/EAN Code 128. The manual gives
its Data Matrix no FNC1, so a GS1 DataMatrix is refused. Labelize places a QR code and an EAN's guard bars a little
differently from the manual; the manual was followed and the difference kept in a test.

PPLA and PPLB still have neither a manual at hand nor an emulator, and the other printer items need a printer, so the
GS1 Logistic Label came next, in ZPL. Printing it whole through Labelary showed two things a test of one symbol had not:
`^A0`'s capitals are 0.78 of the height it is given, so every line of ZPL text had come out 22 % short of the height the
studio meant (2.2 mm as 1.7 mm, under the 2 mm the General Specifications ask); and GS1-128 sent a short run of digits
to code set B, so `^BC` printed it wider than the label made for it. Both were fixed first, each with a test that fails
without the fix; then the label itself: each symbol a `^BC` at the printer's dots, kept centred, the text and the rules
where the layout puts them.

## Session 9 — 2 November 2026: a 2D symbol on the GS1 Logistic Label

The handover's next step was the rest of item 4.1, starting with the 2D symbol section 6.6.4.1.1 places to the right of
the middle block. Drawing the labels to look at them first showed that an 18-digit SSCC at 7 mm is 102 mm wide in the
studio's font, wider than a 4 × 6 in label: its content ran off the edge. That was fixed first, the block's margin
narrowed to 2 mm and the content made just small enough to fit, below the 7 mm the specification recommends only there.

The 2D symbol is table 5's: GS1 DataMatrix, or a QR code or Data Matrix with the GS1 Digital Link URI, sized at
GS1-128's percentage of its own target, at the block's top right with its quiet zone clear; a line too wide for the
room beside it waits for the first row below. Printing it through Labelary showed something no test of a lone QR code
had: `^BQ` puts the symbol as far below `^FO` as the bar height `^BY` last set. After a GS1-128 at 300 dpi that was
375 dots, over the rule below; on its own, 10 dots, the default, on every QR label written so far. Zebra's guide says
nothing of it; a one-dot `^BY` before `^BQ` now keeps the symbol where the label puts it, and a test measures its top.

The same day the label was written in EPL2 too. Its text, measured through Labelize, showed EPL2's fonts with capitals
at three quarters of their cell, so every line of EPL2 text had come out a quarter short; that was fixed first, as
ZPL's had been. The label's own text then takes the printer's font that fits the room the layout gave it, since a
fixed pitch is wider than the layout's font. EPL2 cannot separate an element string of no predefined length from the
next, so a label whose symbol needs that is refused with the reason.

On 3 November the owner set the course for phase 4: no product or healthcare templates, as every place has its own
label; what matters is an editor where one or several barcodes and text blocks are placed, and perhaps one day
templates tied to a project. Two mock-ups were made on the real screen — the designer inside step 3, or a destination
of its own in three columns — and the first, which keeps the data, the export bar, the files in bulk and the phone's
layout, was built. The page is one Layout in units of its smallest module, so every export draws it; each barcode is
laid out as a symbol alone is, and each text block can carry fields from the data, which in bulk take each row's own.
The printer languages wait for a later step of the item.

## Sessions 10 to 13 — 3 November 2026: the designer prints, shapes, dates and a saved work

The designer's label went to ZPL and EPL2 next, each barcode written as the symbol alone where the page puts it and
checked to the dot through Labelary and Labelize. Doing so showed that every print file had ignored the human readable
text chosen (none, or the key alone) in ZPL, TSPL, EPL2 and DPL; that was fixed first, with a test that fails without
it, as every defect found on the way has been since. Lines and boxes followed: two mock-ups (a button for each, or one
**+ Shape**), the first taken under the owner's rule and then the second at the owner's choice. A date field in a
format, `{17:DD/MM/YYYY}`, came with each date offered in five formats; the month's abbreviation in Portuguese and
Spanish the same evening.

The owner then asked for the work to be saved on one's own computer, perhaps through the ZPL, opening a ZPL as Labelary
does (backlog 4.3). Every reload lost the work, so it came before the designer's images: **Save** writes a work file,
and the studio's own ZPL carries the same work in `^FX` comments, which Labelary prints exactly as without them. A ZPL
made elsewhere is refused: a printer's commands keep neither the fields nor the GS1 meaning of the data. A new element
made over another had gone unnoticed, the owner found; each one now lands 5 mm right and down from one at its corner.

## Sessions 14 to 18 — 4 November 2026: images, rotation, the last work kept, EPL2 and TSPL

Images are one-bit pictures as label printers print them, drawn as rectangles in SVG, PNG, PDF and EPS, and as `^GFA` in
ZPL, every dot compared with Labelary's print at 203 and 300 dpi. Rotation by quarter turns needed ZPL's field origins
measured first (`^FO` is the corner of the field as turned); ten symbols were printed upright and turned, and every dot
of each turned one is the upright one's. The last work is kept in the browser and offered again on the next visit, in
a bar under the header rather than a dialog; nothing comes back unasked.

EPL2 then took images (`GW`, raw bytes, so a print file may be bytes rather than text) and rotation, and TSPL the whole
designer. Where Labelize and the manuals differ — EPL2's bit for black, where a turned field's origin goes, TSPL's dot
fonts with capitals at three quarters of their cell — the manual was followed and the tests move or invert what Labelize
draws, each difference in sight; what Labelize cannot show, such as a turned QR code in TSPL, is refused.

## Sessions 19 to 24 — 6 November 2026: DPL, columns as fields, darkness and ZPL's compression

The designer in DPL counts in tenths of a millimetre from the label's bottom left corner; turning ITF-14's frame showed
that a size taken as the difference of two rounded edges prints a dot short, so sizes are rounded on their own again.
GS1-128 of an SSCC alone went to TSPL as `EAN128` once Labelize's source showed both readings of the manual print the
same symbol, which let the GS1 Logistic Label print in TSPL and DPL for an SSCC alone.

Then the parts of 4.2 that come from the data: a column holding no AI as a field, `{Produto}`, on a label of one's own
and in the bulk file names; an image's darkness from its grey levels; and ZPL's own ASCII compression for `^GF`, chosen
over `:Z64:`, which needs newer firmware, every field expanded by the guide's rules in the tests and printed through
Labelary.

## Sessions 25 to 35 — 7 November 2026: resizing, times, dithering and the keyboard

Eleven short sessions, each the handover's next step. Resizing by a handle at the element's corner, a barcode to the
sizes its environment allows: the first try followed the barcode's whole box, so a QR code at 150 % barely grew, which
the browser test caught. A date's time in a field (`hh:mm`, in lower case so that `MM` stays the month), times kept from
bulk cells and from Excel's date-time cells, and dates of birth whose year is written in full. Greys as dots for a
photo, each printer dithering the picture again at its own dots, since sampling a dithered picture printed a mid grey
21 % dark. The handle of an element past the label's edge held at the edge, in red. A second language for the GS1
Logistic Label's data titles, under each English title as 6.6.4.2 allows. Resizing and moving from the keyboard, with
what an arrow key did said in the hint. The browser tests found a phone bug on the way: a long barcode in the live
preview widened the page until the tab bar could not be tapped.

## Sessions 36 to 48 — 8 November 2026: six languages, the Syntax Engine's releases, the last open points

The handover had no unconditional step left, so each session took the recommended option under the owner's rule
unless the owner asked for something. The keyboard's order (**On the label** beside the chosen element, Escape back),
then times with AM or PM and harvest periods in bulk. The owner said there is no screen reader to test with and none is
to be targeted; that went into ADR 0003, what was built kept. At the owner's request the interface gained French, German
and Italian, everywhere a language enters, as Claude's drafts awaiting native speakers; then a grid and rulers in the
designer, turned on and off.

The owner asked whether CI could follow GS1's Barcode Syntax Engine. A weekly workflow now builds the dictionary and the
engine's messages again from a newer release's sources — byte for byte what the repository held for 1.4.1 — runs
`pnpm check` and opens a draft pull request, never merging by itself; the release that checked the data is named on the
screen and in the files made (backlog 0.6).

The last sessions closed points left open earlier: the GS1 Logistic Label's From and To wrapped within their columns,
3 mm when 3.5 mm leaves the label too short; a patient list's headers guessed in bulk, which showed that every name with
a space or an accent had been refused, since (7253) to (7259) and (4300) to (4320) take their characters
percent-encoded, so bulk and then One code write them as `%XX` and show them as people write them; and moving held
within the label, Left and Top typed still free. Session 45, at the owner's request, brought the README, this history
and the documents' index up to date. Session 46 held resizing within the label as moving was: dragging the corner or
the arrow keys make an element no larger than the label's edge allows, a barcode measured at each size with its text,
which keeps its size, so that its box is not simply in proportion; the properties typed stay free. Session 47 let
(7252)'s sex be typed as a word in any of the six languages, in One code and in bulk, a letter still refused since M
is male in English and female in Spanish. Session 48, taking up such names shown encoded under the symbols, read the
General Specifications instead: the HRI is the data as the barcode carries it (4.14), so it stays encoded, while the
GS1 Logistic Label's middle block, text with a data title and no AI, may show *Café Rio* (6.6.4.2, 4.14.1); and a space
should be a plus sign, not %20 (3.8.29), which the studio now writes. Session 49 broke a word too long for From or To
after its hyphen, slash or comma before its letters, never between two digits, so a postcode stays whole; session 50
kept two such marks in a row together, so that no line starts with one. By then the inventory held 1,149 tests in 47
files, and a full browser run passed 266 tests across a desktop, a phone and a tablet.

## Session 51 — 9 November 2026: crop marks

With no step waiting, the session took up what item 1.5 had left "for later, with the labels of phase 4", phase 4
being done: crop marks. The option puts the PDF and the EPS on a page 10 mm larger on every side, with two hairlines at
each corner of the label, 3 mm outside its edges so that they clear a 3 mm bleed, in process black like the rest of the
file rather than in registration colour; the PDF's TrimBox and BleedBox say where the label is. Bulk puts them around
each label's files and every page of the PDF of a label a page, but not on label sheets, whose labels are die-cut.
Poppler and Ghostscript draw each file in the tests, the symbol is read back, each mark is found where it belongs, and
nothing else is printed outside the label.

## Session 52 — 9 November 2026: the zip's PNG at the resolution chosen

The crop marks' session had noted that the zip's PNG kept the label's size whatever PNG resolution was chosen, while
the PNG button and bulk followed the choice. The zip now holds the same PNG as the button, and its README gives the
resolution, the whole pixels a module and the X-dimension and size the PNG then prints at, as the option's list says
them; with no choice the zip is byte for byte what it was.

## Session 53 — 9 November 2026: From and To's postcodes with a space and long numbers

Asked to read the handover and apply its corrections, the session found no correction written by the owner and took
up the defects session 50 had left in From and To. A postcode written with a space (*CEP 01310 200*) could be broken at
the space, leaving *200* alone on a line: numbers separated by a space now stay together while they fit a line, as a
postcode with a hyphen already did. And a number too long for its column, broken between its digits, could start a
line with its hyphen: the character before the mark now goes with it. A house number written just before the postcode,
with no comma, now goes to the postcode's line with it.

## Session 54 — 9 November 2026: the URI's own parameters in bulk

Asked to read the handover and continue, the session found no comment, pull request or issue waiting and took up a
gap item 1.17 had left on 30 October: the GS1 Digital Link URI's own parameters (a campaign, a language) could be
typed in One code but not given by the rows in bulk. Of two mock-ups — the parameter as a choice in a column's
**Goes to** list, or a separate block of names and columns — the first was built: a column goes to **URI parameter**,
named by its header, and a header written `?name` or `name=` goes there by itself. Each row's URI carries its own
value after the data attributes; a header of digits only, an empty one or a name given twice is refused at the
columns that hold them. Ten unit mutations and one browser mutation were caught.

## Session 55 — 9 November 2026: the marks a word starts with in From and To

The last open point of From and To: a word written with marks before it (*--Hortifrutigranjeira*, *,-Agroindustrial*)
was broken after them, so the marks ended the line before (*Doca 3 --*) or stood alone on one. They now stay with the
word. A first try kept them with it always, and on 4 × 6 in that broke *--Hortifrutigranjeira-* between its letters,
worse than before; so when the marks alone keep the word from fitting a line, it is broken after them as it was.
Nine unit mutations and one browser mutation were caught.

The same session then took up a reviewer's comment: in a GS1 DataMatrix, moving (17) above (10) changed neither the
data nor the text, because the editor always put the key's qualifiers right after it, the order a GS1 Digital Link
URI's path needs. An element string has no such order, and a variable-length AI such as (10) is best last, needing no
FNC1 after it. The rows' order, qualifiers included, is now the element string's in every symbol that carries one and in
its text; the URI, and the text under its symbol, keep the URI's order. A pasted element string keeps its order, and in
bulk the columns' order is the element string's. Thirteen unit mutations and one browser mutation were caught.

On 10 November the owner's comments on the new test plan brought three small fixes to the AI fields (the list closing
on Escape when opened from its arrow, a chosen name edited anywhere, a qualifier typed by its AI kept in its own list)
and a request to put sliders in place of the short lists among the label's options. Mock-ups of both showed sliders
cutting the options' names and implying an order the categorical choices do not have; the three choices of two to four
short options became rows of buttons instead, the longer ones staying lists.

On 11 November the owner reviewed the studio in twelve points, put in the backlog as phase 6. On 13 November, with the
Drive's connectors down, the session took phase 6's recommended order from the backlog: first the version under the
name, linking to About, and new releases found by themselves — an installed app brought back from the background had
kept the page it was opened with, since a service worker that takes over at once does not reload a page already open.
The page now asks for a new worker when it comes back to the screen and offers a reload when one has taken over.
