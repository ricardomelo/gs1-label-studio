import { dplLabel, dplPage, dplTestLabel, DplUnsupportedError } from "./dpl.ts";
import { eplLabel, eplLogisticLabel, eplPage, eplTestLabel, EplUnsupportedError } from "./epl.ts";
import type { LogisticLabel } from "./logistic.ts";
import { PrinterUnsupportedError, type PrintFile, type PrintLabelOptions, type PrintPage } from "./printers.ts";
import type { SymbologyId } from "./symbologies.ts";

/**
 * PPLA and PPLB, the two languages of Argox printers (backlog 3.4 and 3.5; ADR 0002). Reference: Argox's *Programmer's
 * Manual* for PPLA and PPLB, part 49.20002.001, fourth edition (December 2000), in the owner's Drive. Its introduction
 * says that PPLA "is compatible with the language on the Datamax's printers" and PPLB "with the language on the
 * Eltron's printers"; its pages give, for every command the studio writes, the same syntax as DPL's and EPL2's:
 *
 * - PPLA: `<STX>L`, `m` (metric), `D11`, `z`, `Qxxxx`, `E`; text records `Rthvoooyyyyxxxx` in fonts 0 to 8; lines and
 *   boxes as X records `l` and `b` with four-digit sizes; bar codes F (EAN-13), G (EAN-8), B (UPC-A), C (UPC-E, its six
 *   digits), D/d (Interleaved 2 of 5), Q/q (UCC/EAN Code 128: the AI and 17 digits, the printer adding the check digit,
 *   as figure A10-17 shows) and W1c (Data Matrix: `1W1c`, multipliers, `000`, row, column, `2000`, rows, columns,
 *   data); multipliers 1 to 9 and A to O; rows and columns from the bottom left corner. No QR code and no RSS: the
 *   manual's bar codes are A to Z (20 linear, MaxiCode, PDF-417) and W (Data Matrix).
 * - PPLB: `N`, `q`, `A` (fonts 1 to 5, rotation 0 to 3), `B` with types E30, E80, UA0, UE0, 2 (Interleaved 2 of 5) and
 *   1E (UCC/EAN), `LO`, `X`, `GW` (a 0 bit black, as EPL2's) and `P`, each line ending in a line feed (a carriage
 *   return before it is ignored). No Data Matrix and no QR code: its 2D bar codes (`b`) are PDF-417 and MaxiCode.
 *
 * So a PPLA file is the DPL writer's and a PPLB file the EPL2 writer's, refusing what Argox's manual does not have;
 * the tests print each file in Labelize as DPL or EPL2 and read it back with ZXing. A refusal of the writer underneath
 * is said in the Argox language's name, its reason kept.
 */
export class PplaUnsupportedError extends PrinterUnsupportedError {}
export class PplbUnsupportedError extends PrinterUnsupportedError {}

const MESSAGES = {
  pplaNoQr:
    "PPLA has no QR code: Argox's manual gives 20 linear bar codes, MaxiCode, PDF-417 and Data Matrix. A Data Matrix " +
    "with a GS1 Digital Link URI prints in PPLA; ZPL, TSPL, DPL or the PDF print the QR code.",
  pplbNoMatrix:
    "PPLB has no Data Matrix: Argox's manual gives PDF-417 and MaxiCode as its only 2D bar codes. ZPL, TSPL, DPL, PPLA " +
    "or the PDF print it.",
  pplbNoQr: "PPLB has no QR code: Argox's manual gives PDF-417 and MaxiCode as its only 2D bar codes. ZPL, TSPL, DPL or the PDF print it.",
};
const PPLA_REFUSED: Partial<Record<SymbologyId, string>> = { "dl-qrcode": MESSAGES.pplaNoQr, "gs1-qrcode": MESSAGES.pplaNoQr };
const PPLB_REFUSED: Partial<Record<SymbologyId, string>> = {
  "dl-datamatrix": MESSAGES.pplbNoMatrix,
  "gs1-datamatrix": MESSAGES.pplbNoMatrix,
  "dl-qrcode": MESSAGES.pplbNoQr,
  "gs1-qrcode": MESSAGES.pplbNoQr,
};

/** A refusal of the writer underneath, said in the Argox language's name with its reason. */
function asArgox<T>(language: "PPLA" | "PPLB", write: () => T): T {
  try {
    return write();
  } catch (error) {
    if (language === "PPLA" && error instanceof DplUnsupportedError) {
      throw new PplaUnsupportedError(`PPLA is written with DPL's commands, which its manual gives alike: ${error.message}`);
    }
    if (language === "PPLB" && error instanceof EplUnsupportedError) {
      throw new PplbUnsupportedError(`PPLB is written with EPL2's commands, which its manual gives alike: ${error.message}`);
    }
    throw error;
  }
}

function refuse(language: "PPLA" | "PPLB", symbologies: readonly SymbologyId[]): void {
  for (const symbology of symbologies) {
    const reason = (language === "PPLA" ? PPLA_REFUSED : PPLB_REFUSED)[symbology];
    if (reason && language === "PPLA") throw new PplaUnsupportedError(reason);
    if (reason) throw new PplbUnsupportedError(reason);
  }
}

/** One label with one symbol in PPLA: DPL's label format. */
export function pplaLabel(symbology: SymbologyId, value: string, options: PrintLabelOptions): string {
  refuse("PPLA", [symbology]);
  return asArgox("PPLA", () => dplLabel(symbology, value, options));
}

/** A test label (backlog 3.1) in PPLA. */
export function pplaTestLabel(symbology: SymbologyId, value: string, options: PrintLabelOptions, notes: readonly string[]): string {
  refuse("PPLA", [symbology]);
  return asArgox("PPLA", () => dplTestLabel(symbology, value, options, notes));
}

/** A label of one's own (backlog 4.2), or the GS1 Logistic Label as a page (`logisticPage`), in PPLA. */
export function pplaPage(page: PrintPage, options: { notes?: readonly string[] } = {}): string {
  refuse("PPLA", page.symbols.map((s) => s.symbology));
  return asArgox("PPLA", () => dplPage(page, options));
}

/** One label with one symbol in PPLB: EPL2's commands. */
export function pplbLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions): string {
  refuse("PPLB", [symbology]);
  return asArgox("PPLB", () => eplLabel(symbology, data, options));
}

/** A test label (backlog 3.1) in PPLB. */
export function pplbTestLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions, notes: readonly string[]): string {
  refuse("PPLB", [symbology]);
  return asArgox("PPLB", () => eplTestLabel(symbology, data, options, notes));
}

/** A label of one's own (backlog 4.2) in PPLB: text, or bytes when it sends an image (GW). */
export function pplbPage(page: PrintPage, options: { notes?: readonly string[] } = {}): PrintFile {
  refuse("PPLB", page.symbols.map((s) => s.symbology));
  return asArgox("PPLB", () => eplPage(page, options));
}

/** The GS1 Logistic Label (backlog 4.1) in PPLB, as EPL2 writes it; a 2D symbol beside the data is refused. */
export function pplbLogisticLabel(label: LogisticLabel, dpi: number, dotsPerModule: number, options: { copies?: number; notes?: readonly string[] } = {}): string {
  if (label.printer.twoD) refuse("PPLB", [label.printer.twoD.symbology]);
  return asArgox("PPLB", () => eplLogisticLabel(label, dpi, dotsPerModule, options));
}
