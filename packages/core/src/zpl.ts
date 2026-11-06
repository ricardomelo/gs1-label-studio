import { dotsWithin, MM_PER_INCH } from "./dots.ts";
import { encode, widthInModules, type QrMode, type SymbolGeometry } from "./encode.ts";
import { hasPredefinedLength, parseElementString, type Element } from "./elementString.ts";
import type { LogisticLabel } from "./logistic.ts";
import type { Bitmap } from "./raster.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { hriTextDots, PrinterUnsupportedError, textLines, type PrintLabelOptions, type PrintPage, type PrintSymbolOptions } from "./printers.ts";

/**
 * ZPL II with the printer's own barcode commands (ADR 0002, decided on 28 October 2026): a few hundred bytes a label,
 * readable, editable, and usable as a template whose placeholders a system fills in before printing. Images (^GF) are
 * for images — a logo — not for symbols. Reference: Zebra's ZPL II Programming Guide, P1134473-11EN Rev A; every
 * command here is printed through Labelary and read back by ZXing in the tests.
 */
export class ZplUnsupportedError extends PrinterUnsupportedError {}

/** Where and how the symbol is drawn, in dots (printers.ts): the same for every printer language. */
export type ZplSymbolOptions = PrintSymbolOptions;

/** The label: its size in dots and the copies, besides the symbol's place (printers.ts). */
export type ZplLabelOptions = PrintLabelOptions;

/** A value a system replaces in a template: `{{name}}` in the ZPL. */
export interface ZplPlaceholder {
  name: string;
  description: string;
  /** The value in the label the template was made from. */
  sample: string;
  /** Characters a value must have replaced before it goes in, e.g. { ">": ">0" }. */
  escapes: Record<string, string>;
}

export interface ZplTemplate {
  zpl: string;
  placeholders: ZplPlaceholder[];
}

/** One label with one symbol, ready to print. */
export function zplLabel(symbology: SymbologyId, data: string, options: ZplLabelOptions): string {
  return document(stacked(symbology, data, options, false).commands, options, []);
}

/** Below a test label (backlog 3.1): a ruler, its ticks and the settings, this many dots high at `dpi`. */
export function zplTestAreaDots(dpi: number, notes: number): number {
  return Math.round((14 / MM_PER_INCH) * dpi) + notes * Math.round(hriTextDots(dpi) * 1.4);
}

/**
 * A test label (backlog 3.1): the label, then below it a 50 mm ruler with a tick every 10 mm and the settings as text,
 * to measure the printer's scale and see what it was given. The label is made `zplTestAreaDots()` higher.
 */
export function zplTestLabel(symbology: SymbologyId, data: string, options: ZplLabelOptions, notes: readonly string[]): string {
  const { commands } = stacked(symbology, data, options, false);
  return document([...commands, ...ruler(options, notes)], testArea(options, notes), []);
}

/** The ruler, its ticks and the settings below a label of `heightDots` (backlog 3.1), from about `x`. */
function ruler(options: Pick<ZplLabelOptions, "x" | "widthDots" | "heightDots" | "dpi">, notes: readonly string[]): string[] {
  const dpi = options.dpi;
  const mm = (value: number) => Math.round((value / MM_PER_INCH) * dpi);
  const top = options.heightDots + mm(2);
  const x = Math.max(mm(2), Math.min(options.x, options.widthDots - mm(50) - mm(2)));
  const t = hriTextDots(dpi);
  return [
    `^FO${x},${top + mm(3)}^GB${mm(50)},${Math.max(2, mm(0.3))},${Math.max(2, mm(0.3))}^FS`,
    ...[0, 10, 20, 30, 40, 50].map((at) => `^FO${x + mm(at) - (at === 50 ? Math.max(2, mm(0.3)) : 0)},${top}^GB${Math.max(2, mm(0.3))},${mm(at % 50 ? 2.5 : 4)},${Math.max(2, mm(0.3))}^FS`),
    `^FO${x},${top + mm(5)}^A0N,${zplFontHeight(t)},${zplFontHeight(t)}^FB${mm(50)},1,0,C${fieldData("50 mm: measure this line")}`,
    ...notes.map((note, index) => `^FO${mm(2)},${top + mm(10) + index * Math.round(t * 1.4)}^A0N,${zplFontHeight(t)},${zplFontHeight(t)}${fieldData(note)}`),
  ];
}

/** A test label's size: the label, made `zplTestAreaDots()` higher and wide enough for the ruler. */
function testArea<T extends Pick<ZplLabelOptions, "x" | "widthDots" | "heightDots" | "dpi">>(options: T, notes: readonly string[]): T {
  const mm = (value: number) => Math.round((value / MM_PER_INCH) * options.dpi);
  const x = Math.max(mm(2), Math.min(options.x, options.widthDots - mm(50) - mm(2)));
  return { ...options, widthDots: Math.max(options.widthDots, x + mm(52)), heightDots: options.heightDots + zplTestAreaDots(options.dpi, notes.length) };
}

/**
 * The GS1 Logistic Label (backlog 4.1 and 3.2) with the printer's own commands: each GS1-128 symbol as ^BC at
 * `dotsPerModule` whole dots, with its element strings below as the editor's symbol has them (3 mm, rule 5c), the
 * label's own text with ^A0 at its capitals' height, the rules between the blocks with ^GB. Everything is placed where
 * the label's layout puts it, in millimetres turned into dots at `dpi`; a symbol keeps its centre, as its width follows
 * the printer's module rather than the layout's. With `notes`, a test label (backlog 3.1): the ruler and the settings
 * below it.
 */
