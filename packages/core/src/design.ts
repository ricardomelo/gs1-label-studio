import { carriesTime, isDateAi, isFullYearDate, isPercentEncoded, percentDecode } from "./dictionary.ts";
import { ENVIRONMENTS } from "./environments.ts";
import type { HriFont } from "./hri.ts";
import type { HriFormat } from "./hriFormat.ts";
import { inUriOrder, type Identified } from "./identify.ts";
import { symbolFor, type LinearKind } from "./linear.ts";
import { formatDate, TIME_TOKENS, type DateOptions, type MonthLanguage } from "./dates.ts";
import { BARS, layoutLabel, type Bearer, type ErrorLevel, type HriPosition, type LabelOptions, type LabelText, type Layout } from "./layout.ts";
import type { QrMode } from "./encode.ts";
import { bitmapRects, pictureBitmap, turnedPicture, type Picture } from "./picture.ts";
import { expectedReads } from "./scan.ts";
import { specificationFor, type SpecSymbol } from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { dataFor, InputError } from "./syntax.ts";

// A label of one's own (backlog 4.2, mock-up A of two, 3 November 2026): a page in millimetres with barcodes and text
// blocks placed on it, lines and boxes, and images. Each barcode is laid out as the editor lays out a symbol alone — its quiet zones and text, at the
// scanning environment's X-dimension — and the page is one Layout, in units of the smallest module, so that the SVG,
// PNG, PDF and EPS draw it as they draw a symbol. Every place has its own label (the owner), so the designer is what the
// studio offers first; the templates by segment (backlog 6.5, templates.ts) are pages of it, to change as any other.

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
  /**
   * The options of the symbol alone (backlog 6.6), each as the label's options have it when not given: the text's place
   * and height (1.16), a QR code's or Data Matrix's error correction level and a QR code's encoding mode (1.14), the bar
   * width reduction of a linear symbol (prepress), and ITF-14's bearer bars.
   */
  hriPosition?: HriPosition;
  hriHeightMm?: number;
  error?: ErrorLevel;
  qrMode?: QrMode;
  reduction?: number;
  bearer?: Bearer;
  /**
   * An EAN/UPC beside a 2D symbol, as the symbol alone's Linear barcode beside it (backlog 6.6): as the GTIN takes, or
   * UPC-E; none when not given. Its size is a percentage of its own target X-dimension, the 2D symbol's when not given.
   */
  linear?: "auto" | "upce";
  linearSize?: number;
  /** Turned clockwise about its box (backlog 4.2): upright when not given. */
  rotation?: Rotation;
  /** The top left corner of the symbol with its quiet zones (of its box as turned), in mm from the page's. */
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
  /** Turned clockwise about its box (backlog 4.2): upright when not given. */
  rotation?: Rotation;
  /** The top left corner of its first line's capitals (of its box as turned), in mm. */
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

/**
 * An image (backlog 4.2, step d): a logo, as a one-bit picture (picture.ts), `widthMm` wide from its top left corner and
 * as high as its proportions make it (`imageHeightMm`).
 */
export interface DesignImage {
  id: string;
  kind: "image";
  /** The file's name, to tell the images apart in the editor. */
  name: string;
  picture: Picture;
  /**
   * The grey level below which the file's pixels were made dark (`pictureFromGrey`), when its darkness was changed in
   * the editor: `PICTURE_THRESHOLD` when not given. The picture is already made with it; the editor shows it.
   */
  threshold?: number;
  /**
   * Whether the file's greys were dithered (`pictureFromGrey`), for a photo: its picture is dots, and each printer
   * dithers it again at its own dots (`redithered`). Made black and white at the threshold when not given.
   */
  dither?: true;
  /** Its own width, before it is turned. */
  widthMm: number;
  /** Turned clockwise about its box (backlog 4.2): upright when not given. */
  rotation?: Rotation;
  /** The top left corner of its box as turned. */
  xMm: number;
  yMm: number;
}

export type DesignElement = DesignSymbol | DesignText | DesignLine | DesignBox | DesignImage;

/**
 * How far a barcode, a text block or an image is turned clockwise (backlog 4.2): a quarter turn reads downwards, a half
 * turn upside down, three quarters upwards. A line or box needs none: it is drawn across or down, wide or tall.
 */
export type Rotation = 0 | 90 | 180 | 270;

/** The rotations an element can take. */
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * A rectangle `[x, y, width, height]` of a box `w` × `h` from its top left corner, where it lands when the box is turned
 * `rotation` and its own corner put at (x0, y0): the box as turned keeps its top left corner there.
 */
