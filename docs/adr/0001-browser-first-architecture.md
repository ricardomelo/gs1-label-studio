# ADR 0001 — A browser-first TypeScript application with a shared core

| | |
|---|---|
| Status | **Accepted** (28 October 2026) |
| Decided by | the owner, among three options, the recommended one |

## Context

The GS1 Digital Link Resolver CE Expansion Pack had a label studio inside its portal (its ADR 0010): QR code, Data
Matrix and GS1 DataMatrix with EAN/UPC beside them, sizes by the scanning environments of the GS1 General
Specifications' symbol specification tables, SVG, PNG, PDF and a zip. It lived on a Python server (`label.py`,
`linear.py`, libzint, segno) and needed an account on a resolver.

This project offers the generator on its own: a tool for anyone to create GS1 barcodes, later labels, in bulk, and to
send them to as many printers as possible. Managing links is out of scope.

## Decision

1. **Everything runs in the browser.** A static web application: the user's product data (GTINs, batches, serial
   numbers, spreadsheets of thousands of rows) never leaves their computer; no server to run, scale or secure; free
   static hosting (GitHub Pages); works offline once loaded (a PWA, later).
2. **TypeScript monorepo** (pnpm workspaces):
   - `packages/core` — no user interface: GS1 validation, encoding to a format-independent geometry (modules),
     printer dot-grid snapping, rasterising, and the exporters (SVG, PNG, PDF, EPS and the printer languages). Runs in
     the browser, in Web Workers and in Node, so a CLI or an HTTP API can be added later with the same code.
   - `apps/web` — React 19 + Vite.
3. **Encoder: bwip-js** (MIT; Barcode Writer in Pure PostScript), which encodes every GS1 symbology — EAN/UPC, ITF-14,
   GS1-128, the GS1 DataBar family, GS1 DataMatrix, GS1 QR Code, GS1 DotCode, composite components — and checks the
   element strings (AI syntax, check digits) as it encodes. Its `raw()` output (bar widths, module matrix) is the
   geometry every exporter draws from, as `label.py` drew every format from one layout.
4. **GS1 rules: the GS1 Barcode Syntax Engine** (Apache-2.0, npm `gs1encoder`, the same engine the resolver used) for
   parsing and validating input — bracketed element strings, unbracketed with GS separators as a scanner sends them,
   GS1 Digital Link URIs — and for the messages explaining what is wrong.
5. **Tests**: Vitest; every symbol is read back by an independent decoder (ZXing, `zxing-wasm`), comparing the
   symbology identifier and the data, as the resolver's tests did with zxing-cpp. Playwright for the browser. Mutation
   checks prove that a new check can fail.
6. **Knowledge carried over** from the resolver's label studio, rewritten in TypeScript: the scanning environments
   table (General Specifications release 26.0, section 5.12.3), the sizes as percentages of the target, the EAN/UPC's
   own size, quiet zones, human readable text rules, the PDF written without a library.

## Options considered

| Option | Why not chosen |
|---|---|
| Python on a server, reusing `label.py` | faster to a first version, but a server to run, uploads of customers' spreadsheets, bulk jobs on the server |
| A desktop application (Tauri) | direct printing without browser limits, but an installation and updates on every computer; can still wrap the same web application later if direct network printing needs it |

## Consequences

- Bulk generation is bounded by the user's computer; Web Workers keep the page responsive. The target is set in the
  bulk item of the backlog.
- Printing straight to a network printer (raw port 9100) is not possible from a browser alone: files are downloaded,
  or sent through WebUSB, Zebra Browser Print or a small local agent (ADR 0002).
- `bwip-js` is large (about 1 MB minified); it is loaded once and cached, and can be split per symbology later.