export function zplLogisticLabel(label: LogisticLabel, dpi: number, dotsPerModule: number, options: { copies?: number; notes?: readonly string[] } = {}): string {
  const { layout, printer } = label;
  const perUnit = (layout.xMm / MM_PER_INCH) * dpi; // dots a unit of the layout
  const dots = (units: number) => Math.round(units * perUnit);
  const d = dotsPerModule;
  const widthDots = dots(layout.width);
  const heightDots = dots(layout.height);
  const barHeightDots = dots(printer.barHeight);
  const symbols = printer.symbols.flatMap(({ part, x, y }) => {
    const modules = gs1128Modules(gs1128FieldData(parseElementString(part))); // as ^BC prints it
    const left = Math.round((x + modules / 2) * perUnit - (modules * d) / 2);
    if (left < 0 || left + modules * d > widthDots) {
      const mm = ((modules * d * MM_PER_INCH) / dpi).toFixed(1);
      throw new ZplUnsupportedError(`The GS1-128 of ${part} is ${mm} mm wide at ${d} dots a module, wider than the label: choose fewer dots or the larger label.`);
    }
    return fields("gs1-128", part, { x: left, y: dots(y), dotsPerModule: d, barHeightDots, dpi, hri: true, hriHeightMm: LOGISTIC_HRI_MM }, false).commands;
  });
  const rules = printer.rules.map(([x, y, w, h]) => {
    const t = Math.max(1, dots(h));
    return `^FO${dots(x)},${dots(y)}^GB${dots(w)},${t},${t}^FS`;
  });
  const texts = printer.texts.map((t) => {
    const height = zplFontHeight(hriTextDots(dpi, t.heightMm));
    return `^FO${dots(t.x)},${dots(t.top)}^A0N,${height},${height}${fieldData(t.text)}`;
  });
  // The 2D symbol beside the middle block: whole dots a module within table 5's range, the nearest to the layout's,
  // its right edge and top where the layout puts them (the quiet zones and the gap to the text take a rounding)
  const twoD = printer.twoD;
  if (twoD) {
    const moduleMm = twoD.module * layout.xMm;
    const choices = dotsWithin(twoD.rangeMm[0], twoD.rangeMm[1], dpi);
    if (!choices.length) throw new ZplUnsupportedError(`A ${dpi} dpi printer cannot print the 2D symbol within table 5's X-dimensions.`);
    const d2 = choices.reduce((best, c) => (Math.abs(c.xMm - moduleMm) < Math.abs(best.xMm - moduleMm) - 1e-9 ? c : best)).dots;
    const right = dots(twoD.x + twoD.modules * twoD.module);
    const qrError = twoD.error.toUpperCase() as "L" | "M" | "Q" | "H";
    symbols.push(...fields(twoD.symbology, twoD.data, { x: right - twoD.modules * d2, y: dots(twoD.y), dotsPerModule: d2, barHeightDots: 0, dpi, hri: false, qrError }, false).commands);
  }
  const size = { x: 0, widthDots, heightDots, dpi, ...(options.copies ? { copies: options.copies } : {}) };
  if (!options.notes) return document([...rules, ...texts, ...symbols], size, []);
  return document([...rules, ...texts, ...symbols, ...ruler(size, options.notes)], testArea(size, options.notes), []);
}

const LOGISTIC_HRI_MM = 3; // section 4.14, rule 5c: no less than 3 mm on a GS1 Logistic Label

/**
 * A label of one's own (backlog 4.2) with the printer's own commands: each barcode with the commands of a symbol alone
 * (^BE, ^BC, ^BX, ^BQ…, its text as that symbol has it), where the page puts it; each line of text with ^A0 at its
 * capitals' height; each line and box with ^GB. With `notes`, a test label (backlog 3.1): the ruler and the settings
 * below it.
 */
export function zplPage(page: PrintPage, options: { notes?: readonly string[] } = {}): string {
  const symbols = page.symbols.flatMap((s) => stacked(s.symbology, s.data, s.options, false).commands);
  const texts = page.texts.map((t) => {
    const height = zplFontHeight(t.heightDots);
    if (!t.rotation) return `^FO${t.x},${t.y}^A0N,${height},${height}${fieldData(t.text)}`;
    return turnedText(t, height);
  });
  // ^GB draws a box's outline inside its width and height, filled when the thickness is its narrower side
  const boxes = page.boxes.map((b) => `^FO${b.x},${b.y}^GB${b.width},${b.height},${b.thickness}^FS`);
  // An image as a graphic field (^GFA, the dots in compressed hexadecimal), in stripes when it passes one field's bytes
  const images = (page.images ?? []).flatMap((image) => graphicFields(image.bitmap, image.x, image.y));
  const size = { x: 0, widthDots: page.widthDots, heightDots: page.heightDots, dpi: page.dpi, ...(page.copies ? { copies: page.copies } : {}) };
  const commands = [...images, ...boxes, ...texts, ...symbols];
  if (!options.notes) return document(commands, size, []);
  return document([...commands, ...ruler(size, options.notes)], testArea(size, options.notes), []);
}

/**
 * A line of the page's text turned (backlog 4.2), through ^A0's orientation, its capitals' top side and its start where
 * the page puts them. ^FO is the top left corner of the field as turned (Labelary, 4 November 2026), whose own height is
 * ^A0's and whose capitals start at its own top: so their top side, which R puts on the right, I at the bottom and B on
 * the left, is that height from ^FO's side or on it. Upside down or reading upwards the text starts at the field's far
 * end, which the printer's font sets, so the field is a one-line ^FB block of a known width, left-aligned, the text's
 * start at its own left end.
 */
