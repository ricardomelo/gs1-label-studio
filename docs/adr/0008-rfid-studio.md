# ADR 0008 — A studio of its own for RFID

| | |
|---|---|
| Status | **Proposed** (17 November 2026); the assessment's recommended option taken under the owner's rule, open to change |
| Decided by | the owner asked (15 November 2026, backlog 6.12) for a destination of its own for RFID: the EPC card, EPC+ and EPC++, +AIDC data, an EPC pasted and NFC grown past step 3's card; a menu of its own beside the label's, with its own steps (the key and data, the scheme, the tag's memory, writing and reading back); an assessment and an ideation round first, then mock-ups |

## 1. Context — what exists

- **The editor's EPC card** (step 3, below the options; items 1.8, 1.19 and 6.7): the key's EPC in every TDS scheme
  that has one, the company prefix's length typed or taken from GS1's GCP length table; EPC+ and EPC++ (TDS 2.x) with
  the filter, a DSGTIN's prioritised date, EPC++'s hostname and +AIDC data after the EPC; the hexadecimal zero-filled
  to the 16-bit word, the tag URI, the pure identity URI; NFC: the link, an `.ndef` file and Web NFC's write.
- **The Check Studio** (ADR 0007): an RFID tag's EPC pasted or typed, decoded (classic or EPC+, header, filter,
  partition) and compared with the item's barcodes; an NFC tag read with Web NFC.
- **Not there:** the tag's memory as a writer or a reader sees it (the PC word whose Length counts the EPC's 16-bit
  words, the UMI, XI and toggle bits, the attribute bits, the StoredCRC a tag computes, the space a scheme needs
  against the tag's EPC memory); printing to an RFID printer (ZPL's `^RS` and `^RF`, Zebra's guide P1134473-11EN,
  pp. 412–444); many tags at once (a serial sequence as a file an encoder takes); what a reader returned compared
  with what was meant to be written.

What a browser cannot do stays out, as ADR 0007 says: no browser reads or writes a UHF tag (only NFC on Android, with
Web NFC). A tag is written by an RFID printer or an encoder from what the studio gives, and read back by pasting what
the reader returned.

## 2. Options (the ideation round)

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **A studio at `#/rfid` with its own steps**: 1 what the tag identifies (the editor's step 1, the same data); 2 the encoding (classic, EPC+ or EPC++, the filter, the company prefix, a DSGTIN's date, the hostname, +AIDC data); 3 the tag's memory (the EPC bank word by word, the bits it needs against the tag's); 4 writing and reading back (hexadecimal and URIs for an encoder, ZPL for an RFID printer, NFC, a file of many tags, what a reader returned compared) | the steps the owner named; the start page's RFID card becomes real; room for the memory, printing and bulk without crowding the label's editor; the data typed is shared both ways | a second screen to keep in step with the editor's step 1 |
| B | **The editor with a carrier switch** (barcode, RFID tag, both) in step 2, step 3 showing the tag's memory instead of the label | least new code; one place for everything | the label's editor, already long, grows again; the steps the owner named do not appear; a menu of its own is not one |
| C | **A converter**: one field that takes anything (element strings, a GS1 Digital Link URI, an EPC URI, hexadecimal) and shows every form and the memory at once | quick for experts; reading back comes free | no guided steps for a first-time user; writing and bulk have no natural place; overlaps the Check Studio |

**Option A is taken**, under the owner's rule (the recommended option, open to change). C's strength is kept inside
A: step 4's *read back* takes any of the forms C would, and step 1 accepts anything pasted as the editor's does.

## 3. Decision

1. **A studio of its own** at `#/rfid`, offered by the start page and the editor's menu, with four steps (2 above).
   Step 1 is the editor's: what is typed in one studio is there in the other. The editor's EPC card stays, shortened
   to what it shows today with a link *Open in the RFID Studio*. Its screen (mock-up A of two, as Playwright screenshots
   of the application in Portuguese): the editor's two columns, steps 1 and 2 on the left, the tag's memory and writing
   on the right; B, one step at a time with Back and Next, hid step 1 while the memory was shown and was set aside. On a
   phone the tabs are Data, Encoding, Tag and Write.
2. **The logic in the core**, as everywhere (ADR 0001): the tag's memory (`tagMemory.ts`: the PC word built and read,
   the StoredCRC computed as Gen2 Annex F says, the EPC bank laid out word by word, the bits a scheme needs), the
   printer's RFID commands, the comparison of what was read with what was meant.
3. **Printing to RFID printers only as far as a test proves** (ADR 0002): ZPL's `^RS` and `^RF` first, checked
   against the guide and by decoding the hexadecimal written back to the same EPC; no other printer language until
   its RFID commands are proven the same way.
4. **Nothing pretends to touch a UHF tag.** The studio says what writes it (an RFID printer, an encoder) and what
   reads it (a reader whose output is pasted); NFC is written and read where Web NFC exists.
5. **Items** (backlog 6.12 a to f): a, the studio's screen with steps 1 and 2 (mock-ups first); b, the tag's memory
   (step 3); c, writing (step 4: encoder, ZPL, NFC); d, many tags at once; e, reading back; f, the documents, the
   inventory and the test plan.
6. **Many tags at once** (item d; mock-up A of two, as Playwright screenshots of the application in Portuguese): the
   editor's *In bulk* mode in the studio too, step 1's rows (a spreadsheet, pasted rows or a serial sequence) each a
   tag with step 2's and step 3's choices, and in step 4, above the RFID printer, a *Many tags* panel: a CSV an encoder
   takes (`encoderCsv`: each row's EPC from bit 20h, its StoredPC and EPC from bit 10h, its length and URIs, a row with
   no tag kept with its reason in English), one ZPL file with a label a tag (`zplRfidLabels`), and each row's label of
   the Label Studio with its tag (the bulk generator, `BatchRow.rfid` written after each label's `^XA`, in ZPL only).
   B, a step 5 of its own under step 2, put the run far from the printer's choice of bit 10h or 20h, which both use, and
   was set aside.

## 4. Consequences

- The start page's RFID card is no longer *coming soon* once item a is delivered.
- The editor's EPC card and the RFID Studio share one component for the encoding, so that a fix reaches both.
- Lock, kill and access passwords are not offered: a wrong one makes a tag unusable, and no test here can prove it.
