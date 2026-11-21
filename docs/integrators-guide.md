# Integrators' guide: gs1ls and its local API

For a system that makes GS1 barcodes, labels and RFID tags without a person at a browser: an ERP or a WMS printing
logistic labels, a script checking a supplier's data, a printing server writing ZPL. `gs1ls` does what the studios do,
with the same core and the same checks, on the machine it runs on: nothing is sent anywhere
([ADR 0009](adr/0009-command-line-and-local-api.md)). Its outputs are tested as the studios' are: every symbol it
draws is read back by ZXing, every tag decoded back.

## 1. Running it

Each release ([releases](https://github.com/ricardomelo/gs1-label-studio/releases)) carries `gs1ls` as an archive,
installed with Node 22 or later:

```text
npm install -g https://github.com/ricardomelo/gs1-label-studio/releases/download/v1.0.0/gs1-label-studio-cli-1.0.0.tgz
gs1ls --version
```

`gs1ls --version` says the release and the commit it was built from (`gs1ls 1.0.0 (<commit>)`). It is not on npm by
name yet ([ADR 0010](adr/0010-releases-and-two-sites.md)). The work in progress runs from a clone of the repository,
with pnpm:

```text
git clone https://github.com/ricardomelo/gs1-label-studio.git
cd gs1-label-studio
pnpm install
pnpm build
node packages/cli/dist/gs1ls.mjs --help
```

`packages/cli/dist/` holds all it needs: `gs1ls.mjs`, the HRI font beside it, and the GS1 Barcode Syntax Engine,
which Node loads from `node_modules`. The examples below write `gs1ls` for `node packages/cli/dist/gs1ls.mjs`.

## 2. The commands

| Command | What it gives | Exit status |
|---|---|---|
| `gs1ls check <data>` | the Check Studio's verdict, each finding with its code, how to fix it and its details, the data's other forms; `--json` for a program | 0 follows the rules checked (remarks included), 1 does not |
| `gs1ls label <data>` | one label: `--format svg`, `png`, `pdf`, `eps` or a printer's language (`zpl`, `tspl`, `epl2`, `dpl`, `ppla`, `pplb`, at `--dpi`); the symbol the studio's step 2 recommends, or `--symbol`, `--environment`, `--size`, `--hri`, `--stem` | 1 when the data or the design is refused |
| `gs1ls epc <data>` | the EPC an RFID tag carries: from bit 20h and from 10h with the StoredPC, the StoredCRC, the EPC URIs; `--prefix-length` or `--gcp` (GS1's GCP length table), `--scheme classic\|plus\|plusplus`, `--filter`, `--date`, `--with-data`, `--umi`, `--hazmat`; `--zpl` a label for an RFID printer | 1 when there is no EPC, with the reason |
| `gs1ls bulk <file>` | a CSV's or workbook's labels as the editor's bulk generation makes them, in a zip with `generated.csv`: `--files`, `--pdf`, `--print --dpi`, `--pattern`, `--rfid` with the EPC options (each row's tag in the ZPL, and `tags.csv`) | 1 when a row was left out |
| `gs1ls serve` | the same as a local HTTP API (section 3) | |

Every command takes `<data>` as the studios do: an element string with brackets, a GS1 Digital Link URI, or a
scanner's text (`]d2…`, with a group separator written `{GS}`). The exit status is 2 when the command itself is wrong:
an unknown option, format or symbol. Messages go to standard error; a file goes where `-o` says (`-o -` for standard
output), else to a name made from the symbol and the key.

```text
$ gs1ls label "(00)095060001343000014" --format zpl --dpi 300 -o sscc.zpl
$ gs1ls epc "(01)09506000134352(21)12345" --prefix-length 7 --zpl -o tag.zpl
$ gs1ls bulk orders.xlsx --print zpl --dpi 203 --rfid --gcp GCPPrefixFormatList.xml -o batch.zip
```

In bulk, the columns are found from their headers, as in the editor: `GTIN` or `(01)`, `Batch` or `(10)`, `Expiry` or
`(17)`, and the other AIs by their number or title; a column with no AI can still name files through `--pattern`
(`{Produto}`). One design serves every row: the one the first row that passes would have. `generated.csv` lists each
row, the files made of it, or why none were.

## 3. The local API

`gs1ls serve` listens on `http://127.0.0.1:8080/v1/` (`--port`, `--host`). It has no authentication, by design: keep it
on the machine, or behind the system's own gateway. Its OpenAPI 3.1 document is at `/v1/openapi.json`.

| Route | Body | Answer |
|---|---|---|
| `POST /v1/check` | JSON: `{"data": "…"}` | JSON: what `gs1ls check --json` prints |
| `POST /v1/label` | JSON: `data`, `format`, `symbol`, `environment`, `size`, `hri`, `dpi`, `stem` | the file, its name in `Content-Disposition` |
| `POST /v1/epc` | JSON: `data` and the EPC options (`scheme`, `prefixLength`, `gcp` as the table's XML, `filter`, `date`, `withData`, `umi`, `hazmat`, `stem`); `format: "zpl"` with `dpi` and `writeFrom` for the RFID printer's label | JSON (the tag) or the ZPL |
| `POST /v1/bulk` | the CSV or workbook itself; the options in the query (`?files=pdf&print=zpl&dpi=300&rfid=true&prefixLength=7`) | the zip; `X-Rows`, `X-Generated` and `X-Left` count the rows |

A request the API cannot understand is answered 400, data the GS1 rules refuse 422, each with `{"error": "…"}`; a
body over 32 MB 413.

```text
$ curl -X POST http://127.0.0.1:8080/v1/label \
    -d '{"data": "(01)09506000134376(10)B42(17)271231", "format": "zpl", "dpi": 300}' -o label.zpl
$ curl -X POST "http://127.0.0.1:8080/v1/bulk?files=pdf" --data-binary @orders.csv -o labels.zip
```

## 4. Languages

What is said about the data can be in the studio's languages: `--lang pt-BR`, `es`, `fr`, `de` or `it` on the command
line, `Accept-Language` on the API (else `gs1ls serve --lang`). It covers the verdict, each finding in the Check
Studio's plain words (in JSON, `plain`), the refusals of the core and of the Syntax Engine, an EPC's reasons, and the
labels of the text printed. Codes (`C1`), severities, the catalogue's own texts (`what`, `fix`), the help, the usage
errors and the files made stay in English, so that a program can rely on them.

## 5. What to rely on

- Codes, exit statuses, HTTP statuses, JSON field names and the routes are the contract; a change to them is written
  in the [changelog](../CHANGELOG.md).
- A printer language prints a symbol only once a test has shown it gives the same symbol
  ([ADR 0002](adr/0002-printer-output.md)): otherwise the reason is given, as in `generated.csv` for TSPL and GS1
  DataBar Expanded, and ZPL or the PDF prints it.
- Every file is made on the machine; neither the command line nor the API calls any service.
