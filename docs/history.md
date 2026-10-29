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
