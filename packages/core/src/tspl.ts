import { MM_PER_INCH } from "./dots.ts";
import { encode } from "./encode.ts";
import { hasPredefinedLength, parseElementString } from "./elementString.ts";
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
 * TSPL/TSPL2 (TSC and most generic thermal printers) with the printer's own commands (ADR 0002, backlog 3.3). Reference:
 * TSC's *TSPL/TSPL2 Programming Manual*, 31-0000001-00 version 3.0 (2025). Every symbol here is rendered by Labelize
 * (an open-source emulator, not a printer) and read back by ZXing in the tests; what Labelize does not print as the
 * manual describes is refused with the reason, so nothing is offered that no test has seen.
 */
export class TsplUnsupportedError extends PrinterUnsupportedError {}

/** The fixed-pitch dot fonts 1 to 5 (manual, TEXT): the same cells in dots at every resolution. */
const FONTS: readonly BitmapFont[] = [
  { name: "1", width: 8, height: 12 },
  { name: "2", width: 12, height: 20 },
  { name: "3", width: 16, height: 24 },
  { name: "4", width: 24, height: 32 },
  { name: "5", width: 32, height: 48 },
];

const REFUSED: Partial<Record<SymbologyId, string>> = {
  ean8: "TSPL's EAN8 is not offered yet: Labelize, the emulator the tests print TSPL with, does not draw it, so no test has read it back. ZPL or the PDF print it.",
  upca: "TSPL's UPCA is not offered yet: Labelize, the emulator the tests print TSPL with, does not draw it, so no test has read it back. ZPL or the PDF print it.",
  upce: "TSPL's UPCE is not offered yet: Labelize, the emulator the tests print TSPL with, does not draw it, so no test has read it back. ZPL or the PDF print it.",
  "gs1-128":
    "GS1-128 is not offered in TSPL yet: the manual writes FNC1 as !102 in a 128M bar code, but Labelize, the emulator " +
    "the tests print TSPL with, encodes \"!102\" as text, so no test has read a GS1-128 back. ZPL or the PDF print it.",
  "gs1-qrcode": "TSPL's QR code has no FNC1, so it cannot print a GS1 QR Code. Use a GS1 DataMatrix, or a QR code with a GS1 Digital Link URI.",
};


/** TSPL's string: double quotes as \["] (manual, TEXT). */
function quoted(text: string): string {
  return `"${text.replace(/"/g, '\\["]')}"`;
}

/** One label with one symbol, ready to print: SIZE in mm, CLS, the symbol and its text, PRINT. */
export function tsplLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions): string {
  return document(fields(symbology, data, options), options);
}

/** A test label (backlog 3.1): the label, then a 50 mm ruler with a tick every 10 mm and the settings as text. */
export function tsplTestLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions, notes: readonly string[]): string {
  const commands = fields(symbology, data, options);
  const dpi = options.dpi;
  const mm = (value: number) => Math.round((value / MM_PER_INCH) * dpi);
  const top = options.heightDots + mm(2);
  const x = Math.max(mm(2), Math.min(options.x, options.widthDots - mm(50) - mm(2)));
  const line = Math.max(2, mm(0.3));
  const t = hriTextDots(dpi);
  const step = Math.round(t * 1.4);
  const ruler = [
    `BAR ${x},${top + mm(3)},${mm(50)},${line}`,
    ...[0, 10, 20, 30, 40, 50].map((at) => `BAR ${x + mm(at) - (at === 50 ? line : 0)},${top},${line},${mm(at % 50 ? 2.5 : 4)}`),
    ...text({ x, y: top + mm(5), width: mm(50), height: t, text: "50 mm: measure this line" }, "C"),
    ...notes.flatMap((note, index) => text({ x: mm(2), y: top + mm(10) + index * step, width: options.widthDots, height: t, text: note }, "L")),
  ];
  const height = options.heightDots + Math.round((14 / MM_PER_INCH) * dpi) + notes.length * step;
  return document([...commands, ...ruler], { ...options, widthDots: Math.max(options.widthDots, x + mm(52)), heightDots: height });
}

function document(commands: string[], options: PrintLabelOptions): string {
  const mm = (dots: number) => Number(((dots / options.dpi) * MM_PER_INCH).toFixed(2));
  return [
    `SIZE ${mm(options.widthDots)} mm,${mm(options.heightDots)} mm`,
    "CODEPAGE UTF-8",
    "CLS",
    ...commands,
    `PRINT ${options.copies ?? 1}`,
    "",
  ].join("\r\n");
}

/** A line of text in the dot font closest to its height, centred in its box or from its left edge. */
function text(line: TextLine, align: "C" | "L"): string[] {
  const { font, multiplier } = bitmapFontFor(FONTS, line.height);
  return align === "C"
    ? [`TEXT ${line.x + Math.round(line.width / 2)},${line.y},"${font.name}",0,${multiplier},${multiplier},2,${quoted(line.text)}`]
    : [`TEXT ${line.x},${line.y},"${font.name}",0,${multiplier},${multiplier},1,${quoted(line.text)}`];
}

