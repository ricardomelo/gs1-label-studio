// gs1ls (backlog 5.1, ADR 0009): GS1 Label Studio's checks, labels and print files from the command line. Arguments,
// files and the exit status are handled here; what is made is commands.ts's, over the core.

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { HriFont, InputError, parseGcpTable, syntaxEngine, type BatchFile, type RfidWriteFrom, type SymbologyId } from "@gs1-label-studio/core";
import {
  bulkFile, checkData, checkStatus, checkText, epcData, epcText, epcZpl, FORMATS, makeLabel, UsageError, type BulkRequest, type EpcRequest, type Format,
} from "./commands.ts";

export const HELP = `gs1ls — GS1 Label Studio from the command line (everything stays on this machine)

Usage:
  gs1ls check <data> [--json]
      Checks an element string, a GS1 Digital Link URI or a scanner's text as the Check Studio does.
      Exit status 0 when it follows the GS1 rules checked, 1 when it does not, 2 for a usage error.
  gs1ls label <data> [--format svg] [--symbol <id>] [--environment <name>] [--size 100]
                     [--hri full|key|none] [--dpi 203] [--stem <domain>] [-o <file>|-]
      Draws the label as the studio does: the symbol step 2 recommends in the key's first scanning
      environment, unless --symbol or --environment say otherwise. Formats: ${FORMATS.join(", ")}.
      Written to the file named (- for standard output), else to a name made from the symbol and the key.
  gs1ls epc <data> [--prefix-length 7 | --gcp <GCP length table.xml>] [--scheme classic|plus|plusplus]
                   [--filter 0-7] [--date <AI>] [--with-data] [--umi] [--hazmat] [--stem <domain>] [--json]
                   [--zpl [--dpi 203] [--write-from pc|epc] [-o <file>|-]]
      The EPC an RFID tag carries, as the RFID Studio writes it: the EPC from bit 20h, the StoredPC and EPC
      from bit 10h, the StoredCRC, the EPC URIs. With --zpl, a label for an RFID printer that writes the tag.
  gs1ls bulk <file.csv|file.xlsx> [--files svg,png,pdf,eps] [--pdf] [--print zpl --dpi 203]
                   [--pattern "{symbol}_{key}_{row}"] [--symbol <id>] [--environment <name>] [--size 100]
                   [--hri full|key|none] [--stem <domain>] [--rfid [EPC options]] [-o labels.zip]
      Every row's label, as the editor's bulk generation makes them, in one zip with generated.csv.
      The columns are found from their headers, such as GTIN or (01). With --rfid, each row's tag is
      written by the ZPL file and listed in tags.csv for an encoder.
  gs1ls --help | --version

Examples:
  gs1ls check "(01)09506000134376(10)B42(17)271231"
  gs1ls label "(01)09506000134376(10)B42(17)271231" --format pdf
  gs1ls label "https://id.gs1.org/01/09506000134376/10/B42" --format zpl --dpi 300 -o label.zpl
  gs1ls epc "(01)09506000134352(21)12345" --prefix-length 7
  gs1ls bulk products.xlsx --files pdf --print zpl -o labels.zip
`;

const OPTIONS = {
  json: { type: "boolean" },
  format: { type: "string", default: "svg" },
  symbol: { type: "string" },
  environment: { type: "string" },
  size: { type: "string" },
  hri: { type: "string" },
  dpi: { type: "string" },
  stem: { type: "string" },
  output: { type: "string", short: "o" },
  "prefix-length": { type: "string" },
  gcp: { type: "string" },
  scheme: { type: "string" },
  filter: { type: "string" },
  date: { type: "string" },
  "with-data": { type: "boolean" },
  umi: { type: "boolean" },
  hazmat: { type: "boolean" },
  zpl: { type: "boolean" },
  "write-from": { type: "string" },
  files: { type: "string" },
  pdf: { type: "boolean" },
  print: { type: "string" },
  pattern: { type: "string" },
  rfid: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
} as const;

/** What a run printed and its exit status, for the tests; `files` are those written, by name. */
export interface Run {
  status: number;
  stdout: string | Uint8Array;
  stderr: string;
}

/** The HRI font beside the bundle (dist/), or the core's own when run from the sources. */
function loadFont(): HriFont {
  for (const url of [new URL("./LiberationSans-Regular.ttf", import.meta.url), new URL("../../core/assets/fonts/LiberationSans-Regular.ttf", import.meta.url)]) {
    try {
      const bytes = readFileSync(url);
      return HriFont.fromBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } catch {
      // the next place
    }
  }
  throw new Error("The HRI font (LiberationSans-Regular.ttf) is not beside gs1ls.");
}

const number = (text: string | undefined, name: string): number | undefined => {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new UsageError(`--${name} takes a number.`);
  return value;
};

