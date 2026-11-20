# ADR 0009 — A command line and a local HTTP API from the same core

| | |
|---|---|
| Status | **Proposed** (20 November 2026); the assessment's recommended option taken under the owner's rule, open to change |
| Decided by | backlog 5.1 (*CLI and HTTP API from the same core*, phase 5, "if needed"), the last item of the backlog that needs neither a release (0.4) nor a physical printer (3.8, 3.9); ADR 0001 kept the core free of the browser so that this could be added later |

## 1. Context — what exists

- **The core runs in Node already**: every test draws, checks and reads back its symbols in Node (vitest), the GS1
  Barcode Syntax Engine's WebAssembly included. What it does not do yet is run in Node *without* a build step: its
  TypeScript has parameter properties and imports JSON without import attributes, which Node's own type stripping
  refuses. A bundle (Vite/Rolldown, already used by the web application) makes one JavaScript file of it.
- **What a system would ask for**, from the studios' features: check an element string or a GS1 Digital Link URI
  (the Check Studio's findings); draw one label or barcode as SVG, PNG, PDF or EPS, or as a printer's file in ZPL,
  TSPL, EPL2, DPL, PPLA or PPLB; draw every row of a spreadsheet at once (the bulk generator's zip); encode a key's
  EPC and write an RFID tag in ZPL (the RFID Studio).
- **What stays true**: nothing leaves the user's machine (ADR 0001, ADR 0007). A server on the internet would end
  that, and would need hosting, limits and care against abuse.

## 2. Options

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **A command line, `gs1ls`, and a local HTTP API it serves** (`gs1ls serve`, on 127.0.0.1 by default): the same operations as the studios — `check`, `label`, `bulk`, `epc` — built from the core into one JavaScript file, in the repository's `packages/cli` | a system or a script prints labels without a browser; a printing server can make ZPL from its own data; nothing leaves the machine; small, as the core does the work; every output read back by ZXing in the tests, as everywhere | one more package to keep in step with the core; distribution waits for the first release (0.4): until then it runs from a clone |
| B | **A hosted HTTP API** on the internet | nothing to install | data leaves the user's machine; hosting, limits, abuse; the project has no server and wants none |
| C | **Nothing until someone asks** (phase 5's "if needed") | no work | a system that needs GS1 labels has no way in but a browser; the backlog has no other item a session can take without the owner's hardware or release |

**Option A is taken**, under the owner's rule (the recommended option, open to change).

## 3. Decision

1. **`packages/cli`**, a workspace package with one entry, `gs1ls`, built by Vite into `dist/gs1ls.mjs` (the core
   bundled, its npm dependencies — bwip-js, gs1encoder and its WebAssembly, opentype.js, qrcode — left to Node to
   load, with the HRI font beside the file). It runs with `node packages/cli/dist/gs1ls.mjs` after `pnpm build`.
2. **The commands**, each a thin layer over functions the core already exports, never logic of their own:
   `gs1ls check <data>` (the Check Studio's check of one reading, as text or `--json`, exit status 1 when it has an
   error); `gs1ls label <data> --format svg|png|pdf|eps|zpl|tspl|epl|dpl|ppla|pplb` (the symbol step 2's decision tree
   recommends unless `--symbol` names one, or the GS1 Logistic Label); `gs1ls bulk <file.csv|.xlsx>` (the bulk
   generator's zip); `gs1ls epc <data>` (the key's EPC, the tag's memory, ZPL for an RFID printer).
3. **`gs1ls serve`**: the same operations as `POST /v1/check`, `/v1/label`, `/v1/bulk`, `/v1/epc`, JSON in, the file
   or JSON out; bound to 127.0.0.1 unless `--host` says otherwise; no authentication, so the guide says to keep it on
   the machine or behind the system's own gateway; described by an OpenAPI document served at `/v1/openapi.json`.
4. **Tests as everywhere**: every symbol a command or an endpoint makes is read back by ZXing (symbology identifier
   and data); printer files through Labelary where the core's tests already use it; mutations prove the checks can
   fail.
5. **Languages**: the command line's messages are the core's English ones, as the files made are; `--lang` with the
   same catalogues as the page (`apps/web/src/locales/*.messages.json`) follows in item d.
6. **Items** (backlog 5.1 a to d): a, the package, the bundle, `check` and `label`; b, `bulk` and `epc`; c, `serve`
   and its OpenAPI document; d, `--lang`, the documents (a guide for integrators), the inventory and the test plan.
7. **`bulk` and `epc`** (5.1 b, 20 November 2026): the EPC with the person's choices moved from the page into the core
   (`epcOf`, `bankFor`, `tagFor`, `EPC_CHOICES`; its messages in English, which the page translates with the core's
   other messages), so that the editor's card, the RFID Studio and `gs1ls epc` cannot drift apart. `gs1ls bulk` finds
   the columns from their headers (`guessMapping`), takes one design for all the rows from the first row that passes
   (as the editor takes step 2's from its data), and writes `generateBatch`'s zip; its exit status is 1 when a row was
   left out, so that a script notices. `--rfid` joins each row's tag to its label in the ZPL file and adds `tags.csv`,
   the RFID Studio's CSV for an encoder.
8. **`serve`** (5.1 c, 20 November 2026): `POST /v1/check`, `/v1/label` and `/v1/epc` take JSON; `/v1/bulk` takes the
   file itself as the body (a CSV or a workbook, up to 32 MB) and its choices in the query, and gives the zip with the
   rows' counts in `X-Rows`, `X-Generated` and `X-Left`. A request the API cannot understand is a 400, data the GS1
   rules refuse a 422 (the command line's exit statuses 2 and 1). The OpenAPI document lists its choices from the same
   tables the commands check, and a test sends every property it names.

## 4. Consequences

- The core stays free of Node's own modules: files, arguments and sockets belong to `packages/cli`.
- CI builds and tests the package with the others (`pnpm check`); publishing it to npm is part of the release process
  (0.4), not of this item.
- The API has no authentication by design: it is a local tool. A shared server is the system's to run and guard.
