// gs1ls (backlog 5.1, ADR 0009): GS1 Label Studio's checks, labels and print files from the command line. Arguments,
// files and the exit status are handled here; what is made is commands.ts's, over the core.

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { HriFont, InputError, syntaxEngine, type SymbologyId } from "@gs1-label-studio/core";
import { checkData, checkStatus, checkText, FORMATS, makeLabel, UsageError, type Format } from "./commands.ts";

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
  gs1ls --help | --version

Examples:
  gs1ls check "(01)09506000134376(10)B42(17)271231"
  gs1ls label "(01)09506000134376(10)B42(17)271231" --format pdf
  gs1ls label "https://id.gs1.org/01/09506000134376/10/B42" --format zpl --dpi 300 -o label.zpl
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
    throw new UsageError(`Unknown command: ${command}. Use check or label (gs1ls --help).`);
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

declare const __VERSION__: string;

// Run when Node starts this file (the bundle), not when a test imports it
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gs1ls.mjs") || process.argv[1]?.endsWith("/gs1ls")) {
  const result = await run(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
