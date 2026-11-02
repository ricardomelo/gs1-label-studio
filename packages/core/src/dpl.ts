import { MM_PER_INCH } from "./dots.ts";
import { encode, widthInModules } from "./encode.ts";
import { parseElementString } from "./elementString.ts";
import { GUARD_EXTENSION } from "./linear.ts";
import {
  bitmapFontFor,
  hriTextDots,
  PrinterUnsupportedError,
  textLines,
  type BitmapFont,
  type PrintLabelOptions,
  type PrintSymbolOptions,
  type TextLine,
} from "./printers.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

/**
 * DPL (Datamax-O'Neil, now Honeywell, printers) with the printer's own commands (ADR 0002, backlog 3.7). Reference:
 * Datamax's *Class Series 2 Programmer's Manual*, 88-2341-01 Rev. B (2008); Honeywell's current *Command Reference: DPL*
 * (DPL-EN-CR) is behind a sign-in. Every symbol here is rendered by Labelize (an open-source emulator, not a printer)
 * and read back by ZXing in the tests; what the manual or Labelize does not support is refused with the reason.
 *
 * A DPL label format is a list of records, each a 15-character header — rotation, font or bar code, two multipliers,
 * height, row, column — then the data and a carriage return. Rows and columns are counted from the label's bottom left
 * corner ("home position"), in tenths of a millimetre after the `m` command: the studio's dots, counted from the top,
 * are turned into them here, a position within half a tenth of a millimetre of the layout's.
 */
export class DplUnsupportedError extends PrinterUnsupportedError {}

/**
 * The fixed-pitch internal fonts 0 to 2 (manual, tables C-2 to C-5): their cell and pitch (width and spacing) in
 * dots at each resolution. Fonts 3 to 6 have capitals only and font 8 digits only, so the human readable text, which
 * may hold lower case letters, uses these three.
 */
const FONTS: Record<number, readonly BitmapFont[]> = {
  203: [{ name: "0", width: 6, height: 7 }, { name: "1", width: 9, height: 13 }, { name: "2", width: 12, height: 18 }],
  300: [{ name: "0", width: 8, height: 10 }, { name: "1", width: 13, height: 19 }, { name: "2", width: 18, height: 27 }],
  406: [{ name: "0", width: 12, height: 14 }, { name: "1", width: 18, height: 26 }, { name: "2", width: 24, height: 36 }],
  600: [{ name: "0", width: 16, height: 20 }, { name: "1", width: 26, height: 38 }, { name: "2", width: 36, height: 54 }],
};
/** The fonts' spacing, the part of the pitch after the last character (manual, tables C-2 to C-5). */
const SPACING: Record<number, readonly number[]> = { 203: [1, 2, 2], 300: [1, 3, 3], 406: [2, 4, 4], 600: [2, 6, 6] };

function fontsFor(dpi: number): { fonts: readonly BitmapFont[]; spacing: readonly number[] } {
  const table = dpi < 250 ? 203 : dpi < 350 ? 300 : dpi < 500 ? 406 : 600;
  return { fonts: FONTS[table]!, spacing: SPACING[table]! };
}

const MESSAGES = {
  gs1128:
    "DPL's GS1-128 is offered for an SSCC (00) alone: the manual's UCC/EAN Code 128 (Q) carries that one, and its other " +
    "ways — FNC1 written &G in Code 128, or EAN 128 with automatic subsets (W1I) — are not drawn by Labelize, the emulator " +
    "the tests print DPL with, so no test has read them back. ZPL or the PDF print it.",
};

const REFUSED: Partial<Record<SymbologyId, string>> = {
  "gs1-datamatrix":
    "DPL's Data Matrix (W1c) has no FNC1 in the manual, so it cannot print a GS1 DataMatrix. ZPL or the PDF print it; " +
    "a Data Matrix with a GS1 Digital Link URI prints in DPL.",
  "gs1-qrcode": "DPL cannot print a GS1 QR Code. Use a GS1 DataMatrix in ZPL, or a QR code with a GS1 Digital Link URI.",
};

type Limit = "module" | "wide" | "font" | "qr";

