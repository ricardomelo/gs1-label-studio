import { dotsWithin, MM_PER_INCH } from "./dots.ts";
import { encode, widthInModules } from "./encode.ts";
import { hasPredefinedLength, parseElementString } from "./elementString.ts";
import type { LogisticLabel } from "./logistic.ts";
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
 * EPL2 (older Zebras and their emulations) with the printer's own commands (ADR 0002, backlog 3.6). Reference: Zebra's
 * *EPL Programming Guide*, 14245L-003 Rev. A (2013). Every symbol here is rendered by Labelize (an open-source
 * emulator, not a printer) and read back by ZXing in the tests; what the manual or Labelize does not support is refused
 * with the reason.
 */
export class EplUnsupportedError extends PrinterUnsupportedError {}

/** The fixed-pitch fonts 1 to 5 (guide, A command), whose cells differ at 203 and 300 dpi. */
const FONTS_203: readonly BitmapFont[] = [
  { name: "1", width: 8, height: 12 },
  { name: "2", width: 10, height: 16 },
  { name: "3", width: 12, height: 20 },
  { name: "4", width: 14, height: 24 },
  { name: "5", width: 32, height: 48 },
];
const FONTS_300: readonly BitmapFont[] = [
  { name: "1", width: 12, height: 20 },
  { name: "2", width: 16, height: 28 },
  { name: "3", width: 20, height: 36 },
  { name: "4", width: 24, height: 44 },
  { name: "5", width: 48, height: 80 },
];
/** The vertical multipliers the A command accepts, 1 to 9; horizontal 1 to 6 and 8 (guide, A). */
const H_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 8];

const REFUSED: Partial<Record<SymbologyId, string>> = {
  "gs1-datamatrix":
    "EPL2's Data Matrix (the b command) has no FNC1, so it cannot print a GS1 DataMatrix. ZPL or the PDF print it; " +
    "a Data Matrix with a GS1 Digital Link URI prints in EPL2.",
  "dl-qrcode": "EPL2's QR code is for Japanese printer models only (guide, b command). ZPL or the PDF print it.",
  "gs1-qrcode": "EPL2 cannot print a GS1 QR Code. Use a GS1 DataMatrix in ZPL, or a QR code with a GS1 Digital Link URI in ZPL.",
};

/** EPL2's string: a double quote and a backslash each after a backslash (guide, B and A commands). */
function quoted(text: string): string {
  return `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/**
 * A symbol's data as a string. The guide escapes a double quote or a backslash with a backslash, but Labelize encodes
 * the backslash too, so no test has read such data back: it is refused (a URI percent-encodes them anyway).
 */
function symbolData(text: string, name: string): string {
  if (/["\\]/.test(text)) {
    throw new EplUnsupportedError(`EPL2's ${name} is not offered for data with a double quote or a backslash: their escape could not be read back. Leave them out, or percent-encode them in a URI.`);
  }
  return `"${text}"`;
}

/** One label with one symbol, ready to print: N (clear), q (print width), the symbol and its text, P. */
export function eplLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions): string {
  return document(fields(symbology, data, options), options);
}

/** A test label (backlog 3.1): the label, then a 50 mm ruler with a tick every 10 mm and the settings as text. */
export function eplTestLabel(symbology: SymbologyId, data: string, options: PrintLabelOptions, notes: readonly string[]): string {
  return withRuler(fields(symbology, data, options), options, notes);
}

/**
 * The GS1 Logistic Label (backlog 4.1) with EPL2's own commands, as ZPL writes it: each GS1-128 as UCC/EAN 128 at the
 * profile's dots, kept centred, its element strings below at 3 mm; the label's own text with A in the fixed-pitch
 * font nearest its height (narrower than the layout's, so it stays where the layout left room); the rules with LO.
 * A 2D symbol beside the data only as a Data Matrix with a GS1 Digital Link URI: EPL2's Data Matrix has no FNC1 and
 * its QR code is for Japanese models (REFUSED). Element strings of no predefined length must each end their symbol.
 */
