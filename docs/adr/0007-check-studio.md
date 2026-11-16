# ADR 0007 — A studio that checks what it is given

| | |
|---|---|
| Status | **Proposed** (15 November 2026); the project's recommended answers taken under the owner's rule while its twelve open questions wait, open to change |
| Decided by | the owner asked (15 November 2026) for a family of studios, one of them checking any barcode or RFID tag it is given: every fault pointed out where it is, explained, with its correction, as the GS1 Healthcare barcode survey app once did; for the reading context to be asked; for history, export, reports and sharing; for a simple view for lay people and an expert one. The project was written at the owner's request and kept in the maintainer's Drive |

## 1. Context

The studio makes barcodes, labels and tags that are right by construction (ADR 0003): every element string passes the
GS1 Barcode Syntax Engine, every symbol is read back by ZXing in the tests. The opposite question — is this code,
made by someone else, right? — has no tool here. A person checking a supplier's label, a nurse with a box that does not
scan, a consultant auditing a pack, needs one that reads the code, says what is wrong, where in the data, why, and how
to put it right.

## 2. Decision

1. **Scope.** What a symbol or tag carries, against the GS1 rules: the carrier and its symbology identifier, FNC1 and
   separators, the AIs, check digits, dates, the associations between AIs, GS1 Digital Link URIs, EPC binary and EPC+
   encodings; whether the symbology suits where the code is scanned (the symbol specification tables, already in
   `specifications.ts`); several carriers on one item, coherent with each other; history, reports, export and
   sharing, on the device. **Out of scope, and said so on the screen:** print quality grading (ISO/IEC 15415 and
   15416 need a calibrated verifier, which a phone camera is not: sizes are estimates, labelled so); whether a GTIN is
   licensed or its data right (a link out to Verified by GS1 or a regulator, not a check); reading UHF RFID tags
   directly (no browser can: their EPC arrives pasted or from a reader in keyboard mode); a server.
2. **One reading record, whatever the way in** (`reading.ts`, item 7.1 a). The camera and an image go through ZXing;
   an NFC tag through Web NFC (Chrome on Android); a scanner in keyboard mode and pasted text through the same field;
   an RFID tag's EPC pasted or typed by its reader. Each becomes a `Reading`: when and how it was read, the carrier,
   the symbology identifier (ISO/IEC 15424) or null, the decoder's format, the bytes, the text, what the decoder
   reports (ECI, level, version, mirrored, inverted, corners), the tag's serial number, and whether the identifier
   was assumed.