function turnedText(t: PrintPage["texts"][number], height: number): string {
  const { x, y, heightDots: caps, widthDots: width, rotation } = t;
  // The block: the line's width with room for a printer's font wider than the page's, no further than the label's edge
  const room = rotation === 180 ? x + width : y + width;
  const block = Math.min(width + 2 * height, room);
  const [fx, fy] = rotation === 90 ? [x + caps - height, y] : rotation === 180 ? [x + width - block, y + caps - height] : [x, y + width - block];
  if (fx < 0 || fy < 0) throw new ZplUnsupportedError("A line of text runs past the label's edge: move it inside the label.");
  const orientation = ORIENTATIONS[rotation!];
  const field = rotation === 90 ? "" : `^FB${block},1,0,L`;
  return `^FO${fx},${fy}^A0${orientation},${height},${height}${field}${fieldData(t.text)}`;
}

/** ZPL's field orientation for a turn clockwise: R reads downwards, I upside down, B upwards. */
const ORIENTATIONS = { 90: "R", 180: "I", 270: "B" } as const;

/**
 * A symbol's fields turned (backlog 4.2): each field — the barcode, its text lines, ITF-14's bearer bars — written
 * upright from the symbol's corner, then turned with it about the symbol's own box. ^FO is the top left corner of a field
 * as turned, for a barcode its bars' or modules' box without the printer's interpretation line (Labelary, 4 November
 * 2026: ^BC, ^BE, ^B2, ^BR and ^BX, at every orientation); a text line's field is its ^FB block, ^A0's height high; a
 * box (^GB) takes its width and height the other way round. ^BQ prints a QR code upright only, so one turned is refused.
 */
function turnFields(symbology: SymbologyId, data: string, commands: string[], options: ZplSymbolOptions): string[] {
  const { rotation } = options.turned!;
  const { x, y } = options;
  const orientation = ORIENTATIONS[rotation];
  const { x: tx, y: ty, width: w, height: h } = zplTurnedField(symbology, data, options, commands);
  return commands.map((command) => {
    const at = /\^FO(-?\d+),(-?\d+)/.exec(command)!;
    const [fx, fy] = [Number(at[1]), Number(at[2])];
    const box = /\^GB(\d+),(\d+),(\d+)/.exec(command);
    const text = /\^A0N,(\d+),\d+\^FB(\d+),1,0,([LC])/.exec(command);
    const barcode = /\^(B[E8U92XRC])N/.exec(command);
    let field: [number, number] | null;
    let turned = command;
    if (box) {
      field = [Number(box[1]), Number(box[2])];
      if (rotation !== 180) turned = turned.replace(box[0], `^GB${box[2]},${box[1]},${box[3]}`);
    } else if (text) {
      field = [Number(text[2]), Number(text[1])];
      turned = turned.replace("^A0N", `^A0${orientation}`);
    } else if (barcode) {
      const own = barcodeField(symbology, data, command, options)!;
      field = [own.width, own.height];
      turned = turned.replace(barcode[0], `^${barcode[1]}${orientation}`);
    } else {
      throw new ZplUnsupportedError("ZPL prints a QR code upright only (^BQ has no orientation): turn it back to 0°. A QR code is read in any direction.");
    }
    let [fw, fh] = field;
    // A left-aligned block (the text below a GS1 DataMatrix) is wider than its text: upside down or reading upwards its
    // far end, where nothing is printed, is shortened to stay on the label
    const slack = rotation === 180 ? tx + w - (fx + fw - x) : rotation === 270 ? ty + w - (fx + fw - x) : 0;
    if (text?.[3] === "L" && slack < 0) {
      turned = turned.replace(`^FB${fw},`, `^FB${fw + slack},`);
      fw += slack;
    }
    const [nx, ny] = rotation === 90 ? [tx + h - (fy + fh - y), ty + (fx - x)]
      : rotation === 180 ? [tx + w - (fx + fw - x), ty + h - (fy + fh - y)]
      : [tx + (fy - y), ty + w - (fx + fw - x)];
    if (nx < 0 || ny < 0) throw new ZplUnsupportedError("A barcode's text runs past the label's edge: move the barcode inside the label.");
    return turned.replace(at[0], `^FO${nx},${ny}`);
  });
}

/**
 * The field a turned symbol turns about, in dots: its (first) barcode's field as the printer prints it
 * (`barcodeField`), its own width and height, upright, and its top left corner as turned — the symbol's `x` and `y`,
 * its bars' corner as turned, less the light space the turn puts at the field's top or left (a quarter turn puts the
 * field's leading space at the top, a half turn its trailing space on the left, three quarters at the top). A QR code,
 * which ZPL prints upright only, is refused.
 */
export function zplTurnedField(symbology: SymbologyId, data: string, options: ZplSymbolOptions, commands?: string[]): { x: number; y: number; width: number; height: number } {
  const { turned: _, ...upright } = options;
  const main = (commands ?? stacked(symbology, data, upright, false).commands).map((command) => barcodeField(symbology, data, command, options)).find(Boolean);
  if (!main) throw new ZplUnsupportedError("ZPL prints a QR code upright only (^BQ has no orientation): turn it back to 0°. A QR code is read in any direction.");
  const { rotation } = options.turned!;
  const [left, top] = rotation === 90 ? [0, main.lead] : rotation === 180 ? [main.trail, 0] : [0, main.trail];
  return { x: options.x - left, y: options.y - top, width: main.width, height: main.height };
}

/**
 * A barcode field's own width and height in dots as the printer prints it, from its corner (^FO); null when the command
 * is not a barcode that turns. GS1-128's stacked symbols are each as wide as their own field data; ^BR prints GS1
 * DataBar at its own height, whatever the bar height asked (`databar`), from its leading space to its last bar, and
 * Expanded (Stacked too) a module further, its right guard's space (Labelary, 4 November 2026); the others are the
 * symbol's box.
 */
