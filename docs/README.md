# Documentation

GS1 Label Studio is maintained by its community, not by GS1 or any GS1 Member Organisation. The documents are grouped
by who reads them. Every feature is listed in [features.md](features.md), each with the tests that prove it; the whole
list of tests is the [inventory of features](test-inventory.md)
([ADR 0005](adr/0005-documentation-and-feature-inventory.md)).

The published studio: <https://ricardomelo.github.io/gs1-label-studio/>.

## People who make barcodes and labels

| Document | What it holds |
|---|---|
| [User guide](user-guide.md) | every task, step by step, with screenshots: pasting data, the key, qualifiers, attributes and parameters, several keys, where the code is scanned and the symbol recommended, the label and its options, real size and the scan test, exports, the GS1 Logistic Label, printer profiles, RFID and NFC, digital signatures, in bulk (rows, the report, sequences, generating), messages and what to do, a glossary |
| [Features](features.md) | every feature, what it does, the commit that brought it and the tests that prove it |

## People who print

| Document | What it holds |
|---|---|
| [Printing guide](printing-guide.md) | which file for which printing; artwork and prepress (no scaling, process black, bar width reduction); laser printers and label sheets; thermal printers and ZPL (dots, profiles, test print, sending the file); ZPL templates for systems; checking a printed symbol; what ZPL refuses and why |

## Integrators

| Document | What it holds |
|---|---|
| [The core's API reference](core-api.md) | every name `@gs1-label-studio/core` exports, module by module, with its declaration and description, generated from the sources |
| [Printing guide](printing-guide.md), section 5 | ZPL templates with placeholders, for an ERP or a WMS |

## Developers and maintainers

| Document | What it holds |
|---|---|
| [Developer guide](developer-guide.md) | architecture, repository layout, how a label is made, every module of the core and file of the application, what the browser keeps, CI and publication, the tests with their counts, how to extend, conventions |
| [Inventory of features](test-inventory.md) | every test of the core and of the browser, grouped by area |
| [Conformance](conformance.md) | each standard section by section — GS1 General Specifications, the Syntax Engine and GS1 Digital Link, the ISO/IEC symbologies, EPC and NFC, digital signatures, ZPL — with what is done, what is not, and the evidence |
| [Third-party software, data and licences](third-party.md) | what the studio is made of besides its own code, each licence, and why nothing restricts commercial use |
| [History](history.md) | how the project grew, session by session, with the decisions on the way |
| [Changelog](../CHANGELOG.md) | every change |
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

The documentation is written in British English only.

Images: `images/guide/`, written by `pnpm --filter @gs1-label-studio/web screenshots` after `pnpm build`.
