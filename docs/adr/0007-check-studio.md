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

## 3. Consequences

- The scan test of the label studio keeps `textMode: "HRI"`: it compares what a label carries with
  `expectedReads()`, where parentheses are the convention, not data.
- A new carrier the studio makes needs a row in `docs/conformance.md`, section 3.1, or the test that holds the table
  to the measure fails.
- The faults, their texts in six languages and the checks follow in item 7.1 b; the open questions (the studio's
  name, what a phone opens on, the report's language, a survey mode, regulatory profiles, a shared link with the
  reading) are the owner's to answer, in the project.
