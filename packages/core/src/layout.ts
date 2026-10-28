import { encode, EncodeError } from "./encode.ts";
import {
  checkEnvironment,
  ENVIRONMENTS,
  linearXDimension,
  RESOLVER_SYMBOL_OF,
  SIZES,
  xDimension,
} from "./environments.ts";
import type { HriFont } from "./hri.ts";
import { DIGIT_HEIGHT, encodeLinear, GUARD_EXTENSION, LINEAR_NAMES, type LinearKind } from "./linear.ts";
import { pyFixed } from "./pyformat.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

/**
 * The label: a 2D symbol with its quiet zone and its human readable text below, and an EAN/UPC beside it if asked —
 * ported from the resolver's `portal/label.py` (`_layout`, `_place_linear`, `render_svg`; ADR 0004) and checked
 * against it. Everything is placed in units of the 2D symbol's module; the label is that unit times `xMm` millimetres.
 *
 * An EAN/UPC alone (no 2D symbol) is laid out the same way, in units of its own module — something the resolver, which
 * always drew a QR code or a Data Matrix, did not do.
 */
export const QUIET_ZONE = 4; // in X
export const MARGIN = 2.0; // white border around the whole label, in X
export const TEXT_GAP = 1.0; // clearance between text and the quiet zone, in X
export const LINE_SPACING = 1.6; // HRI baseline-to-baseline distance, as a multiple of the text height
export const TEXT_HEIGHT_MM = 2.2; // the guideline minimum is 2 mm for the HRI
export const LINEAR_GAP = 4.0; // between the 2D symbol's quiet zone and the linear symbol's, in 2D modules
export const ERROR_LEVELS = ["l", "m", "q", "h"] as const; // QR error correction: about 7, 15, 25 and 30 % recoverable
export type ErrorLevel = (typeof ERROR_LEVELS)[number];

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];
const LINEAR_ALONE: SymbologyId[] = ["ean13", "upca", "upce", "ean8"];

export interface LabelOptions {
  /** A 2D symbol, or an EAN/UPC alone. */
  symbology: SymbologyId;
  /** What the symbol carries (`dataFor()`): a GS1 Digital Link URI, an element string, or the EAN/UPC's digits. */
  data: string;
  hriLines: readonly string[];
  showHri: boolean;
  /** QR version 1–40; null chooses the smallest that fits. */
  version?: number | null;
  /** QR error correction level, exactly as chosen. */
  error?: ErrorLevel;
  /** Percentage of the environment's target X-dimension: one of SIZES. */
  size?: number;
  /** An EAN/UPC beside the 2D symbol: [kind, digits] from `symbolFor()`. */
  linear?: readonly [LinearKind, string] | null;
  environment?: string;
  /** The EAN/UPC's percentage of its own target; null: the 2D symbol's size. */
  linearSize?: number | null;
}

export interface LabelText {
  text: string;
  /** Left end of the baseline, and the em size, in the label's units. */
  x: number;
  baseline: number;
  em: number;
  /** EAN/UPC digits (OCR-B when the text is real text). */
  linear: boolean;
}

export interface Layout {
  width: number;
  height: number;
  /** Dark rectangles — modules and bars — as [x, y, width, height]; the 2D symbol's first. */
  rects: [number, number, number, number][];
  /** How many of `rects` are the 2D symbol's. */
  symbolRects: number;
  texts: LabelText[];
  /** Millimetres per unit. */
  xMm: number;
  /** The 2D symbol: modules a side, and its QR version (null for a Data Matrix or a linear symbol alone). */
  modules: number;
  version: number | null;
}

/** The data does not fit the QR version chosen at the level chosen. */
export class DoesNotFit extends Error {
  constructor(
    readonly params: { version: number | null; level: string; needed: number | null; fittingLevel: string | null },
  ) {
    super(`${params.version}-${params.level}`);
    this.name = "DoesNotFit";
  }
}

interface Matrix {
  matrix: boolean[][];
  version: number | null;
}

/**
 * The 2D symbol. QR: the level is never raised (the code is exactly what was chosen); Micro QR is never used. Data
 * Matrix: square, ECC 200. Encoded by bwip-js, where the resolver used segno and libzint: the same size, though not
 * necessarily the same modules (mask, encodation), which ZXing reads back either way.
 */