function barcodeField(symbology: SymbologyId, data: string, command: string, options: ZplSymbolOptions): { width: number; height: number; lead: number; trail: number } | null {
  const { dotsPerModule: d, turned } = options;
  const code128 = /\^BCN,(\d+),.*?\^FD(.*?)\^FS/.exec(command);
  if (code128) return { width: gs1128Modules(code128[2]!) * d, height: Number(code128[1]), lead: 0, trail: 0 };
  if (/\^BRN/.test(command)) {
    // Its leading space, the left guard's, before its first bar, and Expanded's trailing one after its last
    const geometry = encode(symbology, data);
    const lead = geometry.kind === "linear" && geometry.widths[0] === 0 ? geometry.widths[1]! * d : 0;
    const trail = symbology.startsWith("databar-expanded") ? d : 0;
    return { width: databarWidth(geometry, d, trail) ?? turned!.width + trail, height: databarHeight(symbology, geometry, d), lead, trail };
  }
  return /\^B[E8U92X]N/.test(command) ? { width: turned!.width, height: turned!.height, lead: 0, trail: 0 } : null;
}

/**
 * ^A0's capitals are 0.78 of the height it is given (measured through Labelary, 2 November 2026: 18, 43 and 78 dots for
 * 24, 56 and 100), and they start at the field's top. The studio's text heights are its capitals' (section 4.14), so
 * ^A0 is given this much more.
 */
const A0_CAPITALS = 0.78;

/** The ^A0 height whose capitals are `capitalDots` high. */
export function zplFontHeight(capitalDots: number): number {
  return Math.round(capitalDots / A0_CAPITALS);
}

/** The height a stacked GS1-128 symbol takes with its text and the gap to the next: bars, text, a quiet zone. */
export function gs1128StackDots(options: Pick<ZplSymbolOptions, "barHeightDots" | "dotsPerModule" | "dpi" | "hriHeightMm">): number {
  return options.barHeightDots + 2 * options.dotsPerModule + hriTextDots(options.dpi, options.hriHeightMm) + 10 * options.dotsPerModule;
}

/** One symbol's fields, or GS1-128's symbols stacked from the top, each with its own element strings. */
function stacked(symbology: SymbologyId, data: string, options: ZplSymbolOptions, template: boolean): { commands: string[]; placeholders: ZplPlaceholder[] } {
  if (options.turned) {
    const { turned: _, ...upright } = options;
    const { commands, placeholders } = stacked(symbology, data, upright, template);
    return { commands: turnFields(symbology, data, commands, options), placeholders };
  }
  if (symbology !== "gs1-128" || !options.parts || options.parts.length < 2) return fields(symbology, data, options, template);
  // Split, each symbol's attributes go above it: room for their line between the symbols
  const step = gs1128StackDots(options) + (options.hriPosition === "split" ? zplTextAbove(options, 1) : 0);
  // The key's element string alone: under the first symbol, which carries it
  const all = options.parts.map((part, index) => fields(symbology, part, { ...options, y: options.y + index * step, ...(options.hriKey && index ? { hri: false } : {}) }, template));
  return { commands: all.flatMap((f) => f.commands), placeholders: all.flatMap((f) => f.placeholders) };
}

/**
 * The same label as a template: each value is a placeholder, `{{01}}`, `{{10}}`… or `{{URI}}`, described in ^FX
 * comments at the top so that whoever wires it into a system knows what each one takes. `data` is a sample: the layout
 * (and a Data Matrix's size, forced in the template) follows it, so it should be as long as the longest values.
 */
export function zplTemplate(symbology: SymbologyId, data: string, options: ZplLabelOptions): ZplTemplate {
  const { commands, placeholders } = stacked(symbology, data, options, true);
  return { zpl: document(commands, options, placeholders), placeholders };
}

/**
 * Replaces each `{{name}}` of a template with its value, escaped as the placeholder says — what a system does with the
 * ^FX notes. The text below a symbol takes the value as it is.
 */
export function fillTemplate(template: ZplTemplate, values: Record<string, string>): string {
  const escapes = Object.fromEntries(template.placeholders.map((p) => [p.name, p.escapes]));
  return template.zpl
    .split("\n")
    .map((line) => {
      const inSymbol = /\^B[A-Z0-9]/.test(line);
      return line.replace(/\{\{([^}]+)\}\}/g, (placeholder, name: string) => {
        const value = values[name];
        if (value === undefined) return placeholder;
        if (!inSymbol) return value;
        return Object.entries(escapes[name] ?? {}).reduce((v, [from, to]) => v.split(from).join(to), value);
      });
    })
    .join("\n");
}

function document(commands: string[], options: Pick<ZplLabelOptions, "widthDots" | "heightDots" | "copies">, placeholders: ZplPlaceholder[]): string {
  return [
    "^XA",
    ...(placeholders.length ? ["^FX Template: replace each {{name}}; values must not contain a caret or a tilde.^FS"] : []),
    ...placeholders.map((p) => `^FX {{${p.name}}}: ${p.description} Example: ${p.sample}^FS`),
    "^CI28",
    `^PW${options.widthDots}`,
    `^LL${options.heightDots}`,
    ...commands,
    `^PQ${options.copies ?? 1}`,
    "^XZ",
    "",
  ].join("\n");
}

/** ^FD, or ^FH and ^FD when the data holds a character ZPL reserves (caret, tilde) or the ^FH indicator. */
function fieldData(text: string): string {
  if (!/[\\^~]/.test(text)) return `^FD${text}^FS`;
  return `^FH\\^FD${text.replace(/[\\^~]/g, (c) => `\\${c.charCodeAt(0).toString(16).toUpperCase()}`)}^FS`;
}

