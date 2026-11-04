import { dotsWithin, MM_PER_INCH } from "./dots.ts";
import { encode, widthInModules } from "./encode.ts";
import { hasPredefinedLength, parseElementString } from "./elementString.ts";
import type { LogisticLabel } from "./logistic.ts";
import {
  bitmapFontFor,
  hriTextDots,
  PrinterUnsupportedError,
  textLines,
  type BitmapFont,
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
 * X. With `notes`, a test label (backlog 3.1).
 */
export function eplPage(page: PrintPage, options: { notes?: readonly string[] } = {}): string {
  // GW sends an image's dots as raw bytes, which a text file cannot carry unchanged: refused rather than printed wrong
  if (page.images?.length) throw new EplUnsupportedError("EPL2 sends an image as raw bytes, which the studio's EPL2 file does not carry yet: its ZPL or PDF prints it.");
  // EPL2's rotation (B's and A's second parameter) is not yet shown to print where the page puts it (ADR 0002)
  if (page.symbols.some((s) => s.options.turned) || page.texts.some((t) => t.rotation)) {
    throw new EplUnsupportedError("The studio's EPL2 file prints barcodes and text upright only, for now: its ZPL or PDF prints them turned.");
  }
  const symbols = page.symbols.flatMap((s) => fields(s.symbology, s.data, s.options));
  const texts = page.texts.flatMap((t) => text({ x: t.x, y: t.y, width: t.widthDots, height: t.heightDots, text: t.text }, "L", page.dpi));
  // LO fills a rectangle (a line, a filled box); X draws a box's outline, its ends the box's outer edges
  const boxes = page.boxes.map((b) => b.thickness >= Math.min(b.width, b.height)
    ? `LO${b.x},${b.y},${b.width},${b.height}`
    : `X${b.x},${b.y},${b.thickness},${b.x + b.width},${b.y + b.height}`);
  const size = { x: 0, y: 0, dotsPerModule: 1, barHeightDots: 0, dpi: page.dpi, widthDots: page.widthDots, heightDots: page.heightDots, ...(page.copies ? { copies: page.copies } : {}) };
  return options.notes ? withRuler([...boxes, ...texts, ...symbols], size, options.notes) : document([...boxes, ...texts, ...symbols], size);
}

/** The commands, then a 50 mm ruler below the label with a tick every 10 mm and the settings as text. */
function withRuler(commands: string[], options: PrintLabelOptions, notes: readonly string[]): string {
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

function document(commands: string[], options: PrintLabelOptions): string {
  // A blank line first ends whatever the printer was given before (guide, N); q sets the print width in dots
  return ["", "N", `q${options.widthDots}`, ...commands, `P${options.copies ?? 1}`, ""].join("\r\n");
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
  const cell = line.height / EPL_CAPITALS;
  const widthOf = (font: BitmapFont, multiplier: number) => chars * font.width * horizontal(multiplier);
  let best = { ...bitmapFontFor(fonts, Math.round(cell)), height: 0 };
  best.height = best.font.height * best.multiplier;
  if (widthOf(best.font, best.multiplier) > line.width) {
    // The tallest cell within a tenth of the height asked that keeps the line within its width
    const fitting = fonts.flatMap((font) => Array.from({ length: 9 }, (_, i) => ({ font, multiplier: i + 1, height: font.height * (i + 1) })))
      .filter((c) => c.height <= Math.round(cell) * 1.1 && widthOf(c.font, c.multiplier) <= line.width)
      .sort((a, b) => b.height - a.height);
    best = fitting[0] ?? { font: fonts[0]!, multiplier: 1, height: fonts[0]!.height };
  }
  const { font, multiplier } = best;
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
