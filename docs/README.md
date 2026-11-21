# Documentation

GS1 Label Studio is maintained by its community, not by GS1 or any GS1 Member Organisation. The documents are grouped
by who reads them. Every feature is listed in [features.md](features.md), each with the tests that prove it; the whole
list of tests is the [inventory of features](test-inventory.md)
([ADR 0005](adr/0005-documentation-and-feature-inventory.md)).

The published studio: <https://ricardomelo.github.io/gs1-label-studio/> (the last release); the next version, still
being tested: <https://ricardomelo.github.io/gs1-label-studio/develop/>.

## People who make barcodes and labels

| Document | What it holds |
|---|---|
| [User guide](user-guide.md) | every task, step by step, with screenshots: the screen on a computer, a tablet and a phone, and its six languages; pasting data, the key, qualifiers, attributes and parameters, several keys, where the code is scanned and the symbol recommended, the label and its options, a label of one's own (barcodes, text with fields, lines, boxes and images placed, turned and resized, a grid and rulers), real size and the scan test, exports, saving the work and opening it again, the GS1 Logistic Label, printer profiles and languages, RFID and NFC, digital signatures, in bulk (rows, the report, sequences, generating), messages and what to do, a glossary |
| [Features](features.md) | every feature, what it does, the commit that brought it and the tests that prove it |

## People who print

| Document | What it holds |
|---|---|
| [Printing guide](printing-guide.md) | which file for which printing; artwork and prepress (no scaling, process black, bar width reduction); laser printers and label sheets; thermal printers and ZPL (dots, profiles, test print, sending the file); ZPL templates for systems; checking a printed symbol; what ZPL refuses and why; TSPL, EPL2 and DPL, and the printer languages still to come |

## Integrators

| Document | What it holds |
|---|---|
| [Integrators' guide](integrators-guide.md) | `gs1ls`, the command line, and `gs1ls serve`, its local HTTP API: running it from a clone, each command and route with its options, exit and HTTP statuses, languages, what to rely on |
| [The core's API reference](core-api.md) | every name `@gs1-label-studio/core` exports, module by module, with its declaration and description, generated from the sources |
| [Printing guide](printing-guide.md), section 5 | ZPL templates with placeholders, for an ERP or a WMS |

## Developers and maintainers

| Document | What it holds |
|---|---|
| [Developer guide](developer-guide.md) | architecture, repository layout, how a label is made, every module of the core and file of the application, what the browser keeps, CI and publication, the tests with their counts, how to extend, conventions |
| [Inventory of features](test-inventory.md) | every test of the core and of the browser, grouped by area |
| [Conformance](conformance.md) | each standard section by section — GS1 General Specifications, the Syntax Engine and GS1 Digital Link, the ISO/IEC symbologies, EPC and NFC, digital signatures, ZPL, TSPL, EPL2 and DPL — with what is done, what is not, and the evidence |
| [Third-party software, data and licences](third-party.md) | what the studio is made of besides its own code, each licence, and why nothing restricts commercial use |
| [History](history.md) | how the project grew, session by session, with the decisions on the way |
| [Changelog](../CHANGELOG.md) | every change, release by release |
| [Release process](release-process.md) | the two branches and the two sites (main at the root, develop under `/develop/`), making a release step by step, a fix that cannot wait, `gs1ls`'s archive |
| [Indicators](metrics/README.md) | development and management indicators from the first day; performance targets |
| [CLAUDE.md](../CLAUDE.md) | the working rules for the repository |

## Architecture decision records

| Record | Decision |
|---|---|
| [ADR 0001](adr/0001-browser-first-architecture.md) | a browser-first TypeScript application with a core shared by every use: bwip-js to encode, the GS1 Barcode Syntax Engine as the gate, every symbol read back by ZXing |
| [ADR 0002](adr/0002-printer-output.md) | printer output: the dot grid, the printer's own commands, templates with placeholders, only what a test proves; ZPL's commands and what Labelary showed |
| [ADR 0003](adr/0003-product-scope-and-ux.md) | product scope and user experience: who it is for, ask what is identified, paste anything, right by construction, real size, private; the screens; bulk; export formats; GS1 QR Code not offered |
| [ADR 0004](adr/0004-port-of-the-resolver-label-studio.md) | the resolver's label studio ported to TypeScript and kept as the reference the tests compare with |
| [ADR 0005](adr/0005-documentation-and-feature-inventory.md) | the documents by reader, the inventory drawn from the tests, features naming their tests, the core's API reference generated, a test keeping them in step |
| [ADR 0006](adr/0006-assistant-for-first-time-users.md) | an assistant for first-time users: one question per screen, a need written in one's own words read by keywords offline, the answers given to step 2's decision tree, the rules for the artwork; what stays out of an offline tool |
| [ADR 0007](adr/0007-check-studio.md) | a studio that checks what it is given: its scope and what stays out, one reading record whatever the way in, the symbol's bytes and identifier rather than text, what the decoder cannot read measured, the logic in the core and no server |
| [ADR 0008](adr/0008-rfid-studio.md) | a studio of its own for RFID: what exists, three options from the ideation round and the one taken, the tag's memory and printing in the core, ZPL's RFID commands only as far as a test proves, nothing pretending to touch a UHF tag |
| [ADR 0009](adr/0009-command-line-and-local-api.md) | a command line, `gs1ls`, and a local HTTP API from the same core: three options and the one taken, the commands as thin layers over the core, the API on 127.0.0.1 with no authentication, every output read back |
| [ADR 0010](adr/0010-releases-and-two-sites.md) | releases: main, the last release, at the site's root and develop, the work in progress, under `/develop/`; develop's storage and service worker kept apart; versions and the CHANGELOG cut by a script; a tag's GitHub release with `gs1ls`'s archive; the first release, 1.0.0 |

The documentation is written in British English only.

Images: `images/guide/`, written by `pnpm --filter @gs1-label-studio/web screenshots` after `pnpm build`.