interface LinearGtin {
  command: string;
  digits: (data: string) => string;
  description: string;
}

const LINEAR_GTIN: Partial<Record<SymbologyId, LinearGtin>> = {
  ean13: {
    command: "^BEN,{h},{f},N",
    digits: (data) => data.slice(0, 12),
    description: "the GTIN-13's first 12 digits; the printer adds the check digit (given 13, it drops the first).",
  },
  ean8: {
    command: "^B8N,{h},{f},N",
    digits: (data) => data.slice(0, 7),
    description: "the GTIN-8's first 7 digits; the printer adds the check digit.",
  },
  upca: {
    command: "^BUN,{h},{f},N,Y",
    digits: (data) => data.slice(0, 11),
    description: "the GTIN-12's first 11 digits; the printer adds the check digit.",
  },
  upce: {
    command: "^B9N,{h},{f},N,Y",
    digits: (data) => upcaManufacturerAndProduct(data),
    description: "digits 2 to 11 of the GTIN-12 (number system 0); the printer zero-suppresses it and adds the check digit.",
  },
  itf14: {
    command: "^B2N,{h},{f},N,Y",
    digits: (data) => data.slice(0, 13),
    description: "the GTIN-14's first 13 digits; the printer adds the check digit.",
  },
};

const QR_SHIFT = 1; // the bar height ^BY is given before ^BQ, which prints the QR code this many dots below ^FO
const ITF14_RATIO = 3; // ^BY's wide-to-narrow ratio for ^B2: whole dots for any module, within GS1's 2.25 to 3
const HRI_GAP_MM = 1.02; // section 5.3.2.2: from the bearer bar to the text

// ^BR: the GS1 DataBar type, and the height in modules it prints each at, which ^BR does not let a label change (its
// height parameter is for the linear part of composite symbols). Checked through Labelary.
const DATABAR: Partial<Record<SymbologyId, { type: number; modules?: number }>> = {
  "databar-omni": { type: 1, modules: 33 },
  "databar-truncated": { type: 2, modules: 13 },
  "databar-stacked": { type: 3, modules: 13 },
  "databar-stacked-omni": { type: 4, modules: 69 },
  "databar-limited": { type: 5, modules: 10 },
  "databar-expanded": { type: 6, modules: 34 },
  "databar-expanded-stacked": { type: 6 },
};
const EXPANDED_STACKED_SEGMENTS = 4; // segments a row, as the studio's layout draws it (the encoder's default)

function fields(symbology: SymbologyId, data: string, options: ZplSymbolOptions, template: boolean) {
  const geometry = encode(symbology, data); // checks the data: GS1 syntax, check digits
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const f = options.hri ?? true ? "Y" : "N";
  const placeholders: ZplPlaceholder[] = [];
  const value = (name: string, sample: string, description: string, escapes: Record<string, string> = {}) => {
    if (!template) return sample;
    placeholders.push({ name, description, sample, escapes });
    return `{{${name}}}`;
  };
  const at = `^FO${x},${y}`;
  // In a template a Data Matrix keeps the sample's size, so that the text below it stays clear.
  const matrixSize = geometry.kind === "matrix" && template ? `${geometry.cols},${geometry.rows}` : "0,0";

  const linear = LINEAR_GTIN[symbology];
  if (symbology === "itf14" && options.bearer) return { commands: itf14WithBearers(data, options, value), placeholders };
  if (linear) {
    const digits = value("01", linear.digits(data), linear.description);
    const command = linear.command.replace("{h}", String(h)).replace("{f}", f);
    return { commands: [`${at}^BY${d},3.0,${h}${command}${fieldData(digits)}`], placeholders };
  }

  switch (symbology) {
    case "gs1-128": {
      // Code 128 with the invocation codes written here (mode N): start code, FNC1 (">8") first and after each element
      // string without a predefined length that is not the last, and the code set changes. Mode D, which leaves this
      // to the printer, joins the element strings without FNC1 (Labelary, 28 October 2026), and mode A prints ">8" as
      // text. The interpretation line of mode N has no parentheses, so the element strings are printed below as text.
      const elements = parseElementString(data);
      const text = gs1128FieldData(
        elements,
        template ? (e) => value(e.ai, e.value, aiDescription(e.ai, 'a ">" is written ">0"'), { ">": ">0" }) : undefined,
      );
      const widthDots = (template ? widthInModules(geometry) : gs1128Modules(text)) * d;
      const hri = textAround(elements.map((e) => `(${e.ai})${template ? `{{${e.ai}}}` : e.value}`), x, y, y + h, widthDots, 2 * d, options, true);
      return { commands: [`${at}^BY${d},3.0,${h}^BCN,${h},N,N,N,N${fieldData(text)}`, ...hri], placeholders };
    }
    case "gs1-datamatrix": {
      // ECC 200 with "_" declared as the escape character (its default changed between firmware versions): "_1" is
      // FNC1, first and after each element string without a predefined length that is not the last.
      const elements = parseElementString(data);
      const shown: string[] = [];
      const text = "_1" + elements.map((e, index) => {
        const separator = index < elements.length - 1 && !hasPredefinedLength(e.ai) ? "_1" : "";
        const field = template
          ? value(e.ai, e.value, aiDescription(e.ai, "an underscore is written twice"), { _: "__" })
          : e.value.replace(/_/g, "__");
        shown.push(template ? `{{${e.ai}}}` : e.value);
        return e.ai + field + separator;
      }).join("");
      return {
        commands: [`${at}^BXN,${d},200,${matrixSize},6,_${fieldData(text)}`, ...(geometry.kind === "matrix" ? textAround(elements.map((e, index) => `(${e.ai})${shown[index]}`), x, y, y + geometry.rows * d, Math.max(geometry.cols * d, 40 * hriTextDots(options.dpi, options.hriHeightMm)), 2 * d, options, false, "L") : [])],
        placeholders,
      };
    }
    case "dl-datamatrix": {
      const uri = template
        ? value("URI", data, "the GS1 Digital Link URI; an underscore is written twice.", { _: "__" })
        : data.replace(/_/g, "__");
      return { commands: [`${at}^BXN,${d},200,${matrixSize},6,_${fieldData(uri)}`], placeholders };
    }
    case "dl-qrcode": {
      // Model 2, the error correction level chosen, automatic data input. ^BQ's manual input (one mode for the data) is
      // not used: Labelary prints the same symbol whatever mode it is given (31 October 2026), so nothing shows that a
      // printer would honour it (ADR 0002). The level is a minimum there: Labelary raised M to Q where the version had room.
      if (options.qrMode) {
        throw new ZplUnsupportedError("ZPL writes the QR code in the printer's automatic mode: one mode for the whole data could not be shown to print (ADR 0002).");
      }
      // ^BQ prints the symbol as far below ^FO as the bar height ^BY last set, 10 dots by default (Labelary, 2 November
      // 2026: 10, 1, 50, 200 and 375 dots for those heights, at 203, 300 and 600 dpi): one dot here, taken off ^FO.
      const uri = value("URI", data, "the GS1 Digital Link URI.");
      return { commands: [`^BY1,3.0,${QR_SHIFT}^FO${x},${Math.max(0, y - QR_SHIFT)}^BQN,2,${d}${fieldData(`${options.qrError ?? "M"}A,${uri}`)}`], placeholders };
    }
    case "gs1-qrcode":
      throw new ZplUnsupportedError(
        "ZPL's QR code command (^BQ) has no FNC1, so it cannot print a GS1 QR Code. Use a GS1 DataMatrix, or a QR code " +
          "with a GS1 Digital Link URI.",
      );
    case "databar-omni":
    case "databar-truncated":
    case "databar-stacked":
    case "databar-stacked-omni":
    case "databar-limited":
    case "databar-expanded":
    case "databar-expanded-stacked":
      return { commands: databar(symbology, data, geometry, options, value), placeholders };
    default:
      throw new ZplUnsupportedError(`no ZPL command for ${symbology}`);
  }
}

