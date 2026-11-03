import { isDateAi } from "./dictionary.ts";
import { ENVIRONMENTS } from "./environments.ts";
import type { HriFont } from "./hri.ts";
import type { Identified } from "./identify.ts";
import { BARS, layoutLabel, type ErrorLevel, type LabelOptions, type LabelText, type Layout } from "./layout.ts";
import { expectedReads } from "./scan.ts";
import { isoDate } from "./sign.ts";
import { specificationFor, type SpecSymbol } from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { dataFor, InputError } from "./syntax.ts";

// A label of one's own (backlog 4.2, mock-up A of two, 3 November 2026): a page in millimetres with barcodes and text
// blocks placed on it, and lines and boxes. Each barcode is laid out as the editor lays out a symbol alone — its quiet zones and text, at the
// scanning environment's X-dimension — and the page is one Layout, in units of the smallest module, so that the SVG,
// PNG, PDF and EPS draw it as they draw a symbol. Every place has its own label (the owner), so the designer, not
// ready-made templates, is what the studio offers.

/** A barcode on the page: its symbology, the element strings it carries (null: all), its size and its top left corner. */
export interface DesignSymbol {
  id: string;
  kind: "symbol";
  symbology: SymbologyId;
  /** The AIs whose element strings it carries, in the data's order; null for all. A GS1 Digital Link URI takes all. */
  ais: readonly string[] | null;
  /** Percentage of the environment's target X-dimension, or of its table's row for ITF-14, GS1-128 and GS1 DataBar. */
  size: number;
  /** Its human readable text below it. */
  hri: boolean;
  /** The top left corner of the symbol with its quiet zones, in mm from the page's. */
  xMm: number;
  yMm: number;
}

/**
 * A block of text: a line a line, `{10}` replaced by the AI's value in the data (empty when the data has none), and a
 * date's `{17:DD/MM/YYYY}` by its date in that format (`formatDate`).
 */
export interface DesignText {
  id: string;
  kind: "text";
  text: string;
  /** Its capitals' height in mm. */
  heightMm: number;
  /** The language of a date's month in its fields (`MMM`): English when not given. */
  months?: MonthLanguage;
  /** The top left corner of its first line's capitals, in mm. */
  xMm: number;
  yMm: number;
}

/** A rule across or down the page (backlog 4.2): `lengthMm` long from its top left corner, `thicknessMm` thick. */
export interface DesignLine {
  id: string;
  kind: "line";
  vertical: boolean;
  lengthMm: number;
  thicknessMm: number;
  xMm: number;
  yMm: number;
}

/** A box (backlog 4.2): its outer size from its top left corner, its outline `thicknessMm` thick inside it, or filled. */
export interface DesignBox {
  id: string;
  kind: "box";
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  filled: boolean;
  xMm: number;
  yMm: number;
}

export type DesignElement = DesignSymbol | DesignText | DesignLine | DesignBox;

export interface DesignPage {
  widthMm: number;
  heightMm: number;
  elements: readonly DesignElement[];
}