export function eplLogisticLabel(label: LogisticLabel, dpi: number, dotsPerModule: number, options: { copies?: number; notes?: readonly string[] } = {}): string {
  const { layout, printer } = label;
  const perUnit = (layout.xMm / MM_PER_INCH) * dpi;
  const dots = (units: number) => Math.round(units * perUnit);
  const d = dotsPerModule;
  const widthDots = dots(layout.width);
  const heightDots = dots(layout.height);
  const barHeightDots = dots(printer.barHeight);
  const symbols = printer.symbols.flatMap(({ part, x }, index) => {
    const modules = widthInModules(encode("gs1-128", part));
    const left = Math.round((x + modules / 2) * perUnit - (modules * d) / 2);
    if (left < 0 || left + modules * d > widthDots) {
      const mm = ((modules * d * MM_PER_INCH) / dpi).toFixed(1);
      throw new EplUnsupportedError(`The GS1-128 of ${part} is ${mm} mm wide at ${d} dots a module, wider than the label: choose fewer dots or the larger label.`);
    }
    return gs1128(part, { x: left, y: dots(printer.symbols[index]!.y), dotsPerModule: d, barHeightDots, dpi, hri: true, hriHeightMm: LOGISTIC_HRI_MM });
  });
  const rules = printer.rules.map(([x, y, w, h]) => `LO${dots(x)},${dots(y)},${dots(w)},${Math.max(1, dots(h))}`);
  const texts = printer.texts.flatMap((t) => text({ x: dots(t.x), y: dots(t.top), width: Math.floor(t.width * perUnit), height: hriTextDots(dpi, t.heightMm), text: t.text }, "L", dpi));
  const twoD = printer.twoD;
  if (twoD) {
    const refused = REFUSED[twoD.symbology];
    if (refused) throw new EplUnsupportedError(refused);
    const moduleMm = twoD.module * layout.xMm;
    const choices = dotsWithin(twoD.rangeMm[0], twoD.rangeMm[1], dpi);
    if (!choices.length) throw new EplUnsupportedError(`A ${dpi} dpi printer cannot print the 2D symbol within table 5's X-dimensions.`);
    const d2 = choices.reduce((best, c) => (Math.abs(c.xMm - moduleMm) < Math.abs(best.xMm - moduleMm) - 1e-9 ? c : best)).dots;
    const right = dots(twoD.x + twoD.modules * twoD.module);
    symbols.push(...fields(twoD.symbology, twoD.data, { x: right - twoD.modules * d2, y: dots(twoD.y), dotsPerModule: d2, barHeightDots: 0, dpi, hri: false }));
  }
  const size = { x: 0, y: 0, dotsPerModule: d, barHeightDots, dpi, widthDots, heightDots, ...(options.copies ? { copies: options.copies } : {}) };
  const commands = [...rules, ...texts, ...symbols];
  return options.notes ? withRuler(commands, size, options.notes) : document(commands, size);
}

const LOGISTIC_HRI_MM = 3; // section 4.14, rule 5c: no less than 3 mm on a GS1 Logistic Label

/**
 * A label of one's own (backlog 4.2) with EPL2's own commands, as ZPL writes it: each barcode with the commands of a
 * symbol alone where the page puts it; each line of text with A in the fixed-pitch font whose capitals come nearest its
 * height and that keeps it within the width the page gives it; each line and filled box with LO, each outlined box with
 * X; each image with GW, whose dots are raw bytes, so a page with an image is a print file of bytes (`PrintFile`). A
 * turned barcode or line of text with A's and B's rotation (`turnAbout`); a Data Matrix has none, so one turned is
 * refused. With `notes`, a test label (backlog 3.1).
 */
export function eplPage(page: PrintPage, options: { notes?: readonly string[] } = {}): PrintFile {
  const images = (page.images ?? []).map((image) => directGraphic(image.bitmap, image.x, image.y));
  // A turned symbol: its commands written upright from its corner, then turned with it about its own box
  const symbols = page.symbols.flatMap(({ symbology, data, options: { turned, ...upright } }) => {
    if (turned && symbology === "dl-datamatrix") {
      throw new EplUnsupportedError("EPL2 prints a Data Matrix upright only (its b command has no rotation): turn it back to 0°, or print its ZPL or PDF.");
    }
    const commands = fields(symbology, data, upright);
    return turned ? turnAbout(commands, { x: upright.x, y: upright.y, width: turned.width, height: turned.height }, turned.rotation, BARCODE_TEXT_PAST) : commands;
  });
  // A turned line of text: its A command turned about its capitals' box, the text's start where the page puts it
  const texts = page.texts.flatMap((t) => {
    const commands = text({ x: t.x, y: t.y, width: t.widthDots, height: t.heightDots, text: t.text }, "L", page.dpi);
    return t.rotation ? turnAbout(commands, { x: t.x, y: t.y, width: t.widthDots, height: t.heightDots }, t.rotation, TEXT_PAST) : commands;
  });
  // LO fills a rectangle (a line, a filled box); X draws a box's outline, its ends the box's outer edges
  const boxes = page.boxes.map((b) => b.thickness >= Math.min(b.width, b.height)
    ? `LO${b.x},${b.y},${b.width},${b.height}`
    : `X${b.x},${b.y},${b.thickness},${b.x + b.width},${b.y + b.height}`);
  const size = { x: 0, y: 0, dotsPerModule: 1, barHeightDots: 0, dpi: page.dpi, widthDots: page.widthDots, heightDots: page.heightDots, ...(page.copies ? { copies: page.copies } : {}) };
  const commands = [...images, ...boxes, ...texts, ...symbols];
  return options.notes ? withRuler(commands, size, options.notes) : document(commands, size);
}

