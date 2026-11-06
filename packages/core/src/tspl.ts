import { MM_PER_INCH } from "./dots.ts";
import { encode } from "./encode.ts";
import { hasPredefinedLength, parseElementString } from "./elementString.ts";
import type { Bitmap } from "./raster.ts";
import {
  concatBytes,
  darkAsZeros,
  fittingFont,
  hriTextDots,
  PrinterUnsupportedError,
  textLines,
  type BitmapFont,
  type PrintFile,
  type PrintLabelOptions,
  type PrintPage,
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
  return withRuler(fields(symbology, data, options), options, notes);
}

/**
 * A label of one's own (backlog 4.2) with TSPL's own commands, as ZPL and EPL2 write it: each barcode with the commands
 * of a symbol alone where the page puts it; each line of text with TEXT in the dot font whose capitals come nearest its
 * height and that keeps it within the width the page gives it; each line and filled box with BAR, each outlined box with
 * BOX; each image with BITMAP, whose dots are raw bytes, so a page with an image is a print file of bytes (`PrintFile`).
 * A turned barcode or line of text with BARCODE's, TEXT's and DMATRIX's rotation (`turnAbout`); a turned QR code is
 * refused. With `notes`, a test label (backlog 3.1).
 */
export function tsplPage(page: PrintPage, options: { notes?: readonly string[] } = {}): PrintFile {
  const images = (page.images ?? []).map((image) => bitmap(image.bitmap, image.x, image.y));
  // A turned symbol: its commands written upright from its corner, then turned with it about its own box
  const symbols = page.symbols.flatMap(({ symbology, data, options: { turned, ...upright } }) => {
    if (turned && symbology === "dl-qrcode") {
      throw new TsplUnsupportedError("TSPL's QR code is printed upright only for now: Labelize, the emulator the tests print TSPL with, does not turn it. Turn it back to 0°: a QR code is read in any direction.");
    }
    const commands = fields(symbology, data, upright);
    return turned ? turnAbout(commands, { x: upright.x, y: upright.y, width: turned.width, height: turned.height }, turned.rotation, BARCODE_TEXT_PAST) : commands;
  });
  // A turned line of text: its TEXT command turned about its capitals' box, the text's start where the page puts it
  const texts = page.texts.flatMap((t) => {
    const commands = text({ x: t.x, y: t.y, width: t.widthDots, height: t.heightDots, text: t.text }, "L");
    return t.rotation ? turnAbout(commands, { x: t.x, y: t.y, width: t.widthDots, height: t.heightDots }, t.rotation, TEXT_PAST) : commands;
  });
  // BAR fills a rectangle (a line, a filled box); BOX draws a box's outline inside its corners, the far one exclusive
  const boxes: string[] = [];
  for (const b of page.boxes) {
    if (b.thickness >= Math.min(b.width, b.height)) boxes.push(`BAR ${b.x},${b.y},${b.width},${b.height}`);
    else boxes.push(`BOX ${b.x},${b.y},${b.x + b.width},${b.y + b.height},${b.thickness}`);
  }
  const size = { x: 0, y: 0, dotsPerModule: 1, barHeightDots: 0, dpi: page.dpi, widthDots: page.widthDots, heightDots: page.heightDots, ...(page.copies ? { copies: page.copies } : {}) };
  const commands = [...images, ...boxes, ...texts, ...symbols];
  return options.notes ? withRuler(commands, size, options.notes) : document(commands, size);
}

const BARCODE_TEXT_PAST = "A barcode's text runs past the label's edge: move the barcode inside the label.";
const TEXT_PAST = "A line of text runs past the label's edge: move it inside the label.";

/**
 * Commands written upright from a box's corner, turned clockwise with it about the box (backlog 4.2), whose top left
 * corner as turned is `box`'s `x` and `y` and whose upright size is its `width` and `height`. TSC's printers turn a
 * field about its origin: the manual's RSS example prints four symbols from one x, y turned 0°, 90°, 180° and 270°, and
 * its picture shows them around that point, each in its own quarter (at 90° the origin is the field's top right corner,
 * as EPL2's guide draws it). So BARCODE, TEXT and DMATRIX keep their own field and take their origin, the dot their
 * upright top left dot was, turned about the box, with their rotation (DMATRIX's r#); a centred TEXT (alignment 2,
 * whose x is its middle) is written from its left edge first, by its font's pitch. BAR and BOX have no rotation: their
 * rectangle is turned. Labelize places a turned field's top left corner at x, y instead, as ZPL does: its tests move
 * each origin there.
 */