/** Where an element landed on the page, in mm: what the editor outlines and drags. */
export interface PlacedElement {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface DesignedLabel {
  layout: Layout;
  /** What the files' descriptions take. */
  options: LabelOptions;
  placed: PlacedElement[];
  /** What a reader should give back for the page's symbols (`expectedReads()`), for the scan test. */
  expected: string[];
  /** Each symbol's name and modules a side (2D) or its bars' height (linear), for the caption. */
  symbols: { id: string; symbology: SymbologyId; modules: number; version: number | null }[];
  /**
   * What is wrong with the page but does not stop it being drawn: an element past its edge, a symbol overlapping another
   * element (its quiet zones must stay clear); by the elements' ids, for the editor to name them.
   */
  problems: ({ kind: "edge"; id: string } | { kind: "overlap"; ids: [string, string] })[];
  /**
   * What a printer language writes the page from (backlog 4.2): each barcode as the editor's symbol alone — its data,
   * options and layout — with its box's top left corner on the page, and each line of text with its capitals' top left
   * corner, height and width in the HRI font, in mm; each line and box as a box with its outline's thickness (a line,
   * and a filled box, as thick as their narrower side).
   */
  printer: {
    symbols: { id: string; xMm: number; yMm: number; data: string; options: LabelOptions; layout: Layout }[];
    texts: { text: string; xMm: number; yMm: number; heightMm: number; widthMm: number }[];
    boxes: { id: string; xMm: number; yMm: number; widthMm: number; heightMm: number; thicknessMm: number }[];
  };
}

export interface DesignOptions {
  /** The scanning environment that sizes the symbols (step 3's), and its table for ITF-14, GS1-128 and GS1 DataBar. */
  environment: string;
  table?: number;
  /** A QR code's error correction level. */
  error?: ErrorLevel;
}

const LINE_SPACING = 1.4; // a text block's baseline-to-baseline distance, as a multiple of its height
const NO_SYMBOL_UNIT_MM = 0.1; // the page's unit when it has no symbol

/** A line or box as a box: its outer size and its outline's thickness, no more than half its narrower side (filled). */
export function boxOf(element: DesignLine | DesignBox): { widthMm: number; heightMm: number; thicknessMm: number } {
  const [widthMm, heightMm] = element.kind === "line"
    ? element.vertical ? [element.thicknessMm, element.lengthMm] : [element.lengthMm, element.thicknessMm]
    : [element.widthMm, element.heightMm];
  const narrow = Math.min(widthMm, heightMm);
  const t = element.kind === "line" || element.filled ? narrow : element.thicknessMm;
  return { widthMm, heightMm, thicknessMm: 2 * t >= narrow ? narrow : t };
}

/** A box's dark rectangles, `[x, y, width, height]` from its corner: itself when filled, else its four sides. */
function boxRects(box: { widthMm: number; heightMm: number; thicknessMm: number }): [number, number, number, number][] {
  const { widthMm: w, heightMm: h, thicknessMm: t } = box;
  if (t >= Math.min(w, h)) return [[0, 0, w, h]];
  return [[0, 0, w, t], [0, h - t, w, t], [0, t, t, h - 2 * t], [w - t, t, t, h - 2 * t]];
}

/** The date formats the editor offers for a date field (backlog 4.2): `{17:DD/MM/YYYY}`. */
export const DATE_FORMATS = ["DD/MM/YYYY", "DD.MM.YYYY", "YYYY-MM-DD", "MM/YYYY", "DD MMM YYYY"] as const;

const DATE_TOKENS = /YYYY|YY|MMM|MM|DD/g;

/** The languages a date's month (`MMM`) can be written in: English, Portuguese and Spanish, the interface's (ADR 0003). */
export type MonthLanguage = "en" | "pt" | "es";

/** Each language's month abbreviations, in capitals as labels print them (the owner, 3 November 2026). */
export const MONTH_NAMES: Record<MonthLanguage, readonly string[]> = {
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  pt: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
  es: ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"],
};

/** What a date is written with: the day its century is chosen from (today), the language of its month (English). */
export interface DateOptions {
  today?: Date;
  months?: MonthLanguage;
}

/**
 * A YYMMDD date in a format of DD, MM, MMM (the month's abbreviation in `MONTH_NAMES`), YY and YYYY, what is between
 * them kept: the century as section 7.12 of the General Specifications chooses it, day 00 the month's last
 * (`isoDate`). A format with none of them raises an `InputError`.
 */
export function formatDate(yymmdd: string, format: string, { today = new Date(), months = "en" }: DateOptions = {}): string {
  if (!format.match(DATE_TOKENS)) throw new InputError(`The date format “${format}” has none of DD, MM, MMM, YY and YYYY.`);
  const [yyyy, mm, dd] = isoDate(yymmdd, today).split("-") as [string, string, string];
  const parts: Record<string, string> = { YYYY: yyyy, YY: yyyy.slice(2), MMM: MONTH_NAMES[months][Number(mm) - 1] ?? mm, MM: mm, DD: dd };
  return format.replace(DATE_TOKENS, (token) => parts[token]!);
}

/**
 * The value of each `{AI}` in a text, from the data, and of each `{AI:format}` of a date AI its date in that format
 * (`formatDate`); an AI the data does not have leaves nothing. A format after an AI that is not a date raises an
 * `InputError`.
 */
export function fillFields(text: string, identified: Pick<Identified, "elements">, options: DateOptions = {}): string {
  return text.replace(/\{(\d{2,4})(?::([^{}]*))?\}/g, (_, ai: string, format: string | undefined) => {
    if (format === undefined) return identified.elements.find((e) => e.ai === ai)?.value ?? "";
    if (!isDateAi(ai)) throw new InputError(`(${ai}) is not a date, so its field takes no date format.`);
    const value = identified.elements.find((e) => e.ai === ai)?.value;
    return value ? formatDate(value.slice(0, 6), format, options) : "";
  });
}

/** The element strings a symbol carries: those of its AIs, in the data's order, or all. */
function chosen(identified: Identified, ais: readonly string[] | null): Identified {
  if (!ais) return identified;
  const elements = identified.elements.filter((e) => ais.includes(e.ai));
  if (!elements.length) throw new InputError("A barcode on the label carries none of the data's element strings: choose at least one.");
  return { ...identified, elements, elementString: elements.map((e) => `(${e.ai})${e.value}`).join("") };
}

/** One barcode's options as the editor gives a symbol alone: its table's row, or the environment's range. */
function symbolOptions(element: DesignSymbol, identified: Identified, options: DesignOptions): LabelOptions {
  const { symbology } = element;
  const carried = SYMBOLOGIES[symbology].data === "uri" ? identified : chosen(identified, element.ais);
  const data = dataFor(symbology, carried);
  const table = options.table ?? ENVIRONMENTS[options.environment]?.table;
  const bars = BARS.includes(symbology);
  const spec = bars && table !== undefined ? specificationFor(table, symbology as SpecSymbol) : undefined;
  if (bars && !spec) throw new InputError(`Table ${table} does not allow ${SYMBOLOGIES[symbology].name}: choose another symbol or scanning environment.`);
  return {
    symbology, data, showHri: element.hri, hriLines: carried.elements.map((e) => `(${e.ai})${e.value}`),
    size: element.size, environment: options.environment, error: options.error ?? "m", version: null,
    ...(spec ? { spec, table } : {}),
  };
}

/**
 * The page of `page` with the data of `identified`: one Layout in units of its smallest module, each barcode as the
 * editor lays out a symbol alone, each text block in the HRI font at its capitals' height. An element that cannot be
 * drawn (a symbol the data cannot fill, a table without it) raises an `InputError` naming it.
 */
export function designLabel(page: DesignPage, identified: Identified, font: HriFont, options: DesignOptions): DesignedLabel {
  const symbols = page.elements.flatMap((element) => {
    if (element.kind !== "symbol") return [];
    const o = symbolOptions(element, identified, options);
    return [{ element, options: o, layout: layoutLabel(o, font) }];
  });
  const unit = symbols.length ? Math.min(...symbols.map((s) => s.layout.xMm)) : NO_SYMBOL_UNIT_MM;
  const u = (mm: number) => mm / unit;
  const rects: Layout["rects"] = [];
  const texts: LabelText[] = [];
  const placed: PlacedElement[] = [];
  const printer: DesignedLabel["printer"] = { symbols: [], texts: [], boxes: [] };
  // The rules and boxes after the symbols' rectangles, so that `symbolRects` counts the symbols' alone
  const graphics: Layout["rects"] = [];
  // Each element's dark rectangles in mm where they are not its whole box (a box's outline): what overlaps a symbol
  const dark = new Map<string, [number, number, number, number][]>();
  for (const element of page.elements) {
    if (element.kind === "symbol") {
      const { layout, options: o } = symbols.find((s) => s.element === element)!;
      printer.symbols.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, data: o.data, options: o, layout });
      const scale = layout.xMm / unit;
      const [dx, dy] = [u(element.xMm), u(element.yMm)];
      for (const [x, y, w, h] of layout.rects) rects.push([dx + x * scale, dy + y * scale, w * scale, h * scale]);
      for (const t of layout.texts) texts.push({ ...t, x: dx + t.x * scale, baseline: dy + t.baseline * scale, em: t.em * scale });
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm: layout.width * layout.xMm, heightMm: layout.height * layout.xMm });
    } else if (element.kind === "line" || element.kind === "box") {
      const box = boxOf(element);
      if (!(box.widthMm > 0 && box.heightMm > 0 && box.thicknessMm > 0)) {
        throw new InputError("A line or box needs a length, a width and a thickness greater than 0 mm.");
      }
      const rectsMm = boxRects(box).map(([x, y, w, h]): [number, number, number, number] => [element.xMm + x, element.yMm + y, w, h]);
      for (const [x, y, w, h] of rectsMm) graphics.push([u(x), u(y), u(w), u(h)]);
      dark.set(element.id, rectsMm);
      printer.boxes.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, ...box });
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm: box.widthMm, heightMm: box.heightMm });
    } else {
      const em = (u(element.heightMm) * font.unitsPerEm) / font.capHeight;
      const lines = fillFields(element.text, identified, { months: element.months }).split("\n");
      lines.forEach((line, index) => {
        if (!line) return;
        texts.push({ text: line, x: u(element.xMm), baseline: u(element.yMm + element.heightMm * (1 + index * LINE_SPACING)), em, linear: false });
        printer.texts.push({ text: line, xMm: element.xMm, yMm: element.yMm + element.heightMm * index * LINE_SPACING, heightMm: element.heightMm, widthMm: font.textWidth(line, em) * unit });
      });
      const width = Math.max(0, ...lines.map((line) => font.textWidth(line, em))) * unit;
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm: width, heightMm: element.heightMm * (1 + (lines.length - 1) * LINE_SPACING) });
    }
  }

  const symbolRects = rects.length;
  rects.push(...graphics);

  const problems: DesignedLabel["problems"] = [];
  for (const p of placed) {
    if (p.xMm < -1e-9 || p.yMm < -1e-9 || p.xMm + p.widthMm > page.widthMm + 1e-9 || p.yMm + p.heightMm > page.heightMm + 1e-9) {
      problems.push({ kind: "edge", id: p.id });
    }
  }
  // A box's outline overlaps a symbol only where it is drawn: a frame around a barcode, clear of its quiet zones, is not
  const areas = (p: PlacedElement): [number, number, number, number][] => dark.get(p.id) ?? [[p.xMm, p.yMm, p.widthMm, p.heightMm]];
  const apart = ([ax, ay, aw, ah]: number[], [bx, by, bw, bh]: number[]) =>
    ax! + aw! <= bx! + 1e-9 || bx! + bw! <= ax! + 1e-9 || ay! + ah! <= by! + 1e-9 || by! + bh! <= ay! + 1e-9;
  placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => {
    const symbol = [a, b].some((p) => page.elements.find((e) => e.id === p.id)!.kind === "symbol");
    if (symbol && areas(a).some((ra) => areas(b).some((rb) => !apart(ra, rb)))) problems.push({ kind: "overlap", ids: [a.id, b.id] });
  }));

  const names = symbols.map((s) => SYMBOLOGIES[s.element.symbology].name);
  const description = `A label of one's own, ${page.widthMm} × ${page.heightMm} mm` + (names.length ? `: ${names.join(", ")}` : "");
  return {
    layout: { width: u(page.widthMm), height: u(page.heightMm), rects, symbolRects, texts, xMm: unit, modules: 0, version: null },
    options: { symbology: symbols[0]?.options.symbology ?? "gs1-128", data: identified.elementString, showHri: false, hriLines: [], description },
    placed,
    expected: symbols.flatMap((s) => (s.layout.parts ? s.layout.parts.map((part) => `]C1 ${part}`) : expectedReads(s.options))).sort(),
    symbols: symbols.map((s) => ({ id: s.element.id, symbology: s.element.symbology, modules: s.layout.modules, version: s.layout.version })),
    problems,
    printer,
  };
}
