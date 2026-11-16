# Conformance to the standards

What GS1 Label Studio follows of each standard, section by section, what it does not do (yet), and the tests that are
the evidence (named as in [features.md](features.md): `file`: words of a test's name, in the
[inventory](test-inventory.md)). The standards themselves are copyrighted and are not in this repository; the
maintainer keeps them in the project's references.

Releases read: GS1 General Specifications release 26.0 (2026); GS1 Barcode Syntax Engine 1.4.1 and its dictionary;
GS1 Digital Link URI syntax as the engine implements it; EPC Tag Data Standard 2.3 (October 2025) and Tag Data
Translation 2.3 (February 2025); GS1 Digital Signatures Technical Implementation Guideline 1.1.0 (January 2026); GS1
Verifiable Credentials data model 1.2.1; NFC Forum URI Record Type Definition; Zebra's ZPL II Programming Guide
P1134473-11EN Rev A; TSC's TSPL/TSPL2 Programming Manual 3.0; Zebra's EPL Programming Guide 14245L-003; Datamax's
Class Series 2 Programmer's Manual 88-2341-01 (DPL); Argox's Programmer's Manual 49.20002.001 (PPLA and PPLB).

## Contents

1. [GS1 General Specifications](#1-gs1-general-specifications)
2. [GS1 Barcode Syntax Engine and GS1 Digital Link](#2-gs1-barcode-syntax-engine-and-gs1-digital-link)
3. [Symbologies (ISO/IEC)](#3-symbologies-isoiec)
    1. [What a reader gives back](#31-what-a-reader-gives-back)
    2. [The Check Studio's faults and their sources](#32-the-check-studios-faults-and-their-sources)
4. [EPC Tag Data Standard and NFC](#4-epc-tag-data-standard-and-nfc)
5. [GS1 Digital Signatures and Verifiable Credentials](#5-gs1-digital-signatures-and-verifiable-credentials)
6. [ZPL II](#6-zpl-ii)
    1. [TSPL/TSPL2, EPL2, DPL, PPLA and PPLB](#6a-tspltspl2-epl2-dpl-ppla-and-pplb)
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
| 6.6 (logistic label) | Layout of the GS1 Logistic Label: blocks, free text ≥ 3 mm (3.5 mm, 3 mm when the wrapped From and To need it), data titles, contents ≥ 7 mm, SSCC in the lowest symbol; a 2D symbol, if used, to the right of the middle block with its quiet zone (6.6.4.1.1) | `logistic.ts` in A6, 4 × 6 in, A5, 6 × 8 in; a content wider than the page (an SSCC on 4 × 6 in) as high as fits, a SHOULD not met; in ZPL at the same heights (`zplLogisticLabel`); the 2D symbol at table 5's row at the middle block's top right, the text clear of its quiet zone; the data titles in English, a second language (Portuguese or Spanish) under each if chosen (6.6.4.2) | `logistic`: places a gs1-datamatrix to the right of the middle block · `logistic`: is the page's size, its SSCC alone in the lowest symbol · `logistic`: fits the SSCC's content on a 4 × 6 in label · `labelary`: the GS1 Logistic Label a5 at 203 dpi · `logistic`: adds a second language under each data title |
| 7.9 | The check digit | Computed and checked | `checkDigit`: matches published keys |
| 7.12 | The century of a YYMMDD date | Used by the signed payload's dates | `sign`: dates YYMMDD as section 7.12 chooses the century |

Not done: composite components (CC-A, CC-B, CC-C); EAN/UPC add-ons; the reduced bar heights of the footnotes for small
items; margins and crop marks; GS1 DotCode (named, not drawn: no independent decoder to check it); product and
healthcare label templates.

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

### 3.1 What a reader gives back

The Check Studio (backlog 7.1) judges what a symbol carries from its bytes and its symbology identifier as ZXing
decodes them, before any text mode (`reading.ts`): a reader that writes GS1 data with parentheses would hide
parentheses really encoded. Measured for every symbology the studio makes and for the plain carriers a faulty label
uses instead, each drawn by bwip-js and read by ZXing 3 (`reading`: the table says what was measured, row by row;
each row is a test of its own, named after its carrier).

| Carrier | Drawn as (bwip-js) | ZXing reads it | Format, identifier | Bytes |
|---|---|---|---|---|
| EAN-13 | `ean13` | yes | `EAN13, ]E0` | the 13 digits |
| UPC-A | `upca` | yes | `EAN13, ]E0` | the 12 digits with a 0 before them: the decoder gives a UPC-A as the EAN-13 it is part of |
| EAN-8 | `ean8` | yes | `EAN8, ]E4` | the 8 digits |
| UPC-E | `upce` | yes | `UPCE, ]E0` | its UPC-A, expanded, in 13 digits |
| ITF-14 | `itf14` | yes | `ITF, ]I1` | the 14 digits (`]I1`: its check digit checked by the decoder) |
| GS1-128 | `gs1-128` | yes | `Code128, ]C1` | the element strings, no FNC1 first, a group separator (1D) after a variable-length one |
| GS1 DataMatrix | `gs1datamatrix` | yes | `DataMatrix, ]d2` | as GS1-128 |
| GS1 QR Code | `gs1qrcode` | yes | `QRCode, ]Q3` | as GS1-128 (`]Q3`: FNC1 in the first position) |
| QR code (GS1 Digital Link) | `qrcode` | yes | `QRCode, ]Q1` | the URI |
| Data Matrix (GS1 Digital Link) | `datamatrix` | yes | `DataMatrix, ]d1` | the URI |
| GS1 DataBar Omnidirectional | `databaromni` | yes | `DataBarOmni, ]e0` | (01) and the GTIN |
| GS1 DataBar Truncated | `databartruncated` | yes | `DataBarOmni, ]e0` | as Omnidirectional: the decoder does not tell them apart |
| GS1 DataBar Stacked | `databarstacked` | yes | `DataBarStk, ]e0` | (01) and the GTIN |
| GS1 DataBar Stacked Omnidirectional | `databarstackedomni` | yes | `DataBarStk, ]e0` | as Stacked: the decoder does not tell them apart |
| GS1 DataBar Limited | `databarlimited` | yes | `DataBarLtd, ]e0` | (01) and the GTIN |
| GS1 DataBar Expanded | `databarexpanded` | yes | `DataBarExp, ]e0` | as GS1-128 |
| GS1 DataBar Expanded Stacked | `databarexpandedstacked` | yes | `DataBarExpStk, ]e0` | as GS1-128 |
| Code 128 (not GS1-128) | `code128` | yes | `Code128, ]C0` | the characters; `]C0` says no FNC1 first: not GS1 |
| Data Matrix with the parentheses encoded | `datamatrix` | yes | `DataMatrix, ]d1` | the parentheses as bytes 28 and 29: what a reader in GS1 text mode would hide |
| QR code with element strings, no FNC1 | `qrcode` | yes | `QRCode, ]Q1` | the element strings and their separator, under a plain identifier |
| GS1 DotCode | `gs1dotcode` | no | — | ZXing has no DotCode decoder: the studio must say it cannot read this symbol, not that there is none |
| EAN-13 with a Composite Component | `ean13composite` | the linear part only | `EAN13, ]E0` | the 13 digits; the 2D component (here (10)) is not read, and must be said so |
| GS1-128 with a Composite Component | `gs1-128composite` | the linear part only | `Code128, ]C1` | (01) and the GTIN; the 2D component is not read |

### 3.2 The Check Studio's faults and their sources

The faults the Check Studio reports (backlog 7.1, `packages/core/src/data/check_faults.json`), each with the sections
of the General Specifications (release 26.0) or the other standard it rests on, and the backlog item that finds it.
The texts paraphrase the standards; none is copied. `packages/core/test/faults.test.ts` holds this table to the
catalogue.

| Code | Fault | Severity | Sections or source | Found by |
|---|---|---|---|---|
| A1 | Data Matrix used instead of GS1 DataMatrix | error | 5.6.3.3; 5.9; 5.1.3; 7.8 | 7.1 b |
| A2 | QR Code without FNC1 carrying element strings | error | 5.7; 5.10 | 7.1 b |
| A3 | Code 128 instead of GS1-128 | error | 7.8.5; 5.4.7.4; 5.12.5.10.4 | 7.1 b |
| A4 | The flag typed as text | error | 5.1.3 | 7.1 b |
| A5 | A separator in place of the leading FNC1 | error | 5.6.3.3 | 7.1 b |
| A6 | A GS1 Digital Link URI inside a GS1 DataMatrix or GS1 QR Code | error | 5.1.3 | 7.1 b |
| A7 | ITF that is not ITF-14, or check digit not verified by the reader | error | 7.2.6; 7.2.7 | 7.1 b |
| A8 | Not a GS1 carrier or not GS1 data | note | 5.1.3 | 7.1 b |
| A9 | A symbol type the studio cannot read | not-assessed | docs/conformance.md, section 3.1 (what the decoder reads) | 7.1 b |
| B1 | The AIs' parentheses are encoded | error | 4.14; 1.4.2; 5.12.5.10.4 | 7.1 b |
| B2 | Spaces, line breaks or printed titles encoded (EXP, LOT, GTIN:) | error | 7.8.1; 7.11 | 7.1 b |
| B3 | Separator missing after a variable-length AI | error | 7.8.3; 7.8.4 | 7.1 b |
| B4 | Separator after a predefined-length AI | warning | 7.8.3 | 7.1 b |
| B5 | Separator at the end of the data | warning | 7.8.3 | 7.1 b |
| B6 | Wrong separator character | error | 7.8.4 | 7.1 b |
| B7 | Unknown AI | error | 3.2 | 7.1 b |
| B8 | Wrong length for a fixed-length field | error | 3.3.2 | 7.1 b |
| B9 | Characters outside the allowed set | error | 7.11 | 7.1 b |
| B10 | The same AI twice with different values | error | 4.13 | 7.1 b |
| B11 | Predefined-length AIs after variable-length ones | note | 5.12.5.10.4 | 7.1 b |
| B12 | More data than GS1-128 allows | error | 5.4.7.2 | 7.1 b |
| C1 | Wrong check digit (GTIN, SSCC, GLN, GRAI, GSRN, GDTI…) | error | 7.9.1; 7.2.7 | 7.1 c |
| C2 | Wrong check character pair (GMN, AI 8013) | error | 7.9.5 | 7.1 c |
| C3 | GTIN-14 indicator 9 without a measure | error | 2.1.10; 4.13.2 | 7.1 c |
| C4 | GTIN-14 with indicator 1–8 in a retail point-of-sale context | warning | 2.1.7.2 | 7.1 c |
| C5 | A GTIN-13, GTIN-12 or GTIN-8 not padded, or over-padded | error | 3.3.2 | 7.1 c |
| C6 | Restricted circulation or special prefix | note | 1.2.3.1; 2.1.11 | 7.1 c |
| C7 | An example number | warning | 1.2.3.1 | 7.1 c |
| C8 | Company prefix not in the GCP table | warning | The GS1 Company Prefix licence, from the GS1 member organisation | 7.1 c |
| C9 | No key at all | error | 4.13.2 | 7.1 c |
| D1 | Impossible date | error | 3.4; 7.2.7 | 7.1 c |
| D2 | Day 00 | note | 3.4.7 | 7.1 c |
| D3 | Day 00 on a regulated healthcare item | error | 3.4.7 | 7.1 c |
| D4 | Date order looks swapped | error | 3.4 | 7.1 c |
| D5 | Implausible dates | warning | 7.2.7; 7.12 | 7.1 c |
| D6 | Lot or serial with forbidden characters, or too long | error | 3.4.1; 7.11 | 7.1 c |
| D7 | Lot or serial likely to be mis-keyed | note | 7.11; GS1 Digital Link: URI Syntax | 7.1 c |
| D8 | Measure of zero or implausible | warning | 7.8.7 | 7.1 c |
| D9 | Other typed fields | error | 3 | 7.1 c |
| E1 | A required companion AI is missing | error | 4.13.2 | 7.1 c |
| E2 | Two AIs that may not appear together | error | 4.13.1 | 7.1 c |
| E3 | Serial missing where the scheme needs it | error | 3 | 7.1 c |
| F1 | A symbol the context's table does not list | error | 5.12.3; 2.1; 2.7 | 7.1 d |
| F2 | EAN/UPC asked to carry more than a GTIN | note | 5.1.3 | 7.1 d |
| F3 | A 2D symbol alone at a retail point of sale | warning | 4.15.4 | 7.1 d |
| F4 | Add-on symbol | note | 5.1.3 | 7.1 d |
| F5 | Context not given | not-assessed | The Check Studio project, section 3.6 (the reading context) | 7.1 d |
| G1 | A web address with no GS1 key | note | GS1 Digital Link: URI Syntax | 7.1 c |
| G2 | Qualifiers in the wrong order, or not belonging to the key | error | GS1 Digital Link: URI Syntax | 7.1 c |
| G3 | An attribute in the path, or a qualifier in the query | error | GS1 Digital Link: URI Syntax | 7.1 c |
| G4 | Unknown AI in the query | error | GS1 Digital Link: URI Syntax | 7.1 c |
| G5 | An AI a URI cannot carry | error | GS1 Digital Link: URI Syntax | 7.1 c |
| G6 | Bad percent-encoding, or a reserved character left raw | error | GS1 Digital Link: URI Syntax | 7.1 c |
| G7 | Not canonical, though valid | note | GS1 Digital Link: URI Syntax | 7.1 c |
| G8 | http:// instead of https://; a non-web scheme | warning | 4.15.3; GS1 Digital Link: URI Syntax | 7.1 c |
| G9 | Short names in the path (/gtin/ for /01/) | warning | GS1 Digital Link: URI Syntax | 7.1 c |
| G10 | A compressed Digital Link URI | note | GS1 Digital Link: URI Syntax | 7.1 c |
| G11 | The key's check digit, dates and values inside the URI | error | 1.4.4 | 7.1 c |
| H1 | X-dimension outside the context's range | warning | 5.12.3 | 7.1 m |
| H2 | Quiet zone too small | warning | 5.2.3.4 | 7.1 m |
| H3 | Bars truncated | warning | 5.12.2.2 | 7.1 m |
| H4 | Light on dark, or mirrored | warning | The decoder (ZXing): isInverted, isMirrored | 7.1 m |
| H5 | Human readable text does not match the data | not-assessed | 4.14; 5.12.5.1 | 7.1 m |
| I1 | Not an EPC, or an unknown header | note | EPC Tag Data Standard 2.3 | 7.1 d |
| I2 | EPC fields inconsistent | error | EPC Tag Data Standard 2.3 | 7.1 d |
| I3 | NFC: the URI is not the first record, not a URI record, or not https | error | 4.15.3 | 7.1 d |
| I4 | NFC: the URI itself | error | GS1 Digital Link: URI Syntax | 7.1 d |
| J1 | Different GTINs (or other keys) on one item | error | 4.15.1 | 7.1 d |
| J2 | Same attribute, different values (batch, expiry, serial, weight) | error | 4.15.1 | 7.1 d |
| J3 | Attributes in one symbol, their GTIN only in another | warning | 4.15.5; 4.15.1; 4.15.4 | 7.1 d |
| J4 | Retail pack with a 2D symbol and no EAN/UPC or GS1 DataBar | warning | 4.15.4 | 7.1 d |
| J5 | The 2D symbol is far from the linear one | warning | 6.3.3.1 | 7.1 d |
| J6 | A supplemental 2D symbol missing data of the GS1-128 | error | 4.15.1 | 7.1 d |
| J7 | EPC and barcode disagree | error | 4.15.2 | 7.1 d |
| J8 | NFC tag and 2D symbol disagree | error | 4.15.3 | 7.1 d |
| J9 | A logistic label that contradicts itself | error | 2.2; 6.6; 4.13.2 | 7.1 d |
| J10 | A non-GS1 symbol on the pack | note | 4.15.1 | 7.1 d |

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
| `^BC` mode N | FNC1 (`>8`) first and after variable-length element strings; code sets chosen; `>` as `>0`; the width counted from what is written | `zpl`: writes GS1-128 with FNC1 and code sets chosen here · `labelary`: GS1-128 is as wide as the modules counted |
| `^BX` | FNC1 as `_1`, `_` declared as the escape character | `zpl`: places FNC1 in a GS1 DataMatrix only first and after variable-length element strings |
| `^BR` | GS1 DataBar at its fixed heights; refused where the table asks more | `zpl`: refuses what ^BR cannot print |
| `^FH` | Reserved characters escaped | `zpl`: writes reserved characters through ^FH |
| `^GF` | Byte counts 1 to 99,999: larger images in stripes | `roundtrip`: splits an image larger than a graphic field into stripes |
| Every symbol | Printed and read back | `labelary`: ZPL printed by Labelary and read back |

Findings no manual showed, from Labelary: mode D joins element strings without FNC1; `^BQ` has no FNC1 (no GS1 QR
Code); the Data Matrix escape character changed between firmware versions; `^BQ`'s manual mode was not honoured; `^BQ` prints the QR code as far below `^FO` as the bar height `^BY` last set (10 dots by default), so it is given a
one-dot `^BY` and `^FO` a dot higher.

## 6a. TSPL/TSPL2, EPL2, DPL, PPLA and PPLB

The printer's own commands from TSC's *TSPL/TSPL2 Programming Manual* 3.0, Zebra's *EPL Programming Guide*
14245L-003 and Datamax's *Class Series 2 Programmer's Manual* 88-2341-01 (DPL), each rendered by Labelize (an open-source emulator, not the printers' firmware) and read back by ZXing in
every test run (ADR 0002).

| What | What the studio does | Evidence |
|---|---|---|
| TSPL `DMATRIX` | `c126`: FNC1 as `~1`, `~` as `~~`, the size forced | `printlangs`: tspl gs1-datamatrix |
| TSPL `BARCODE` | EAN13 (12 digits), ITF14 (13 digits) with bearer bars drawn | `printlangs`: tspl itf14 |
| TSPL `EAN128` | GS1-128 of an SSCC alone: `00` and its 18 digits, check digit included, which Labelize draws as ZPL's UCC case mode | `printlangs`: tspl gs1-128 |
| TSPL strings | A double quote as `\["]` | `printlangs`: TSPL quotes a double quote |
| EPL2 `B` | EAN/UPC at 2 to 4 dots; UCC/EAN 128 with FNC1 first, a variable-length element string last only | `printlangs`: EPL2 prints EAN and UPC with a narrow bar of 2 to 4 dots only |
| EPL2 `b` | Data Matrix with a URI, started a module early for the printer's own quiet zone | `printlangs`: epl: dl-datamatrix starts at the layout's corner |
| DPL records | Rows and columns in tenths of a millimetre from the label's bottom left corner (`m`), within a dot | `printlangs`: DPL counts in tenths of a millimetre from the label's bottom left corner |
| DPL `q` | UCC/EAN Code 128 for an SSCC alone: `00` and 17 digits, the printer adding FNC1 and the check digit | `printlangs`: dpl gs1-128 |
| DPL `W1D` | QR code with the label's error correction level, its module in tenths of a millimetre | `printlangs`: dpl dl-qrcode |
| PPLA and PPLB | Argox's *Programmer's Manual* 49.20002.001 gives PPLA as Datamax-compatible and PPLB as Eltron-compatible, with DPL's and EPL2's syntax for every command written: each file the DPL or EPL2 writer's, byte for byte, printed in Labelize as that language | `argox`: ppla ean13 · `argox`: pplb gs1-128 |
| Not offered | TSPL: GS1-128 beyond an SSCC, EAN-8, UPC, DataBar; EPL2: GS1 DataMatrix, QR, DataBar; DPL: GS1-128 beyond an SSCC, GS1 DataMatrix, DataBar; PPLA: as DPL, and the QR code; PPLB: as EPL2, and Data Matrix | `printlangs`: what TSPL, EPL2 and DPL refuse, with the reason · `argox`: PPLA has no QR code; PPLB has no Data Matrix |

Where Labelize and the manual differ, the symbol is refused (TSPL's `!102`; its `EAN128` offered only for an SSCC, which
both readings of it print alike) or the manual followed and the difference
tested in sight (EPL2's Data Matrix quiet zone; where DPL's QR code and EAN guard bars land). A print from a physical printer outranks both (backlog 3.9).

## 7. Deliberate differences and open points

- **QR version.** bwip-js can make a QR code a version smaller than the resolver's segno did, encoding the GTIN's digits
  in numeric mode; the fixtures pin the version where it matters (ADR 0004).
- **Process black.** PDF and EPS in DeviceCMYK 0 0 0 1, where the resolver wrote DeviceGray (ADR 0004).
- **GS1 QR Code** is encoded but not offered in the editor (ADR 0003).
- **ITF-14's ratio** is 2.5 on artwork and 3 in ZPL (whole dots), both within 2.25 to 3.
- **Printers emulating ZPL** are proven only on their own hardware; Labelary renders Zebra firmware.