export function turnedRect([x, y, rw, rh]: readonly number[], w: number, h: number, rotation: Rotation, x0 = 0, y0 = 0): [number, number, number, number] {
  if (rotation === 90) return [x0 + h - y! - rh!, y0 + x!, rh!, rw!];
  if (rotation === 180) return [x0 + w - x! - rw!, y0 + h - y! - rh!, rw!, rh!];
  if (rotation === 270) return [x0 + y!, y0 + w - x! - rw!, rh!, rw!];
  return [x0 + x!, y0 + y!, rw!, rh!];
}

/** A point of a box `w` × `h` from its top left corner, where it lands when the box is turned as `turnedRect` turns it. */
function turnedPoint(x: number, y: number, w: number, h: number, rotation: Rotation, x0: number, y0: number): [number, number] {
  const [px, py] = turnedRect([x, y, 0, 0], w, h, rotation);
  return [x0 + px, y0 + py];
}

const turnOf = (rotation: Rotation | undefined): { turn?: 1 | 2 | 3 } => (rotation ? { turn: (rotation / 90) as 1 | 2 | 3 } : {});

/** An image's own height in mm, before it is turned: its width's, in its picture's proportions. */
export function imageHeightMm(element: Pick<DesignImage, "picture" | "widthMm">): number {
  return (element.widthMm * element.picture.height) / element.picture.width;
}

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
   * corner, height and width in the HRI font, in mm, each with how far it is turned; each line and box as a box with its
   * outline's thickness (a line, and a filled box, as thick as their narrower side); each image with its corner, size
   * and picture, turned already.
   */
  printer: {
    /** Its box's top left corner as turned, and its own layout, upright. */
    symbols: { id: string; xMm: number; yMm: number; rotation: Rotation; data: string; options: LabelOptions; layout: Layout }[];
    /** Each line's capitals: their box's top left corner as turned, and their own width and height, upright. */
    texts: { text: string; xMm: number; yMm: number; heightMm: number; widthMm: number; rotation: Rotation }[];
    boxes: { id: string; xMm: number; yMm: number; widthMm: number; heightMm: number; thicknessMm: number }[];
    images: { id: string; xMm: number; yMm: number; widthMm: number; heightMm: number; picture: Picture; dither?: true }[];
  };
}

