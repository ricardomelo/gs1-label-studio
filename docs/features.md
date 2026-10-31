# Features

Every feature of GS1 Label Studio, grouped by area, with what it does, the commit that brought it (oldest first in
[history.md](history.md)) and the tests that prove it: `file` names a test file — `packages/core/test/<file>.test.ts`
or, for `editor`, the browser tests `apps/web/e2e/editor.spec.ts` — and the words after it are found in the name of one
of its tests, listed in the [inventory of features](test-inventory.md)
([ADR 0005](adr/0005-documentation-and-feature-inventory.md); `packages/core/test/docs.test.ts` fails when a feature
names no test, or a test that does not exist).

How to use each feature: the [user guide](user-guide.md). How each is built: the [developer guide](developer-guide.md).
Which standard each follows: [conformance](conformance.md).

## Contents

- [Input and identification](#input-and-identification)
- [Where it is scanned: the guided choice](#where-it-is-scanned-the-guided-choice)
- [Symbols](#symbols)
- [The label's layout and its human readable text](#the-labels-layout-and-its-human-readable-text)
- [Seeing and checking the label](#seeing-and-checking-the-label)
- [Exports and prepress](#exports-and-prepress)
- [The GS1 Logistic Label](#the-gs1-logistic-label)
- [Printers and ZPL](#printers-and-zpl)
- [RFID and NFC](#rfid-and-nfc)
- [Digital signatures and verifiable credentials](#digital-signatures-and-verifiable-credentials)
- [In bulk](#in-bulk)
- [The application](#the-application)
- [Tests, indicators and documents](#tests-indicators-and-documents)

## Input and identification

| Feature | What it does | Since | Tests |
|---|---|---|---|
| GS1 Barcode Syntax Engine as the gate | Every input goes through GS1's own engine (`gs1encoder` 1.4.1): AI syntax, check digits, dates, associations; the data each symbol carries is derived from what it accepted, and bwip-js only draws | `eb549d0` | `syntax`: recognises element-string input · `syntax`: gives each symbology its data |
| Paste anything | A GTIN of 8, 12, 13 or 14 digits, an element string with or without brackets, a scanner's output with its symbology identifier and `{GS}` separators, or a GS1 Digital Link URI; the fields are filled in from it | `b9dab5d` | `syntax`: recognises scan input · `syntax`: takes a GTIN of 8, 12, 13 or 14 digits · `editor`: pasted scanner output fills the fields |
| Errors explained | The engine's message with the characters at fault marked (*day 00*, an illegal month) | `eb549d0` | `syntax`: explains errors and marks the characters at fault · `editor`: day 00 is explained |
| AIs named | Each AI with its GS1 data title; every AI choice reads "(AI) abbreviation name", in the GS1 order of the AI | `6b45da0` | `syntax`: names each AI with its data title · `editor`: AI choices read (AI) abbreviation name |
| Every identification key | The 16 GS1 Digital Link primary keys and, in element strings only, the Made-to-Order GTIN (03) with its batch or serial; (03) drawn in GS1 DataMatrix where a URI symbol was chosen, never in a URI | `d987b8a`, `b8caad3` | `identifiers`: offers the 16 GS1 Digital Link keys · `identifiers`: refuses it in a GS1 Digital Link URI · `editor`: the Made-to-Order GTIN (03) |
| The key's check digit | Checked as it is typed, saying which digit it should be; a GTIN typed in its own length | `d0e3cf6`, `bf334a4` | `identify`: says what the check digit should be · `checkDigit`: matches published keys · `editor`: a wrong check digit says which it should be |
| Qualifiers and data attributes in one list | + Add attributes adds a row whose AI list starts with the key's qualifiers; links add a qualifier at once; each row says path or query string; qualifiers go to the path in the syntax's order whatever the rows' order | `8d56534` | `identify`: sends a row with a qualifier's AI to the path · `editor`: qualifiers and a decimal attribute go into the URI as typed |
| Qualifiers that exclude each other | Two qualifier sets the key takes one or the other of (TPX with batch) said on the row and refused | `d0e3cf6` | `identify`: which exclude each other · `editor`: qualifiers and a decimal attribute go into the URI as typed |
| Decimal families | A net weight typed as `0,5` kg becomes (3103) 000500, as the resolver converted it; day zero in dates | `d0e3cf6` | `attributes`: decimal family 310n · `attributes`: day zero in (17) |
| Attributes of element strings only | (8014), (8040)–(8043), (8200)… offered and marked; kept for element string symbols, the URI saying why it cannot carry them | `d987b8a` | `identifiers`: offers the attributes of element strings only · `identify`: keeps an AI a GS1 Digital Link URI cannot carry |
| Every AI from the arrow | The attribute's AI field lists every AI even after one is chosen; typing filters | `b8caad3` | `editor`: the arrow lists every AI even after one is chosen |
| Several keys in one symbol | The pairings of General Specifications 4.13 offered as links (an SSCC with (02)+(37), (01), (8026)+(37), (401), (402), (403), (410); a GTIN with (8003) or (8004)); a row of another key checks its check digit; one key in the URI's path, the others in its query string; forbidden pairs refused by the engine | `eb75731` | `identify`: draws each pairing the General Specifications give · `identify`: the engine refuses the pairs the tables forbid · `editor`: several keys |
| The URI's own parameters | `name=value` pairs after the data attributes, percent-encoded; a name of digits only, a missing name or one given twice refused; taken from a pasted URI | `83b5cd3` | `identify`: follow the data attributes in the query string · `identify`: refuses a name made of digits only · `editor`: the GS1 Digital Link URI's own parameters |
| The URI's domain | Any domain in the GS1 Digital Link URI (`https://id.gs1.org` by default) | `87a745d` | `syntax`: uses another stem for the GS1 Digital Link URI |
| The URI coloured by part | Domain, key, qualifiers and data attributes in their colours, with Copy URI and the element string with Copy | `87a745d` | `editor`: qualifiers and a decimal attribute go into the URI as typed |
| The resolver's editor, ported | Key, qualifiers and attributes offered and converted as the resolver's portal did, checked against its answers | `d0e3cf6` | `attributes`: offers the same AIs · `attributes`: puts the same qualifiers in each key's path · `identify`: refuses with the resolver's codes |

## Where it is scanned: the guided choice

| Feature | What it does | Since | Tests |
|---|---|---|---|
| The decision tree | Figure 5-68 of the General Specifications, one question at a time, those the key answers left out, to one of the thirteen symbol specification tables | `17a09b0`, `28c25f7` | `guide`: reaches all thirteen tables · `guide`: asks one question at a time · `editor`: an SSCC in distribution |
| The symbols a table allows, one recommended | Section 2's carrier choices for the application in the standard's order; recommended: the first that carries all the data, or the EAN/UPC with a QR code (GS1 Digital Link) beside it; also allowed, in addition only, and not for this data with the reason | `17a09b0` | `guide`: lists every carrier and every symbol in addition · `guide`: at a retail till with a batch and a date · `editor`: at a retail till, a batch and a date |
| Retail rules for GS1 DataBar | At a till, DataBar Expanded carries everything only for a variable measure item; a case's GTIN-14 gets DataBar Omnidirectional | `c8924e1` | `guide`: GS1 DataBar Expanded carries the attributes of a variable measure item only · `editor`: a case's GTIN at a retail till |
| Logistic units and healthcare | An SSCC to GS1-128 at table 5; GS1 DataMatrix for hospitals, GS1-128 first in distribution | `17a09b0` | `guide`: a logistic unit: GS1-128 · `guide`: regulated healthcare |
| GS1-128's 48 data characters | Counted as section 5.4.4.3 does; beyond them GS1-128 is offered over several symbols | `17a09b0`, `eae3e94` | `guide`: allows 48 and refuses 49 · `gs1128`: counts data characters as section 5.4.4.3 does |
| Choose a symbol yourself | Every symbol with the key's scanning environments, starting from the guided choice and able to go back | `28c25f7` | `editor`: choosing the symbol yourself starts from the guided choice · `editor`: choosing ITF-14 yourself |
| Symbol specification tables 1 to 13 | Every row: X-dimension minimum, target and maximum, bar heights, quiet zones, quality, each tested against the standard's text | `86ff0c2` | `specifications`: has the printed rows, in their order, and no others · `specifications`: row 1: EAN-13 |
| The resolver's scanning environments | Ported and checked against the resolver's 2,970 answers | `5707969` | `environments`: answers the resolver's 2970 checks |
| Sizes within the range only | Only the table's sizes are offered, the target marked recommended | `5707969` | `environments`: offers the same sizes · `bars`: refuses a size outside the row's range |

## Symbols

| Feature | What it does | Since | Tests |
|---|---|---|---|
| EAN-13, EAN-8, UPC-A, UPC-E | Encoded as the resolver did, with guard bars, digits and quiet zones; UPC-E by zero suppression | `e7826a5` | `layout`: modules, guard bars, quiet zones, bar height and digits · `syntax`: zero-suppresses a GTIN-12 |
| ITF-14 | At ratio 2.5, bearer frame of 4.83 mm or bars of 2X, its 14 digits below at least 1.02 mm away | `a70e9ef` | `bars`: has a frame 4.83 mm thick · `bars`: ITF-14, table 2, bearer frame · `editor`: ITF-14 with its bearer bars |
| GS1-128 | At its table's sizes and minimum bar height, quiet zones of 10X, a symbol over 165.10 mm refused | `a70e9ef` | `bars`: keeps GS1-128's quiet zones of 10X · `bars`: GS1-128, table 5, an SSCC |
| GS1-128 over several symbols | Beyond 48 data characters or 165.10 mm, the element strings in as many symbols as needed, the key in the first, stacked; the person moves where a symbol starts | `eae3e94` | `gs1128`: keeps the order and the key first · `gs1128`: splits where a symbol would pass 165.10 mm · `editor`: GS1-128 beyond 48 data characters |
| The GS1 DataBar family | Omnidirectional, Truncated, Stacked, Stacked Omnidirectional, Limited, Expanded, Expanded Stacked; stacked rows grown to the table's height | `a70e9ef` | `bars`: GS1 DataBar Expanded Stacked, table 3 · `bars`: grows a stacked symbol's rows · `roundtrip`: databar-limited |
| GS1 DataMatrix | ECC 200, FNC1 first | `d4622a9` | `roundtrip`: gs1-datamatrix · `labelsvg`: GS1 DataMatrix in healthcare |
| QR code and Data Matrix with a GS1 Digital Link URI | The URI in a QR code (version, error correction) or a Data Matrix | `e7826a5` | `roundtrip`: dl-qrcode · `roundtrip`: dl-datamatrix · `labelsvg`: Data Matrix with a URI |
| QR Code's encoding mode | Automatic, or numeric, alphanumeric or byte for the whole data through node-qrcode; a character a mode cannot take named | `f9ae166` | `qrmode`: takes the version each mode's capacity gives · `qrmode`: refuses what a mode cannot encode · `editor`: QR Code's encoding mode |
| Scheme and domain in capitals | `HTTPS://ID.GS1.ORG` so that alphanumeric mode is possible; never the path or query | `f9ae166` | `qrmode`: writes a URI's scheme and domain in capitals · `qrmode`: alphanumeric, capitals in the domain |
| GS1 QR Code not offered | Encoded by the core but not offered in the editor, beside the QR code with a GS1 Digital Link URI (ADR 0003) | `e67e775` | `editor`: GS1 QR Code is not offered · `labelsvg`: GS1 QR Code, error correction H |
| GS1 DotCode named, not drawn | Listed for tobacco unit packs, GS1 DataMatrix recommended meanwhile: no decoder can check DotCode | `dffb560` | `guide`: tobacco unit packs · `editor`: tobacco unit packs |
| Tables 12 and 13 | 2D symbols of tables without a scanning environment laid out at their row's X-dimension | `a70e9ef` | `bars`: a 2D symbol of a table without a scanning environment |
| Every symbol read back | Every symbol encoded, rasterised and read by ZXing: symbology identifier and data | `d4622a9` | `roundtrip`: encode, rasterise and read back · `roundtrip`: refuses a wrong check digit |

## The label's layout and its human readable text

| Feature | What it does | Since | Tests |
|---|---|---|---|
| The resolver's layout | A 2D symbol with its quiet zone and text, an EAN/UPC beside it, sizes by scanning environment; positions equal to the resolver's within 1e-9 | `e7826a5` | `layout`: the label's layout, as the resolver placed it · `labelsvg`: QR code with a GS1 Digital Link URI and an EAN-13 beside it |
| Text as outlines | Liberation Sans glyph outlines drawn as fontTools does, so the SVG needs no font; or real text | `e7826a5` | `layout`: case 0 · `labelsvg`: text as outlines |
| Python's rounding | Ties to even, so the SVG matches the resolver's byte for byte | `e7826a5` | `pyformat`: breaks exact ties to even · `pyformat`: 200 000 values |
| Text placed | Below, above, split (key below, attributes above), left or right; clear of the quiet zone; ITF-14 and EAN/UPC digits where the standard puts them | `3e9fb4d` | `hriplace`: text above the symbol · `hriplace`: keeps a 2D symbol's text below or above when an EAN/UPC is beside it · `editor`: the human readable text above, split, left or right |
| Text height | From the 2 mm minimum to 5 mm; 3 mm for the GS1 Logistic Label | `3e9fb4d` | `hriplace`: sizes the text from 2 mm, and refuses less |
| Text under bars | GS1-128's and DataBar's element strings on as few lines as the width allows, never broken | `a70e9ef` | `bars`: puts the element strings under the symbol on as few lines as its width allows |
| The symbol described | The SVG's description and the README say the X-dimension, table, bars, quiet zones and bearer bars | `a70e9ef` | `bars`: describes the symbol in the SVG and the README |

## Seeing and checking the label

| Feature | What it does | Since | Tests |
|---|---|---|---|
| Live preview | The label redrawn as anything changes, beside the identification | `87a745d` | `editor`: qualifiers and a decimal attribute go into the URI as typed |
| The label's own area | Step 3 across the screen: the canvas with its tools over it, the Export bar below, the options under them | `9aa4493` | `editor`: the label in its own area across step 3 |
| Zoom | − and + from 25 % to 400 %, back to 100 % on a click or a change of view | `3e860d0` | `editor`: zoom in and out on the label's canvas |
| The caption's counts | The modules (rows × columns, or the width) and the characters encoded, FNC1 and group separators included | `430cea3` | `syntax`: counts an element string's FNC1 · `editor`: the caption counts the modules |
| Real size | 1:1 between rulers in millimetres | `fafb40f` | `editor`: at real size the label is drawn between rulers |
| Screen calibration | Against a bank card's short side, the slider within the room, − and + by half a pixel; kept in the browser | `31ef92a` | `editor`: at the screen's calibration |
| Scan test | The label drawn and read by ZXing in the browser, each symbol compared with what it should carry; nothing leaves the browser | `ac0629b`, `fafb40f` | `editor`: the scan test reads the label back as intended |

## Exports and prepress

| Feature | What it does | Since | Tests |
|---|---|---|---|
| SVG | At real size in millimetres, text as outlines or as text | `e7826a5` | `labelsvg`: the label's SVG, drawn and read back · `roundtrip`: sizes the SVG in millimetres |
| PNG | 12 pixels a module with its dpi recorded, as the resolver's | `c5a6ce2` | `render`: PNG: the resolver's size |
| PNG at a chosen resolution | 300, 600 or 1200 dpi, a whole number of pixels a module, the X-dimension it prints at said | `af29b21` | `prepress`: takes the whole number of pixels a module · `editor`: a PNG at a chosen resolution |
| PDF | One page the label's size, vector, text as outlines, written without a library | `c5a6ce2` | `render`: PDF: the resolver's page |
| PDF of several pages | One page a label, each its size; one page gives labelPdf's bytes | `cdcb24a` | `batch`: writes each page its size |
| EPS | The PDF's drawing under a PostScript prolog, read back through Ghostscript | `af29b21` | `prepress`: drawn by Ghostscript and read back |
| Process black (100 % K) | PDF and EPS in DeviceCMYK 0 0 0 1, no grey | `af29b21` | `prepress`: paints the PDF and the EPS in DeviceCMYK |
| Bar width reduction | 0.010 to 0.050 mm off every bar of a linear symbol, bearer bars untouched, said in the SVG and the README | `af29b21` | `prepress`: narrows every bar of a linear symbol · `prepress`: leaves ITF-14's bearer bars as they are · `editor`: a bar width reduction narrows the bars |
| Zip of all | SVG, PNG, PDF, EPS and a README of the data, the symbol, its sizes and how to print | `c5a6ce2` | `render`: zip: SVG, PNG, PDF · `editor`: the label downloads as SVG, PNG, PDF, EPS and zip |
| File names | After the symbol, the key and its qualifiers | `ee95083` | `editor`: named after the key |

## The GS1 Logistic Label

| Feature | What it does | Since | Tests |
|---|---|---|---|
| The GS1 Logistic Label | For an SSCC, General Specifications 6.6 in A6, 4 × 6 in, A5 or 6 × 8 in: free text, data titles over 7 mm contents, GS1-128 with 3 mm text, the SSCC alone lowest | `3644f13` | `logistic`: is the page's size, its SSCC alone in the lowest symbol · `logistic`: reads back every symbol · `editor`: the GS1 Logistic Label |
| Refused when it cannot be right | Data without an SSCC, a symbol wider than the page, more than the page holds | `3644f13` | `logistic`: refuses data without an SSCC |

## Printers and ZPL

| Feature | What it does | Since | Tests |
|---|---|---|---|
| The printer's dot grid | X-dimensions as whole numbers of dots, only those within the table's range | `d4622a9` | `dots`: prints an EAN-13 at 100 % · `dots`: offers only the dot counts within a symbol specification table's range |
| ZPL with the printer's own commands | `^BE`, `^B8`, `^BU`, `^B9`, `^B2`, `^BC` mode N with FNC1, `^BX`, `^BQ`, `^BR`; reserved characters through `^FH`; every symbol printed by Labelary and read back | `3605071` | `zpl`: gives the printer the digits it expects · `zpl`: writes GS1-128 with FNC1 and code sets chosen here · `labelary`: ZPL printed by Labelary and read back |
| ZPL templates | `{{01}}`, `{{10}}`… or `{{URI}}` described in `^FX` comments; filled, they give the label back | `3605071` | `zpl`: makes a template whose filled placeholders give the label back · `labelary`: template of gs1-128 |
| GS1 QR Code refused in ZPL | `^BQ` has no FNC1 | `3605071` | `zpl`: refuses a GS1 QR Code |
| GS1 DataBar and ITF-14's bearer bars in ZPL | `^BR` with what it cannot print as the table asks refused; bearer bars as `^GB`, digits below | `95b5894` | `zpl`: gives ^BR the GTIN's first 13 digits · `zpl`: refuses what ^BR cannot print · `labelary`: ITF-14 with bearer bars as a frame |
| QR code at the label's level | `^BQ` at the error correction level chosen; one encoding mode refused with Labelary's evidence | `fd93dcd` | `zpl`: writes ^BQ at the error correction level chosen · `labelary`: a QR code at level Q or above |
| GS1-128 stacked in ZPL | A `^BC` a symbol, stacked as on the label | `de66a5b` | `gs1128`: stacks a ^BC a symbol · `labelary`: GS1-128 in two symbols, stacked |
| ZPL's text | At the label's height, below, above or split; beside refused | `807c602` | `zpl`: writes the text above, or split · `labelary`: gs1-128 with its text |
| Images in stripes | An image larger than a graphic field (99,999 bytes) sent as stripes | `fb903f6` | `roundtrip`: splits an image larger than a graphic field into stripes · `labelary`: prints an image (a logo) larger than one graphic field |
| Printer profiles | Generic profiles at 152 to 600 dpi, 104 mm, and one's own kept in the browser; a label wider than the printer refused | `a5e261d` | `printer`: checks a profile and the label's width · `editor`: printer profiles |
| The module in whole dots | The dots within the table's range, the nearest by default; said when none fits | `a5e261d` | `printer`: offers the dots within the range · `printer`: says when no whole number of dots lies within the range |
| Test print | A 50 mm ruler with ticks every 10 mm and the settings under the label | `a5e261d` | `printer`: adds a 50 mm ruler · `labelary`: a test label: the symbol reads and the ruler is 50 mm |

## RFID and NFC

| Feature | What it does | Since | Tests |
|---|---|---|---|
| EPC for every key with a scheme | SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GSRNP, GDTI, SGCN, CPI, ITIP, as the resolver encoded them, read back by epc-tds | `bb47487`, `6e50f32` | `epc`: EPC, as the resolver encoded it · `epc`: EPC read back by an independent decoder · `editor`: the EPC asks for a serial number |
| The tag's hexadecimal | Filled to 16-bit words as on the tag (TDS 2.3); base 64, tag URI, pure identity URI, NFC links /eh and /ex | `bb47487` | `epc`: tries the same schemes for each key · `epc`: starts the company part after a GTIN's indicator |
| GS1's GCP length table | Loaded once, kept in the browser, gives the prefix's length | `bb47487` | `epc`: reads the list and finds the longest prefix · `editor`: GS1's GCP length table |
| NDEF URI records | NFC Forum URI RTD, the prefix abbreviated, short and long records | `14a1449` | `ndef`: abbreviates https:// as code 4 · `ndef`: writes a long record |
| Writing an NFC tag | Through Web NFC, read back to check; elsewhere the NDEF file | `14a1449` | `editor`: NFC: without Web NFC, the NDEF file |

## Digital signatures and verifiable credentials

| Feature | What it does | Since | Tests |
|---|---|---|---|
| The signed payload | The GS1 Digital Signatures guideline 1.1.0 figure 4-7: JSON-LD with the URI as id, GTIN, serial, batch, dates as xsd:date (century by 7.12), names, a security marking | `2336514` | `sign`: is figure 4-7's JSON-LD · `sign`: dates YYMMDD as section 7.12 chooses the century |
| JWS with ES256 | A key made in the page (Web Crypto), its RFC 7638 thumbprint as kid; verified before it is offered and by Node in the tests | `2336514` | `sign`: writes a compact JWS with ES256 · `sign`: refuses a payload changed after signing · `editor`: digital signature |
| Security marking workflows | The marking's code shown (workflow 2) or taken out (workflow 3), checked against its pattern | `2336514` | `sign`: workflow 3 · `sign`: checks a marking's code against its regular expression |
| Saved keys | A key saved as a JWK and taken back, with the same kid | `2336514` | `sign`: takes back a key the person saved |
| GS1 verifiable credentials | Key and product data credentials of the data model 1.2.1 as JWTs for an issuer's DID | `2336514` | `sign`: writes the key and product data credentials |

## In bulk

| Feature | What it does | Since | Tests |
|---|---|---|---|
| Rows from CSV, Excel or a paste | Comma, semicolon or tab; RFC 4180 quotes; Excel's first worksheet read without a library, numbers to 15 digits, dates | `2bf990e`, `0911949` | `table`: reads a CSV with quotes · `table`: reads the first worksheet of a workbook · `editor`: in bulk: an Excel workbook's rows |
| Columns guessed | From an AI, a GS1 data title, or English, Portuguese and Spanish words; a header written as an AI always goes to that AI | `2bf990e`, `09079de` | `bulk`: Código de barras → (01) · `bulk`: AI (17) expiry → (17) |
| Cells normalised | Dates to YYMMDD from ISO and day-first forms | `2bf990e` | `bulk`: writes dates as YYMMDD |
| Each row checked | By the Syntax Engine, numbered as the spreadsheet numbers it; fixed values last | `2bf990e` | `bulk`: checks every row of a workbook with the Syntax Engine · `bulk`: takes the key, its qualifiers and the attributes, with the fixed values last |
| Columns remembered | For files with the same headers, in this browser | `0911949` | `editor`: the columns remembered for the same headers |
| The validation report | Rows with errors, fixed, skipped or all; the cell at fault outlined and fixed in place; skip, include, undo | `afdb79e`, `e4133f7` | `report`: finds the column of the AI the error names · `report`: fixes a cell without changing the file · `editor`: in bulk: the validation report |
| Hints on spoilt values | Excel's 15 digits, scientific notation in a CSV | `afdb79e` | `report`: says when Excel kept 15 digits of a long code |
| Report and corrected rows as CSV | RFC 4180, each row's status, reason, columns at fault and values; the file's rows with the fixes | `afdb79e` | `report`: writes each row's status · `report`: writes the file's rows with the fixes |
| Serial numbers and SSCCs made here | Serial numbers (prefix, padding, first, step) or SSCCs (extension, company prefix, reference, check digit), as rows or as a column | `7a1400d` | `sequence`: writes the prefix and the number padded · `sequence`: fills the serial reference to 17 digits · `editor`: in bulk: SSCCs made as rows |
| Generate N labels | One design for every row: a file a row by a name pattern, one PDF, label sheets, one ZPL file, generated.csv | `cdcb24a`, `23756ff` | `batch`: makes each row's files · `batch`: replaces the row, the symbol, the key's value and any AI · `editor`: in bulk: Generate N labels |
| Label sheets | Avery L7160, L7163, L7651, 5160 and custom sheets; labels at 100 % centred, never scaled, from any place | `cdcb24a` | `batch`: describes each sheet offered · `batch`: never scales a label · `batch`: lays the labels row by row from the place given |
| In a Web Worker | Progress and Cancel, the page usable; three times faster with the same bytes | `ea35c58`, `ab51bab` | `editor`: generating thousands of labels shows its progress and can be cancelled · `pyformat`: 200 000 values |

## The application

| Feature | What it does | Since | Tests |
|---|---|---|---|
| Everything in the browser | No server; the engine, the encoder and the reader run in the page; no request leaves it | `5d0566f` | `editor`: the scan test reads the label back as intended |
| Offline | A service worker the build writes keeps every file; installable | `4ea0174` | `editor`: works offline once loaded |
| Phone and desktop | The whole width; on a phone the fields first and a live preview fixed at the top | `87a745d`, `9aa4493` | `editor`: the page fits the screen's width |
| One code or in bulk | A mode of the editor; steps 2 and 3 shared | `0911949` | `editor`: in bulk: pasted rows |
| Start over | Clears the data and every choice, as on a first visit | `b8caad3` | `editor`: Start over clears the data |
| Three languages | English, Brazilian Portuguese and Spanish from a menu in the header, the browser's language on a first visit, the choice kept; the page redrawn in place, what was typed kept (ADR 0003) | this delivery | `editor`: the interface in Brazilian Portuguese and Spanish · `editor`: a browser in Portuguese opens the studio in Portuguese · `i18n`: chooses the browser's language |
| Every text translated | Every text of the page and every message of the core and of the Syntax Engine in each language, with the same placeholders; messages translated by template where they are shown; the engine's and the keys' texts from the resolver | this delivery | `i18n`: every text of the page · `i18n`: every message of the core and of the Syntax Engine · `i18n`: translates a core or engine message by its template |

## Tests, indicators and documents

| Feature | What it does | Since | Tests |
|---|---|---|---|
| ZPL through Labelary in CI | ZPL rendered by labelary.com and read back by ZXing; retried when Labelary asks to slow down | `6733059`, `14c2704` | `labelary`: ZPL printed by Labelary and read back |
| Fixtures from the resolver | The resolver's own answers, written by its Python, as fixtures | `5707969` | `environments`: has the same tables, sizes and symbols · `render`: render 0 |
| The documentation kept in step | The core's API reference generated and checked; features naming tests; the developer guide's counts; links | `4f9815f` | `docs`: is what the sources give · `docs`: every feature names at least one test · `docs`: counts each test file's tests · `docs`: lead to files that exist |