type Value = (name: string, sample: string, description: string, escapes?: Record<string, string>) => string;

/**
 * ITF-14 with its bearer bars as ^GB boxes and its 14 digits below them, 1.02 mm away: the printer's interpretation
 * line would print under the bottom bearer bar. The symbol takes the whole GTIN-14 with no check digit computed, so
 * that the symbol and the text below it carry the same value — in a template too.
 */
function itf14WithBearers(data: string, options: ZplSymbolOptions, value: Value) {
  const { x, y, dotsPerModule: d, barHeightDots: h, bearer } = options;
  const t = bearer!.thicknessDots;
  const quiet = 10 * d;
  const width = (7 * (4 * ITF14_RATIO + 6) + ITF14_RATIO + 6) * d; // section 5.3.2.2: P(4N+6)+N+6 modules
  const side = bearer!.kind === "frame" ? t : 0;
  const left = x - quiet - side;
  const outer = width + 2 * quiet + 2 * side;
  const gtin = value("01", data, "the GTIN-14, its check digit included.");
  const boxes = bearer!.kind === "frame"
    ? [`^FO${left},${y - t}^GB${outer},${h + 2 * t},${t}^FS`]
    : [`^FO${left},${y - t}^GB${outer},${t},${t}^FS`, `^FO${left},${y + h}^GB${outer},${t},${t}^FS`];
  const gap = Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi);
  const text = textAround([gtin], left, y - t, y + h + t, outer, gap, { ...options, hriPosition: options.hriPosition === "split" ? "below" : options.hriPosition }, true);
  return [`^FO${x},${y}^BY${d},${ITF14_RATIO}.0,${h}^B2N,${h},N,N,N${fieldData(gtin)}`, ...boxes, ...text];
}

/**
 * GS1 DataBar through ^BR. The family but Expanded takes the GTIN's first 13 digits and adds the check digit; Expanded
 * takes the element strings without brackets. ^BR could not be made to separate an element string of no predefined
 * length from the next (neither "#" nor a GS byte through ^FH was read back), so Expanded is refused where one would
 * need it; and ^BR prints each symbol at a fixed height, so a table that asks for more is refused too. The element
 * strings are printed below as text.
 */