export function symbolMatrix(options: LabelOptions): Matrix {
  const error = options.error ?? "m";
  const isQr = options.symbology === "dl-qrcode" || options.symbology === "gs1-qrcode";
  const qrOptions = (level: string, version?: number | null) =>
    isQr ? { eclevel: level.toUpperCase() as "L" | "M" | "Q" | "H", ...(version ? { version } : {}) } : {};
  const fits = (level: string, version?: number | null) => {
    try {
      return encode(options.symbology, options.data, qrOptions(level, version));
    } catch (e) {
      if (e instanceof EncodeError && isQr && /NoValidSymbol|too long|exceeds/i.test(e.message)) return null;
      throw e;
    }
  };
  const geometry = fits(error, options.version);
  if (!geometry) {
    const smallest = fits(error);
    const needed = smallest && smallest.kind === "matrix" ? (smallest.rows - 17) / 4 : null;
    const fittingLevel = options.version
      ? ([...ERROR_LEVELS].reverse().find((level) => fits(level, options.version)) ?? null)
      : null;
    throw new DoesNotFit({
      version: options.version ?? null, level: error.toUpperCase(), needed, fittingLevel: fittingLevel?.toUpperCase() ?? null,
    });
  }
  if (geometry.kind !== "matrix") throw new Error(`${options.symbology} is not a 2D symbol`);
  const matrix = Array.from({ length: geometry.rows }, (_, r) => geometry.dark.slice(r * geometry.cols, (r + 1) * geometry.cols));
  return { matrix, version: isQr ? (geometry.rows - 17) / 4 : null };
}

/** The dark modules, one rectangle per horizontal run. */
function qrRects(matrix: boolean[][], x0: number, y0: number): [number, number, number, number][] {
  const rects: [number, number, number, number][] = [];
  matrix.forEach((row, rowIndex) => {
    let col = 0;
    while (col < row.length) {
      if (!row[col]) {
        col++;
        continue;
      }
      const start = col;
      while (col < row.length && row[col]) col++;
      rects.push([x0 + start, y0 + rowIndex, col - start, 1]);
    }
  });
  return rects;
}

/**
 * Places the symbol, its quiet zone and the HRI lines (text never below 2 mm), then the linear symbol, if any, to the
 * right with its own quiet zones, tops aligned.
 */
export function layoutLabel(options: LabelOptions, font: HriFont): Layout {
  const environment = options.environment ?? "retail";
  const size = options.size ?? 100;
  if (!(SIZES as readonly number[]).includes(size)) throw new Error(`size ${size} is not one of ${SIZES.join(", ")}`);
  if (options.linearSize != null && !(SIZES as readonly number[]).includes(options.linearSize)) {
    throw new Error(`linear size ${options.linearSize} is not one of ${SIZES.join(", ")}`);
  }
  if (LINEAR_ALONE.includes(options.symbology)) return layoutLinearAlone(options, font, environment, size);
  const symbol = RESOLVER_SYMBOL_OF[options.symbology];
  if (!symbol || !TWO_D.includes(options.symbology)) {
    throw new Error(`${SYMBOLOGIES[options.symbology].name} has no label layout yet`);
  }
  checkEnvironment({
    environment, symbol, size, linear: Boolean(options.linear), linearSize: options.linearSize ?? null,
  });
  const xMm = xDimension(environment, size);
  const { matrix, version } = symbolMatrix(options);
  const modules = matrix[0]?.length ?? 0;
  const box = modules + 2 * QUIET_ZONE;

  const textHeight = TEXT_HEIGHT_MM / xMm;
  const em = (textHeight * font.unitsPerEm) / font.capHeight;
  const lines = options.showHri ? [...options.hriLines] : [];
  const widths = lines.map((line) => font.textWidth(line, em));
  const contentWidth = Math.max(box, ...widths);

  const boxX = MARGIN + (contentWidth - box) / 2;
  const boxY = MARGIN;
  const rects = qrRects(matrix, boxX + QUIET_ZONE, boxY + QUIET_ZONE);
  const symbolRects = rects.length;
  const texts: LabelText[] = [];
  let y = boxY + matrix.length + 2 * QUIET_ZONE;
  lines.forEach((line, index) => {
    const baseline = y + TEXT_GAP + textHeight + index * textHeight * LINE_SPACING;
    texts.push({ text: line, x: MARGIN + (contentWidth - widths[index]!) / 2, baseline, em, linear: false });
  });
  if (texts.length) y = texts.at(-1)!.baseline + (font.descent * em) / font.unitsPerEm;
  let width = MARGIN + contentWidth;
  let height = y;

  if (options.linear) {
    const unit = linearXDimension(environment, options.linearSize ?? size) / xMm; // one linear module in 2D modules
    [width, height] = placeLinear(options.linear, unit, rects, texts, width + LINEAR_GAP, boxY, height, font);
  }
  return { width: width + MARGIN, height: height + MARGIN, rects, symbolRects, texts, xMm, modules, version };
}

/** An EAN/UPC alone, in units of its own module, at its environment's linear target times the size. */
function layoutLinearAlone(options: LabelOptions, font: HriFont, environment: string, size: number): Layout {
  if (!ENVIRONMENTS[environment]?.linear) throw new Error(`the scanning environment ${environment} has no EAN/UPC range`);
  const linearSize = options.linearSize ?? size;
  const kind = options.symbology as LinearKind;
  const rects: [number, number, number, number][] = [];
  const texts: LabelText[] = [];
  const [width, height] = placeLinear([kind, options.data], 1, rects, texts, MARGIN, MARGIN, MARGIN, font);
  return {
    width: width + MARGIN, height: height + MARGIN, rects, symbolRects: 0, texts,
    xMm: linearXDimension(environment, linearSize), modules: 0, version: null,
  };
}