/** One run of gs1ls with its arguments; files named with -o are written, everything else is returned. */
export async function run(argv: readonly string[], write: (name: string, bytes: Uint8Array) => void = writeFileSync): Promise<Run> {
  try {
    const { values, positionals } = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
    const [command, ...rest] = positionals;
    if (values.version) return { status: 0, stdout: `gs1ls ${__VERSION__}\n`, stderr: "" };
    if (values.help || !command) return { status: values.help ? 0 : 2, stdout: values.help ? HELP : "", stderr: values.help ? "" : HELP };
    if (command === "bulk") return await bulk(rest, values, write);
    const data = rest.join(" ");
    if (!data.trim()) throw new UsageError(`gs1ls ${command} needs the data: an element string, a GS1 Digital Link URI or a scanner's text.`);
    const engine = await syntaxEngine();
    if (command === "check") {
      const out = checkData(engine, data);
      return { status: checkStatus(out), stdout: values.json ? JSON.stringify(out, null, 2) + "\n" : checkText(out), stderr: "" };
    }
    if (command === "label") {
      const file = await makeLabel(engine, loadFont(), {
        data, format: values.format as Format,
        ...(values.symbol ? { symbology: values.symbol as SymbologyId } : {}),
        ...(values.environment ? { environment: values.environment } : {}),
        ...(values.hri ? { hri: values.hri as "full" | "key" | "none" } : {}),
        ...(values.stem ? { stem: values.stem } : {}),
        ...(values.size !== undefined ? { size: number(values.size, "size")! } : {}),
        ...(values.dpi !== undefined ? { dpi: number(values.dpi, "dpi")! } : {}),
      });
      if (values.output === "-") return { status: 0, stdout: file.bytes, stderr: "" };
      const name = values.output ?? file.name;
      write(name, file.bytes);
      return { status: 0, stdout: "", stderr: `${name}\n` };
    }
    if (command === "epc") {
      const out = await epcData(engine, data, epcRequest(values));
      if (!values.zpl) return { status: 0, stdout: values.json ? JSON.stringify({ ...out, tag: undefined }, null, 2) + "\n" : epcText(out), stderr: "" };
      const bytes = epcZpl(out, { ...(values.dpi !== undefined ? { dpi: number(values.dpi, "dpi")! } : {}), from: writeFrom(values["write-from"]) });
      if (values.output === "-") return { status: 0, stdout: bytes, stderr: "" };
      const name = values.output ?? `epc_${out.epc}.zpl`;
      write(name, bytes);
      return { status: 0, stdout: "", stderr: `${name}\n` };
    }
    throw new UsageError(`Unknown command: ${command}. Use check, label, epc or bulk (gs1ls --help).`);
  } catch (error) {
    if (error instanceof InputError) return { status: 1, stdout: "", stderr: `${error.message}\n` };
    const message = error instanceof Error ? error.message : String(error);
    // parseArgs's own refusals (an unknown option, a missing value) are usage errors too
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      return { status: 2, stdout: "", stderr: `${message}\n` };
    }
    return { status: 1, stdout: "", stderr: `${message}\n` };
  }
}

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: true }>>["values"];

const writeFrom = (value: string | undefined): RfidWriteFrom => {
  if (value === undefined || value === "pc") return "pc";
  if (value === "epc") return "auto";
  throw new UsageError("--write-from is pc (the printer writes the StoredPC and EPC from bit 10h) or epc (from bit 20h).");
};

/** The EPC options shared by gs1ls epc and gs1ls bulk --rfid; GS1's GCP length table read from its file. */
function epcRequest(values: Values): EpcRequest {
  return {
    ...(values.scheme ? { scheme: values.scheme as EpcRequest["scheme"] } : {}),
    ...(values["prefix-length"] !== undefined ? { prefixLength: number(values["prefix-length"], "prefix-length")! } : {}),
    ...(values.filter !== undefined ? { filter: number(values.filter, "filter")! } : {}),
    ...(values.date ? { date: values.date } : {}),
    ...(values["with-data"] ? { withData: true } : {}),
    ...(values.umi ? { umi: true } : {}),
    ...(values.hazmat ? { hazmat: true } : {}),
    ...(values.stem ? { stem: values.stem } : {}),
    ...(values.gcp ? { gcp: parseGcpTable(readFileSync(values.gcp, "utf8")) } : {}),
  };
}

/** gs1ls bulk: the file read, the zip written (labels.zip unless -o names another; - for standard output). */
async function bulk(rest: string[], values: Values, write: (name: string, bytes: Uint8Array) => void): Promise<Run> {
  const [path, ...more] = rest;
  if (!path || more.length) throw new UsageError("gs1ls bulk needs one file: a CSV or an Excel workbook (.xlsx).");
  const request: BulkRequest = {
    ...(values.files ? { files: values.files.split(",").map((f) => f.trim()).filter(Boolean) as BatchFile[] } : {}),
    ...(values.pdf ? { pdf: true } : {}),
    ...(values.print ? { print: values.print as BulkRequest["print"] } : {}),
    ...(values.dpi !== undefined ? { dpi: number(values.dpi, "dpi")! } : {}),
    ...(values.pattern ? { pattern: values.pattern } : {}),
    ...(values.symbol ? { symbology: values.symbol as SymbologyId } : {}),
    ...(values.environment ? { environment: values.environment } : {}),
    ...(values.size !== undefined ? { size: number(values.size, "size")! } : {}),
    ...(values.hri ? { hri: values.hri as BulkRequest["hri"] } : {}),
    ...(values.stem ? { stem: values.stem } : {}),
    ...(values.rfid ? { rfid: { ...epcRequest(values), from: writeFrom(values["write-from"]) } } : {}),
  };
  const out = await bulkFile(await syntaxEngine(), loadFont(), new Uint8Array(readFileSync(path)), request);
  const summary = `${out.generated} of ${out.rows} rows generated${out.left ? `; ${out.left} left out (their reasons are in generated.csv)` : ""}\n`;
  if (values.output === "-") return { status: out.left ? 1 : 0, stdout: out.zip, stderr: summary };
  const name = values.output ?? "labels.zip";
  write(name, out.zip);
  return { status: out.left ? 1 : 0, stdout: "", stderr: `${name}\n${summary}` };
}

declare const __VERSION__: string;

// Run when Node starts this file (the bundle), not when a test imports it
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gs1ls.mjs") || process.argv[1]?.endsWith("/gs1ls")) {
  const result = await run(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