3. **Bytes, not text.** The decoder is asked for the symbol's bytes and identifier, not for GS1 text with
   parentheses (the scan test's `textMode: "HRI"`): that text would hide parentheses really encoded, one of the
   faults the studio exists to find. Every other form — the element strings, the human readable text, the control
   characters as pictures (␝) — is derived from the bytes.
4. **What the decoder cannot read is measured, not assumed** (`docs/conformance.md`, section 3.1, held to the measure
   by a test). ZXing reads every symbology the studio makes, and the plain carriers a faulty label uses instead
   (Code 128 under `]C0`, Data Matrix under `]d1`, a QR code under `]Q1`), but it has no DotCode decoder, reads only
   the linear part of a Composite symbol, gives a UPC-A as its EAN-13 and does not tell GS1 DataBar Truncated or
   Stacked Omnidirectional from their siblings. The studio says "this symbol cannot be read here", not "no barcode".
5. **The logic in the core, no server** (ADR 0001). The reading, the catalogue of faults, the repairs, the checks of
   one code and of several, the estimates, the history's format and the report are pure functions of
   `packages/core`; the application draws them. No request leaves the page for a reading: the decoder, the engine and
   the EPC tables are the application's own files, cached for use offline. The camera stops when the result opens,
   when the tab is hidden and when the studio is left; no frame is kept unless the user keeps a picture, reduced and
   without metadata.
6. **Built in the project's order:** the engine first (7.1 a to d, no screen), then the start page and the screens,
   then keeping and sending, then the estimates (the project's Q2, recommended).
7. **A repair is kept only when it leaves fewer faults** (7.1 b). The check never guesses: it tries a named repair
   (assume the FNC1, strip the parentheses, strip spaces and titles, make a stand-in a separator, insert a separator),
   splits the data into element strings again and keeps the repair when fewer element strings are refused; the repair
   names the fault and gives the data made right. Each element string goes through the Syntax Engine alone, its
   associations switched off, so that every fault of a symbol is reported, not only the engine's first; the whole
   message is checked once each element string is valid. Every finding points at the reading's own bytes.
8. **The catalogue is data, in English, until a screen shows it** (7.1 b). The 77 faults are
   `packages/core/src/data/check_faults.json`, with the project's texts, which cite the General Specifications and
   are written for an expert; the simple view's wording (the project's section 6.1) and the translations into the
   five other languages come with the result screen (7.1 f), so that no text is translated twice.

9. **The context is asked, and "I do not know" is an answer** (7.1 d). `check()` takes the reading context as a
   scanning environment of `environments.ts`; with one, the symbol is held to that table (F1, with the symbols the
   table allows for this data, recommended first, from `guidance()` as step 2 of the Label Studio lists them) and a
   2D symbol alone at a retail till is a Warning (F3); with `null`, the user's "I do not know", F5 and the codes that
   needed the context listed as not assessed; left out (an API call), those checks are left out, so that a check of
   the data alone is not marked down. The verdict counts only the findings judged: a reading whose data follows the
   rules follows them, with F5 beside it.
10. **Several carriers are compared, not merged** (7.1 d, `checkGroup.ts`). Each reading is checked alone, then the
   group: a matrix of one row per AI and one column per carrier, values compared character by character (4.15.2: no
   leading zero dropped), the GTIN of an EAN/UPC already padded to 14 digits. The user says what the group is (a
   consumer pack, a case, a logistic label, a tag with its printed code), since the rules differ; a finding of one
   reading that the group answers (C9 or E1 whose key or companion another carrier holds, F3 beside a linear symbol)
   is listed as resolved, by J3 where 4.15 still asks for one symbol. The columns are data (carrier, symbol name,
   identifier, EPC scheme), not text: the screen heads them in the user's language (7.1 f). J5, the 50 mm distance,
   is not assessed until the estimates (7.1 m).

11. **The studios have addresses** (7.1 e). Hash routes, which GitHub Pages serves without configuration and which
   never reach the server: `#/` the start page, `#/label` and `#/barcode` the editor (the second with the barcode
   alone), `#/rfid` and `#/check` the studios to come, a query after the route for what a shared link carries. A hash
   without the slash is one of the editor's anchors, as before. The editor stays in the page, hidden, while another
   studio is shown, so that its state survives without being stored.

12. **One result, two depths, the simple view first** (7.1 f). The result screen at `#/check` takes what a code holds
   pasted or typed (a scanner in keyboard mode types into the same field), the symbol it came from (a scanner's
   identifier at the start says it by itself) and where it is scanned, eight places of the project's section 3.6, two
   with a follow-up question, mapped to a scanning environment; "I do not know" is the default answer, so that a check
   is never marked down for a context nobody gave. Mock-up A of two was taken (the owner's rule, open to change): a
   Simple / Expert switch at the head of the result, both views drawn from the same findings; B put the verdict and the
   data beside the cards and the expert view folded at the end. The 77 faults are told in plain words in the web
   application (`apps/web/src/checkTexts.ts`: what, why, how to fix and who), through `t()` in six languages; the
   catalogue's texts stay the expert's, in English, shown as such in the expert view beside the engine's English
   message and its translation. *Make it right* opens the Barcode Studio with the data a repair made valid; the
   editor's Identify card links to the studio with its data, as a GS1 DataMatrix would carry it (`#/check?s=]d2&d=`).
13. **The camera first on a phone, pictures read whole, what cannot be read said** (7.1 g). Three buttons under the
   reading area choose the way in: Camera, Picture, Type or paste; a touch screen opens on the camera (the project's
   Q3, mock-up A of two taken under the owner's rule; B, a menu of the ways in, cost a tap before every reading), a
   mouse on the text a scanner types. The camera starts on a press, so that no page asks for it unasked; frames are
   read every 200 ms in a worker (`decode.worker.ts`, ZXing with `textMode: "Plain"` and up to 16 symbols), the
   same symbol counts once within three seconds, a tone and a vibration mark a reading. The stream stops when the
   result opens, when the tab is hidden and when the studio is left; no frame is kept. Torch and zoom come from the
   track's capabilities where offered. A picture (chosen, taken, dropped or pasted, SVG included) is drawn at most
   2,400 pixels on its longest side and read harder; every symbol is outlined and numbered on it, coloured by its
   verdict, and one chosen shows its result. When nothing is read, the studio names what it cannot read (DotCode, a
   Composite's 2D part: docs/conformance.md, 3.1) and the user can record a code not read, which `check()` reports as
   A9; a linear symbol that may host a Composite Component, read by the camera or in a picture, lists that part as not
   checked. The browser tests play the camera as a canvas stream put in the place of `getUserMedia()` rather than
   Chromium's fake device with a clip, as the project planned: it runs in the three projects and can also play a
   refused, a missing and a torch-and-zoom camera; the frames still go through the video, the worker and ZXing.
14. **A scanner is known by its rhythm; tags are read where the browser can, and said where it cannot** (7.1 h). In
   the text field, four or more keystrokes no more than 50 ms apart ended by Enter are a scan (`wedge.ts`): it is
   checked at once and marked as a scanner's, its Enter leaves no line break, and Ctrl+] types a group separator. The
   three things a scanner gets wrong are named, not blamed on the code: no identifier sent (the symbol is asked, with
   how to switch on AIM ID), the separator lost (B3 from keyboard text says the code may lack it or the scanner may
   drop it, with the set-up), and a US-layout scanner on another keyboard layout (AZERTY, QWERTZ, ABNT2, Spanish and
   Italian undone; offered only when that brings back an identifier or the digits). A fourth way in, Tag, holds NFC
   and RFID together (mock-up A of two under the owner's rule; B gave each its own button, five in a row on a phone).
   NFC is read by Web NFC where it exists; its records are made an NDEF message again (`nfc.ts`, the core's
   `ndefMessage()`), so that a tag from the browser and an .ndef file from an NFC app are read by the same
   `readingFromNdef()`, and every record is listed. Without Web NFC the screen says what works instead (an iPhone
   opens the tag's link by itself; an .ndef file) and shows no dead button. No browser reads UHF RFID: the EPC is pasted
   or typed by a reader in keyboard mode, and a classic EPC is read with the application's own EPC tables. The tag
   writer of 1.19 now shares the Web NFC code.
15. **Several codes of one item: the next reading joins; the matrix is a table on a computer and a card per detail on
   a phone** (7.1 i). After any result, *Add another code from this item* starts a group with that code and clears the
   ways in; the next code read joins it by itself when it comes whole (the camera, a picture's symbol, an NFC tag, a
   scanner's burst) and on a press when it is text being typed or pasted, which has no end the studio can see. The same
   code read twice (the same carrier, identifier and bytes) joins once, so the camera seeing the first symbol again
   adds nothing. Every symbol of a picture or a frame can be taken at once (the project's automatic group). A member can
   be unticked, left listed but out of the check, or removed; either re-runs `checkGroup()`. The kind of group is
   guessed (a tag beside a code, an SSCC in a GS1-128, a GS1-128 alone, else a consumer pack) until the user names it.
   The matrix (`GroupMatrix.tsx`) heads each column with the code's number, name and verdict, and marks the cells of a
   row that differs; a column's head opens that code's own result below. On a phone it is shown as a card per AI with
   each code's value on its own line (mock-up B of two under the owner's rule; A, the same table with the AIs' column
   fixed and the rest scrolling sideways, cut a GTIN in two on a phone 412 pixels wide). J1 between GTINs that differ
   only in the indicator asks the project's question; *Yes* says they are different items and offers to check them one
   at a time.

## 3. Consequences

- The scan test of the label studio keeps `textMode: "HRI"`: it compares what a label carries with
  `expectedReads()`, where parentheses are the convention, not data.
- A new carrier the studio makes needs a row in `docs/conformance.md`, section 3.1, or the test that holds the table
  to the measure fails.
- The faults and the check of groups A and B are item 7.1 b; groups C to E and G, their own rules and the mapping of
  every engine message (`engineFaults.ts`, each message named by a fault or listed with its reason), item 7.1 c; the
  context (group F), tags (I) and several carriers (J), item 7.1 d; the texts in six languages, item 7.1 f. The
  engine's messages moved to `packages/core/src/data/engine_messages.json`, where the core reads them. The open questions (the studio's
  name, what a phone opens on, the report's language, a survey mode, regulatory profiles, a shared link with the
  reading) are the owner's to answer, in the project.
