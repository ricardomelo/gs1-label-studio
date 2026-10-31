# Conformance to the standards

What GS1 Label Studio follows of each standard, section by section, what it does not do (yet), and the tests that are
the evidence (named as in [features.md](features.md): `file`: words of a test's name, in the
[inventory](test-inventory.md)). The standards themselves are copyrighted and are not in this repository; the
maintainer keeps them in the project's references.

Releases read: GS1 General Specifications release 26.0 (2026); GS1 Barcode Syntax Engine 1.4.1 and its dictionary;
GS1 Digital Link URI syntax as the engine implements it; EPC Tag Data Standard 2.3 (October 2025) and Tag Data
Translation 2.3 (February 2025); GS1 Digital Signatures Technical Implementation Guideline 1.1.0 (January 2026); GS1
Verifiable Credentials data model 1.2.1; NFC Forum URI Record Type Definition; Zebra's ZPL II Programming Guide
P1134473-11EN Rev A.

## Contents

1. [GS1 General Specifications](#1-gs1-general-specifications)
2. [GS1 Barcode Syntax Engine and GS1 Digital Link](#2-gs1-barcode-syntax-engine-and-gs1-digital-link)
3. [Symbologies (ISO/IEC)](#3-symbologies-isoiec)
4. [EPC Tag Data Standard and NFC](#4-epc-tag-data-standard-and-nfc)
5. [GS1 Digital Signatures and Verifiable Credentials](#5-gs1-digital-signatures-and-verifiable-credentials)
6. [ZPL II](#6-zpl-ii)
7. [Deliberate differences and open points](#7-deliberate-differences-and-open-points)

## 1. GS1 General Specifications

| Section | What it asks | What the studio does | Evidence |
|---|---|---|---|
| 1.3 | The GS1 identification keys and their qualifiers | The 16 GS1 Digital Link primary keys and the Made-to-Order GTIN (03), with its batch (10) or serial (21), in element strings only | `identifiers`: offers the 16 GS1 Digital Link keys · `identifiers`: carries (03) in element strings |
| 2 (applications) | The carrier choices of each application (2.1.3 fixed measure, 2.1.12.1 variable measure, 2.2.1 logistic units, healthcare…) | `guide.ts`: each leaf of the tree is a section 2 application; its carriers in the standard's order, the first that carries all the data recommended | `guide`: lists every carrier and every symbol in addition · `guide`: a logistic unit: GS1-128 |
| 2.1.3, 2.1.12.1 | At a retail till, a fixed measure item's attributes in a 2D symbol in addition; DataBar Expanded for a variable measure item | DataBar Expanded carries everything at a till only with AIs 30, 31nn, 32nn, 35nn, 36nn | `guide`: GS1 DataBar Expanded carries the attributes of a variable measure item only |
| 3 (AIs) | Each AI's format, check digit, date rules | The Syntax Engine checks every element string; the editor names the AI and its format | `syntax`: explains errors and marks the characters at fault |
| 4.13.1, 4.13.2 (tables 4-4, 4-5) | Pairs of AIs that must not, or must, go together | Enforced by the Syntax Engine; the pairings offered as links in the editor | `identify`: the engine refuses the pairs the tables forbid |
| 4.14 (HRI) | Human readable text: below by default, above or beside where space asks (rule 1), split key/attributes (1d), never broken (1e), at least 2 mm (2a iii), 3 mm on logistic labels (5c) | Text position below, above, split, left, right; height from 2 to 5 mm; EAN/UPC digits as 5.2.5 places them | `hriplace`: text above the symbol · `hriplace`: sizes the text from 2 mm, and refuses less |
| 5.2 (EAN/UPC) | Modules, guard bars, quiet zones, digits | Ported from the resolver, checked against its fixtures | `layout`: modules, guard bars, quiet zones, bar height and digits |
| 5.3 (ITF-14) | Ratio 2.25 to 3, bearer bars (frame 4.83 mm or bars), quiet zones of 10X, digits clear of the bearer bar | Ratio 2.5 (3 in ZPL, whole dots), frame or bars of 2X, digits 1.02 mm below | `bars`: is as wide as section 5.3.2.2's expression · `bars`: has a frame 4.83 mm thick |
| 5.4.4.3 (GS1-128) | At most 48 data characters, 165.10 mm with quiet zones | Counted as the section does; beyond them, several symbols in order | `guide`: allows 48 and refuses 49 · `gs1128`: splits where a symbol would pass 165.10 mm |
| 5.12.3 (tables 1 to 13) | X-dimension range and target, minimum bar height, quiet zones, quality for each application | Every row in `specifications.ts`, each tested against the standard's text; only sizes within the range offered | `specifications`: has the printed rows, in their order, and no others · `bars`: refuses a size outside the row's range |
| Figure 5-68 | The decision tree to the symbol specification table | `walk()` node by node; questions the key answers left out | `guide`: reaches all thirteen tables · `guide`: has a question for every node the key does not answer |
| 6.6 (logistic label) | Layout of the GS1 Logistic Label: blocks, free text ≥ 3 mm, data titles, contents ≥ 7 mm, SSCC in the lowest symbol | `logistic.ts` in A6, 4 × 6 in, A5, 6 × 8 in | `logistic`: is the page's size, its SSCC alone in the lowest symbol |
| 7.9 | The check digit | Computed and checked | `checkDigit`: matches published keys |
| 7.12 | The century of a YYMMDD date | Used by the signed payload's dates | `sign`: dates YYMMDD as section 7.12 chooses the century |

Not done: composite components (CC-A, CC-B, CC-C); EAN/UPC add-ons; the reduced bar heights of the footnotes for small
items; margins and crop marks; GS1 DotCode (named, not drawn: no independent decoder to check it); product and
healthcare label templates; data titles in a second language.

## 2. GS1 Barcode Syntax Engine and GS1 Digital Link

| What | What the studio does | Evidence |
|---|---|---|
| The engine as the gate | Every input parsed and checked by `gs1encoder` 1.4.1: bracketed and unbracketed element strings, scanner output with symbology identifiers, GS1 Digital Link URIs | `syntax`: recognises digital-link input · `syntax`: recognises scan input |
| The URI's path and query | One key in the path, its qualifiers in the syntax's order, data attributes and other keys in the query string | `identify`: writes key, qualifiers in path order · `identify`: draws each pairing the General Specifications give |
| AIs a URI cannot carry | Kept for element string symbols; the URI says why | `identify`: keeps an AI a GS1 Digital Link URI cannot carry |
| Non-GS1 query parameters | After the data attributes, percent-encoded; a name of digits refused | `identify`: follow the data attributes in the query string |
| Case | The scheme and domain may be in capitals (RFC 3986), the path and query never | `qrmode`: writes a URI's scheme and domain in capitals |

Not done: a value holding `(` is refused (bwip-js cannot take the engine's escaped form).

## 3. Symbologies (ISO/IEC)

Symbols are encoded by bwip-js (and node-qrcode for one QR mode) and every one is read back by ZXing in the tests,
comparing the symbology identifier (ISO/IEC 15424) and the data.

| Standard | What the studio does | Evidence |
|---|---|---|
| ISO/IEC 15420 (EAN/UPC) | EAN-13, EAN-8, UPC-A, UPC-E | `roundtrip`: ean13 · `roundtrip`: upca |
| ISO/IEC 16390 (ITF) | ITF-14 | `roundtrip`: itf14 |
| ISO/IEC 15417 (Code 128) | GS1-128 with FNC1 | `roundtrip`: gs1-128 |
| ISO/IEC 24724 (GS1 DataBar) | The seven symbols; stacked rows at their least heights | `roundtrip`: gives a stacked GS1 DataBar its rows at their least heights |
| ISO/IEC 16022 (Data Matrix) | ECC 200, square; FNC1 first for GS1 DataMatrix | `roundtrip`: gs1-datamatrix · `roundtrip`: dl-datamatrix |
| ISO/IEC 18004 (QR Code) | Model 2, versions 1 to 40, levels L to H, numeric, alphanumeric and byte modes | `qrmode`: takes the version each mode's capacity gives · `roundtrip`: dl-qrcode |

## 4. EPC Tag Data Standard and NFC

| What | What the studio does | Evidence |
|---|---|---|
| TDS 2.3 schemes | SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GSRNP, GDTI, SGCN, CPI, ITIP from the TDT-derived schemes | `epc`: EPC, as the resolver encoded it · `epc`: EPC read back by an independent decoder |
| The EPC field | Zero-filled to the 16-bit word, as on the tag (the resolver's 4-bit fill was corrected) | `epc`: tries the same schemes for each key |
| GCP length | GS1's GCP length table, the longest prefix | `epc`: reads the list and finds the longest prefix |
| GS1 Digital Link for NFC | `/eh` (hexadecimal) and `/ex` (base 64) links | `editor`: the EPC asks for a serial number |
| NFC Forum URI RTD | The URI abbreviated by its prefix code, short and long records | `ndef`: abbreviates https:// as code 4 |

## 5. GS1 Digital Signatures and Verifiable Credentials

| What | What the studio does | Evidence |
|---|---|---|
| Guideline 1.1.0, section 4 | A compact JWS (ES256) over figure 4-7's JSON-LD payload, the URI as id, the RFC 7638 thumbprint as kid | `sign`: is figure 4-7's JSON-LD · `sign`: writes a compact JWS with ES256 |
| Workflows 2 and 3 | The security marking's code shown, or taken out and put back to verify | `sign`: workflow 3 |
| GS1 Web Vocabulary 1.18 | Security marking types HOLOGRAM, MICROPRINTING, UVINK, WATERMARK | `sign`: is figure 4-7's JSON-LD |
| VC data model 1.2.1 | Key and product data credentials as its examples 5.5.1 and 5.6.1, as JWTs | `sign`: writes the key and product data credentials |

Not done: section 3, the DigSig of ISO/IEC 20248 in AI (8030), whose encoding is defined by the ISO standard; the chain
of trust from GS1 (section 4.6), still GS1's work in progress.

## 6. ZPL II

The printer's own commands (ADR 0002), each printed by Labelary — which renders what Zebra firmware prints — and read
back by ZXing in CI.

| What | What the studio does | Evidence |
|---|---|---|
| `^BC` mode N | FNC1 (`>8`) first and after variable-length element strings; code sets chosen; `>` as `>0` | `zpl`: writes GS1-128 with FNC1 and code sets chosen here |
| `^BX` | FNC1 as `_1`, `_` declared as the escape character | `zpl`: places FNC1 in a GS1 DataMatrix only first and after variable-length element strings |
| `^BR` | GS1 DataBar at its fixed heights; refused where the table asks more | `zpl`: refuses what ^BR cannot print |
| `^FH` | Reserved characters escaped | `zpl`: writes reserved characters through ^FH |
| `^GF` | Byte counts 1 to 99,999: larger images in stripes | `roundtrip`: splits an image larger than a graphic field into stripes |
| Every symbol | Printed and read back | `labelary`: ZPL printed by Labelary and read back |

Findings no manual showed, from Labelary: mode D joins element strings without FNC1; `^BQ` has no FNC1 (no GS1 QR
Code); the Data Matrix escape character changed between firmware versions; `^BQ`'s manual mode was not honoured.

## 7. Deliberate differences and open points

- **QR version.** bwip-js can make a QR code a version smaller than the resolver's segno did, encoding the GTIN's digits
  in numeric mode; the fixtures pin the version where it matters (ADR 0004).
- **Process black.** PDF and EPS in DeviceCMYK 0 0 0 1, where the resolver wrote DeviceGray (ADR 0004).
- **GS1 QR Code** is encoded but not offered in the editor (ADR 0003).
- **ITF-14's ratio** is 2.5 on artwork and 3 in ZPL (whole dots), both within 2.25 to 3.
- **Printers emulating ZPL** are proven only on their own hardware; Labelary renders Zebra firmware.