function databar(symbology: SymbologyId, data: string, geometry: SymbolGeometry, options: ZplSymbolOptions, value: Value) {
  const { x, y, dotsPerModule: d, barHeightDots: h } = options;
  const { type, modules } = DATABAR[symbology]!;
  const name = SYMBOLOGIES[symbology].name;
  if (d > 10) throw new ZplUnsupportedError(`^BR prints ${name} at 1 to 10 dots a module; this X-dimension needs ${d}.`);
  if (modules && h > modules * d + d / 2) {
    throw new ZplUnsupportedError(
      `^BR prints ${name} ${modules} modules high and no higher; this table asks for ${Math.round(h / d)}. Use the PDF, ` +
        "or a symbol the table lets the printer draw as high as it asks.",
    );
  }
  const elements = parseElementString(data);
  if (type === 6 && elements.slice(0, -1).some((e) => !hasPredefinedLength(e.ai))) {
    throw new ZplUnsupportedError(
      `^BR cannot separate an element string of no predefined length from the next, so ${name} carries such a one ` +
        "only last. Put it last, or use GS1-128 or the PDF.",
    );
  }
  const shown: string[] = [];
  const fd = type === 6
    ? elements.map((e) => {
        const v = value(e.ai, e.value, aiDescription(e.ai, "as it is"));
        shown.push(`(${e.ai})${v}`);
        return e.ai + v;
      }).join("")
    : (() => {
        const gtin = elements[0]!.value;
        const v = value("01", gtin.slice(0, 13), "the GTIN-14's first 13 digits; the printer adds the check digit.");
        shown.push(`(01)${value("GTIN", gtin, "the whole GTIN-14, for the text below the symbol.")}`);
        return v;
      })();
  const segments = symbology === "databar-expanded-stacked" ? EXPANDED_STACKED_SEGMENTS : 22;
  const height = databarHeight(symbology, geometry, d);
  const widthDots = widthInModules(geometry) * d;
  const text = textAround(type === 6 ? shown : [shown[0]!], x, y, y + height, widthDots, Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi), options, true);
  return [`^FO${x},${y}^BRN,${type},${d},1,${h},${segments}${fieldData(fd)}`, ...text];
}

/** The height ^BR prints a GS1 DataBar symbol at, in dots: its type's modules, or a stacked Expanded's rows. */
function databarHeight(symbology: SymbologyId, geometry: SymbolGeometry, d: number): number {
  return (DATABAR[symbology]!.modules ?? (geometry.kind === "matrix" ? geometry.rows : 34)) * d;
}

/** The width of ^BR's field for a GS1 DataBar symbol in a row, in dots: to its last bar, and its trailing space. */
function databarWidth(geometry: SymbolGeometry, d: number, trail: number): number | null {
  if (geometry.kind !== "linear") return null;
  const { widths } = geometry;
  let last = widths.length - 1;
  while (last > 0 && (last % 2 || !widths[last])) last--;
  return widths.slice(0, last + 1).reduce((a, b) => a + b, 0) * d + trail;
}

function aiDescription(ai: string, escaping: string): string {
  return `the value of AI (${ai}), without the AI; ${escaping}.`;
}

/**
 * GS1-128 field data for ^BC mode N. Element strings of predefined length are all digits and of even length (figure
 * 7.8.5-2), so they go in code set C as pairs; the AI of another element string goes in C when it has an even number of
 * digits, and its value in code set B — or, in a label (not a template), in C wherever four or more digits follow one
 * another. In code set B ">" is written ">0" (ZPL II guide, table 2). `placeholder` turns a value into a template's.
 */
export function gs1128FieldData(elements: Element[], placeholder?: (element: Element) => string): string {
  let out = "";
  let set: "B" | "C" | null = null;
  const to = (next: "B" | "C") => {
    if (set !== next) out += set === null ? (next === "C" ? ">;" : ">:") : next === "C" ? ">5" : ">6";
    set = next;
  };
  const inB = (text: string) => {
    to("B");
    out += text.replace(/>/g, ">0");
  };
  elements.forEach((e, index) => {
    if (index === 0) {
      to(hasPredefinedLength(e.ai) || e.ai.length % 2 === 0 ? "C" : "B");
      out += ">8";
    }
    if (hasPredefinedLength(e.ai)) {
      to("C");
      out += e.ai + (placeholder ? placeholder(e) : e.value);
    } else {
      if (e.ai.length % 2 === 0) {
        to("C");
        out += e.ai;
      } else inB(e.ai);
      if (placeholder) inB(placeholder(e));
      else {
        for (const [run] of e.value.matchAll(/\d{4,}|\D+|\d{1,3}/g)) {
          // Already in C, an even run of digits stays there (a count's "24": one codeword rather than three)
          if (set === "C" && /^\d+$/.test(run) && run.length % 2 === 0) out += run;
          else if (!/^\d{4,}$/.test(run)) inB(run);
          else {
            if (run.length % 2 === 1) inB(run[0]!);
            to("C");
            out += run.slice(run.length % 2);
          }
        }
      }
      if (index < elements.length - 1) out += ">8";
    }
  });
  return out;
}

/**
 * The modules of a GS1-128 symbol as ^BC mode N prints `fieldData` (gs1128FieldData): each codeword 11 modules — the
 * start, each invocation code (">8", ">5", ">6"), a pair of digits in code set C, a character in B (">0" one) — then
 * the check character and the stop pattern (13). The encoder may choose code sets more cleverly, so the width of what
 * the printer is given is counted from what it is given.
 */
export function gs1128Modules(fieldData: string): number {
  let codewords = 0;
  let set: "B" | "C" = "B";
  for (let i = 0; i < fieldData.length; ) {
    if (fieldData[i] === ">") {
      const code = fieldData[i + 1];
      if (code === ";" || code === "5") set = "C";
      if (code === ":" || code === "6") set = "B";
      codewords++;
      i += 2;
    } else {
      codewords++;
      i += set === "C" ? 2 : 1;
    }
  }
  return (codewords + 1) * 11 + 13;
}

/**
 * Text lines around a symbol that spans [top, bottom] from `x` over `widthDots`, `gap` away (backlog 1.16): below it,
 * above it, or split with the key's line below and the others above; one element string a line unless `join`.
 * Left and right are not written: the printer's font sets the text's width, which the studio cannot know here.
 */
function textAround(lines: string[], x: number, top: number, bottom: number, widthDots: number, gap: number,
  options: ZplSymbolOptions, join: boolean, align: "C" | "L" = "C"): string[] {
  return textLines(lines, x, top, bottom, widthDots, gap, options, join, "ZPL")
    .map((line) => `^FO${line.x},${line.y}^A0N,${zplFontHeight(line.height)},${zplFontHeight(line.height)}^FB${line.width},1,0,${align}${fieldData(line.text)}`);
}