const BARCODE_TEXT_PAST = "A barcode's text runs past the label's edge: move the barcode inside the label.";
const TEXT_PAST = "A line of text runs past the label's edge: move it inside the label.";
/** EPL2's rotation for a turn clockwise (guide, A and B commands, p3). */
const EPL_ROTATIONS = { 90: 1, 180: 2, 270: 3 } as const;

/**
 * Commands written upright from a box's corner, turned clockwise with it about the box (backlog 4.2), whose top left
 * corner as turned is `box`'s `x` and `y` and whose upright size is its `width` and `height`. In EPL2 "the point of
 * origin for a non-rotated object is the upper left corner; as an object rotates, the point of origin rotates with the
 * object" (guide, Placing Elements in the Print Image, figure 2: a text turned 90° has its origin at its top right
 * corner, 270° at its bottom left): so an A or B command keeps its own field and takes its origin, the dot its upright
 * top left dot was, turned about the box, with its rotation (p3). LO and X have no rotation: their rectangle is turned.
 * Labelize places a turned field's top left corner at x, y instead, as ZPL does: its tests move each origin there.
 */
function turnAbout(commands: string[], box: { x: number; y: number; width: number; height: number }, rotation: 90 | 180 | 270, past: string): string[] {
  const { x, y, width: w, height: h } = box;
  // A rectangle's top left corner and size as turned; a dot is a rectangle one dot square
  const rect = (rx: number, ry: number, rw: number, rh: number): [number, number, number, number] => {
    const [u, v] = [rx - x, ry - y];
    const turned: [number, number, number, number] = rotation === 90 ? [x + h - v - rh, y + u, rh, rw]
      : rotation === 180 ? [x + w - u - rw, y + h - v - rh, rw, rh]
      : [x + v, y + w - u - rw, rh, rw];
    if (turned[0] < 0 || turned[1] < 0) throw new EplUnsupportedError(past);
    return turned;
  };
  return commands.map((command) => {
    const field = /^([AB])(-?\d+),(-?\d+),0,/.exec(command);
    if (field) {
      const [nx, ny] = rect(Number(field[2]), Number(field[3]), 1, 1);
      return `${field[1]}${nx},${ny},${EPL_ROTATIONS[rotation]},${command.slice(field[0].length)}`;
    }
    const line = /^LO(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(command);
    if (line) return `LO${rect(Number(line[1]), Number(line[2]), Number(line[3]), Number(line[4])).join(",")}`;
    const box = /^X(-?\d+),(-?\d+),(\d+),(-?\d+),(-?\d+)$/.exec(command);
    if (box) {
      const [bx, by, bw, bh] = rect(Number(box[1]), Number(box[2]), Number(box[4]) - Number(box[1]), Number(box[5]) - Number(box[2]));
      return `X${bx},${by},${box[3]},${bx + bw},${by + bh}`;
    }
    throw new Error(`no turn for the EPL2 command ${command}`);
  });
}

/**
 * An image with GW (guide, Direct Graphic Write): its corner, its width in bytes (eight dots a byte), its height in
 * dots, then the dots as raw bytes, a row at a time, the leftmost dot in the highest bit. A dot whose bit is 0 prints
 * black and 1 leaves it white (Zebra's support note on GW; the guide does not say), so the dots past the image's width
 * in its last byte are 1s. Labelize prints the bits the other way round, so its tests invert them first.
 */
function directGraphic(bitmap: Bitmap, x: number, y: number): Uint8Array<ArrayBuffer> {
  return concatBytes([`GW${x},${y},${Math.ceil(bitmap.width / 8)},${bitmap.height},`, darkAsZeros(bitmap)]);
}

/** A command: its text, or its bytes where it carries raw binary data (GW). */
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
    `LO${x},${top + mm(3)},${mm(50)},${line}`,
    ...[0, 10, 20, 30, 40, 50].map((at) => `LO${x + mm(at) - (at === 50 ? line : 0)},${top},${line},${mm(at % 50 ? 2.5 : 4)}`),
    ...text({ x, y: top + mm(5), width: mm(50), height: t, text: "50 mm: measure this line" }, "C", dpi),
    ...notes.flatMap((note, index) => text({ x: mm(2), y: top + mm(10) + index * step, width: options.widthDots, height: t, text: note }, "L", dpi)),
  ];
  return document([...commands, ...ruler], { ...options, widthDots: Math.max(options.widthDots, x + mm(52)) });
}