/** Why a multiplier cannot be written: each in words of its own, for the translations. */
function limitMessage(kind: Limit, n: number): string {
  switch (kind) {
    case "module":
      return `DPL takes a module of 1 to 24 dots; this one needs ${n}. Choose another size or printer.`;
    case "wide":
      return `DPL takes a wide bar of 1 to 24 dots; ITF-14's needs ${n}. Choose another size or printer.`;
    case "font":
      return `DPL takes a font multiplier of 1 to 24; this text needs ${n}. Choose a smaller text.`;
    case "qr":
      return `DPL takes a QR code's module of 1 to 24 tenths of a millimetre; this one needs ${n}. Choose another size.`;
  }
}

/** A header's multiplier: 1 to 9, then A for 10 to O for 24 (manual and Labelize agree that far). */
function multiplier(n: number, kind: Limit): string {
  if (!Number.isInteger(n) || n < 1 || n > 24) throw new DplUnsupportedError(limitMessage(kind, n));
  return n <= 9 ? String(n) : String.fromCharCode(65 + n - 10);
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** The geometry every record needs: the label's height and resolution, to count rows up from its bottom. */
interface Frame {
  dpi: number;
  heightDots: number;
}

/** Dots as tenths of a millimetre (the `m` command's unit). */
function tenths(dots: number, dpi: number): number {
  return Math.round((dots / dpi) * MM_PER_INCH * 10);
}

/** A position: the row of `bottom` (in dots from the top) counted up from the label's bottom, and the column of `x`. */
function place(frame: Frame, bottom: number, x: number): string {
  const row = tenths(frame.heightDots - bottom, frame.dpi);
  const column = tenths(x, frame.dpi);
  if (row < 0 || row > 9999 || column < 0 || column > 9999) {
    throw new DplUnsupportedError("The symbol falls outside the label: DPL places records within 0 to 999.9 mm of its bottom left corner.");
  }
  return pad(row, 4) + pad(column, 4);
}

/** A bar code's height field: tenths of a millimetre, 001 to 999. */
function height(dots: number, dpi: number): string {
  const value = tenths(dots, dpi);
  if (value < 1 || value > 999) throw new DplUnsupportedError("DPL's bar codes are 0.1 to 99.9 mm high.");
  return pad(value, 3);
}

/** A record's data ends at the carriage return, so it cannot hold one; the rest goes as it is. */
function data(text: string): string {
  if (/[\r\n\x02]/.test(text)) throw new DplUnsupportedError("DPL's records end at a line break: the data cannot hold one.");
  return text;
}

/** One label with one symbol, ready to print: STX L, the units, the symbol and its text, the quantity, E. */
export function dplLabel(symbology: SymbologyId, value: string, options: PrintLabelOptions): string {
  return document(fields(symbology, value, options, options), options);
}

/** A test label (backlog 3.1): the label, then a 50 mm ruler with a tick every 10 mm and the settings as text. */
export function dplTestLabel(symbology: SymbologyId, value: string, options: PrintLabelOptions, notes: readonly string[]): string {
  const dpi = options.dpi;
  const mm = (v: number) => Math.round((v / MM_PER_INCH) * dpi);
  const t = hriTextDots(dpi);
  const step = Math.round(t * 1.4);
  const height = options.heightDots + Math.round((14 / MM_PER_INCH) * dpi) + notes.length * step;
  // Rows count from the bottom, so the label grows downwards: the whole label is placed in the taller frame
  const frame = { dpi, heightDots: height };
  const commands = fields(symbology, value, options, frame);
  const top = options.heightDots + mm(2);
  const x = Math.max(mm(2), Math.min(options.x, options.widthDots - mm(50) - mm(2)));
  const line = Math.max(2, mm(0.3));
  const ruler = [
    rule(frame, x, top + mm(3), mm(50), line),
    ...[0, 10, 20, 30, 40, 50].map((at) => rule(frame, x + mm(at) - (at === 50 ? line : 0), top, line, mm(at % 50 ? 2.5 : 4))),
    ...text(frame, { x, y: top + mm(5), width: mm(50), height: t, text: "50 mm: measure this line" }, "C"),
    ...notes.flatMap((note, index) => text(frame, { x: mm(2), y: top + mm(10) + index * step, width: options.widthDots, height: t, text: note }, "L")),
  ];
  return document([...commands, ...ruler], { ...options, heightDots: height });
}

function document(records: string[], options: PrintLabelOptions): string {
  // m: tenths of a millimetre; D11: each dot printed once; z: zeros without a slash in the fonts 0 to 8
  return ["\x02L", "m", "D11", "z", ...records, `Q${pad(options.copies ?? 1, 4)}`, "E", ""].join("\r");
}

/** A filled line or bar (an X record's l): its top left corner, width and height in dots. */
function rule(frame: Frame, x: number, y: number, width: number, h: number): string {
  return `1X11000${place(frame, y + h, x)}l${pad(tenths(width, frame.dpi), 4)}${pad(tenths(h, frame.dpi), 4)}`;
}

/** A hollow box (an X record's b): its outer top left corner, size and thickness in dots. */
function box(frame: Frame, x: number, y: number, width: number, h: number, thickness: number): string {
  const tt = pad(tenths(thickness, frame.dpi), 4);
  return `1X11000${place(frame, y + h, x)}b${pad(tenths(width, frame.dpi), 4)}${pad(tenths(h, frame.dpi), 4)}${tt}${tt}`;
}

/**
 * A line of text in the internal font closest to its height. A record has no centring for these fonts (the J command
 * is for scalable fonts on display-equipped models): the text's width is the font's pitch times its characters, so a
 * centred line starts half the difference in. The row is the cell's bottom.
 */
function text(frame: Frame, line: TextLine, align: "C" | "L"): string[] {
  const { fonts, spacing } = fontsFor(frame.dpi);
  const { font, multiplier: m } = bitmapFontFor(fonts, line.height);
  const width = ([...line.text].length * font.width - spacing[Number(font.name)]!) * m;
  const x = align === "C" ? line.x + Math.max(0, Math.round((line.width - width) / 2)) : line.x;
  const k = multiplier(m, "font");
  return [`1${font.name}${k}${k}000${place(frame, line.y + font.height * m, x)}${data(line.text)}`];
}

function around(frame: Frame, lines: string[], x: number, top: number, bottom: number, width: number, gap: number, options: PrintSymbolOptions, join: boolean, align: "C" | "L" = "C"): string[] {
  return textLines(lines, x, top, bottom, width, gap, options, join, "DPL").flatMap((line) => text(frame, line, align));
}

const HRI_GAP_MM = 1.02; // section 5.3.2.2: from the bearer bar to the text; the same under the other bars
const ITF14_RATIO = 3; // narrow to wide 1:3, within the manual's 2:1 to 3:1 for Interleaved 2 of 5

/** EAN and UPC: the bar code letter and the digits the printer takes (it adds the check digit itself). */
const LINEAR: Partial<Record<SymbologyId, { letter: string; digits: (value: string) => string }>> = {
  ean13: { letter: "F", digits: (value) => value.slice(0, 12) },
  ean8: { letter: "G", digits: (value) => value.slice(0, 7) },
  upca: { letter: "B", digits: (value) => value.slice(0, 11) },
  // UPC-E's six digits without the number system (always 0 here) and the check digit: the manual's six-digit form
  upce: { letter: "C", digits: (value) => value.slice(1, 7) },
};

function fields(symbology: SymbologyId, value: string, options: PrintSymbolOptions, frame: Frame): string[] {
  const refused = REFUSED[symbology];
  if (refused) throw new DplUnsupportedError(refused);
  if (symbology.startsWith("databar")) {
    throw new DplUnsupportedError(
      `DPL's RSS (W1k) is not offered yet for ${SYMBOLOGIES[symbology].name}: Labelize, the emulator the tests print DPL with, ` +
        "does not draw it, so no test has read it back. ZPL or the PDF print it.",
    );
  }
  // Checks the data (GS1 syntax, check digits); a QR code at the level the printer is given, which sets its size
  const geometry = encode(symbology, value, symbology === "dl-qrcode" ? { eclevel: options.qrError ?? "M" } : {});
  const { x, y, dotsPerModule: d, barHeightDots: h, dpi } = options;
  const hri = options.hri ?? true;
  const linear = LINEAR[symbology];
  if (linear) {
    // Upper case letters print the printer's own human readable digits under the bars (manual, table 8-4). The row is
    // the symbol's bottom: its guard bars', which reach 5X below the others, as the layout draws them
    const letter = hri ? linear.letter : linear.letter.toLowerCase();
    const m = multiplier(d, "module");
    return [`1${letter}${m}${m}${height(h, dpi)}${place(frame, y + h + Math.round(GUARD_EXTENSION * d), x)}${linear.digits(value)}`];
  }

  switch (symbology) {
    case "itf14":
      return itf14(value, options, frame);
    case "gs1-128": {
      const elements = parseElementString(value);
      if ((options.parts && options.parts.length > 1) || elements.length !== 1 || elements[0]!.ai !== "00") throw new DplUnsupportedError(MESSAGES.gs1128);
      // Q: "00" and the SSCC's first 17 digits, 19 in all; the printer adds the check digit and FNC1 (manual, Q). The
      // lower case q leaves out the printer's text, which it prints above the symbol: the studio's goes where asked
      const m = multiplier(d, "module");
      const symbol = `1q${m}${m}${height(h, dpi)}${place(frame, y + h, x)}00${elements[0]!.value.slice(0, 17)}`;
      return [symbol, ...around(frame, [`(00)${elements[0]!.value}`], x, y, y + h, widthInModules(geometry) * d, 2 * d, options, true)];
    }
    case "dl-datamatrix": {
      const { rows, cols } = geometry as { rows: number; cols: number }; // a Data Matrix's
      if (rows !== cols) throw new DplUnsupportedError("DPL's Data Matrix is square: a rectangular one is not offered.");
      // ECC 200 (hhh 200, i 0) at the layout's size, rows and columns given so that the printer draws the same symbol
      const m = multiplier(d, "module");
      return [`1W1c${m}${m}000${place(frame, y + rows * d, x)}2000${pad(rows, 3)}${pad(cols, 3)}${data(value)}`];
    }
    case "dl-qrcode": {
      if (options.qrMode) {
        throw new DplUnsupportedError("DPL is written with the QR code in the printer's automatic mode: one mode for the whole data is not offered yet.");
      }
      // The module is given in tenths of a millimetre (manual, W1D), not dots: the nearest, refused if it misses a dot
      const units = Math.max(1, Math.round((d / dpi) * MM_PER_INCH * 10));
      if (Math.round(((units / 10) * dpi) / MM_PER_INCH) !== d) {
        throw new DplUnsupportedError(`DPL sizes a QR code's module in tenths of a millimetre: ${d} dots at ${dpi} dpi is not one of them. Choose another size or printer.`);
      }
      const m = multiplier(units, "qr");
      const size = (geometry as { rows: number }).rows; // a QR code's, square
      // W1D, manual formatting: the error correction level, A (automatic input), the data, then two carriage returns
      return [`1W1D${m}${m}000${place(frame, y + size * d, x)}${options.qrError ?? "M"}A,${data(value)}\r`];
    }
    default:
      throw new DplUnsupportedError(`no DPL command for ${SYMBOLOGIES[symbology].name}`);
  }
}

/**
 * ITF-14 as Interleaved 2 of 5 (d, the 14 digits as they are, no printer text), narrow to wide 1:3; its bearer bars
 * drawn with X records (a box for the frame, lines for the bars), and its 14 digits below them, 1.02 mm away.
 */
function itf14(value: string, options: PrintSymbolOptions, frame: Frame): string[] {
  const { x, y, dotsPerModule: d, barHeightDots: h, bearer, dpi } = options;
  const width = (7 * (4 * ITF14_RATIO + 6) + ITF14_RATIO + 6) * d; // section 5.3.2.2: P(4N+6)+N+6 modules
  const symbol = `1d${multiplier(ITF14_RATIO * d, "wide")}${multiplier(d, "module")}${height(h, dpi)}${place(frame, y + h, x)}${value}`;
  const gap = Math.round((HRI_GAP_MM / MM_PER_INCH) * dpi);
  if (!bearer) return [symbol, ...around(frame, [value], x, y, y + h, width, gap, options, true)];
  const t = bearer.thicknessDots;
  const quiet = 10 * d;
  const side = bearer.kind === "frame" ? t : 0;
  const left = x - quiet - side;
  const outer = width + 2 * quiet + 2 * side;
  const boxes = bearer.kind === "frame"
    ? [box(frame, left, y - t, outer, h + 2 * t, t)]
    : [rule(frame, left, y - t, outer, t), rule(frame, left, y + h, outer, t)];
  const placed = { ...options, hriPosition: options.hriPosition === "split" ? "below" as const : options.hriPosition };
  return [symbol, ...boxes, ...around(frame, [value], left, y - t, y + h + t, outer, gap, placed, true)];
}