function turnAbout(commands: string[], box: { x: number; y: number; width: number; height: number }, rotation: 90 | 180 | 270, past: string): string[] {
  const { x, y, width: w, height: h } = box;
  // A rectangle's top left corner and size as turned; a dot is a rectangle one dot square
  const rect = (rx: number, ry: number, rw: number, rh: number): [number, number, number, number] => {
    const [u, v] = [rx - x, ry - y];
    const turned: [number, number, number, number] = rotation === 90 ? [x + h - v - rh, y + u, rh, rw]
      : rotation === 180 ? [x + w - u - rw, y + h - v - rh, rw, rh]
      : [x + v, y + w - u - rw, rh, rw];
    if (turned[0] < 0 || turned[1] < 0) throw new TsplUnsupportedError(past);
    return turned;
  };
  const origin = (ox: number, oy: number) => rect(ox, oy, 1, 1).slice(0, 2).join(",");
  const written = (name: string, ...parameters: (string | number)[]) => `${name} ${parameters.join(",")}`;
  return commands.map((command) => {
    const barcode = /^BARCODE (-?\d+),(-?\d+),("[^"]*",\d+,\d+),0,/.exec(command);
    if (barcode) return written("BARCODE", origin(Number(barcode[1]), Number(barcode[2])), barcode[3]!, rotation, command.slice(barcode[0].length));
    const line = /^TEXT (-?\d+),(-?\d+),"(\d)",0,(\d+),(\d+),(2,)?(".*")$/.exec(command);
    if (line) {
      const [, tx, ty, font, mx, my, centred, content] = line as unknown as [string, string, string, string, string, string, string | undefined, string];
      const chars = [...content.slice(1, -1).replace(/\\\["\]/g, '"')].length;
      const left = Number(tx) - (centred ? Math.round((chars * FONTS[Number(font) - 1]!.width * Number(mx)) / 2) : 0);
      return written("TEXT", origin(left, Number(ty)), `"${font}"`, rotation, mx, my, content);
    }
    const matrix = /^DMATRIX (-?\d+),(-?\d+),(\d+,\d+,c126,x\d+),/.exec(command);
    if (matrix) return written("DMATRIX", origin(Number(matrix[1]), Number(matrix[2])), matrix[3]!, `r${rotation}`, command.slice(matrix[0].length));
    const bar = /^BAR (-?\d+),(-?\d+),(\d+),(\d+)$/.exec(command);
    if (bar) return written("BAR", ...rect(Number(bar[1]), Number(bar[2]), Number(bar[3]), Number(bar[4])));
    const outline = /^BOX (-?\d+),(-?\d+),(-?\d+),(-?\d+),(\d+)$/.exec(command);
    if (outline) {
      const [bx, by, bw, bh] = rect(Number(outline[1]), Number(outline[2]), Number(outline[3]) - Number(outline[1]), Number(outline[4]) - Number(outline[2]));
      return written("BOX", bx, by, bx + bw, by + bh, outline[5]!);
    }
    throw new Error(`no turn for the TSPL command ${command}`);
  });
}

/**
 * An image with BITMAP (manual, BITMAP): its corner, its width in bytes (eight dots a byte), its height in dots, mode 0
 * (overwrite), then the dots as raw bytes, a row at a time, the leftmost dot in the highest bit; a dot whose bit is 0
 * prints black, as Labelize draws it (its parser: "TSC BITMAP prints cleared bits"), so the spare dots in a row's last
 * byte are 1s.
 */
function bitmap(picture: Bitmap, x: number, y: number): Uint8Array<ArrayBuffer> {
  return concatBytes([`BITMAP ${x},${y},${Math.ceil(picture.width / 8)},${picture.height},0,`, darkAsZeros(picture)]);
}

/** A command: its text, or its bytes where it carries raw binary data (BITMAP). */
type Command = string | Uint8Array<ArrayBuffer>;

/** The commands, then a 50 mm ruler below the label with a tick every 10 mm and the settings as text. */
function withRuler(commands: string[], options: PrintLabelOptions, notes: readonly string[]): string;
function withRuler(commands: Command[], options: PrintLabelOptions, notes: readonly string[]): PrintFile;
function withRuler(commands: Command[], options: PrintLabelOptions, notes: readonly string[]): PrintFile {
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

/** The print file: text, or bytes when a command carries raw binary data. */
function document(commands: string[], options: PrintLabelOptions): string;
function document(commands: Command[], options: PrintLabelOptions): PrintFile;
function document(commands: Command[], options: PrintLabelOptions): PrintFile {
  const mm = (dots: number) => Number(((dots / options.dpi) * MM_PER_INCH).toFixed(2));
  const lines = [
    `SIZE ${mm(options.widthDots)} mm,${mm(options.heightDots)} mm`,
    "CODEPAGE UTF-8",
    "CLS",
    ...commands,
    `PRINT ${options.copies ?? 1}`,
    "",
  ];
  if (lines.every((line) => typeof line === "string")) return lines.join("\r\n");
  return concatBytes(lines.flatMap((line, index) => (index ? ["\r\n", line] : [line])));
}

/**
 * The dot fonts' capitals are this much of their cell (Labelize, 4 November 2026: 9, 15, 18, 24 and 36 dots in cells
 * of 12, 20, 24, 32 and 48, twice as many at multiplier 2, the same at 203 and 300 dpi; their top at the TEXT command's
 * y). The studio's text heights are its capitals' (section 4.14), so the cell asked for is this much larger.
 */
const TSPL_CAPITALS = 0.75;

/**
 * A line of text in the dot font whose capitals come closest to its height, no wider than `line.width` where a font
 * that tall fits it (else the narrowest); centred in its box with alignment 2, or from its left edge with no alignment
 * (the default, which every firmware takes; alignment came with V6.73 EZ).
 */
function text(line: TextLine, align: "C" | "L"): string[] {
  const { font, multiplier } = fittingFont(FONTS, line.text, line.height, line.width, TSPL_CAPITALS, (f, m) => f.width * m, 10);
  return align === "C"
    ? [`TEXT ${line.x + Math.round(line.width / 2)},${line.y},"${font.name}",0,${multiplier},${multiplier},2,${quoted(line.text)}`]
    : [`TEXT ${line.x},${line.y},"${font.name}",0,${multiplier},${multiplier},${quoted(line.text)}`];
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