/** The print file: text, or bytes when a command carries raw binary data. */
function document(commands: string[], options: PrintLabelOptions): string;
function document(commands: Command[], options: PrintLabelOptions): PrintFile;
function document(commands: Command[], options: PrintLabelOptions): PrintFile {
  // A blank line first ends whatever the printer was given before (guide, N); q sets the print width in dots
  const lines = ["", "N", `q${options.widthDots}`, ...commands, `P${options.copies ?? 1}`, ""];
  if (lines.every((line) => typeof line === "string")) return lines.join("\r\n");
  return concatBytes(lines.flatMap((line, index) => (index ? ["\r\n", line] : [line])));
}

/**
 * The fonts' capitals are this much of their cell (Labelize, 2 November 2026: 9, 12, 15, 18 and 36 dots in cells of
 * 12, 16, 20, 24 and 48 at 203 dpi, and twice as many at multiplier 2). The studio's text heights are its capitals'
 * (section 4.14), so the cell asked for is this much larger. At 300 dpi Labelize draws the 203 dpi cells, not the
 * guide's; the guide's cells are taken with the same ratio.
 */
const EPL_CAPITALS = 0.75;

/**
 * A line of text in the font whose capitals come closest to its height, no wider than `line.width` where a font that
 * tall fits it (else the narrowest). The A command has no centring: the text's width is the font's pitch times its
 * characters, so a centred line starts half the difference in.
 */
function text(line: TextLine, align: "C" | "L", dpi: number): string[] {
  const fonts = dpi < 250 ? FONTS_203 : FONTS_300;
  const chars = [...line.text].length;
  const { font, multiplier } = fittingFont(fonts, line.text, line.height, line.width, EPL_CAPITALS, (f, m) => f.width * horizontal(m), 9);
  const v = Math.min(9, multiplier);
  const h = horizontal(multiplier);
  const width = chars * font.width * h;
  const x = align === "C" ? line.x + Math.max(0, Math.round((line.width - width) / 2)) : line.x;
  return [`A${x},${line.y},0,${font.name},${h},${v},N,${quoted(line.text)}`];
}

/** The horizontal multiplier for a vertical one: the largest the A command takes that is no larger. */
function horizontal(multiplier: number): number {
  return [...H_MULTIPLIERS].reverse().find((m) => m <= multiplier) ?? 1;
}

function around(lines: string[], x: number, top: number, bottom: number, width: number, gap: number, options: PrintSymbolOptions, join: boolean): string[] {
  return textLines(lines, x, top, bottom, width, gap, options, join, "EPL2").flatMap((line) => text(line, "C", options.dpi));
}

const HRI_GAP_MM = 1.02; // section 5.3.2.2: from the bearer bar to the text
const ITF14_RATIO = 3;
/** EAN and UPC take a narrow bar of 2 to 4 dots (guide, B command, table 1). */
const EAN_DOTS: readonly [number, number] = [2, 4];

const LINEAR: Partial<Record<SymbologyId, { type: string; digits: (data: string) => string }>> = {
  ean13: { type: "E30", digits: (data) => data.slice(0, 12) },
  ean8: { type: "E80", digits: (data) => data.slice(0, 7) },
  upca: { type: "UA0", digits: (data) => data.slice(0, 11) },
  upce: { type: "UE0", digits: (data) => data.slice(0, 7) },
};