/**
 * Adds the EAN/UPC symbol with its left quiet zone starting at `left`; returns the new right edge and bottom. (The
 * resolver adds LINEAR_GAP to `left` inside; here the caller does, so that a symbol alone needs no gap.)
 */
function placeLinear(
  linear: readonly [LinearKind, string],
  unit: number,
  rects: [number, number, number, number][],
  texts: LabelText[],
  left: number,
  top: number,
  bottom: number,
  font: HriFont,
): [number, number] {
  const code = encodeLinear(linear[0], linear[1]);
  const [quietLeft, quietRight] = code.quiet;
  const x0 = left + quietLeft * unit;
  const barBottom = top + code.barHeight * unit;
  const guardBottom = barBottom + GUARD_EXTENSION * unit;
  let index = 0;
  while (index < code.modules.length) {
    if (code.modules[index] !== "1") {
      index++;
      continue;
    }
    const start = index;
    while (index < code.modules.length && code.modules[index] === "1" && code.extended.has(index) === code.extended.has(start)) {
      index++;
    }
    const low = code.extended.has(start) ? guardBottom : barBottom;
    rects.push([x0 + start * unit, top, (index - start) * unit, low - top]);
  }
  let lowest = guardBottom;
  for (const [text, centre, relative] of code.digits) {
    const height = DIGIT_HEIGHT * unit * relative;
    const em = (height * font.unitsPerEm) / font.capHeight;
    const baseline = barBottom + 0.6 * unit + height;
    texts.push({ text, x: x0 + centre * unit - font.textWidth(text, em) / 2, baseline, em, linear: true });
    lowest = Math.max(lowest, baseline + (font.descent * em) / font.unitsPerEm);
  }
  const right = x0 + (code.modules.length + quietRight) * unit;
  return [right, Math.max(bottom, lowest)];
}

const OCR_B = "OCR-B, 'OCR B', 'OCR-B 10 BT', monospace"; // the font of EAN/UPC digits, when the HRI is text
const HRI_FONT_FAMILY = "'Liberation Sans', Arial, Helvetica, sans-serif";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Python's "{:g}" of a value rounded to four decimals, as the resolver writes the rectangles. */
function g(value: number): string {
  const rounded = Number(value.toFixed(4));
  return String(Number(rounded.toPrecision(6)));
}

/**
 * The label as SVG sized in millimetres, the text as glyph outlines (no font needed), or as real text when `hriText`
 * (editable, but needing Liberation Sans and OCR-B where it is printed).
 */
export function labelSvg(options: LabelOptions, layout: Layout, font: HriFont, hriText = false): string {
  const environment = options.environment ?? "retail";
  const size = options.size ?? 100;
  const wMm = layout.width * layout.xMm;
  const hMm = layout.height * layout.xMm;
  const linearNote = options.linear
    ? `, ${LINEAR_NAMES[options.linear[0]]} ${options.linear[1]} at X = ` +
      `${pyFixed(linearXDimension(environment, options.linearSize ?? size), 3)} mm`
    : "";
  const path = layout.rects.map(([x, y, w, h]) => `M${g(x)},${g(y)}h${g(w)}v${g(h)}h${g(-w)}z`).join("");
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pyFixed(wMm, 3)}mm" height="${pyFixed(hMm, 3)}mm" ` +
      `viewBox="0 0 ${pyFixed(layout.width, 4)} ${pyFixed(layout.height, 4)}">`,
    `<title>${xml(options.data)}</title>`,
    `<desc>${SYMBOLOGIES[options.symbology].name} at ${size} % of the target size of the scanning environment ` +
      `${environment} (X = ${pyFixed(layout.xMm, 3)} mm), quiet zone ${QUIET_ZONE}X${linearNote}.</desc>`,
    `<rect width="${pyFixed(layout.width, 4)}" height="${pyFixed(layout.height, 4)}" fill="#fff"/>`,
    `<path fill="#000" shape-rendering="crispEdges" d="${path}"/>`,
  ];
  for (const t of layout.texts) {
    if (hriText) {
      parts.push(
        `<text x="${pyFixed(t.x, 4)}" y="${pyFixed(t.baseline, 4)}" font-family="${t.linear ? OCR_B : HRI_FONT_FAMILY}" ` +
          `font-size="${pyFixed(t.em, 4)}" fill="#000">${xml(t.text)}</text>`,
      );
    } else {
      parts.push(`<path fill="#000" aria-label="${xml(t.text)}" d="${font.svgPath(t.text, t.x, t.baseline, t.em)}"/>`);
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}
