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
- GS1 DotCode is named in step 2 but not drawn: no independent decoder reads it back (ZXing does not), which every
  symbol needs before it is offered; tobacco unit packs get GS1 DataMatrix at table 12's size.
- In bulk (item 2.1): "One code | In bulk"; rows from a CSV, rows pasted from a spreadsheet or an Excel workbook, read
  without a library; each column's AI guessed from its header (an AI, a GS1 data title, common English, Portuguese and
  Spanish words) and remembered for files with the same headers; values the same on every row; dates as YYMMDD from
  Excel's dates and day-first forms; every row checked by the Syntax Engine, those in error listed, the label's preview
  stepping through the rows.
- The validation report (item 2.2): rows with errors, fixed, skipped or all, each with its reason and its cells, the
  cell at fault outlined and fixed in place without changing the file; a hint when Excel kept 15 digits of a code or a
  CSV wrote it in scientific notation; rows skipped one by one or all those in error; the report and the corrected
  rows as CSV.
- Headers written as AIs work for every AI (the owner's suggestion): "(01) GTIN", "(21) Número de série", "AI (17)",
  "(3103)" and decimal families such as "(310n)" go to that AI, whatever words follow the brackets.
- Every AI choice reads "(AI) abbreviation name" — identifier types ("(01) GTIN Product"), qualifiers ("(10)
  Batch/lot", "(235) TPX Third-party serialised extension"), attributes and the bulk columns — and the lists follow the
  order of that text, the AI's (item 1.10 b, the owner's request).
- The screen's calibration spans the label's card, so the bar fits at the slider's maximum; on a narrow screen the
  slider stops where the bar still fits; − and + move the bar by about half a pixel (item 1.10 c, the owner's report).
- The editor takes the whole width of the screen, and step 3 is rearranged (item 1.10 a, mock-up B of three, the
  owner's request): the label in its own area across the step, Fit, Real size and the scan test over it, an Export bar
  below it, the options below them in as many columns as fit.
- Zoom at the label canvas's lower right corner (the owner's request): −, the percentage (a click goes back to 100 %)
  and +, from 25 % to 400 % of the fitted label or of the real size, rulers included; Fit and Real size start at 100 %.
- The caption counts the modules (a 2D symbol's rows × columns and their total, a linear symbol's width from its first
  bar to its last) and the characters encoded, the FNC1 and the group separators included (the owner's request).
- Every GS1 identifier (item 1.11, General Specifications 26.0, section 1.3): the Made-to-Order GTIN (03), with its
  batch/lot or serial number, in a group of its own for element strings only, drawn in GS1 DataMatrix rather than a
  symbol for a URI; the attributes only element strings carry ((8014) HIDRI, (8040) IMEI, (8200) PRODUCT URL…), marked
  so; "+ Add qualifier" beyond the first four.
- An attribute's AI is typed or picked from a list whose arrow shows every AI even once one is chosen (a browser's
  datalist showed the chosen one alone); "Start over" in the header clears the data and every choice, asking first
  when rows are loaded.
- Generating in bulk (item 2.4): "Generate N labels" draws the label shown for every row ready or fixed, in one zip —
  a file a row (SVG, PNG, PDF, EPS) named by a pattern, one PDF a label a page, Avery label sheets or a custom sheet
  (labels at 100 %, centred, refused when larger), one ZPL file, and generated.csv listing every row and what was made
  of it or why nothing was.
- Qualifiers and data attributes in one list (item 1.15): "+ Add attributes" adds a row whose AI may be one of the
  key's qualifiers or any attribute; the qualifiers still go to the GS1 Digital Link URI's path in its own order.
- The GS1 Digital Link URI's own parameters (item 1.17): name=value pairs after the data attributes, percent-encoded;
  names of digits only are refused (they are AIs); kept when a URI is pasted.
- Several keys in one symbol (item 1.12): another key in the list says so and has its check digit checked; links add
  the pairings of the General Specifications (an SSCC with the GTIN it contains and its count, with a GTIN, the
  transport keys; a GTIN with a GRAI or GIAI); the other keys go to the URI's query string.
- Sequences made in the studio (item 2.3): serial numbers with a prefix and zeros in front, or SSCCs from an extension
  digit, a company prefix and a first serial reference, as rows or as a column added to a file's rows.
- The human readable text's place and height (item 1.16, General Specifications 4.14): below, above, split with the key
  below, left or right of the symbol; from 2 mm high, 3 mm for the GS1 Logistic Label.
- GS1-128 over several symbols (item 1.13): beyond 48 data characters or 165.10 mm, stacked symbols in order with the
  key in the first, each with its text; where a symbol starts can be chosen.
- Generating in bulk runs in a Web Worker with its progress and Cancel (item 2.5); labels are drawn about three times
  faster, with the same files out.
- QR Code's encoding mode (item 1.14): automatic, numeric, alphanumeric or byte for the whole data, and the URI's scheme
  and domain in capitals for alphanumeric mode.
- Digital signatures over the Web (item 1.18, GS1 Digital Signatures guideline 1.1.0, section 4): a JWS (ES256) of the
  code's data in JSON-LD, a security marking's code shown or to be read from the marking, the key made in the browser;
  GS1 product data and key credentials (data model 1.2.1) as JWTs.
- Writing NFC tags (item 1.19): the GS1 Digital Link URI or the EPC's link for NFC written through Web NFC and read back;
  elsewhere an NDEF file for a tag writer.
- ZPL catches up with the label (phase 3): the QR code's error correction level as chosen, GS1-128 over several
  symbols, the text above or split at its height; printer profiles (item 3.1) with the module in whole dots within the
  table's range, the print width checked and a test print with a 50 mm ruler.
- The GS1 Logistic Label (item 4.1): A6, 4 × 6 in, A5 or 6 × 8 in, with free text, data titles and the GS1-128 symbols,
  the SSCC lowest, in SVG, PNG, PDF and EPS, one at a time or in bulk.
- The interface in Brazilian Portuguese and Spanish besides English (item 1.20, ADR 0003): a language menu in the
  header, the browser's language on a first visit, the choice kept; every text of the page and every message of the
  core and of the GS1 Barcode Syntax Engine translated, checked by a test; the files made stay in English.
- Documentation by reader (ADR 0005): a user guide with screenshots, a printing guide, the core's API reference
  generated from its sources, a developer guide, the conformance to each standard, third-party licences and an index;
  every feature in `docs/features.md` with the commit that brought it and the tests that prove it; the inventory of
  every test (`docs/test-inventory.md`), drawn from a run; a test that keeps them in step, also run when only documents
  change.
- A design for phones and tablets (backlog 1.21, mock-up A of three), the computer's left as it was: on a phone, a
  tablet held upright or a narrow window, one destination at a time — Data, Scan, Label, Export, More — in a tab bar at
  the bottom, each keeping its scroll, a link to another opening it, a dot where there is an error; on a tablet held
  horizontally a navigation rail, the destination on the left and the label always on the right. About at the foot of
  the page: the repository, the Apache 2.0 licence, the manuals, the version (commit and date) and the software it is
  made with, each linked to its repository. The browser tests also run on a phone and a tablet. The README opens with
  a tour of the studio in screenshots and the manuals chapter by chapter.
- Installing on a phone: *Install the app* under More (the browser's dialog, or how on an iPhone or iPad), the home
  screen's name GS1 Label Studio; on a phone Start over is a round reload icon beside the live preview.
- TSPL and EPL2 with the printer's own commands (backlog 3.3 and 3.6), beside ZPL: a printer profile has a language;
  the Export bar's file, the test print and the bulk print file follow it. Every symbol is rendered by Labelize, an
  open-source emulator, and read back by ZXing in the tests; what no test reads back is refused with the reason. The
  studio says these files are checked in an emulator, not yet on a printer.
- DPL with the printer's own commands (backlog 3.7) for Datamax-O'Neil and Honeywell printers, from Datamax's Class
  Series 2 Programmer's Manual: EAN and UPC, ITF-14 with bearer bars, GS1-128 for an SSCC alone, Data Matrix and QR code
  with a GS1 Digital Link URI, text in the internal fonts; positions in tenths of a millimetre from the label's bottom
  left corner. Rendered by Labelize and read back by ZXing; GS1 DataMatrix, other GS1-128 and DataBar refused with the
  reason. Generic DPL profiles at 203 and 300 dpi.
- ZPL's human readable text at its capitals' height: `^A0`'s capitals are 0.78 of the height it is given, so the text
  came out 22 % short (2.2 mm as 1.7 mm, below section 4.14's 2 mm); it is now given 1/0.78 of it.
- ZPL's GS1-128 could print wider than the label made for it: a short run of digits in a value went to code set B (a
  count's "24": three codewords rather than one), and the width was the encoder's. An even run of digits now stays in
  code set C, and the width is counted from what `^BC` is given.
- The GS1 Logistic Label in ZPL (backlog 3.2, 4.1): each GS1-128 a `^BC` at the printer profile's dots, the text and the
  rules where the layout puts them; the Export bar's file, the test print and the bulk ZPL file. TSPL, EPL2 and DPL
  refuse it for now, with the reason.
- A label of one's own (backlog 4.2, mock-up A of two): in step 3, *Label* offers *A label of my own* — barcodes and
  text blocks placed on a page of any size, chosen and dragged on the canvas or set in the panel; text with `{AI}`
  fields filled from the data, so in bulk each row's label shows its own data; one layout, so SVG, PNG, PDF, EPS and the
  files in bulk draw it, every barcode read back. In ZPL and EPL2 since 3 November: each barcode with the commands of the
  symbol alone, its bars where the page puts them (to the dot through Labelary and Labelize), the text with `^A0` or `A`.
  Lines and boxes since 3 November (*+ Shape*: a line across or down, a box or a filled box): in ZPL with `^GB`, in
  EPL2 with `LO` and `X`. A date field in a format since 3 November: `{17:DD/MM/YYYY}`, `{17:DD MMM YYYY}`…, offered by
  *Insert a field from the data* with the date each gives; the month (`MMM`) in English, Portuguese or Spanish, chosen
  for each text block (*Month names*).
- The print files now carry the human readable text chosen for the label — every element string, the key's alone, or
  none — in ZPL, TSPL, EPL2 and DPL; until 3 November they printed every element string whatever was chosen.
- The work saved on one's own computer and opened again (backlog 4.3, 3 November): **Save** and **Open…** in the header
  (under More on a phone). The work file (`.gs1-work.json`) keeps the data, step 2's answers, the label's options with
  a label of one's own, the printer profile and, in bulk, the columns chosen; the ZPL downloaded carries the same work
  in `^FX` comments and opens too. A ZPL made elsewhere is refused, saying why.
- A new element on a label of one's own never lands exactly on another (3 November, the owner): where an element
  already has its corner, it goes 5 mm right and down, and again, so the person sees it was made.
- An image on a label of one's own (backlog 4.2, step d, 4 November; mock-up A of two): **+ Image** takes a PNG, JPEG,
  GIF, WebP or SVG file and places it 20 mm wide, as high as its proportions make it, in black and white as label
  printers print it (each pixel's grey over white below half way is dark; at most 600 pixels a side, a larger image
  scaled down); **Replace…** changes its file. Drawn in SVG, PNG, PDF and EPS; in ZPL as a graphic field (`^GFA`) at the
  printer's dots, in stripes when larger than one field, every dot checked through Labelary; kept in the work file.
  EPL2 refuses it for now (`GW` sends raw bytes, which the studio's text file does not carry).
- Rotation on a label of one's own (backlog 4.2, 4 November; mock-up A of two): **Rotation** 0°, 90°, 180° or 270° in
  the properties of a barcode, a text block or an image, which turns about its box, the box's top left corner kept.
  Drawn turned in SVG, PNG, PDF and EPS; in ZPL each field with its orientation (`R`, `I`, `B`) where the page puts it:
  every dot of each symbol the upright print's turned (GS1-128, EAN-13, UPC-E, ITF-14 with its bearer bars, GS1 DataBar
  Expanded, Limited, Stacked and Expanded Stacked, both Data Matrix) and a turned line of text's capitals to the dot,
  through Labelary at 203 and 300 dpi; an image is sent turned. A QR code stays upright (`^BQ` has no orientation); the
  studio's EPL2 file refuses a turned element for now. Kept in the work file.
- The last work kept in this browser (backlog 4.3 (c), 4 November; mock-up A of two): the work file kept in IndexedDB a
  moment after each change and when the page is left; the next visit asks in a bar under the header, with the time it
  was kept and the key's element string, whether to **Continue it** or **Start anew**, never bringing it back unasked
  and keeping nothing over it until answered. A first visit's work keeps nothing; Start over empties it.
- An image on a label of one's own in EPL2 (backlog 4.2, 4 November): `GW` at the image's corner with its dots as raw
  bytes, a dot whose bit is 0 black as Zebra says (Labelize, the emulator of the tests, prints them the other way round,
  so the tests invert them); the print file is then bytes, downloaded and joined in bulk unchanged. Every dot checked
  through Labelize at 203 and 300 dpi; not yet on an EPL2 printer.
- Rotation on a label of one's own in EPL2 (backlog 4.2, 4 November): a turned barcode or line of text with `A`'s and
  `B`'s rotation, its point of origin turned with it as the guide's figure 2 shows (Labelize places a turned field
  otherwise, so its tests move the origin); ITF-14's bearer bars turned with it; a turned Data Matrix refused (`b` has
  no rotation). Every dot of each symbol's bars checked through Labelize at 203 and 300 dpi.
- A label of one's own in TSPL (backlog 4.2, 4 November): each barcode as the symbol alone, each line of text with
  `TEXT` in the dot font whose capitals come nearest its height and that fits its width, lines and boxes with `BAR`
  and `BOX`, images with `BITMAP` (raw bytes, a dot whose bit is 0 black, as Labelize draws it). TSPL's text, the
  symbols' too, now has its capitals at the height asked: Labelize draws the dot fonts' capitals at 0.75 of their cell.
  Every barcode read back and every line, box and image dot checked through Labelize at 203 and 300 dpi.
- Rotation on a label of one's own in TSPL (backlog 4.2, 4 November): a turned barcode or line of text with
  `BARCODE`'s, `TEXT`'s and `DMATRIX`'s rotation, turned about its origin as the manual's own example prints it
  (Labelize places a turned field otherwise, so its tests move the origin); ITF-14's bearer bars turned with it; a
  turned QR code refused (Labelize does not turn it). Every dot of each symbol checked through Labelize at 203 and 300
  dpi.
- A label of one's own in DPL (backlog 4.2, 6 November): each barcode as the symbol alone, each line of text in the
  internal font whose capitals come nearest its height and that fits its width, lines and boxes as `X` records, each
  by its bottom left corner in tenths of a millimetre, its corner and size each rounded on its own. DPL's text, the
  symbols' too, now has its capitals at the height asked: Labelize draws the internal fonts' capitals at 0.72 of their
  cell, their top at the cell's. Every barcode read back and every line and box checked through Labelize at 8 and 12 dots a millimetre;
  an image refused (Labelize does not draw DPL's stored images).
- Rotation on a label of one's own in DPL (backlog 4.2, 6 November): a turned barcode or line of text with its
  record's rotation, turned about its bottom left corner as the manual's figure 8-1 shows (Labelize places a turned
  field otherwise, so its tests move it); ITF-14's bearer bars turned as rectangles; a turned Data Matrix or QR code
  refused (Labelize does not turn them). Every dot of each symbol's bars checked through Labelize at 8 dots a
  millimetre.
- Fixed (6 November): a label of one's own whose first barcode carries the GTIN alone (an ITF-14 or EAN/UPC with the
  data's other element strings unticked) was refused for those element strings, so nothing could be exported.
- GS1-128 of an SSCC alone in TSPL (6 November), on a label alone and on a label of one's own: `EAN128` with the
  SSCC's 20 digits, check digit included, the studio's text below; Labelize draws `EAN128` as ZPL's UCC case mode,
  and a printer that puts FNC1 before the digits as they come prints the same symbol. Read back through Labelize at
  203 and 300 dpi, turned too; other GS1-128 still refused in TSPL.
- The GS1 Logistic Label in TSPL and DPL (backlog 4.1, 6 November) for an SSCC alone, the element string their
  GS1-128 carries: laid out in the printer's dots as in ZPL and EPL2 (`logisticPage`) and written as a label of one's
  own, the 2D symbol beside the data too; a label with more data refused with the language's reason. Every symbol
  read back through Labelize, the SSCC's bars and the 2D symbol where the layout puts them.
- Fields bound to spreadsheet columns on a label of one's own (backlog 4.2, 6 November): in bulk, a text block's
  `{column}` field shows the row's cell under that header, offered in **Insert a field from the data** with the row
  shown's value for each column holding no AI; every row's label and print file with its own cells. A name in braces
  that no column has stays as typed (as any such text did before).
- File names from spreadsheet columns (backlog 4.2, 6 November): in bulk, **File names** takes any column's header in
  braces, such as `{Produto}`, for the row's cell, on any label; accents dropped. The message for an unknown name in
  the pattern is now translated too (it was shown in English).
- An image's darkness (backlog 4.2, 6 November): **Darkness** in an image's properties, a slider from lighter to
  darker (5 to 95 %), makes its black and white again from the file's grey levels, so a pale logo can print; the work
  keeps the threshold chosen, and after a reload **Replace…** with the same file lets it change again.
- Smaller ZPL for images (backlog 4.2, 6 November): every graphic field (`^GFA`) is written with ZPL's own ASCII
  compression — repeat counts, a row's trailing white or black filled by `,` or `!`, a repeated row as `:` — which
  every ZPL II printer reads; a logo's field is several times smaller, every dot printed as before (Labelary).
- Resizing by dragging a corner (backlog 4.2, 7 November): on a label of one's own the chosen element shows a handle
  at its bottom right corner; dragging it resizes the element, its top left corner kept — a box and a line to the
  corner, an image in its proportions, a barcode to the nearest size its scanning environment allows (its bars or
  modules following the corner), a text block to the nearest text height.
- A date's time in a field (backlog 4.2, 7 November): a date followed by a time, such as (7003) or (8008), takes `hh`,
  `mm` and `ss` after its date, `{7003:DD/MM/YYYY hh:mm}` → *31/12/2027 15:30*, offered by *Insert a field from the
  data*; a part the value lacks, as (7011) without its time, is left out with the text before it.
- Names offered for the file names (backlog 4.2, 7 November): in bulk, **Insert a name** under **File names** lists
  `{row}`, `{symbol}`, `{key}`, the first row's AIs and the columns holding no AI, each with the first row's value, and
  adds the one chosen at the end of the pattern.
- Greys as dots, for a photo (backlog 4.2, 7 November): a box under an image's **Darkness** dithers its greys by error
  diffusion, so a photo prints as dots rather than black and white areas; Darkness then darkens or lightens the greys;
  each print file dithers the picture again at the printer's dots, so a grey prints as dark as it is.
- The handle of an element past the label's edge (backlog 4.2, 7 November): it stays at the label's edge, where the
  element is cut, in red, instead of following the corner out of sight under the canvas's edge or the zoom buttons;
  dragging it puts the corner under the pointer, so the element shrinks back at once.
- A date of birth in a field (backlog 4.2, 7 November): (7250) DOB and (7251) DOB TIME, whose dates are YYYYMMDD,
  are offered by *Insert a field from the data* like the other dates, with the year as given (`{7250:DD/MM/YYYY}` →
  *15/01/1960*), and (7251) with its time; in bulk, `1960-01-15` and `15/01/1960` become 19600115, and (7251) keeps
  a time after them. A time after a YYMMDD date written day first, `31/12/2027 15:30`, is now dropped as after an ISO
  date.
- The phone's live preview of a long barcode, such as a GSRN's GS1 DataBar Expanded with a date of birth, is kept
  within the screen's width; it made the page wider than the screen and the tab bar could not be tapped.
- Resizing from the keyboard (backlog 4.2, 7 November): Tab reaches the chosen element's handle on a label of one's
  own, a hint under it says what the keys do, and each arrow key moves its corner half a millimetre, or 5 mm with
  Shift; a barcode and a text block go a size at a time.
- A date's time in bulk (backlog 4.2, 7 November): (7003), (4324), (4325), (7011) and (8008) keep a time after the
  date in a cell, `31/12/2027 15:30` → 2712311530, (8008) with its seconds; (7011), whose time is optional, leaves out
  a midnight exported with its seconds. An Excel workbook's date cell keeps the time its format shows; it was dropped.
- Data titles in a second language on the GS1 Logistic Label (backlog 4.1, 7 November): **Data titles also in**
  Portuguese or Spanish puts each data title's translation under the English one, and FROM's and TO's (General
  Specifications 6.6.4.2), in the drawing, the print files, bulk and the work saved; the translations are drafts.
- Moving from the keyboard (backlog 4.2, 7 November): Tab reaches the chosen element's outline on a label of one's
  own, just before its handle, a hint under it says what the keys do, and each arrow key moves the element half a
  millimetre, or 5 mm with Shift.
- What an arrow key did, said (backlog 4.2, 7 November): after an arrow key on the chosen element's outline or handle,
  the hint under it starts with the element's new place or size (and says when it has no larger or smaller size or
  runs past the label's edge), and a screen reader is told the same.
- The keyboard's order (backlog 4.2, 8 November): **On the label** beside the chosen element in the list takes the
  focus to its outline on the label, which comes before the panel, so that Tab no longer has to go back past the
  export; Escape on the outline or the handle brings it back to the element in the list.
- Grid and rulers (backlog 4.2, 8 November): on a label of one's own, **Grid and rulers** over the canvas turns on
  lines over the label every 1, 2, 5 or 10 mm as fine as its drawn size allows, stronger every 10 mm, and rulers in
  millimetres along its top and left with the chosen element's span marked on them; drawn only, never in the files;
  kept on or off in this browser.
- Times in bulk (backlog 4.2, 8 November): a cell's time may be on a 12-hour clock with AM or PM
  (`31/12/2027 8:05 PM` → 2712312005); an Excel cell whose format shows a time alone (`h:mm`, `h:mm AM/PM`) comes out
  as HH:MM or HH:MM:SS, as on a 24-hour clock, for a field on the label; it came out as a fraction of a day, and the
  built-in `mm:ss` formats as a date of 1899; (7007)'s harvest period is read from two dates in one cell,
  `01/09/2027 - 15/09/2027` → 270901270915.
- French, German and Italian (backlog 1.20, 8 November, the owner's request): the interface in Français, Deutsch and
  Italiano from the language menu, or a browser's French, German or Italian on a first visit, the core's and the
  Syntax Engine's messages included; the GS1 Logistic Label's **Data titles also in** French, German or Italian
  (EXPÉDITEUR, ABSENDER, MITTENTE…); a text block's **Month names** in French (JAN, FEV … DEC), German (JAN, FEB, MRZ
  … DEZ) or Italian (GEN, FEB … DIC); headers such as *Numéro de lot*, *Chargennummer*, *MHD*, *Scadenza* or
  *Quantità* guessed in bulk, and a harvest period with *au*, *à* or *bis* between its dates. A data title the second
  language writes as English does is no longer repeated under it. Drafts, to be reviewed by native speakers.
- The GS1 Barcode Syntax Engine's releases followed (backlog 0.6, 8 November, the owner's request): the dictionary and
  the engine's messages are made from a release's sources by `scripts/syntax-engine.mjs` (byte for byte what the
  repository held for 1.4.1); every Monday the workflow *Syntax Engine* checks npm for a newer `gs1encoder` and, when
  there is one, pushes a branch with the update and `pnpm check`'s result, opens a draft pull request listing the
  engine messages to translate and what else is left, and starts CI on it. The release that checked the data is named
  on the screen (*✓ Checked by the GS1 Barcode Syntax Engine 1.4.1*, linked to its notes; About, with the dictionary's
  date) and in the files made: the zip's README, the PDF's Producer and the EPS's Creator.
- The GS1 Logistic Label's From and To wrapped (8 November; an open point since 2 November): a line too long for its
  half of the label used to run on under the other column and past the page's edge; each is now broken between words
  within its column, a line of its own in the drawing, the files and every print language, at 3.5 mm or, when that
  leaves the label too short, at the 3 mm that 6.6.4.4 allows; a refusal then names shorter text among the cures.
- A patient list in bulk (8 November; an open point since 7 November): *GSRN* alone is guessed as (8018), the
  recipient's, and a date of birth, sex, names, address, birth order and SRIN from their words in the six languages or
  their data titles; a name or address whose AI is percent-encoded ((4300)–(4320), (7253)–(7259)) has its spaces and
  accents written as %XX for the barcode, where every accented name used to be refused, and a `{7254}` field shows the
  name as written.
- Moving held within the label (8 November; an open point since 7 November): dragging an element or moving it by the
  arrow keys used to carry it past the label's edge, where print files refuse it; it now stops at the edge, its corner
  on the last half millimetre that keeps it on the label, an element already past the edge is never moved further
  past it, and the arrow keys' hint says when the edge is reached. **Left** and **Top** typed still place it anywhere.
- Resizing held within the label (8 November; an open point since session 43): dragging an element's corner or the
  arrow keys on it used to make it as large as asked, past the label's edge, where print files refuse it; it now grows
  no further than the edge, a box or a line on the last half millimetre, an image at the width that keeps it on the
  label, a barcode (its text and quiet zones included) or a text block at its largest size that does; one already past
  the edge grows no further past it, and the arrow keys' hint says when the edge is reached. The properties typed still
  make it any size.
- Names and addresses as written in One code (8 November; an open point since session 42): a name or address whose AI
  is percent-encoded ((4300)–(4320), (7253)–(7259)) used to be refused for its first space or accent unless typed as
  %XX by hand; it is now typed as people write it and goes in the code as %XX, as in bulk, the row's hint showing the
  code's form; a pasted name is shown as people read it.
- A person's sex as a word (8 November; an open point since session 42): (7252) BIO SEX, ISO/IEC 5218's digit, is
  now also taken as a word in any of the six languages (*Feminino*, *male*, *männlich*, *Inconnu*, *Não aplicável*),
  in One code and in bulk, the hint showing the digit; a letter is still refused, as M is male in English and female
  in Spanish. The hint names the four codes and says *one digit*, not *1 digits*.
- Names and addresses as GS1 writes them (8 November; an open point since session 44): a percent-encoded AI's space
  now goes in the code as + rather than %20, as the General Specifications say it should (3.8.29, 7.11: "A space
  character should be encoded as a single plus symbol, +"): *Maria José* is *(7254) Maria+Jos%C3%A9*; a + already
  written is kept as a space, a plus sign meant as itself is typed %2B; a value written with %20 before is kept and
  still read. On the GS1 Logistic Label the middle block shows such a name as people read it (*Café Rio*), being text
  with a data title and no AI (6.6.4.2, 4.14.1); the HRI under the symbols keeps the value as the barcode carries it
  (4.14).
- The GS1 Logistic Label's From and To broken within a word (8 November; an open point since session 41): a word too
  long for its column, such as *Hortifrutigranjeira-Cooperativa* or *Rua Augusta,1500,Consolação*, is broken after a
  hyphen, dash, slash, comma or semicolon, the mark ending the line, before it is broken between its letters; never
  between two digits, so a postcode (*01305-100*), a decimal comma or a date stays whole.
- From and To: two marks in a row kept together (8 November; an open point since session 49): a word such as
  *Agroindustrial,-Belo* or *Hortifrutigranjeira--Cooperativa* is broken after the last of the marks, so that no line
  starts with a hyphen, slash or comma.
- Crop marks (9 November; left from item 1.5 until the labels of phase 4): the option *Crop marks* puts the PDF and
  the EPS on a page 10 mm larger on every side, with two 0.25 pt hairlines at each corner of the label, 3 mm outside
  its edges and 5 mm long, in process black; the PDF's TrimBox and BleedBox are the label. In the zip (its README says
  so) and in bulk, around each label's PDF and EPS and every page of the PDF of a label a page; never on label sheets.
- The zip's PNG at the resolution chosen (9 November; an open point of the crop marks' session): *Zip of all* took the
  PNG at the label's size whatever *PNG resolution* said, while the PNG on its own and bulk's took the choice. Now the
  zip's PNG is the same file as the PNG button's, and its README says so: *PNG: 300 dpi, 6 pixels a module, so it
  prints at X = 0.508 mm, …*, since a whole number of pixels a module can move the X-dimension and the size. Without a
  choice, the zip and its README are as before.
- Documentation brought up to date (8 November): the README's languages badge (six), test count, status, a tour stop
  for the designer and the GS1 Logistic Label, where the backlog stands, item 4.2 as dated sub-items, the development
  commands and workflows; the history from session 10 to 44; the documents' index, the user guide's summary,
  conformance's DPL heading and manuals, and the developer guide's layout.
- Decisions: ADR 0001 (browser-first architecture), ADR 0002 (printer output), ADR 0003 (scope and user experience).