export interface DesignOptions {
  /** The scanning environment that sizes the symbols (step 3's), and its table for ITF-14, GS1-128 and GS1 DataBar. */
  environment: string;
  table?: number;
  /** A QR code's error correction level. */
  error?: ErrorLevel;
  /** In bulk, the row's cells by their column's header, which `{column}` fields show (`fillFields`). */
  cells?: Readonly<Record<string, string>>;
  /** How each barcode's text writes its element strings (backlog 6.11, `hriText`); the AI in parentheses when not given. */
  hriFormat?: HriFormat;
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

export { DATE_FORMATS, formatDate, MONTH_NAMES, TIME_FORMATS, type DateOptions, type MonthLanguage } from "./dates.ts";

export interface FieldOptions extends DateOptions {
  /** A spreadsheet row's cells by their column's header (in bulk): what a `{column}` field shows. */
  cells?: Readonly<Record<string, string>>;
}

/**
 * The cell of the column `name` (its header, spaces around it and the case of its letters aside), or undefined when no
 * column is named so.
 */
export function columnCell(cells: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  if (!cells) return undefined;
  const wanted = name.trim().toLowerCase();
  const header = Object.keys(cells).find((h) => h.trim().toLowerCase() === wanted);
  return header === undefined ? undefined : cells[header];
}

/**
 * The value of each `{AI}` in a text, from the data, and of each `{AI:format}` of a date AI its date in that format
 * (`formatDate`, its year as given for a YYYYMMDD date, `isFullYearDate`), and its time too when the AI carries one (`carriesTime`); an AI the data does not have leaves
 * nothing. A percent-encoded AI's value (`isPercentEncoded`), as (7254) GIVEN NAME, is shown as people read it
 * (`percentDecode`: `Jo%C3%A3o` → `João`). A format after an AI that is not a date, or with a time after an AI that carries none, raises an
 * `InputError`. Any other name in braces is a spreadsheet column's (backlog 4.2): `{Description}` shows the row's cell
 * under that header (`columnCell`); a name no column has stays as typed, so that a mistyped field shows on the label.
 */
export function fillFields(text: string, identified: Pick<Identified, "elements">, options: FieldOptions = {}): string {
  return text.replace(/\{([^{}]*)\}/g, (whole, inside: string) => {
    const field = /^(\d{2,4})(?::(.*))?$/s.exec(inside);
    if (!field) return columnCell(options.cells, inside) ?? whole;
    const [, ai, format] = field as unknown as [string, string, string | undefined];
    if (format === undefined) {
      const value = identified.elements.find((e) => e.ai === ai)?.value ?? "";
      return isPercentEncoded(ai) ? percentDecode(value) : value;
    }
    if (!isDateAi(ai)) throw new InputError(`(${ai}) is not a date, so its field takes no date format.`);
    if (!carriesTime(ai) && TIME_TOKENS.test(format)) throw new InputError(`(${ai}) carries no time, so its field takes no hh, mm or ss.`);
    const value = identified.elements.find((e) => e.ai === ai)?.value;
    return value ? formatDate(value, format, { ...options, fullYear: isFullYearDate(ai) }) : "";
  });
}

/** The element strings a symbol carries: those of its AIs, in the data's order, or all. */
function chosen(identified: Identified, ais: readonly string[] | null): Identified {
  if (!ais) return identified;
  const elements = identified.elements.filter((e) => ais.includes(e.ai));
  if (!elements.length) throw new InputError("A barcode on the label carries none of the data's element strings: choose at least one.");
  return { ...identified, elements, elementString: elements.map((e) => `(${e.ai})${e.value}`).join("") };
}

/** The EAN/UPC beside a 2D symbol: the GTIN it carries, in a scanning environment with an EAN/UPC range. */
function linearBeside(choice: "auto" | "upce", carried: Identified, environment: string): [LinearKind, string] {
  if (!ENVIRONMENTS[environment]?.linear) throw new InputError("This scanning environment has no EAN/UPC: a linear barcode beside the 2D symbol needs one.");
  const gtin = carried.elements.find((e) => e.ai === "01")?.value;
  if (!gtin) throw new InputError("A linear barcode beside the 2D symbol needs a GTIN (01).");
  try {
    return symbolFor(gtin, choice);
  } catch {
    throw new InputError(choice === "upce" ? "UPC-E is only for a GTIN-12 that zero-suppresses." : "An EAN/UPC is only for GTINs of consumer units (indicator 0).");
  }
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
  const linear = element.linear && SYMBOLOGIES[symbology].kind === "matrix" ? linearBeside(element.linear, carried, options.environment) : null;
  // Beside an EAN/UPC, the 2D symbol's text goes below or above it, as for the symbol alone
  const hriPosition = linear && (element.hriPosition === "left" || element.hriPosition === "right") ? "below" : element.hriPosition;
  return {
    symbology, data, showHri: element.hri,
    hriLines: (SYMBOLOGIES[symbology].data === "uri" ? inUriOrder(carried.elements) : carried.elements).map((e) => `(${e.ai})${e.value}`),
    size: element.size, environment: options.environment, error: element.error ?? options.error ?? "m", version: null,
    ...(hriPosition && hriPosition !== "below" ? { hriPosition } : {}),
    ...(element.hriHeightMm ? { hriHeightMm: element.hriHeightMm } : {}),
    ...(element.qrMode && symbology === "dl-qrcode" ? { qrMode: element.qrMode } : {}),
    ...(linear ? { linear, linearSize: element.linearSize ?? null } : {}),
    ...(element.reduction && (linear || SYMBOLOGIES[symbology].kind !== "matrix") ? { barWidthReduction: element.reduction } : {}),
    ...(element.bearer && symbology === "itf14" ? { bearer: element.bearer } : {}),
    ...(options.hriFormat ? { hriFormat: options.hriFormat } : {}),
    ...(spec ? { spec, table } : {}),
  };
}

/**
 * A 2D symbol and the EAN/UPC beside it as a printer language writes them (backlog 6.6, ADR 0002): two symbols, each
 * with its own options and layout as a symbol alone, its bars' box where the pair's layout puts them on the page, as
 * turned: each printed with the printer's own command, as the symbol alone and an EAN/UPC alone are.
 */
function besideParts(element: DesignSymbol, o: LabelOptions, drawn: Layout, font: HriFont): DesignedLabel["printer"]["symbols"] {
  const rotation = element.rotation ?? 0;
  // The bar width reduction is prepress, for the files: the printer's bars are where the pair's unreduced bars are
  const { barWidthReduction, ...unreduced } = o;
  const pair = barWidthReduction ? layoutLabel(unreduced, font) : drawn;
  const [kind, digits] = o.linear!;
  const twoD: LabelOptions = { ...unreduced, linear: null, linearSize: null };
  const linear: LabelOptions = {
    symbology: kind, data: digits, hriLines: [], showHri: true, environment: o.environment, size: o.linearSize ?? o.size,
  };
  const box = (rects: Layout["rects"]): [number, number, number, number] => {
    const [x, y] = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1]))];
    return [x, y, Math.max(...rects.map((r) => r[0] + r[2])) - x, Math.max(...rects.map((r) => r[1] + r[3])) - y];
  };
  const part = (options: LabelOptions, rects: Layout["rects"]) => {
    const layout = layoutLabel(options, font);
    // Where the pair puts these bars on the page, less where the part's own layout puts them in its box
    const [px, py] = turnedRect(box(rects), pair.width, pair.height, rotation);
    const [ox, oy] = turnedRect(box(layout.rects), layout.width, layout.height, rotation);
    const xMm = element.xMm + px * pair.xMm - ox * layout.xMm;
    const yMm = element.yMm + py * pair.xMm - oy * layout.xMm;
    return { id: element.id, xMm, yMm, rotation, data: options.data, options, layout };
  };
  return [part(twoD, pair.rects.slice(0, pair.symbolRects)), part(linear, pair.rects.slice(pair.symbolRects))];
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
  const printer: DesignedLabel["printer"] = { symbols: [], texts: [], boxes: [], images: [] };
  // The rules, boxes and images after the symbols' rectangles, so that `symbolRects` counts the symbols' alone
  const graphics: Layout["rects"] = [];
  // Each element's dark rectangles in mm where they are not its whole box (a box's outline): what overlaps a symbol
  const dark = new Map<string, [number, number, number, number][]>();
  for (const element of page.elements) {
    if (element.kind === "symbol") {
      const { layout, options: o } = symbols.find((s) => s.element === element)!;
      const rotation = element.rotation ?? 0;
      if (o.linear) printer.symbols.push(...besideParts(element, o, layout, font));
      else printer.symbols.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, rotation, data: o.data, options: o, layout });
      const scale = layout.xMm / unit;
      const [dx, dy] = [u(element.xMm), u(element.yMm)];
      const [w, h] = [layout.width * scale, layout.height * scale];
      for (const r of layout.rects) rects.push(turnedRect(r.map((v) => v * scale), w, h, rotation, dx, dy));
      for (const t of layout.texts) {
        const [x, baseline] = turnedPoint(t.x * scale, t.baseline * scale, w, h, rotation, dx, dy);
        texts.push({ ...t, x, baseline, em: t.em * scale, ...turnOf(rotation) });
      }
      const [, , widthMm, heightMm] = turnedRect([0, 0, layout.width * layout.xMm, layout.height * layout.xMm], 0, 0, rotation);
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm, heightMm });
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
    } else if (element.kind === "image") {
      if (!(element.widthMm > 0)) throw new InputError("An image needs a width greater than 0 mm.");
      // Turned, the picture itself is turned: then it is drawn and printed as an upright one is
      const picture = turnedPicture(element.picture, element.rotation ?? 0);
      const bitmap = pictureBitmap(picture);
      const pixel = element.widthMm / element.picture.width;
      for (const [x, y, w, h] of bitmapRects(bitmap)) {
        graphics.push([u(element.xMm + x * pixel), u(element.yMm + y * pixel), u(w * pixel), u(h * pixel)]);
      }
      const [widthMm, heightMm] = [picture.width * pixel, picture.height * pixel];
      printer.images.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm, heightMm, picture, ...(element.dither ? { dither: true as const } : {}) });
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm, heightMm });
    } else {
      const em = (u(element.heightMm) * font.unitsPerEm) / font.capHeight;
      const lines = fillFields(element.text, identified, { months: element.months, cells: options.cells }).split("\n");
      const rotation = element.rotation ?? 0;
      // The block's own box, upright: its widest line, its first line's capitals to its last's baseline
      const width = Math.max(0, ...lines.map((line) => font.textWidth(line, em))) * unit;
      const height = element.heightMm * (1 + (lines.length - 1) * LINE_SPACING);
      lines.forEach((line, index) => {
        if (!line) return;
        const top = element.heightMm * index * LINE_SPACING;
        const [x, baseline] = turnedPoint(0, top + element.heightMm, width, height, rotation, element.xMm, element.yMm);
        texts.push({ text: line, x: u(x), baseline: u(baseline), em, linear: false, ...turnOf(rotation) });
        const lineWidth = font.textWidth(line, em) * unit;
        const [xMm, yMm] = turnedRect([0, top, lineWidth, element.heightMm], width, height, rotation, element.xMm, element.yMm);
        printer.texts.push({ text: line, xMm, yMm, heightMm: element.heightMm, widthMm: lineWidth, rotation });
      });
      const [, , widthMm, heightMm] = turnedRect([0, 0, width, height], 0, 0, rotation);
      placed.push({ id: element.id, xMm: element.xMm, yMm: element.yMm, widthMm, heightMm });
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