function around(lines: string[], x: number, top: number, bottom: number, width: number, gap: number, options: PrintSymbolOptions, join: boolean, align: "C" | "L" = "C"): string[] {
  return textLines(lines, x, top, bottom, width, gap, options, join, "TSPL").flatMap((line) => text(line, align));
}

const HRI_GAP_MM = 1.02; // section 5.3.2.2: from the bearer bar to the text
const ITF14_RATIO = 3; // narrow to wide 1:3, which the manual's table allows for Interleaved 2 of 5

function fields(symbology: SymbologyId, data: string, options: PrintSymbolOptions): string[] {
  const refused = REFUSED[symbology];
  if (refused) throw new TsplUnsupportedError(refused);
  if (symbology.startsWith("databar")) {
    throw new TsplUnsupportedError("TSPL's RSS command is not offered yet for {name}: Labelize, the emulator the tests print TSPL with, does not draw it, so no test has read it back. ZPL or the PDF print it.".replace("{name}", SYMBOLOGIES[symbology].name));
  }
  if (options.parts && options.parts.length > 1) throw new TsplUnsupportedError(REFUSED["gs1-128"]!);
  const geometry = encode(symbology, data); // checks the data: GS1 syntax, check digits
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const hri = options.hri ?? true;

  switch (symbology) {
    case "ean13":
      // The first 12 digits: the printer adds the check digit (manual, BARCODE: EAN13 takes 12)
      return [`BARCODE ${x},${y},"EAN13",${h},${hri ? 2 : 0},0,${d},${d},"${data.slice(0, 12)}"`];
    case "itf14":
      return itf14(data, options);
    case "gs1-datamatrix":
    case "dl-datamatrix": {
      // c126: "~" is the escape character; ~1 is FNC1, first and after each element string without a predefined length
      // that is not the last (manual, DMATRIX, "Example for GS1 DataMatrix"); a "~" in the data is written "~~"
      const escape = (value: string) => value.replace(/~/g, "~~");
      const elements = symbology === "gs1-datamatrix" ? parseElementString(data) : [];
      const content = symbology === "gs1-datamatrix"
        ? "~1" + elements.map((e, index) => e.ai + escape(e.value) + (index < elements.length - 1 && !hasPredefinedLength(e.ai) ? "~1" : "")).join("")
        : escape(data);
      const { rows, cols } = geometry as { rows: number; cols: number }; // a Data Matrix's
      const symbol = `DMATRIX ${x},${y},${cols * d},${rows * d},c126,x${d},${rows},${cols},${quoted(content)}`;
      const t = hriTextDots(options.dpi, options.hriHeightMm);
      const lines = elements.map((e) => `(${e.ai})${e.value}`);
      return [symbol, ...around(lines, x, y, y + rows * d, Math.max(cols * d, 40 * t), 2 * d, options, false, "L")];
    }
    case "dl-qrcode":
      // Automatic mode, the label's error correction level, a module of d dots (manual, QRCODE)
      if (options.qrMode) {
        throw new TsplUnsupportedError("TSPL is written with the QR code in the printer's automatic mode: one mode for the whole data is not offered yet.");
      }
      return [`QRCODE ${x},${y},${options.qrError ?? "M"},${d},A,0,${quoted(data)}`];
    default:
      throw new TsplUnsupportedError(`no TSPL command for ${SYMBOLOGIES[symbology].name}`);
  }
}

/**
 * ITF-14 as the ITF14 bar code (the GTIN-14's first 13 digits; the printer adds the check digit), narrow to wide 1:3;
 * its bearer bars drawn with BAR or BOX, and its 14 digits below them, 1.02 mm away. The manual's "25" (Interleaved 2
 * of 5) is not used: Labelize does not draw it. Whether a TSC printer adds bearer bars of its own to ITF14 the manual
 * does not say; Labelize draws none.
 */
function itf14(data: string, options: PrintSymbolOptions): string[] {
  const { x, y, dotsPerModule: d, barHeightDots: h, bearer } = options;
  const width = (7 * (4 * ITF14_RATIO + 6) + ITF14_RATIO + 6) * d; // section 5.3.2.2: P(4N+6)+N+6 modules
  const symbol = `BARCODE ${x},${y},"ITF14",${h},0,0,${d},${ITF14_RATIO * d},"${data.slice(0, 13)}"`;
  const gap = Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi);
  if (!bearer) return [symbol, ...around([data], x, y, y + h, width, gap, options, true)];
  const t = bearer.thicknessDots;
  const quiet = 10 * d;
  const side = bearer.kind === "frame" ? t : 0;
  const left = x - quiet - side;
  const outer = width + 2 * quiet + 2 * side;
  const boxes: string[] = [];
  if (bearer.kind === "frame") boxes.push(`BOX ${left},${y - t},${left + outer},${y + h + t},${t}`);
  else boxes.push(`BAR ${left},${y - t},${outer},${t}`, `BAR ${left},${y + h},${outer},${t}`);
  const placed = { ...options, hriPosition: options.hriPosition === "split" ? "below" as const : options.hriPosition };
  return [symbol, ...boxes, ...around([data], left, y - t, y + h + t, outer, gap, placed, true)];
}