function fields(symbology: SymbologyId, data: string, options: PrintSymbolOptions): string[] {
  const refused = REFUSED[symbology];
  if (refused) throw new EplUnsupportedError(refused);
  if (symbology.startsWith("databar")) {
    throw new EplUnsupportedError(
      `EPL2's RSS-14 is not offered yet for ${SYMBOLOGIES[symbology].name}: Labelize, the emulator the tests print EPL2 with, ` +
        "does not draw it, so no test has read it back. ZPL or the PDF print it.",
    );
  }
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const hri = options.hri ?? true;
  const linear = LINEAR[symbology];
  if (linear) {
    encode(symbology, data);
    if (d < EAN_DOTS[0] || d > EAN_DOTS[1]) {
      throw new EplUnsupportedError(`EPL2 prints ${SYMBOLOGIES[symbology].name} with a narrow bar of 2 to 4 dots; this X-dimension needs ${d}. Choose another size or printer.`);
    }
    // The printer adds the check digit and prints its own interpretation line (B)
    return [`B${x},${y},0,${linear.type},${d},${d},${h},${hri ? "B" : "N"},"${linear.digits(data)}"`];
  }

  switch (symbology) {
    case "itf14":
      return itf14(data, options);
    case "gs1-128": {
      const parts = options.parts && options.parts.length > 1 ? options.parts : [data];
      const step = gs1128Step(options);
      return parts.flatMap((part, index) => gs1128(part, { ...options, y: y + index * step, ...(options.hriKey && index ? { hri: false } : {}) }));
    }
    case "dl-datamatrix": {
      const geometry = encode(symbology, data);
      // The printer draws a quiet zone of one module around the symbol (guide, b command): it starts a module earlier
      const { rows, cols } = geometry as { rows: number; cols: number }; // a Data Matrix's
      return [`b${x - d},${y - d},D,c${cols},r${rows},h${d},${symbolData(data, "Data Matrix")}`];
    }
    default:
      throw new EplUnsupportedError(`no EPL2 command for ${SYMBOLOGIES[symbology].name}`);
  }
}

/** The height a stacked GS1-128 symbol takes with its text and the gap to the next, as in ZPL. */
function gs1128Step(options: PrintSymbolOptions): number {
  return options.barHeightDots + 2 * options.dotsPerModule + hriTextDots(options.dpi, options.hriHeightMm) + 10 * options.dotsPerModule;
}

/**
 * GS1-128 as EPL2's UCC/EAN 128 (type 1E): the printer puts FNC1 first. An element string of no predefined length can
 * only come last: the guide gives no way to write FNC1 between element strings that Labelize reads back (its ASCII 06
 * delimiter was not), so such data is refused rather than joined.
 */
function gs1128(data: string, options: PrintSymbolOptions): string[] {
  const elements = parseElementString(data);
  if (elements.slice(0, -1).some((e) => !hasPredefinedLength(e.ai))) {
    throw new EplUnsupportedError(
      "EPL2's GS1-128 (UCC/EAN 128) carries an element string of no predefined length only last: no way to separate it " +
        "from the next has been read back. Put it last, or use ZPL or the PDF.",
    );
  }
  const geometry = encode("gs1-128", data);
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const symbol = `B${x},${y},0,1E,${d},${d},${h},N,${symbolData(elements.map((e) => e.ai + e.value).join(""), "GS1-128")}`;
  const lines = elements.map((e) => `(${e.ai})${e.value}`);
  return [symbol, ...around(lines, x, y, y + h, widthInModules(geometry) * d, 2 * d, options, true)];
}

/**
 * ITF-14 as Interleaved 2 of 5 (type 2, the 14 digits as they are), narrow to wide 1:3; its bearer bars drawn with LO
 * (a frame with X), and its 14 digits below them, 1.02 mm away.
 */
function itf14(data: string, options: PrintSymbolOptions): string[] {
  const { x, y, dotsPerModule: d, barHeightDots: h, bearer } = options;
  encode("itf14", data);
  const width = (7 * (4 * ITF14_RATIO + 6) + ITF14_RATIO + 6) * d;
  const symbol = `B${x},${y},0,2,${d},${ITF14_RATIO * d},${h},N,"${data}"`;
  const gap = Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi);
  if (!bearer) return [symbol, ...around([data], x, y, y + h, width, gap, options, true)];
  const t = bearer.thicknessDots;
  const quiet = 10 * d;
  const side = bearer.kind === "frame" ? t : 0;
  const left = x - quiet - side;
  const outer = width + 2 * quiet + 2 * side;
  const boxes: string[] = [];
  if (bearer.kind === "frame") boxes.push(`X${left},${y - t},${t},${left + outer},${y + h + t}`);
  else boxes.push(`LO${left},${y - t},${outer},${t}`, `LO${left},${y + h},${outer},${t}`);
  const placed = { ...options, hriPosition: options.hriPosition === "split" ? "below" as const : options.hriPosition };
  return [symbol, ...boxes, ...around([data], left, y - t, y + h + t, outer, gap, placed, true)];
}