/** The room text above a symbol takes in ZPL (backlog 1.16), at most one line an element string. */
export function zplTextAbove(options: Pick<ZplSymbolOptions, "hriPosition" | "hriHeightMm" | "dpi" | "dotsPerModule">, lines: number): number {
  if (options.hriPosition !== "above" && options.hriPosition !== "split") return 0;
  const t = hriTextDots(options.dpi, options.hriHeightMm);
  return lines * Math.round(t * 1.4) + 2 * options.dotsPerModule + Math.round((HRI_GAP_MM / MM_PER_INCH) * options.dpi);
}

/** UPC-E (number system 0, eight digits) expanded to the UPC-A's manufacturer and product digits (ten). */
export function upcaManufacturerAndProduct(upce: string): string {
  const d = upce.slice(1, 7);
  const last = Number(d[5]);
  if (last <= 2) return `${d[0]}${d[1]}${d[5]}00` + `00${d[2]}${d[3]}${d[4]}`;
  if (last === 3) return `${d.slice(0, 3)}00` + `000${d[3]}${d[4]}`;
  if (last === 4) return `${d.slice(0, 4)}0` + `0000${d[4]}`;
  return d.slice(0, 5) + `0000${d[5]}`;
}

/**
 * The largest graphic field: the byte counts of ^GF take 1 to 99999 (ZPL II Programming Guide, ^GF). Graphic fields
 * are for images such as a logo; a larger image is sent as horizontal stripes.
 */
export const MAX_GRAPHIC_FIELD_BYTES = 99999;

/**
 * Rows `fromRow` (inclusive) to `toRow` (exclusive) of `bitmap` as one ^GFA, eight dots a byte, leftmost dot first.
 * `compressed` (the default) writes the dots with ZPL's own ASCII compression (rowData), which every ZPL II printer
 * reads; the byte counts stay the image's own, as ^GF asks of ASCII data.
 */
export function bitmapToGraphicField(bitmap: Bitmap, fromRow = 0, toRow = bitmap.height, compressed = true): string {
  const bytesPerRow = Math.ceil(bitmap.width / 8);
  const total = bytesPerRow * (toRow - fromRow);
  if (total > MAX_GRAPHIC_FIELD_BYTES) throw new Error(`a graphic field holds at most ${MAX_GRAPHIC_FIELD_BYTES} bytes`);
  let data = "";
  let previous: string | undefined;
  for (let y = fromRow; y < toRow; y++) {
    let hex = "";
    for (let byte = 0; byte < bytesPerRow; byte++) {
      let value = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit;
        if (x < bitmap.width && bitmap.dark[y * bitmap.width + x]) value |= 0x80 >> bit;
      }
      hex += value.toString(16).toUpperCase().padStart(2, "0");
    }
    data += !compressed ? hex : hex === previous ? ":" : rowData(hex);
    previous = hex;
  }
  return `^GFA,${total},${total},${bytesPerRow},${data}`;
}

/**
 * One row of a graphic field in ZPL's ASCII compression (ZPL II Programming Guide, "Alternative Data Compression Scheme
 * for ~DG and ~DB Commands", which ^GF's ASCII data reads too): the row's trailing white is a comma and its trailing
 * black an exclamation mark, each filling the row's last bytes, so an odd number of such digits keeps one before it;
 * any other run of three or more of a digit is its count in letters before it, G to Y for 1 to 19 and g to z for 20 to
 * 400, added together ("vMB" is 327 B's). A row the same as the one above is a colon (bitmapToGraphicField).
 */
function rowData(hex: string): string {
  let end = hex.length;
  let fill = "";
  const last = hex[end - 1]!;
  if (last === "0" || last === "F") {
    let start = end;
    while (start > 0 && hex[start - 1] === last) start--;
    // The fill takes whole bytes: an odd run keeps its first digit, which ends the byte before it
    const kept = (end - start) % 2 ? start + 1 : start;
    if (end - kept >= 2) [end, fill] = [kept, last === "0" ? "," : "!"];
  }
  let out = "";
  for (let i = 0; i < end; ) {
    let j = i;
    while (j < end && hex[j] === hex[i]) j++;
    const n = j - i;
    out += n < 3 ? hex.slice(i, j) : repeatCount(n) + hex[i];
    i = j;
  }
  return out + fill;
}

/** A repeat count in ZPL's ASCII compression: z for each 400, then g to y for the twenties, then G to Y for the rest. */
function repeatCount(n: number): string {
  const tens = Math.floor((n % 400) / 20);
  const units = n % 20;
  return "z".repeat(Math.floor(n / 400)) + (tens ? String.fromCharCode(102 + tens) : "") + (units ? String.fromCharCode(70 + units) : "");
}

/** The bitmap placed at (x, y) in dots, as one field or as stripes that each fit a graphic field, compressed or not. */
export function graphicFields(bitmap: Bitmap, x: number, y: number, compressed = true): string[] {
  const rowsPerField = Math.floor(MAX_GRAPHIC_FIELD_BYTES / Math.ceil(bitmap.width / 8));
  if (rowsPerField < 1) throw new Error("the image is too wide for a graphic field");
  const fields: string[] = [];
  for (let row = 0; row < bitmap.height; row += rowsPerField) {
    const end = Math.min(bitmap.height, row + rowsPerField);
    fields.push(`^FO${x},${y + row}${bitmapToGraphicField(bitmap, row, end, compressed)}^FS`);
  }
  return fields;
}
