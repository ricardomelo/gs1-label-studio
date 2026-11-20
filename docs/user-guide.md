# GS1 Label Studio — user guide

How to make GS1 barcodes and labels with the studio, step by step: one code at a time or thousands from a
spreadsheet, as files for artwork or as print files for label printers. The studio is at
<https://ricardomelo.github.io/gs1-label-studio/>; it runs in your browser, and nothing you type or load leaves your
computer.

Every feature named here is listed in [features.md](features.md) with the tests that prove it. How to send the files to
a printer or to prepress: the [printing guide](printing-guide.md). The words used: the [glossary](#18-glossary).

## Contents

1. [What the studio does](#1-what-the-studio-does)
2. [The screen at a glance](#2-the-screen-at-a-glance)
3. [Step 1 — what the code identifies](#3-step-1--what-the-code-identifies)
4. [Step 2 — where it is scanned](#4-step-2--where-it-is-scanned)
5. [Step 3 — the label](#5-step-3--the-label)
6. [The label's options](#6-the-labels-options)
7. [Seeing it at real size, and the scan test](#7-seeing-it-at-real-size-and-the-scan-test)
8. [Exporting the label](#8-exporting-the-label)
9. [The GS1 Logistic Label](#9-the-gs1-logistic-label)
10. [Printer (ZPL, TSPL, EPL2, DPL, PPLA, PPLB)](#10-printer-zpl-tspl-epl2-dpl-ppla-pplb)
11. [RFID and NFC (EPC), and NFC tags](#11-rfid-and-nfc-epc-and-nfc-tags)
12. [Digital signature (GS1, JWS)](#12-digital-signature-gs1-jws)
13. [In bulk: rows from a spreadsheet](#13-in-bulk-rows-from-a-spreadsheet)
14. [In bulk: the validation report](#14-in-bulk-the-validation-report)
15. [In bulk: sequences and generating every label](#15-in-bulk-sequences-and-generating-every-label)
16. [Shortcuts worth knowing](#16-shortcuts-worth-knowing)
17. [Messages and what to do](#17-messages-and-what-to-do)
18. [Glossary](#18-glossary)

## 1. What the studio does

- **Right by construction.** You say what the code identifies and where it is scanned; the studio follows the GS1
  General Specifications (release 26.0) to the symbol specification table, offers only the symbols that table allows
  and only the sizes within its range, recommends one, computes or checks every check digit, and places quiet zones and
  human readable text where the standard puts them.
- **Paste anything.** A GTIN, an element string with or without brackets, a GS1 Digital Link URI or what a barcode
  scanner types: the GS1 Barcode Syntax Engine — GS1's own — recognises it, names each Application Identifier (AI) and
  explains what is wrong in plain words.
- **Every GS1 symbol it can check.** EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, GS1-128 (over several symbols when the data
  is long), the GS1 DataBar family, GS1 DataMatrix, and the QR code and Data Matrix with a GS1 Digital Link URI; every
  symbol is read back by an independent decoder in the tests. GS1 DotCode is named but not drawn (no decoder is
  available to check it), and GS1 QR Code is not offered (beside the QR code with a GS1 Digital Link URI it confuses;
  [ADR 0003](adr/0003-product-scope-and-ux.md)).
- **Files for artwork and for printers.** SVG, PNG, PDF and EPS at real size, a zip of all, and ZPL II, TSPL, EPL2
  and DPL with the printer's own commands, PPLA and PPLB for Argox printers (ZPL also as a template with placeholders).
- **Labels.** The GS1 Logistic Label for an SSCC, and a label of your own: barcodes, text with fields from the data,
  lines, boxes and images placed, turned and resized (section 5). The work is saved as a file and opened again
  (section 8), and the last one is offered again on your next visit.
- **In bulk.** Rows from CSV, Excel or a paste; each row checked, fixed or skipped; serial numbers and SSCCs made for
  you; a file a row, one PDF, laser label sheets, one ZPL file and a CSV of what was made.
- **RFID, NFC and signatures.** The EPC of the key for RFID and NFC tags, an NFC tag written from a phone, and a GS1
  digital signature of the code's data.
- **Private and offline.** Everything runs in the page. After the first visit the studio works without a connection,
  and it can be installed as an application from the browser's menu.

The studio speaks English, Brazilian Portuguese, Spanish, French, German and Italian (section 2); this guide is in
English.

## 2. The screen at a glance

### The start page: the studios

![The start page: the Label Studio, the Barcode Studio and the Check Studio, the RFID Studio coming soon](images/guide/start.png)

The address of the tool opens on its studios. **Label Studio** opens the editor below with the kinds of label shown;
**Barcode Studio** opens the same editor with the barcode alone; **Check Studio** checks a code you already have (see
below). The **RFID Studio** is marked *Coming soon*. Each studio has its own address, to bookmark or to open from the
installed application's shortcuts: `#/label`, `#/barcode`, `#/check`. The name in the header always leads back to the
studios; the browser's Back and Forward move between them, and what you typed in the editor is kept while you look at
another studio.

### The Check Studio: is a code right?

![The Check Studio with the worked example: the verdict, what the code says and three cards](images/guide/check.png)

1. Open **Check Studio** on the start page (or `#/check`). Under **Read a code**, four buttons choose how the code
   comes in: **Camera**, **Picture**, **Tag** and **Type or paste**. A phone or a tablet opens on the camera, a
   computer on the text.
2. With **Camera**, press **Start the camera** and allow it when the browser asks; point it at the code, which is read
   by itself, with a tone and a vibration where the phone allows. The result opens below and the camera pauses;
   **Scan another** starts it again. Where the phone offers them, **Torch** lights the code and **Zoom** brings it
   closer. The camera also stops when you switch to another tab or leave the studio, and no picture of it is kept. If
   the camera is refused or missing, the studio says so and offers a picture instead.
3. With **Picture**, press **Take or choose a picture** (on a phone this can take a photograph), or drop a picture on
   the box, or paste one anywhere in the studio (Ctrl+V). Every symbol found is outlined on it and numbered, coloured by
   its verdict; when there are several, choose one in the list under the picture to see its result. When none is
   found, the studio says what it cannot read: a GS1 DotCode, and the 2D part of a Composite symbol, which no decoder
   here reads (for an EAN-13, a GS1-128 or a GS1 DataBar read this way, *What was not checked* says so).
   **There is a code here that is not read** records that, with fault A9 (*This type of symbol cannot be read here*).

![A picture of three symbols: each outlined, numbered and coloured by its verdict, the second chosen](images/guide/check-picture.png)

4. With **Tag**, read an NFC tag or an RFID tag's EPC. On an Android phone with Chrome, press **Read an NFC tag** and
   hold the tag to the back of the phone: every record on it is listed, and its link is checked (a link that is not
   the tag's first record, or not https, is reported). Other browsers cannot read NFC tags; the screen says so: on an
   iPhone, hold the tag near the top of the phone, which opens its link, and paste that link under **Type or paste**;
   or press **Open an .ndef file** for the file an NFC app saved. For an RFID tag, paste its EPC as hexadecimal
   (`3034…`) or as a URI (`urn:epc:…`), or read it with an RFID reader set as a keyboard: the key and the serial it
   carries are shown, and its GS1 Digital Link URI in the expert view.
5. With **Type or paste**, under **What the code holds**, paste or type what the code carries, or scan it with a scanner connected as a
   keyboard. A separator can be typed as `<GS>`, `{GS}` or `\x1D`. **Try an example** fills in the example of the
   project: an ordinary Data Matrix with the brackets encoded and a month 13.
   A scanner connected as a keyboard is recognised by its speed: the code is checked as soon as it sends Enter, and
   *Read from a scanner in keyboard mode* says so. When the scanner sends no symbology identifier, the studio asks
   which symbol it was and says how to switch on the scanner's *AIM ID* setting. When a separator seems missing, the
   card says the code may lack it or the scanner may drop it, and how to set the scanner up. When the scanner types on a
   different keyboard layout (`+d2…` or `$d2…` instead of `]d2…`, or French AZERTY's `&é"'(` instead of digits), the
   studio offers what it meant: **Use this**.
6. Under **The symbol it came from**, say which symbol it was, when you know; a scanner that sends its symbology
   identifier (`]d2`, `]Q3`, `]C1`…) at the start says it by itself. *Not known* lets the data decide.
7. Under **Where is it scanned?**, choose the place: a shop, a medicine or medical device (then the pharmacy, the
   pharmacy and warehouse, or a hospital), a case, a pallet, the part itself, a phone, an asset, or *I do not know*.
   Changing it checks the same data again. Without it, whether the symbol suits its place is listed as not checked.
8. **The result** opens in the **Simple** view: the verdict with its icon and word (*Follows the GS1 rules*, *Works,
   with remarks*, *Does not follow the GS1 rules*, *Not a GS1 code*), what the code says (each data title in your
   language with its value, a date written out), then a card per problem, the worst first, each saying what is wrong,
   where (the code's text with the part highlighted), why it matters and how to fix it, and who does it. When the data
   can be made right, **Make it right** opens the Barcode Studio with it. **What was not checked** ends the list; print
   quality is never graded here, since that needs a barcode verifier.
9. **Expert** shows the same result in detail: the reading (the symbology identifier and the repairs tried), the raw
   bytes in hexadecimal and as text with the problems' bytes highlighted and three copy buttons, the element strings,
   the other syntaxes (bracketed, the engine's notation, the GS1 Digital Link URI) when the data is valid, each finding
   with its code, the General Specifications sections, the GS1 Barcode Syntax Engine's own message in English beside
   its translation, the context, and the versions that checked it.

![The expert view of the same result](images/guide/check-expert.png)

10. To check several codes of one item together (a pack's 2D symbol and its EAN-13, a barcode and its RFID or NFC
    tag), press **Add another code from this item** under the result, then read the next code in any way: a code read
    by the camera, a picture, an NFC tag or a scanner joins by itself; a code typed or pasted joins on **Add this code
    to the item**. A picture or a camera frame with several symbols offers **Check all … as one item**. **The codes of
    this item** lists them, numbered; untick one to leave it out, or **Remove** it, and the group is checked again.
    Under **What is this item?** say whether it is a consumer pack, a case, a logistic label or a tag with its printed
    code (the studio guesses until you choose: the rules differ). The group's verdict comes first, then **What each code
    says**: one row per detail and one column per code (on a phone, a card per detail), the values that disagree
    marked; values are compared character by character, though a GTIN-13 padded to 14 digits is the same GTIN. Then a
    card per group fault, such as different GTINs, an RFID tag whose serial number differs from the barcode's, or a
    case's 2D symbol missing the GS1-128's data. When two GTINs differ only in their first digit, the studio asks whether
    one is the box's code and the other the product's: then they are different items, to be checked one at a time.
    **Its own result** shows one code's result below; **Check codes one at a time** ends the group.

![The codes of one item: a GS1 DataMatrix, its EAN-13 and an RFID tag, the serial numbers marked where they differ](images/guide/check-group.png)

11. **History**, at the end of the studio, lists the codes you checked, newest first, kept on this device only and
    without pictures (a code typed or pasted is kept once you stop typing for two seconds; the same code shown again
    is kept once). Search a GTIN or any value, or filter by verdict or session; press a reading to see its result
    again, checked under the current release: a reading whose verdict that changes says so. Before a run of readings
    (a ward, a supplier, a day), name a session and press **Start a session**; **End the session** stops adding to it.
    **This item has no barcode** counts an item without one, for a survey. Readings that carry a serial number or a
    person's number are marked. **History off** stops keeping codes, and **Delete all** removes every reading and
    session. In a private window, or where the browser keeps nothing, the history lasts only for the visit and the
    studio says so.

![The history: a session named, four readings, one with no barcode, one marked as carrying a serial number](images/guide/check-history.png)

12. **Reports and files.** Under a result, **Report (PDF)** saves the result as a document to print or send: the
    verdict, what the code says, each fault with where, why and how to fix it, what was not checked, then the details
    for experts (the bytes, the element string, every fault's sections). With a group, **Item report (PDF)** saves the
    table of what each code says, the differences in bold, and the group's faults. In **History**, the row under the
    filters exports what the list shows (filter first to export a session or one verdict): **Session report (PDF)**
    counts the readings by verdict, by kind (a code with GS1 data, one without, no barcode), by symbology, the ten most
    frequent faults and by company prefix, then lists every reading; **Readings (CSV)** and **Findings (CSV)** open in a
    spreadsheet (tick **CSV with semicolons** where your spreadsheet expects them); **All the data (JSON)** keeps
    everything, and **Open a readings file** brings it back on this or another device. When the readings carry a serial
    number or a person's number, the studio asks once before it exports them. The reports are in the language of the
    page; the files' columns stay in English.
13. **Share.** **Share…** sits beside **Report (PDF)**, beside **Item report (PDF)** and in the history's row. On a
    phone (and in browsers that have one) it opens the device's share sheet with the PDF and a text that is enough on
    its own: the verdict, what the code says, each fault in one line with its code, the element string. Elsewhere it
    offers a menu: **WhatsApp** (the text and the link; the file is sent from the phone), **E-mail** (the PDF is saved
    first: attach it to the message), **Copy the text**, **Copy the link** and **Download**. The link of one reading
    carries the code itself in the part of the address after `#`, which the web server never sees; whoever opens it
    sees the same result, checked again. When the data would make a link longer than 2,000 characters there is no
    link, only the file. A share that includes a serial number or a person's number asks once.

![Share without a share sheet: the menu under the button](images/guide/check-share.png)

14. **Size estimates from a picture.** Under a picture, **Size estimates** shows each symbol's clear margins in modules
    and a linear symbol's bar height at once. For the X-dimension (the width of the narrowest bar or module), measure
    one symbol's width with a ruler, the bars or modules only without the margins, choose it under **Symbol**, type the
    width in **Printed width (mm)** and press **Estimate**: every symbol of the picture is then estimated, each with
    its tolerance and the range the place allows. A size outside that range, a margin too narrow, bars cut short, a
    symbol printed light on dark or mirrored, and, for a pack checked as one item, a 2D symbol more than 50 mm from
    the linear one, appear as findings. These are estimates from a photograph: hold the camera square to the pack. They
    are never a print quality grade, which only a verifier gives; the table names the grade a verifier must find.

![Size estimates under a picture, with one symbol's printed width typed](images/guide/check-estimates.png)

In the editor, once the data is checked, **Check this in the Check Studio** under the Identify step opens the studio
with that data, as a GS1 DataMatrix would carry it. Nothing you check leaves the page.

### The editor

![The editor: steps 1 and 2 and the options on the left, the label on the right](images/guide/editor.png)

- The header: the name, with the version under it (the commit the page was built from and its date, which opens
  About), **One code** or **In bulk** (section 13), **Assistant** (below), **Language**, **Open…** and **Save** (the work kept as a file
  on your computer, section 8), and **Start over**, which clears every field and choice as on a first visit (on a
  phone, Language, Open… and Save are under **More** and Start over is a round icon at the right of the name).
- **1 — What does the code identify?** The key, its qualifiers and data attributes, and the GS1 Digital Link URI's own
  parameters.
- **2 — Where is it scanned?** Questions that choose the symbol specification table and the symbol.
- **3 — Label.** The label, redrawn as you type, its tools over it, the **Export** bar below it, then its options, the
  GS1 Digital Link URI and the element string, and the sections *Printer (ZPL, TSPL, EPL2, DPL, PPLA, PPLB)*, *RFID and NFC (EPC)* and *Digital
  signature (GS1, JWS)*.

On a computer the page takes the screen's whole width, as above: steps 1 and 2 and the label's options on the left, the
label with its tools and the **Export** bar on the right, which stays in view as the page scrolls, so step 2's answers
and the options change the label in sight (as on a tablet). At its foot, **About GS1 Label Studio**: who
developed it (Ricardo Verza Amaral Melo, with links to his LinkedIn and GitHub), the repository on GitHub, the licence (Apache 2.0), links to this guide and the printing guide, the version published (the
commit it was built from, with its date — the way to tell whether the page shows the latest work), and the software it
is made with, each linked to its repository; the GS1 Barcode Syntax Engine with the release that checks the data and the
date of its GS1 Barcode Syntax Dictionary (*GS1 Barcode Syntax Engine 1.4.1 — … · GS1 Barcode Syntax Dictionary of
2026-01-27*).

**A new version.** The page looks for a new release when it opens and whenever it comes back to the screen — an
installed app brought back from the background included. When one is ready, a bar under the header says *A new version
of GS1 Label Studio is ready*: **Reload** opens it, and the work in progress is offered back (*Your last work … is kept
in this browser — Continue it*); × leaves it for the next visit. Nothing is redrawn unasked.

### The assistant

![The assistant's first question, a need written in one's own words already read](images/guide/assistant.png)

For a first barcode, the **Assistant** sets the steps up from a few simple questions (it opens by itself on a first
visit; afterwards from the **Assistant** button beside *One code* and *In bulk* in the header, on a phone too). Each screen asks one
thing, with large cards to choose from and a *Why we ask* that says the rule behind it:

1. **What do you want to identify?** A product I sell; a medicine or a medical device; a case of several units; a
   pallet or a parcel I ship; something else (an asset, a returnable container, a location, a document, a service
   relationship). Or type the need in your own words — *a QR code with my website on the product I sell in shops* —
   and the assistant chooses the card and answers what it can (*A product I sell · In shops · Yes, my website*), to
   check on the next screens. The words are read here, in the browser, by keywords in the six languages: a sentence
   with no word it knows leaves the choice to the cards. **I know what I want: go to the editor**, beside **Continue**
   (under it on a phone), closes the assistant and leaves the editor as it is.
2. Two to four questions that depend on it: where a product is sold; the lot, the dates or the serial number printed
   on each unit; whether a phone's camera should open the brand's own website (then its domain), a page through GS1,
   or nothing; whether a medicine goes to pharmacies or hospitals; whether a case is itself sold at a till; for
   something else, which key, and whether it is marked directly on the item.
3. **How will you print it?** On the packaging's artwork, with a label printer, or on label sheets with an office
   printer.

![The summary: the symbols, the values still to type and the rules for the artwork](images/guide/assistant-summary.png)

The summary names the symbols step 2 will draw (*EAN-13, with a QR code (GS1 Digital Link) beside it*), what is still
yours to type — the example values (GS1's example company prefix 950 6000) are only for trying the studio — and the
rules that apply, each with its section of the General Specifications: the two barcodes side by side, the QR code within
50 mm of the EAN-13's centre, the back's lower right quarter, the size range, a case's or a pallet's label height.
**Fill in my data** fills steps 1, 2 and 3 (the key and its data, step 2's answers, the URI's domain, a GS1 Logistic
Label for a pallet, the printer's section opened for a label printer); a card above step 1 says what was set up, with
**See the rules again** and **Start the answers again**. The symbol always comes from step 2's table: the assistant
answers its questions, it never picks a symbol of its own.

In step 1, each field still holding an example value is outlined in amber, with *Example value: replace it with yours*
under it, and the card above step 1 names the ones left (*Replace them with yours: Batch or lot, Expiry date*). A field
loses its mark as soon as its value is yours, or its row is removed; once none is left the card says *✓ Every example
value is replaced with yours*.

### The tour

![The tour at its second stop: step 2 ringed in amber, the rest of the page dimmed, a card beside it](images/guide/tour.png)

The **Tour** button in the header (on a phone or a tablet, **Take the tour** in *More*) points out the steps and the main
buttons one at a time: the rest of the page is dimmed, the part shown is ringed in amber, and a card beside it says what
it is for, with *1 of 9*, **Skip the tour**, **Back** and **Next** (**Done** at the last). On a computer it shows step 1,
step 2, the label, its options, the exports, *One code* and *In bulk*, the assistant, *Open…* and *Save*, and ends on its
own button. On a phone or a tablet it opens each destination of the bar in turn — *Data*, *Use*, *Label*, *Export* — then
points at the mode, the assistant, *Start over* and *More*. Esc or × closes it at any stop, the arrow keys move between
stops, and closing it brings back where it was opened. The page behind cannot be pressed while it is open.

### On a phone

A phone — and a tablet held upright, or a narrow window — shows one column and one part at a time, chosen in the tab
bar at the bottom, as phone apps do:

| Tab | What it shows |
|---|---|
| **Data** | step 1 (or the rows, in bulk), with a small live preview at the top: tap it to open the label |
| **Use** (a shop front) | step 2, where and how the code is used and scanned |
| **Label** | the label, its tools and its options |
| **Export** | the downloads, *Generate in bulk* and *Printer (ZPL, TSPL, EPL2, DPL, PPLA, PPLB)* |
| **More** | **Language**, **Install the app**, *RFID and NFC (EPC)*, *Digital signature* and About |

Each tab keeps where it was scrolled to. A link to another part — *Change in step 2* under the label's options, or the
live preview — opens its tab. A red dot on **Data** says the data has an error; on **Label**, that the label cannot be
drawn. The header keeps the name and, on a row of their own under it, **One code / In bulk** and **Assistant**; **Start over** is the round reload icon at the right of the
name, on every tab.

**Install the app** puts the studio on the home screen, where it opens without the browser's bars and works offline, under
the name *GS1 Label Studio*. Chrome, Edge and Samsung Internet show their install dialog; on an iPhone or iPad the button
says how: Share, then *Add to Home Screen*; other browsers install from their menu. Once installed, the button says so. The installed app opens on its icon with the name *GS1 Label Studio* under it,
until the page is ready.
On a tablet the button is under **More** too.

<p>
  <img src="images/guide/phone-data.png" alt="On a phone: Data, step 1 with the live preview at the top and the tab bar at the bottom" width="200">
  <img src="images/guide/phone-label.png" alt="On a phone: Label, the label and its options" width="200">
  <img src="images/guide/phone-export.png" alt="On a phone: Export, the downloads in two columns and the printer profiles" width="200">
  <img src="images/guide/phone-more.png" alt="On a phone: More, the language, Start over and the EPC section" width="200">
</p>

### On a tablet held horizontally

A rail on the left holds the same five parts; the part chosen is on the left and the label, with its tools and the
**Export** bar, always on the right, redrawn as you type. Turning the tablet changes the layout and keeps what you
typed.

![On a tablet held horizontally: the rail, step 1 and the label beside it](images/guide/tablet.png)

The page follows the system's light or dark theme.

**Language**: English, Português (Brasil), Español, Français, Deutsch or Italiano. The studio opens in the browser's
language (Portuguese for any Portuguese, and likewise Spanish, French, German and Italian; English otherwise) and
remembers the choice in this browser. Changing it redraws the page at once, keeping what you typed; the messages of the
GS1 Barcode Syntax Engine are translated too. The data titles of the AIs are Portuguese names in Portuguese, and GS1's
English ones in the other languages. The files the studio makes —
the README in the zip, the CSVs, the notes of a test print — stay in English.

![The studio in Portuguese](images/guide/language.png)

## 3. Step 1 — what the code identifies

![Step 1 with a GTIN, a batch, an expiry date, a serial number and a net weight](images/guide/identify.png)

### Paste what you have

**Have the data already? Paste it**, then **Fill in**. It takes:

- a GTIN alone: `9506000134376`;
- an element string with brackets: `(01)09506000134352(10)ABC123(17)271231`;
- an element string without brackets, as a scanner sends it — write the group separator as `{GS}`;
- a scanner's output with its symbology identifier: `]d2010950600013435210ABC123{GS}17271200`;
- a GS1 Digital Link URI: `https://id.gs1.org/01/09506000134376/10/B42?17=271231`, its own parameters included.

The fields below are filled in from it. When something is wrong the engine says what, with the characters at fault
marked:

![A date with day 00 explained by the Syntax Engine](images/guide/identify-error.png)

### The key

**Identifier type** lists every GS1 identification key, each as *(AI) abbreviation name* — `(01) GTIN Product`,
`(00) SSCC Logistic unit`, `(414) GLN Physical location`…: the 16 keys a GS1 Digital Link URI can carry, then, under
*In element strings only*, the Made-to-Order GTIN `(03)`, which a URI cannot carry (it is drawn in GS1 DataMatrix when a
URI symbol was chosen).

Type the key's value below. A GTIN may be typed in its own length (8, 12, 13 or 14 digits). The check digit is
checked as you type: *The check digit does not match: it should be 6.*

### Qualifiers and data attributes

One list holds the key's qualifiers (batch, serial number, variant…) and its data attributes (expiry, weight, price…):

- **+ Add attributes** adds a row; its AI field lists the key's qualifiers not yet given first, then every attribute.
  Its arrow always lists every AI; typing filters the list; Esc or a click outside closes it.
- The links beside it add a qualifier of the key at once: *+ (22) Product variant*, *+ (21) Serial number*…
- Each row says where it goes: *qualifier · in the URI's path* (marked on its left edge) or *data attribute · in the
  query string*. ↑ and ↓ move a row, × removes it.
- The rows' order is the element string's: GS1-128, GS1 DataMatrix, GS1 QR Code and GS1 DataBar Expanded carry the
  qualifiers and attributes in that order, and so does their text. A batch or lot (10), whose length varies, is best
  last: it then needs no separator (FNC1) after it, and EPL2 can print it. A GS1 Digital Link URI keeps its own order
  whatever the list's: the qualifiers in its path, in the order its syntax asks, then the attributes; the text under its
  symbol follows the URI. An element string pasted in another order keeps it.
- Each value is checked on its row, with a hint of the format (*6 digits · date YYMMDD*, *up to 20 characters*).
- Decimal attributes take a comma or a point: a net weight of `0,5` kg becomes *(3103) 000500*; the hint shows what goes
  in the code.
- Names and addresses are typed as people write them: a patient's (7253) family name or (7254) given name, a ship-to
  address (4300)–(4320) take their spaces as + and their accents as %XX in the code, and the tool writes them so —
  *Maria José* becomes *(7254) Maria+Jos%C3%A9*, which the hint shows; %XX and + already written are kept (a plus sign
  meant as itself is typed %2B). A pasted name is shown as
  people read it (*Jo%C3%A3o* → *João*), and a `{7254}` field on a label of one's own shows it as written.
- A patient's sex, (7252), is ISO/IEC 5218's digit — 0 not known, 1 male, 2 female, 9 not applicable — and may be
  typed as a word in any of the six languages: *Feminino*, *female*, *weiblich* become *(7252) 2*, which the hint shows.
  A letter such as *M* or *F* is refused, as M is male in English and Portuguese but female (*mujer*) in Spanish.
- Two qualifiers the key does not take together are said on the row (*Not with (22), (10) and (21): the key takes one
  or the other.*).
- Attributes that only element strings carry — (8014), (8040) to (8043), (8200)… — are offered and marked so.

### Several keys in one symbol

Some keys go together (GS1 General Specifications 4.13): an SSCC with the GTIN of the trade items it contains and their
count, a GTIN that is also a returnable asset. Under the list, *Other keys with the SSCC* (or the GTIN) offers the
pairings the standard allows as links; a row of another key says *another key · in the URI's query string* and has its
check digit checked on the row. Pairs the standard forbids — (01) with (02) or (37), for example — are refused by the
Syntax Engine with its reason.

![An SSCC with the GTIN it contains and their count, and a parameter of the URI](images/guide/several-keys.png)

### Parameters of the URI

**Parameters of the URI** — your own, not GS1's: a campaign, a language, a version. **+ Add parameter** adds a
`name = value` row; they are appended to the GS1 Digital Link URI's query string after the data attributes, percent
encoded. A name of digits only is an AI and is refused, as are a missing name and a name given twice. Element strings
have no place for them, so they appear only in URI symbols. In bulk, a column of the rows can hold one (section 13).

At the bottom of the step: *✓ Checked by the GS1 Barcode Syntax Engine 1.4.1: 5 element strings*, or the engine's
message. The engine's name, with the release that checked the data, links to that release's notes on GitHub; the files
made name it too (section 8).

## 4. Step 2 — where it is scanned

The studio walks the GS1 General Specifications' decision tree (figure 5-68) one question at a time. The key already
answers some — *The GTIN already answers 2 questions of the tree* — and they are not asked. Answer **Yes** or **No**:
at a general retail point of sale? in general distribution? a regulated healthcare item? a tobacco product under the EU
traceability regulation? marked directly on the item?

![Step 2: table 1, the EAN-13 with a QR code beside it recommended](images/guide/guided-choice.png)

The answer leads to a **symbol specification table** (named, with its sections) and to the choices of section 2 of the
General Specifications for that application:

- **Recommended for this data** — the first symbol the standard lists for that table that carries all your data, or,
  where only the GTIN fits (an EAN-13 at a till), that symbol with a 2D symbol beside it that carries the rest.
- **Also allowed** — the other symbols, each with what it carries, its X-dimension range and its bar height.
- **Only in addition to one of the above** — symbols the standard allows beside another, never alone.
- **Not for this data** — with the reason (*UPC-A carries a GTIN-12*).

Choosing one changes the label at once. On a phone, where the label is on another tab, each choice shows a small
picture of its symbol at the right, drawn from your data, so you see what you choose before you tap it.

<img src="images/guide/phone-use.png" alt="On a phone: Use, step 2's choices, each with a small picture of its symbol at the right" width="200"> At a till, GS1 DataBar Expanded carries everything only for a variable measure
item (a count or a measure that varies, AIs 30, 31nn, 32nn, 35nn, 36nn); otherwise it carries the GTIN alone.

Until step 2 is answered, a line over the label says that its symbol is the default one, with **Go to step 2**. Once a
question is answered, **Clear the answers** under the questions starts them again.

**Choose a symbol yourself** offers every symbol with the key's scanning environments instead, starting from the
guided choice; your answers are kept, and **Back to the guided choice** (or **Change in step 2**) brings them back.

## 5. Step 3 — the label

![Step 3: the label in its area and the Export bar; on a computer the options are beside it, on the left](images/guide/label-card.png)

- The **caption** over the label says what is drawn: the symbol, its version or rows × columns and modules (or its width
  from the first bar to the last), the error correction, the X-dimension, the label's size at the chosen size, and the
  characters encoded — FNC1 and group separators included.
- The **canvas** shows the label fitted to its area. − and + at its lower right corner zoom from 25 % to 400 %; the
  figure between them goes back to 100 %.
- **Fit** or **Real size**, and **Scan test** (section 7).
- The **Export** bar (section 8) and, in bulk, **Generate in bulk** (section 15).
- Under the options: the GS1 Digital Link URI coloured by part — domain, key, qualifiers, data attributes — with **Copy
  URI**, and the element string with **Copy**.

The symbols are drawn as the General Specifications lay them out: an EAN/UPC with its guard bars and digits, ITF-14 with
its bearer bars and its 14 digits, GS1-128 with its element strings below, the 2D symbols with their quiet zone and
their text.

![The EAN-13 with a QR code beside it, from table 1](images/guide/label-ean13-qr.png)

![ITF-14 with its bearer frame, at table 2's sizes](images/guide/itf14.png)

When the data of a GS1-128 passes 48 data characters, or the symbol would pass 165.10 mm with its quiet zones, the
element strings go in as many GS1-128 symbols as needed, in order, the key in the first, stacked on the left a quiet
zone apart, each with its own text:

![GS1-128 over three symbols](images/guide/gs1-128-stack.png)

The box **GS1-128 symbols** under the options lists the element strings: tick *new symbol* to start a symbol where you
choose; **Automatic** goes back.

### Templates by segment

In **Label**, **A label** shows the kinds of label grouped by segment: *Logistics* (the GS1 Logistic Label, section 9),
*Retail*, *Healthcare* and *Your own* (a label of one's own, below, and a work saved, section 8).

![The kinds of label by segment, the medicine's template chosen: a GS1 DataMatrix with the GTIN, expiry date, lot and serial number written beside it](images/guide/templates.png)

| Segment | Template | What it holds |
|---|---|---|
| Retail | *Product with lot and expiry*, 66 × 38 mm | An EAN-13 and a QR code (GS1 Digital Link) side by side, their quiet zones kept, *LOT (10)* and *EXPIRY (17)* under them (General Specifications 4.15.1, 6.3.3.1) |
| Retail | *Consumer unit with GS1 Digital Link*, 64 × 32 mm | An EAN-13 and a QR code whose GS1 Digital Link URI carries the GTIN alone, the QR code with its quiet zones within 50 mm of the EAN-13's centre (6.3.3.1), *SCAN FOR PRODUCT INFO* under it; the barcode area of a pack's back, lower right (6.3.2: the front is the trading and advertising area) |
| Retail | *Fresh food sold by weight*, 60 × 54 mm | A GS1 DataBar Expanded Stacked with a variable measure GTIN (its first digit 9), the net weight (310n) and the price (392n), as a scale prints them (2.1.12) |
| Healthcare | *Medicine or medical device*, 60 × 18 mm | A GS1 DataMatrix with *GTIN (01)*, *EXPIRY (17)*, *LOT (10)* and *SERIAL (21)* written beside it (4.14.1, figure 4-8), its element strings in the order (01), (17), (10), (21), for hospitals (table 6) |
| Healthcare | *Medical device with its UDI*, 46 × 21 mm | A GS1 DataMatrix under the *UDI* pictogram (ISO 15223-1, symbol 5.7.10), the UDI's element strings beside it, one a line, each AI in parentheses before its value and no data titles, as the UDI rules take a GS1 carrier's human readable text; the *MD* pictogram (5.7.7) at the top right |
| Healthcare | *Patient's wristband*, 150 × 25 mm | A GSRN of the service recipient (8018) with the patient's family name (7253), given name (7254), date of birth (7250) and sex (7252, ISO 5218: 1 male, 2 female), in a GS1 DataMatrix at each end so that one faces the scanner however the band curves; the name large between them, *DOB* with the date as DD/MM/YYYY (a format of its own, so without its AI: 4.14.1, figure 4-9) and *GSRN (8018)* (2.5.2) |

Choosing one:

1. Opens it as a label of one's own, which you change as any other (below), and answers step 2 for it.
2. Keeps step 1's GTIN and the data the template shows; what it shows that step 1 lacks is added with an example value,
   outlined in amber in step 1 and named in a card above it until you replace it (*Fresh food sold by weight* also puts
   its example GTIN in place of one that does not start with 9).
3. Names first the data of step 1 the template has no place for: **Keep it** leaves it in step 1 and in the symbols that
   carry all the data, without a text on the label; **Leave it out** removes it; **Cancel** keeps everything as it was.
4. With another key in step 1, such as an SSCC, says that step 1 gives way to the template's examples: **Use the
   template** or **Cancel**.

The texts on the label stay in English, for you to rewrite: each data title with its AI and the data exactly as the
barcode carries it, as section 4.14.1 of the General Specifications asks when they are the same (a date written another
way, such as *20 Nov 2027*, takes its data title without the AI). More segments and templates come one at a time.

### A label of one's own: barcodes, text, lines, boxes and images placed freely

Every place has its own label, so the studio has an editor rather than only ready-made ones. In **Label**, choose **A
label**, then the card *A label of my own*:

![A label of one's own: a QR code, a GS1-128, text blocks, a logo, a frame, a rule and a line read upwards on a 150 × 90 mm page](images/guide/designer.png)

1. Set **Label width (mm)** and **Label height (mm)**, and the **Scanning environment** that sizes the barcodes (in
   step 2's guided choice, its table does).
2. **+ Barcode** adds a barcode; **+ Text** a text block; **+ Shape** a line or a box; **+ Pictogram** a pictogram,
   *UDI* at first (ISO 15223-1, symbol 5.7.10, beside the barcode that carries the UDI). Its arrow **▾** lists them
   all by segment, each with its letters or drawing: *Healthcare · ISO 15223-1* (UDI, MD, LOT, REF, SN, IVD, STERILE,
   STERILE EO, STERILE R, NON STERILE, the manufacturer, the date of manufacture, the use-by date), *Logistics · ISO
   7000 / ISO 780* (fragile, this way up, keep dry) and *Prepacked goods · Directive 76/211/EEC* (the estimated sign
   ℮). The one you choose is added at its own height (4 mm; 15 mm for a carton's; 3 mm for the ℮, its least height
   for most quantities) and the button then adds it again. Its properties list them the same way, with its
   **Height (mm)**; letters are printed as boxes and text, a drawing as an image at the printer's dots (not yet in
   DPL); **+ Image** an image, such as
   a logo, from a file you choose (PNG, JPEG, GIF, WebP or SVG). Each is listed under
   **Elements**, and chosen. Where an element already sits at the new one's corner, the new one goes 5 mm right and
   down, and again, so that it is never hidden under another.
3. Choose an element in the list or click it on the label; drag it on the label to move it (by half millimetres), or
   type **Left (mm)** and **Top (mm)**. Dragging and the arrow keys stop the element at the label's edge; one already
   past it (a **Left** typed, the label made smaller) moves back onto the label but never further out; only **Left**
   and **Top** typed place it past the edge. From the keyboard: choose it in the list, press **Tab** to **On the label**
   beside it and **Enter**: a ring goes round the element on the label (a hint under it says what the keys do); press
   the arrow keys: each press moves it half a millimetre, or 5 mm with **Shift**. The next **Tab** goes on to its
   corner's square; **Esc** on either brings you back to the element in the list. The chosen element shows a small square at its bottom right corner: drag it to
   make the element larger or smaller, its top left corner kept. A box takes the corner's width and height and a line
   its length (by half millimetres); an image keeps its proportions; a barcode takes the nearest **Size** its scanning
   environment allows (its bars or modules follow the corner, its text keeps its height), and a text block the nearest
   **Text height**. The properties show the new size as it changes. Dragging the square and the arrow keys stop the
   element at the label's edge: a box or a line on the last half millimetre, an image at the width that keeps it on the
   label, a barcode or a text block at the largest size that does (a barcode's text included); only the properties
   (**Width**, **Size**, **Text height** and the others) make it larger than that. When the element runs past the
   label's edge, its square stays at the edge, where the element is cut, and turns red; it grows no further, and when
   you drag it the corner comes under the pointer, so the element shrinks back onto the label. From the keyboard: choose the element in the list, **On the label** and
   then **Tab** give the square a ring (just after the element's own ring) (a hint under it says what the keys do), and press the arrow keys: each press moves the
   corner half a millimetre, or 5 mm with **Shift**. A box takes **→** and **←** on its width and **↓** and **↑** on
   its height, a line the two along it; an image, a barcode and a text block keep their proportions, **→** and **↓**
   making them larger, **←** and **↑** smaller, a barcode and a text block a size at a time (with **Shift**, about
   5 mm at a time). After each press the hint starts with the new place (**Left** and **Top**) or the new size, and
   says when a barcode or a text block has no larger or smaller size, the element has reached the label's edge or runs
   past it; a screen reader is told the same.
   **Grid and rulers**, over the label beside **Delete**, draws lines over the label every few millimetres (finer as
   you zoom in: every 2 mm at 100 % on a computer, every millimetre at 200 %), a stronger one every 10 mm, and rulers
   in millimetres above and to the left of the label; the chosen element's width and height are marked in blue on the
   rulers and follow it as it moves. They are only drawn on the screen, never in the label or its files, and the
   pointer goes through them to the elements. Press it again to hide them; the studio remembers the choice in this
   browser for the next visit. In **Real size** the label has its own rulers instead.
4. A barcode: its **Symbol**, **Size** (a percentage of the environment's target X-dimension, or of its table's row),
   **Human readable text** (with it, the label's **Text format**, as in the options of a barcode alone: the same for
   every barcode of the label), and the **Element strings it carries** (a GS1 Digital Link URI carries them all).
   Under them, **This barcode's options** (folded on a phone, a line saying what is set) gives it the options of the
   symbol alone, its own whatever the other barcodes have: **Text position** and **Text height** (not for an EAN/UPC,
   whose digits stay where the standard puts them; not split for ITF-14), a QR code's **Error correction** (the label's
   until changed) and **Encoding mode**, a linear symbol's **Bar width reduction** (prepress: the files, not the print
   files, as for the symbol alone) and ITF-14's **Bearer bars**. A QR code or Data Matrix also takes a **Linear barcode
   beside it** where the page's scanning environment has an EAN/UPC (Retail, for example): EAN-13 / UPC-A / EAN-8 as
   the GTIN takes, or UPC-E, then its **Size of the linear barcode** (the 2D symbol's, or its own) and the **Bar width
   reduction** its bars take; the pair moves and turns as one barcode, and **None** takes it off. They are saved with
   the work; a printer language that cannot write one says so, as for the symbol alone (ZPL refuses one mode for a QR
   code's whole data).
5. A text block: its **Text** (a line a line), **Text height** (its capitals'), and **Insert a field from the data**,
   which adds `{10}`, `{17}`… — each replaced by that element string's value, so in bulk every row's label shows its
   own data. A date, such as (17) or (11), is also offered in five formats, each shown with the date it gives:
   `{17:DD/MM/YYYY}` *31/12/2027*, `{17:DD.MM.YYYY}`, `{17:YYYY-MM-DD}`, `{17:MM/YYYY}` and `{17:DD MMM YYYY}`
   *31 DEC 2027*. Other formats can be typed after the colon, with `DD`, `MM`, `MMM` (the month's abbreviation),
   `YY` and `YYYY`; the century is the one section 7.12 of the General Specifications chooses, and a day 00 is the
   month's last. When the text has `MMM`, **Month names** chooses its language: *English* (JAN to DEC), *Portuguese*
   (JAN, FEV … DEZ), *Spanish* (ENE, FEB … DIC), *French* (JAN, FEV, MAR, AVR … DEC, without accents), *German* (JAN,
   FEB, MRZ … DEZ) or *Italian* (GEN, FEB … DIC); a new text block starts in the interface's language.
   A date followed by a time, such as (7003) *expiration date and time*, (7011), (4324), (4325) or (8008), is also
   offered with its time: `{7003:DD/MM/YYYY hh:mm}` *31/12/2027 15:30*, `{7003:DD.MM.YYYY hh:mm}`,
   `{7003:YYYY-MM-DD hh:mm}` and `{7003:hh:mm}` *15:30*, and (8008) with its seconds, `{8008:YYYY-MM-DD hh:mm:ss}`.
   The time's parts are in lower case, `hh`, `mm` and `ss`, so that `MM` stays the month. A part the value does not
   have, such as (7011)'s time when only its date was given, is left out with the text before it: `DD/MM/YYYY hh:mm`
   then shows the date alone.
   A date of birth, (7250) *DOB* or (7251) *DOB TIME*, is written YYYYMMDD, its year whole, and keeps the century it
   was given: `{7250:DD/MM/YYYY}` of 19600115 shows *15/01/1960* (the rule for YYMMDD would make 60 into 2060). It is
   offered in the same five formats, and (7251) with its time too: `{7251:DD/MM/YYYY hh:mm}` *15/01/1960 08:30*.
   In bulk, the list also offers, under *Columns of the spreadsheet*, each column that holds no AI (a product's name,
   its region, a price), each shown with the row shown's value, such as `{Produto}` *Finest Truffle Tapenade*: each
   row's label shows that row's cell, in the drawing and in the print files. The header's case and the spaces around
   it do not matter; a column empty on a row leaves nothing, and a name in braces that no column has stays on the label
   as typed, so a mistyped field shows. On a single label, with no spreadsheet, such a field also stays as typed.
6. A shape: its **Shape** (*Line across*, *Line down*, *Box* or *Filled box*), **Width (mm)**, **Height (mm)** and
   **Thickness (mm)**, from its top left corner. A line across is as wide as it is long, a line down as high; its other
   side is its thickness, shown but not typed. A box's outline is drawn inside its width and height; a filled box has
   no outline to thicken. Changing the shape keeps its corner, its thickness and the length it shares with the new one.
7. An image: it comes in 20 mm wide; **Width (mm)** changes it, and its **Height (mm)** follows its proportions. It is
   kept in black and white, as label printers print: each pixel whose grey over white is below half way is dark, a
   transparent one light, so a light colour (yellow, a pale grey) vanishes and a logo in black works best. An image
   larger than 600 pixels a side is scaled down to it. **Replace…** takes another file at the same place and width.
   **Darkness** moves that half way: towards *Darker* more of the image's light colours print black (a pale grey logo
   comes out), towards *Lighter* fewer (only what is near black), from 5 % to 95 %, 50 % the usual. The label is
   redrawn as the slider moves. The studio keeps the file's greys only while the page is open: after a reload, or a
   work opened again, the darkness chosen is kept but the slider is greyed out until **Replace…** takes the same file
   again, which brings it back at that darkness.
   **Greys as dots, for a photo** (under Darkness) prints a photo or a shaded image as dots instead of black and white
   areas: each grey as many dots as it is dark, closer together where it is darker (dithering). Darkness then makes
   all its greys darker or lighter while white stays white and black black. A printer prints the dots at its own
   resolution, so the label drawn on the screen shows the picture's pixels and the print file the printer's dots, each
   as dark as the other. As the darkness, the box waits for **Replace…** after a reload. A logo in black prints better
   without it: its edges stay sharp.
8. **Rotation** turns a barcode, a text block or an image: *0°*, *90°* (reading downwards), *180°* (upside down) or
   *270°* (reading upwards). It turns about its box, whose top left corner stays at **Left** and **Top**. A QR code
   reads in any direction, so it stays upright. A line or box needs none: choose *Line across* or *Line down*, or swap
   its width and height.
9. A frame around the whole label, or around a barcode clear of its quiet zones, is not an overlap.
10. **Delete** takes the chosen element off the label; so does the Delete or Backspace key, unless you are typing in
    a field (where the keys edit its text).

A barcode, line, box or image past the label's edge, or a barcode overlapping another element (its quiet zones must stay
clear; a box's outline counts only where it is drawn), is named in red under
the size; so is a 2D barcode more than 50 mm from the centre of the nearest EAN/UPC or GS1 DataBar when step 3's
scanning environment is a point of sale (tables 1, 3 and 10): with its quiet zones it should stay within that radius, or
the scanner may not take both for the same trade item (General Specifications 6.3.3.1). The label is still drawn. **Scan test** reads every barcode. The label exports as SVG, PNG, PDF and EPS and
in bulk, and in ZPL with the printer's own commands (the printer section's file, its test print and the bulk ZPL file): each
barcode as the symbol alone is written, at the whole dots a module nearest to its own X-dimension (within its table's
row), its bars where the label puts them; each line of text with `^A0` at its capitals' height; each line and box with
`^GB`, its edges at the nearest dots; each image as a graphic field (`^GFA`, in ZPL's own compression, which every
ZPL II printer reads) at the printer's dots, each dot the image's pixel under its centre; a turned barcode or text with its field turned (`R`, `I`, `B`) and a turned image sent
turned. A barcode whose bars, or a line, box or image, would run past the label's edge at those
dots is refused. In EPL2 too, each line of text in the printer's font whose capitals come nearest its height and that
keeps it within the width the label gives it, each line and filled box with `LO`, each outlined box with `X` and each
image with `GW`, whose dots go as raw bytes: the EPL2 file of a label with an image is then not a text file, and is sent
to the printer as it is, unchanged (see the printing guide). EPL2 refuses what it refuses for a symbol alone (GS1
DataMatrix, the QR code, GS1 DataBar). A turned barcode or text goes in EPL2 with its rotation, its point of origin
turned with it as the guide says; a Data Matrix has no rotation in EPL2, so one turned is refused there. In TSPL too,
each line of text with `TEXT` in the dot font whose capitals come nearest its height and that keeps it within its
width, each line and filled box with `BAR`, each outlined box with `BOX` and each image with `BITMAP`, its dots as raw
bytes as in EPL2; TSPL refuses what it refuses for a symbol alone (GS1-128 but for an SSCC alone, EAN-8, UPC, GS1 DataBar). A turned barcode
or text goes in TSPL with its rotation, turned about its point of origin as TSC's printers do (the manual's example);
a turned QR code is refused there. In DPL too, each record by its bottom left corner, counted up from the label's bottom
in tenths of a millimetre: each line of text in the internal font whose capitals come nearest its height and that keeps
it within its width, each line and filled box as an `X` record's line, each outlined box as its box; DPL refuses what
it refuses for a symbol alone (GS1 DataMatrix, GS1-128 but for an SSCC alone, GS1 DataBar), an image (DPL prints one
stored in the printer first, which Labelize, the emulator of the tests, does not draw). A turned barcode or text goes
in DPL with its record's rotation, turned about its bottom left corner as Datamax's manual shows; a turned Data Matrix
or QR code is refused there (Labelize does not turn them).

## 6. The label's options

Only the choices that apply to the symbol are shown, grouped by what they do, each group framed and named: *The symbol
and its size*, *Linear barcode* (when there is one), *Human readable text*, *GS1 Digital Link URI* and *Prepress* — and
*The GS1 Logistic Label* first, for that label. On a phone each group is folded under its name with a line saying what
is set (*QR code (GS1 Digital Link) · 100 % · error correction M*): tap it to open it, and again to fold it. A choice of two to four short options is a row of buttons (press
one, or use the arrow keys on the chosen one); a longer choice is a list. The **?** beside each option's name says what
it does and gives a tip, in the page's language: under the option on a computer, in a sheet from the bottom of the
screen on a phone; Escape, the **?** again or a press elsewhere closes it.

| Option | What it does |
|---|---|
| Symbol | Shown when you chose the symbol yourself; otherwise step 2's choice is named, with *Change in step 2* |
| Scanning environment | The key's symbol specification tables (when you chose the symbol yourself) |
| Size | The X-dimension, from the table's minimum to its maximum; the target marked *recommended* |
| Human readable text | Full (every element string), the identification key only, or none |
| Text position | Below the symbol (the default), above it, key below and attributes above, left or right of it (an element string a line, never broken); beside an EAN/UPC a 2D symbol's text goes below or above |
| Text height | From 2.0 mm (the minimum) to 5.0 mm; 2.2 mm by default; 3.0 mm is what the GS1 Logistic Label asks |
| Text format | How each element string is written, each choice showing your data: *AI and data*, `(17)271231` (the default); *Data title and data*, `USE BY or EXPIRY 271231`; *Both*, `USE BY or EXPIRY (17) 271231` (General Specifications 4.14.1, figure 4-8); or *A format of my own*. Not for the digits of an EAN/UPC or ITF-14, nor the GS1 Logistic Label |
| Data titles in | With data titles: English (the default, as the General Specifications ask unless trading partners agree on another), Português, Español, Français, Deutsch or Italiano |
| Format of my own | `{title}` the data title, `{ai}` the AI's number, `{value}` the data, e.g. `{title}: {value}`; after a date's value a format, `{value:DD MMM YYYY}`, writes it as people read it and leaves its AI out (figure 4-9: the AI goes only with the data as encoded). An example from your data shows under it as you type; a format without `{value}`, or with another name in braces, is refused, saying why |
| QR code version | Automatic (the smallest that fits) or 1 to 40; refused when the data does not fit |
| Encoding mode | QR code: automatic (modes mixed, the smallest symbol), or numeric, alphanumeric or byte for the whole data; a character the mode cannot take is named |
| Scheme and domain | Two buttons: As typed, or In capitals (`HTTPS://ID.GS1.ORG`), which lets alphanumeric mode encode the URI's start; the path and the query stay as typed |
| Error correction | QR code: four buttons, L (7 %), M (15 %), Q (25 %), H (30 %), the chosen level's name under them |
| Linear barcode beside it | An EAN-13, UPC-A or EAN-8 as the GTIN takes, or UPC-E, beside a 2D symbol |
| Size of the linear barcode | In the framed group *Linear barcode (EAN-13)*: its X-dimension, as the 2D symbol's size by default, each size with the X it gives |
| Bearer bars | ITF-14: a frame (suits every printing method) or bars of 2X at the top and bottom |
| Bar width reduction | In the same group, for every linear symbol: 0.010 to 0.050 mm taken off every bar, half on each side, each value with its share of the X (*0.020 mm less on every bar (6 % of X 0.330 mm)*); the symbol's size and the 2D symbol do not change, the spaces widen. The **?** beside its name says what it is for: a press spreads the ink, so take off what the printer asks for, and none for a label, laser or inkjet printer |
| Crop marks | Two buttons: None, or In the PDF and EPS, marks at the label's corners in the PDF and EPS, on a page 10 mm larger on every side, for a label cut from a larger sheet (the [printing guide](printing-guide.md#2-artwork-and-prepress-svg-pdf-eps)) |
| Domain in the GS1 Digital Link URI | `https://id.gs1.org` by default; your resolver's domain |
| Label | At the top of the options, two buttons: **The barcode only**, or **A label**, which shows the kinds of label as cards: *GS1 Logistic Label* (section 9; greyed, saying it needs an SSCC, until the key is one), *A label of my own* (section 5) and *A work saved*, which opens a work file as **Open…** does (section 8). Until a card is chosen the barcode is drawn alone |

The hint under the options says the table and its section, and how many dots a module takes at the printer's resolution
(section 10).

## 7. Seeing it at real size, and the scan test

**Real size** draws the label at 1:1 between rulers in millimetres. A screen's pixels are not all the same size, so
calibrate it once: **Calibrate the screen**, hold the short side of a bank card (53.98 mm) against the screen and move
the slider — or − and + for half a pixel — until the bar is as long as the card. The calibration is kept in this
browser; **Reset** forgets it.

![Real size between rulers, with the calibration open](images/guide/real-size.png)

**Scan test** draws the label as the SVG would print it and reads it back with ZXing, here in the browser, comparing
each symbol's symbology identifier and data with what the label should carry:

![The scan test: read as intended](images/guide/scan-test.png)

*✓ Read as intended: ]Q1 https://id.gs1.org/01/…* — or what was read instead. Nothing is sent anywhere: the reader comes
with the page.

## 8. Exporting the label

| Button | File |
|---|---|
| Download SVG | Vector, at real size in millimetres. The arrow **▾** beside it chooses the human readable text: *Outlines* (no font needed: prints the same in any program) or *Text* (editable in a drawing program; needs the Liberation Sans and OCR-B fonts) |
| PNG (616 dpi) | At the label's size (12 pixels a module) or at the resolution chosen with the arrow **▾** beside it: 300, 600 or 1200 dpi with a whole number of pixels a module, the X-dimension it prints at said. The choice is kept and shown on the button (*PNG (300 dpi)*); its dpi recorded in the file |
| PDF | One page the size of the label, vector, the text as outlines, in process black (100 % K); with *Crop marks*, 10 mm larger on every side |
| EPS | The PDF's drawing in PostScript, for prepress |
| Zip of all | SVG, PNG, PDF and EPS with a README of the data, the symbol, its sizes and how to print it; the PNG at the resolution chosen beside the PNG's button, which the README then gives with the X-dimension it prints at |
| Label printer… | Opens the section *Printer* (section 10) and brings it into view: the print file in the profile's language (*Download ZPL (203 dpi)*) and the *ZPL template* are downloaded there, beside the test print |

The menus of the two arrows open under them on a computer and rise from the bottom of the screen on a phone; the arrow
keys move between the choices, Enter chooses, Escape or a press elsewhere closes them.

The release of the GS1 Barcode Syntax Engine that checked the data is written where a file has a place for it that is
never printed: the zip's README (*Data checked by the GS1 Barcode Syntax Engine 1.4.1 (dictionary 2026-01-27).*), the
PDF's *Producer* (a PDF reader shows it among the document's properties) and the EPS's `%%Creator` comment.

Files are named after the symbol, the key and its qualifiers: `gs1-128_00_106141411234567897.zpl`. What ZPL cannot print
correctly is refused with the reason, never printed wrong (section 17). How to use each file: the
[printing guide](printing-guide.md).

### Saving the work and opening it again

1. **Save** in the header (under **More** on a phone) downloads the work as a file, such as
   `dl-qrcode_01_09506000134376_10_B42.gs1-work.json`: the data typed in step 1, the answers of step 2, every option of
   the label — a label of one's own with all its elements —, the printer profile and, in bulk, the columns chosen for
   the spreadsheet's headers. A message under the header names the file.
2. Keep it where you like; nothing leaves your computer.
3. Later, or in another browser, **Open…** takes the file back: the fields, the choices and the label return as they
   were saved. In bulk, take the spreadsheet again: its columns are chosen as they were saved (the rows stay in the
   spreadsheet, not in the work).
4. The ZPL the printer section downloads carries the same work in comments (`^FX GS1 Label Studio work 1/3 …`), which
   printers and Labelary ignore: **Open…** takes that ZPL back too. A ZPL made elsewhere cannot be opened — its printer
   commands do not keep the fields, the meaning of the data or the sizes in millimetres; Labelary's viewer draws it.
5. This browser also keeps the last work by itself, a moment after each change. On the next visit a bar under the
   header asks about it — *Your last work, of 4 November 2026 at 14:30, is kept in this browser.*, with the key's
   element string and, for a label of one's own, *a label of your own*: **Continue it** brings it back as **Open…**
   would (in bulk, take the spreadsheet again); **Start anew** forgets it. Nothing comes back unasked, and nothing is
   kept over it until you answer. **Start over** forgets it too. A private window, or a browser that blocks storage,
   keeps nothing; the work file of step 1 is still the way to keep a work for good or take it to another computer.
6. **Share…** in the Export step sends the label as a PNG with a text of its data (each data title and value, the
   element string, the GS1 Digital Link URI) and a link `#/label?w=…` that opens the same work in any browser: the
   data, the choices and the label, as **Open…** does with the file. As in the Check Studio, the device's share sheet
   is used where there is one, else WhatsApp, e-mail, copy and download; past 2,000 characters there is no link.

## 9. The GS1 Logistic Label

For an SSCC, **Label** → **A label** offers the card *GS1 Logistic Label* (General Specifications 6.6); **Label size**
under the cards gives A6 (105 × 148 mm, at first), 4 × 6 in, A5 (148 × 210 mm) or 6 × 8 in. **From** and **To** take who sends and who receives it. **2D symbol beside the data** adds
a QR code or a Data Matrix with the GS1 Digital Link URI, or a GS1 DataMatrix with the element string, to the right of
the middle block (6.6.4.1.1). **Data titles also in** adds Portuguese, Spanish, French, German or Italian to the English data titles (6.6.4.2:
English unless the trading partners agree on another language, and a second one at the labeller's discretion).

![A GS1 Logistic Label in A5](images/guide/logistic-label.png)

- The top block: the free text, 3.5 mm high, FROM on the left half and TO on the right. A line too long for its half
  goes on to the next line, broken between words; a word too long on its own is broken after a hyphen, slash, comma or
  semicolon (*Hortifrutigranjeira-* / *Cooperativa*), after the last of two such marks in a row (*Agroindustrial,-* /
  *Belo*), keeping the marks a word starts with on its line (*--Hortifrutigranjeira*, not *--* at the end of the line before), never between two digits such as a postcode's (*01305-100*, or *01305 100* written with a space, while it fits
  a line), and only then between its letters, a hyphen or comma never starting a line; type a new line where you want one. When the wrapped lines leave the label too short, the free text is made 3 mm high, the least
  6.6.4.4 allows; if even that does not fit, the label is refused, with shorter text in From and To among the cures.
- The middle block: each element string's data title (SSCC, CONTENT, COUNT, BATCH/LOT…) above its content, 7 mm high. A content wider than the label (an 18-digit SSCC is 102 mm at 7 mm, wider
  than a 4 × 6 in label) takes 2 mm margins and is made just small enough to fit.
- With a second language, each title has its translation on a line of its own under it (CONTENT, then CONTEÚDO or
  CONTENIDO, CONTENU, INHALT, CONTENUTO), and so have FROM and TO (REMETENTE, DESTINATÁRIO; ABSENDER, EMPFÄNGER…); a
  title that is the same in every language, such as SSCC or GTIN, or that the language writes as English does (ROUTE
  in German), stays one line, its content level with the others on its row. The second line
  takes 4 mm a row, so a label that was just full may then need the larger size. The translations are drafts, to be
  reviewed by native speakers. ZPL prints their accents (UTF-8, checked through Labelary) and TSPL declares UTF-8;
  EPL2 and DPL files carry them in UTF-8 too, which a printer set to another code page may print otherwise.
- The 2D symbol, if chosen: at the middle block's top right, at table 5's X-dimension (0.743 mm at 100 %, growing with
  **Size** as GS1-128 does), its quiet zone clear of the text; a line too wide for the room beside it goes below it.
  It carries every element string, which the GS1-128 symbols already show as text, so it has no text of its own. The
  caption gives its modules, and **Scan test** reads it with the GS1-128 symbols.
- The bottom block: the GS1-128 symbols with their 3 mm text, the SSCC alone in the lowest, the rest split as they fit
  the page's width.

A page too short for its symbols is refused with its height. The label exports as SVG, PNG, PDF and EPS and in bulk,
and in ZPL with the printer's own commands: each GS1-128 a `^BC` at the printer profile's dots, the text and the rules
where the layout puts them, the 2D symbol as `^BQ` or `^BX` at whole dots within table 5's X-dimensions, and its test print. A6 and A5 are wider than a 4-inch printer prints (104 mm): choose 4 × 6
in, or a printer profile of your own that prints wider. In EPL2 too: each GS1-128 as UCC/EAN 128, the text in the
printer's font that fits the room the layout gives it, and a Data Matrix with the GS1 Digital Link URI beside the data;
EPL2 refuses an element string of no predefined length that is not the last of its symbol (as `(37)` before `(10)`),
a GS1 DataMatrix and a QR code, saying why. In TSPL and DPL for an SSCC alone, the element string their GS1-128
carries: the same text, rules and 2D symbol, with what each refuses for a symbol alone refused here too (other element
strings, a GS1 QR Code; in DPL a GS1 DataMatrix). A ZPL template does not write it yet (its PDF prints it).

## 10. Printer (ZPL, TSPL, EPL2, DPL, PPLA, PPLB)

A thermal printer prints whole dots, so a module must be a whole number of dots or the symbol degrades. **Printer
(ZPL, TSPL, EPL2, DPL, PPLA, PPLB)** sets the printer the print files are for, and its language:

![Printer (ZPL, TSPL, EPL2, DPL, PPLA, PPLB): the profile and the module's dots](images/guide/printer.png)

- **Printer profile**: *Any ZPL printer* at 152, 203, 300, 406 or 600 dpi, *Any TSPL printer*, *Any EPL2 printer*,
  *Any DPL printer*, *Any PPLA printer* and *Any PPLB printer* at 203 and 300 dpi, all 104 mm wide, or your own — **New
  profile…** takes a name, the language (ZPL, TSPL, EPL2, DPL, PPLA or PPLB), the
  resolution (100 to 1200 dpi) and the print width (10 to 500 mm); **Edit profile** changes it. Your profiles are kept
  in this browser.
- With a TSPL, EPL2 or DPL profile the studio says that its files are checked in an emulator (Labelize), not yet on such a
  printer: print the test label and scan it before a production run. What the language cannot print is refused with
  the reason ([printing guide, section 8](printing-guide.md#8-tspl-epl2-dpl-ppla-and-pplb)).
- An Argox printer speaks PPLA or PPLB (its display or self-test printout says which). With a PPLA or PPLB profile the
  studio says that its files are written with the DPL or EPL2 commands Argox's manual gives alike, and checked in
  Labelize as DPL or EPL2. PPLA has no QR code and PPLB no Data Matrix: choose a Data Matrix for PPLA, a GS1-128 or an
  EAN for PPLB, or print the PDF.
- **Module**: the whole numbers of dots within the table's X-dimension range, the nearest to the label's size by
  default; the X-dimension printed is said (*✓ X 0.500 mm (4 dots at 203 dpi) is within the table's 0.396 to 0.990
  mm*), or that no whole number of dots fits.
- A label wider than the printer prints is refused.
- **Test print** (in the profile's language) adds a 50 mm ruler with a tick every 10 mm and the settings under the label:
  print it and measure the ruler to check the printer's scale.

The section's download button — *Download ZPL (203 dpi)*, *TSPL (203 dpi)*, *EPL2 (300 dpi)*, *DPL (300 dpi)*,
*PPLA (203 dpi)* or *PPLB (203 dpi)*, a `.zpl`, `.prn`, `.epl`, `.dpl`, `.ppla` or `.pplb` file — and the bulk print
file use the same profile and dots. The ZPL template is offered with a ZPL profile. The Export bar's **Label printer…**
opens this section and brings it into view.

## 11. RFID and NFC (EPC), and NFC tags

**RFID and NFC (EPC)** gives the key's EPC as the EPC Tag Data Standard 2.3 encodes it, for every key that has a scheme
(SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GSRNP, GDTI, SGCN, CPI, ITIP):

![The EPC of a GTIN with a serial number](images/guide/epc.png)

- **Scheme**: **Classic** (SGTIN-96, SGTIN-198, SSCC-96…, which every RFID reader knows), **EPC+** (TDS 2.0) or
  **EPC++** (TDS 2.3, EPC+ with the hostname of your GS1 Digital Link URI's domain, from the settings). EPC+ and EPC++
  need no company prefix length, so its list and GS1's table are not shown; older readers may not know them.
- **Date in the EPC** (EPC+ and EPC++ of a GTIN whose data has a production, packaging, best before, sell by, expiry,
  first freeze or harvest date): *None* gives an SGTIN+, a date a DSGTIN+, which puts it before the GTIN.
- **Company prefix length** (classic): chosen, or *Automatic* from GS1's GCP length table (`GCPPrefixFormatList.xml`,
  which GS1 gives on request): load it once, it is read here and kept in this browser.
- **Filter**: the EPC filter value (1 for a point-of-sale trade item…).
- Classic: the scheme, the EPC in hexadecimal as on the tag (filled to 16-bit words), in base 64, the tag URI, the pure
  identity URI and the links for NFC (`/eh…` and `/ex…` on your domain), each with **Copy**.
- EPC+ and EPC++: the scheme (*SGTIN+*, *DSGTIN++*…), its length in bits and in 16-bit words of the tag's EPC memory,
  the EPC in hexadecimal and the GS1 Digital Link URI it carries, read back from the hexadecimal; they have no tag URI.
- **The data's other element strings after the EPC (+AIDC data)** (EPC+ and EPC++): the batch, dates, weights and the
  other element strings of step 1 that the EPC does not carry follow it in the tag's EPC memory, each as the EPC Tag Data
  Standard's table F encodes it. The line under the box says which (*After the EPC: (17) (10) (3103).*) and why any
  cannot (an AI newer than the standard, or a value longer than its table allows). Past 496 bits (31 words), the most an
  EPC memory can hold, the length says so.
- The other way round: an EPC pasted in step 1, its hexadecimal (classic or new) or its tag URI, fills in the data
  (section 16).
- A key that needs a qualifier for its EPC says so (*This key's EPC needs its qualifier (21), such as the serial
  number.*).

**NFC tag** writes the GS1 Digital Link URI, or the EPC's link for NFC, to an NFC tag as an NDEF URI record:

- **Write to an NFC tag**, then **Read the tag back** to check it holds that URI. This needs Web NFC, which only Chrome on
  Android has; hold the tag to the phone when asked.
- Elsewhere, **NDEF file** saves the NDEF message (NFC Forum URI record, the prefix abbreviated) for a tag writer app.

### The RFID Studio: the tag's memory and writing it

The start page's **RFID Studio** (or *Open in the RFID Studio* in the card above) gives the tag its own steps. Step 1
is the editor's: what is typed in one studio is there in the other, and so are the scheme and filter chosen.

![The RFID Studio: step 1, the encoding, the tag's memory word by word](images/guide/rfid-studio.png)

1. **What does the code identify?** Type or paste the data as in the editor; an EPC's hexadecimal or URI pasted fills it
   in too.
2. **How is it encoded?** The scheme (Classic, EPC+ or EPC++), the company prefix's length or GS1's table, a DSGTIN's
   date, the filter and +AIDC data, as in the card above.
3. **The tag's memory**: the tag drawn with its EPC memory as a bar (the dashed line at 464 bits is the most a tag with
   an XPC_W1 word holds; 496 bits without one), then the EPC bank word by word from bit 00h: the **StoredCRC** (grey;
   the tag computes it itself, shown so that you can compare it with what a reader returns), the **StoredPC** (orange;
   its Length counts the EPC's 16-bit words) and the **EPC** (blue), zero-filled to the word. Under **Control bits in the
   StoredPC**, *Hazardous material* sets the attribute bit x01 (Gen2 version 1 tags) and *User memory holds data* the
   user memory indicator; both change the StoredPC and its CRC. The EPC's forms follow (hexadecimal, base 64, URIs,
   links for NFC).
4. **Writing and reading back**: a browser cannot write or read a UHF tag, so this step gives what an encoder or an RFID
   printer takes:

![Step 4: the EPC for an encoder, ZPL for an RFID printer, the NFC tag](images/guide/rfid-write.png)

- *EPC, from bit 20h* for most encoders and readers; *StoredPC and EPC, from bit 10h* for one that writes the PC too;
  *The whole bank, from bit 00h* as a reader that dumps the bank shows it; the tag URI with the control bits
  (`urn:epc:tag:[att=x01]:sgtin-96:…`). Each with **Copy**.
- **RFID printer (ZPL)**: *From bit 10h* (the StoredPC and the EPC, right on any Gen2 printer) or *From bit 20h* (the
  printer sets the PC; Zebra ZD500R, ZT400 and ZT600 series only). **The tag and its EPC in text (.zpl)** prints a label
  with the EPC and its pure identity URI while writing the tag; **The tag with the Label Studio's label (.zpl)** adds
  the commands to the label made in the Label Studio, so that one pass prints the label and writes its tag. See the
  [printing guide](printing-guide.md#rfid-printers).
- **Reading back**: paste what the reader returned after writing a tag, in hexadecimal: the EPC alone (what most
  readers show), or the bank from bit 10h or from bit 00h. *The tag holds what was meant* — or each difference, with
  what to do: another EPC, a Length that does not count the EPC's words (write from bit 10h), the attribute bits, the
  toggle, a CRC that does not match (read again).
- **NFC tag**, as in the card above.

## 12. Digital signature (GS1, JWS)

Signs the code's data as the GS1 Digital Signatures Technical Implementation Guideline 1.1.0 (section 4) describes: a
JSON Web Signature you publish where your resolver's link type `gs1:jws` points, with your public key.

![A signature made and verified in the page](images/guide/signature.png)

1. Fill in **Product name** and **Brand** if you want them in the signed data (the key, serial, batch and dates come
   from step 1).
2. Optionally a **Security marking** — hologram, microprinting, UV ink or watermark — with **Where to look**, its **Code
   pattern** (a regular expression the code must match) and **The code in the signature**: *shown*, to compare with the
   marking (the guideline's workflow 2), or *taken out*, to be read from the marking (workflow 3).
3. **New key** makes an ECDSA P-256 key in the page (its RFC 7638 thumbprint as its *kid*), or **Use a saved key…**
   takes one you saved. **Save the key (private)** downloads it as a JWK: keep it safe; the page does not keep it.
4. **Sign** writes the JWS and verifies it with the public key before offering it: *✓ Verified here with the public
  key.* **JWS** and **Public key** (a JWK set) download them.
5. With an **Issuer, for credentials (DID)**, such as `did:web:brand.example.com`, **Product data credential** and
   **Key credential** download the GS1 verifiable credentials (data model 1.2.1) as JWTs.

The DigSig of ISO/IEC 20248 in AI (8030), the guideline's section 3, is not offered: its encoding is defined by the ISO
standard itself.

## 13. In bulk: rows from a spreadsheet

**In bulk** in the header turns step 1 into **Rows**; steps 2 and 3 stay as they are, so the label is designed once and
its preview steps through the rows.

![In bulk: drop a file, paste rows or make a sequence](images/guide/bulk-start.png)

1. **Drop a CSV or Excel file**, **Choose a file**, or paste rows copied from a spreadsheet (the header row first) and
   **Use the pasted rows**. CSV with comma, semicolon or tab; Excel's first worksheet (`.xlsx`).
2. Each column's AI is guessed from its header — an AI (`(01)`, `(17) Expiry` always go to that AI), a GS1 data title,
   or a common word in English, Portuguese, Spanish, French, German or Italian (*Lote*, *Validade*, *Código de barras*,
   *Numéro de lot*, *Verfallsdatum*, *Scadenza*). Change it under **Goes
   to**. A column may also go to **URI parameter: …**, one of the GS1 Digital Link URI's own parameters (section 3),
   named by its header: a column *Campanha* gives `…?Campanha=Natal%202026` on each row's URI, after the data
   attributes, and an empty cell leaves it out. A header written `?utm_source` or `lang=` goes there at once, named
   `utm_source` or `lang`. A header of digits only, an empty one or two columns naming the same parameter are refused
   on the rows that fill them; element strings have no place for parameters. Each row's element string carries its
   AIs in the columns' order, after the key (a batch column before the expiry's puts (10) first). Dates become YYMMDD from ISO and day-first forms (`31/12/2027 → 271231`). An AI that carries a time, such as
   (7003), (4324) or (8008), keeps a time after the date (`31/12/2027 15:30 → 2712311530`), (8008) its seconds too;
   (7011), whose time is optional, leaves out a midnight written with its seconds (`00:00:00`, how a date alone is
   exported); other dates drop it. A time may be on a 12-hour clock, with AM or PM (`31/12/2027 8:05 PM →
   2712312005`). An Excel cell keeps the time its format shows (`dd/mm/yyyy hh:mm`), and a cell that holds a time
   alone (`h:mm`, `h:mm AM/PM`) comes as HH:MM, as on a 24-hour clock, for a column shown on the label. (7007)'s
   harvest period takes two dates in one cell, with a dash, *to*, *a*, *até*, *au* or *bis* between them
   (`01/09/2027 - 15/09/2027 → 270901270915`); its first date alone is a single day. A date
   of birth, (7250) or (7251), becomes YYYYMMDD from `1960-01-15` or `15/01/1960`, and (7251) keeps its time
   (`1960-01-15 08:30 → 196001150830`); a two-digit year such as `15/01/60` is left as typed and refused, since its
   century cannot be told. A patient list's headers are guessed too: *GSRN* alone goes to (8018), the recipient's, which
   a patient's data require; *Data de nascimento*, *Sexo*, *Primeiro nome*, *Sobrenome*, *Nome completo* and their words
   in the other languages, or their data titles (*DOB*, *FAMILY NAME*), to (7250)–(7259). A bare *Nome* or *Name* is
   left for you to choose, as it may hold a full name or a surname. A name or an address whose AI takes its other
   characters as %XX — (7253), (7254), (7256), (7257), (7259) and the ship-to and return-to AIs (4300)–(4320) — has its
   spaces written as + and accents as %XX for the barcode (`Maria José → Maria+Jos%C3%A9`); %XX already written is kept. A
   field such as `{7254}` on a label of one's own shows the name as written, *Maria José*. (7252)'s sex is ISO/IEC
   5218's digit (0, 1, 2 or 9) or a word in any of the six languages (`Feminino → 2`, `Männlich → 1`, `Inconnu → 0`);
   a letter such as *F* is refused.
3. **Same value on every row** → **+ Add**: an AI with the same value on every row, such as a country of origin (422).
4. The rows are checked at once: *2 rows ready · 2 with errors*.

The columns chosen are remembered, in this browser, for files with the same headers.

Over the label, the row navigation steps through the rows: *Row 3 · 2 of 4 · fixed*.

## 14. In bulk: the validation report

![The report: the cell at fault outlined and fixed in place](images/guide/bulk-report.png)

- The filters: **With errors**, **Fixed**, **Skipped**, **All**, with their counts.
- Each row in error shows its reason and its cells, the one at fault outlined. Fix it in place: the value is checked at
  once and the row becomes *fixed*. The file itself is not changed.
- **Show** shows the row's label; **Skip** leaves it out of what is generated; **Include** takes it back; **Undo the
  fixes** brings back the file's values.
- **Skip the N rows with errors** skips them together.
- **Report (CSV)** downloads every row with its status, reason, the columns at fault and what was fixed;
  **Corrected rows (CSV)** downloads the rows with your fixes, to correct the file at its source.
- A hint when Excel kept only 15 digits of a long code (an SSCC typed as a number) or a CSV wrote it in scientific
  notation: format that column as text.

## 15. In bulk: sequences and generating every label

### Making a sequence

**…or make a sequence** makes serial numbers or SSCCs:

![Three SSCCs from a company prefix](images/guide/sequence.png)

- **Serial numbers (21)**: how many, the first number, the step, a prefix and the digits (zeros in front);
  `S-000001` to `S-000100`. What AI (21) cannot hold — a character outside its set, more than 20 characters — is
  refused.
- **SSCCs (00)**: how many, the extension digit, the GS1 Company Prefix (4 to 12 digits) and the first serial reference;
  the check digits are computed. A serial reference that does not fit is refused.
- **Make N rows** makes rows of their own; **Add as a column to the N rows** adds the sequence to the rows loaded,
  keeping their fixes and skips. At most 100,000 rows.

### Generate in bulk

Under the Export bar, **Generate in bulk** draws the label shown, with its options, for every row ready or fixed:

![Generate in bulk: files a row, one PDF, label sheets, ZPL](images/guide/generate.png)

- **A file a row**: SVG, PNG, PDF and/or EPS, named by **File names** — `{row}`, `{symbol}`, `{key}`, any AI such as
  `{01}` or `{10}`, or any column's header such as `{Produto}` (the row's cell under it, the header's case and the
  spaces around it aside; accents are dropped, as file names keep plain letters); a name repeated is numbered. The
  first name is shown. **Insert a name** lists the names the pattern can take, each with the first row's value:
  `{row}`, `{symbol}`, `{key}`, the AIs of the first row's data, and under *Columns of the spreadsheet* each column
  holding no AI; the name chosen goes at the end of the pattern, after an underscore unless the pattern ends in `-`,
  `_`, `.` or a space.
- **To print**: **One PDF, a label a page**; **Label sheets** — Avery L7160, L7163, L7651, 5160 or a **Custom sheet…**
  (page, label size, columns × rows, margins and pitch) — each label at 100 % centred in its place, starting from any
  label of the first sheet. A label larger than the sheet's labels is said before generating; labels are never scaled.
  **One ZPL file** with every label, for the printer profile chosen. The option *Crop marks* puts them around each
  label's PDF and EPS and every page of the PDF of a label a page, never on label sheets, whose labels are die-cut.
- **Generate N labels** makes one zip with the files chosen and `generated.csv`, which lists every row and what was
  made of it, or why nothing was. Rows in error or skipped are left out and named there.

Generation runs in the background with a progress bar and **Cancel**; the page stays usable meanwhile. A thousand QR
code labels as SVG and one PDF took 10.7 s when measured ([performance targets](metrics/README.md#performance-targets-backlog-25)).

## 16. Shortcuts worth knowing

The studio understands more than its fields show. Each shortcut below is tried by a test that passes, and is worth
showing to someone new to the tool.

| Type or paste | Where | What the studio does |
|---|---|---|
| A scanner's output, its symbology identifier first: `]d2010950600013435210ABC123{GS}17271231` (GS1 DataMatrix) or `]C1…` (GS1-128) | **Have the data already? Paste it** | Fills in every field, as from the element string; `{GS}` or `^` stands for the group separator a scanner sends (section 3) |
| An element string without brackets: `^0109506000134352^10ABC123{GS}17271231` | the same | The same as with brackets |
| A GS1 Digital Link URI with your own parameters: `https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2` | the same | (17) and (20) become data attributes, `a` and `b` two rows of **Parameters of the URI**; the URI is kept as pasted |
| A GTIN in its own length: `9506000134376` (13 digits), 8 or 12 digits too | the key's value | Taken as it is; the check digit is checked as you type |
| A decimal with a comma: `0,5` in a net weight (310n) | an attribute's value | Written with its decimal places in the AI: *(3103) 000500*, which the hint shows |
| A patient's sex as a word: `Masculino`, `female`, `weiblich`, `Inconnu` | (7252)'s value | Its ISO/IEC 5218 digit: *(7252) 1*, *2*, *0*; a letter such as *M* is refused, as it means male or female by language |
| A name as people write it: `Maria José` | (7253), (7254), (4300)–(4320) | Written for the barcode as *Maria+Jos%C3%A9*; a pasted *Jo%C3%A3o* is shown as *João* |
| An AI's number: `21` | an attribute's AI field | Lists (21) first, then the AIs that contain 21; the arrow lists every AI |
| A spreadsheet's rows, copied with their header row | **In bulk** → paste, **Use the pasted rows** | No file needed (section 13) |
| Headers in any of the six languages, or GS1 data titles: *Lote*, *Validade*, *Verfallsdatum*, *DOB* | a bulk table's header row | Each column goes to its AI; dates such as `31/12/2027` become `271231` |
| A header written `?utm_source` or `lang=` | the same | The column becomes one of the URI's own parameters, named `utm_source` or `lang` |
| The Delete or Backspace key, an element chosen | a label of one's own, outside its fields | Removes the element, as the **Delete** button does (section 5) |
| An EPC read from an RFID tag, in hexadecimal: `3074257BF7194E4000001A85` (SGTIN-96), `FC14379F09506000134352654B5D34D62A0CFCD8DC00` (DSGTIN++), spaces and lower case allowed | **Have the data already? Paste it** | Fills in the key, its serial or other qualifier, a DSGTIN's date and any element strings after the EPC (section 11) |
| An EPC's tag URI or pure identity URI: `urn:epc:tag:sgtin-198:1.9506000.013437.S1001`, `urn:epc:id:sgln:9506000.13437.7` | the same | The same, from the URI |

## 17. Messages and what to do

| Message (or its start) | Why | What to do |
|---|---|---|
| *The check digit does not match: it should be N.* | A digit is mistyped, or the last digit is not the check digit | Correct the value; the studio computes the check digit for a sequence |
| The engine's message, characters marked (*day 00*, *illegal day of the month*) | The value breaks the AI's format | Correct what is marked |
| *Qualifiers (22) and (235) cannot be used together* | The key takes one set of qualifiers or the other | Remove one |
| *It is invalid to pair AI (01) with AI (37)* (or another pair) | The General Specifications forbid the pair (4.13) | Keep the keys the pairing allows |
| A value with `(` refused | The barcode encoder cannot take it yet | Use another character |
| *EAN-13 carries a GTIN-13…*, *UPC-E carries a GTIN-12…* | The symbol cannot carry that GTIN | Choose the symbol step 2 recommends |
| The data does not fit the QR version chosen | Too much data for that version and level | Choose *Automatic*, a larger version or a lower level |
| *The parameter "…" is given twice*, a name of digits | Parameters of the URI need unique, non-numeric names | Rename it |
| *…mm wide; … prints 104 mm* | The label is wider than the printer prints | A smaller size, a fewer-dot module, or another profile |
| *The label (… mm) is larger than the sheet's labels* | Labels are never scaled | A smaller size or a sheet with larger labels |
| *ZPL places the text below or above the symbol* | ZPL refuses text left or right (the printer's font sets its width) | Text below or above for ZPL; the PDF keeps it beside |
| *ZPL writes the QR code in the printer's automatic mode* | One QR mode could not be shown to print in ZPL | Automatic mode for ZPL; the PDF keeps the mode |
| *^BR prints … at 1 to 10 dots a module* | GS1 DataBar in ZPL at this size | Another size, or the PDF |
| GS1 DataBar refused in ZPL at a till (tables 1 and 3) | `^BR` prints a fixed height, below what the table asks | Print the PDF |
| *DPL prints an image stored in the printer's memory first…* | An image on a label of one's own, in DPL | Print its ZPL, EPL2, TSPL or PDF |
| *DPL's Data Matrix is printed upright only for now…* | A turned Data Matrix on a label of one's own, in DPL | Turn it back to 0°, or print its ZPL, TSPL or PDF |
| *TSPL's QR code is printed upright only for now…* | A turned QR code on a label of one's own (from a work file), in TSPL | Turn it back to 0°: a QR code is read in any direction |
| *The … runs past the label's edge at … dots a module* | A barcode of a label of one's own, at the printer's dots, past the label's edge | Move it inside the label |
| *A line or box runs past the label's edge* | A line or box of a label of one's own past the label's edge, in a print file | Move it inside the label, or shorten it |
| *A line or box needs a length, a width and a thickness greater than 0 mm* | A line or box of a label of one's own with a size of 0 | Give it a size |
| *… is not an image this browser can read* | **+ Image** or **Replace…** given a file that is not a PNG, JPEG, GIF, WebP or SVG image, or a damaged one | Choose the image file, or save it again as PNG |
| *An image runs past the label's edge* | An image of a label of one's own past the label's edge, in a print file | Move it inside the label, or make it narrower |
| *ZPL prints a QR code upright only…* | A QR code of a label of one's own turned (in a work file made by hand), in ZPL | Turn it back to 0°: a QR code reads in any direction |
| *A line of text runs past the label's edge* / *A barcode's text runs past the label's edge* | A turned text, or a turned barcode's text or ITF-14 frame, past the label's edge, in ZPL, EPL2 or TSPL | Move it inside the label |
| *EPL2 prints a Data Matrix upright only…* | A turned Data Matrix of a label of one's own, in EPL2 | Turn it back to 0°, or print its ZPL or its PDF |
| *(10) is not a date, so its field takes no date format.* | A text block's field such as `{10:DD/MM/YYYY}` | Write `{10}` alone; formats are for dates |
| *The date format “…” has none of DD, MM, MMM, YY, YYYY, hh, mm and ss.* | A date field's format without a part of the date or time, such as `{17:dd/yy}` | Write the date's parts in capitals: `{17:DD/YY}` |
| *(17) carries no time, so its field takes no hh, mm or ss.* | A time after a date that has none, such as `{17:DD/MM/YYYY hh:mm}` | Leave out `hh`, `mm` and `ss`; a time comes with AIs such as (7003) |
| *This file is not a work saved by GS1 Label Studio.* | **Open…** was given another file (a spreadsheet, an image) | Open a `.gs1-work.json` file saved here, or a ZPL downloaded here |
| *This ZPL carries no work: only the ZPL that GS1 Label Studio downloads can be opened here.* | A ZPL made elsewhere, or a ZPL template | Open the work file, or view the ZPL in Labelary's viewer |
| *Part of the work in this ZPL is missing* | The ZPL was cut or edited, and some `^FX` comments are lost | Download the ZPL again |
| *This work was saved by a newer version of GS1 Label Studio* | The file comes from a newer studio than the page shown | Reload the page, then open it again |
| *The work file is damaged (part: …)* | The file was edited and a part is not as the studio writes it | Save the work again from the studio |
| *Table … does not allow …* | A barcode on a label of one's own that the scanning environment's table does not have | Choose another symbol, or another environment (or another answer in step 2) |
| *The label is 148.0 mm wide; … prints 104 mm* | An A5 or A6 GS1 Logistic Label on a 4-inch printer | Choose 4 × 6 in, or a profile of a wider printer |
| *… is not offered yet: Labelize, the emulator the tests print TSPL with, does not draw it* (or EPL2) | No test has read that symbol back in that language | Use a ZPL profile, or print the PDF |
| *EPL2's Data Matrix (the b command) has no FNC1…*, *EPL2's QR code is for Japanese printer models only* | The language cannot print it | Use a ZPL profile, or print the PDF |
| *DPL's GS1-128 is offered for an SSCC (00) alone…*, *TSPL's GS1-128 is offered for an SSCC (00) alone…*, *DPL's Data Matrix (W1c) has no FNC1…* | DPL or TSPL cannot print it, or no test has read it back (a GS1 Logistic Label with more than an SSCC too) | Use a ZPL or EPL2 profile, or print the PDF |
| *DPL sizes a QR code's module in tenths of a millimetre…* | The module's dots fall between DPL's sizes | Choose another size or printer |
| *the A6 label is 148 mm high* (too short) | The page cannot hold its symbols | A larger page (A5, 6 × 8 in) |
| *Not a name the pattern knows: {…}* | A file name pattern with an unknown name | `{row}`, `{symbol}`, `{key}`, an AI or a column's header |

## 18. Glossary

| Term | Meaning |
|---|---|
| AI | Application Identifier: the number in brackets that says what a value is — (01) GTIN, (10) batch, (17) expiry |
| Element string | An AI and its value; several make the data of GS1-128, GS1 DataMatrix or GS1 DataBar Expanded |
| GS1 Digital Link URI | A web address that carries the same data, such as `https://id.gs1.org/01/09506000134376/10/B42`; what the QR code and Data Matrix with a GS1 Digital Link carry |
| Key | The identification key: GTIN, SSCC, GLN, GRAI, GIAI… |
| Qualifier | A value that refines the key in the URI's path: batch, serial number, variant |
| Data attribute | Further data: expiry, weight, price; in the URI's query string |
| Symbol specification table | The table of the General Specifications (5.12.3) that sets the symbols, sizes and quality where a code is scanned |
| X-dimension | The width of the narrowest bar or of a module |
| Module | The smallest element of a symbol: a narrow bar, or a square of a 2D symbol |
| Quiet zone | The empty margin a symbol needs around it |
| HRI | Human readable interpretation: the text under or beside the symbol |
| FNC1 | The character that marks a GS1 symbol and separates element strings of no fixed length |
| Bearer bars | The frame or bars around an ITF-14 |
| EPC | Electronic Product Code: the key as an RFID tag encodes it |
| NDEF | The message format of NFC tags |
| JWS, JWK | JSON Web Signature, JSON Web Key |
| ZPL | Zebra Programming Language, the printer language of Zebra printers and many others |
| dpi | Dots per inch: a printer's resolution |
