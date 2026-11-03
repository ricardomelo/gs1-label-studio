import { MM_PER_INCH } from "./dots.ts";
import type { QrMode } from "./encode.ts";
import type { SymbologyId } from "./symbologies.ts";

/**
 * What every printer language shares (ADR 0002): the symbol's place and size in whole dots, the label's size, the
 * human readable text laid out around the symbol, and the error a language raises for what it cannot print correctly —
 * refused with the reason, never printed wrong. Each language writes these with its own commands: zpl.ts, tspl.ts,
 * epl.ts; printFile.ts chooses among them.
 */
export class PrinterUnsupportedError extends Error {}

export interface PrintSymbolOptions {
  /** Top left corner of the symbol (not of its quiet zone), in dots. */
  x: number;
  y: number;
  /** Module width in dots: a whole number (dots.ts). */
  dotsPerModule: number;
  /** Bar height of a linear symbol, in dots. */
  barHeightDots: number;
  /** The printer's resolution, for the text height. */
  dpi: number;
  /** Human readable text: the printer's interpretation line for linear symbols, text lines below 2D symbols. */
  hri?: boolean;
  /** The text carries the key's element string alone (the editor's "key" choice), not every element string. */
  hriKey?: boolean;
  /**
   * ITF-14's bearer bars (section 5.3.2.4): a frame around the symbol and its quiet zones of 10X, or bars at the top
   * and bottom; `thicknessDots` thick. `x` and `y` stay the symbol's corner.
   */
  bearer?: { kind: "frame" | "bars"; thicknessDots: number };
  /** A QR code's error correction level (M when not given) and one encoding mode for its data (backlog 1.14). */
  qrError?: "L" | "M" | "Q" | "H";
  qrMode?: QrMode;
  /**
   * GS1-128 over several symbols (backlog 1.13): the element strings of each, from the top; the data is then the whole
   * element string. Each symbol and its text are stacked `stackDots` apart, from `y`.
   */
  parts?: readonly string[];
  /** The human readable text's place and height in mm (backlog 1.16): below and 2.2 mm when not given. */
  hriPosition?: "below" | "above" | "split" | "left" | "right";
  hriHeightMm?: number;
}

export interface PrintLabelOptions extends PrintSymbolOptions {
  /** Label width and height in dots. */
  widthDots: number;
  heightDots: number;
  copies?: number;
}

/**
 * A label of one's own (backlog 4.2) in dots: several symbols, each placed and sized as a symbol alone is, lines of
 * text, each with its capitals' top left corner and height, and lines and boxes. What a printer language writes the
 * designer's page from.
 */
export interface PrintPage {
  widthDots: number;
  heightDots: number;
  dpi: number;
  copies?: number;
  symbols: { symbology: SymbologyId; data: string; options: PrintSymbolOptions }[];
  /** Each line's width as the page lays it out: a printer whose fonts are fixed-pitch picks one that fits it. */
  texts: { x: number; y: number; heightDots: number; widthDots: number; text: string }[];
  /** The page's lines and boxes: each a box's top left corner and outer size, its outline as thick as its narrower side when filled. */
  boxes: { x: number; y: number; width: number; height: number; thickness: number }[];
}

export const HRI_TEXT_MM = 2.2;

/** The human readable text's height in dots at `dpi`. */
export function hriTextDots(dpi: number, mm = HRI_TEXT_MM): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** One line of text: its box's top left corner, width and height in dots; the text centred or left in the box. */
export interface TextLine {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Text lines around a symbol that spans [top, bottom] from `x` over `widthDots`, `gap` away (backlog 1.16): below it,
 * above it, or split with the key's line below and the others above; one element string a line unless `join`.
 * Left and right are refused: the printer's font sets the text's width, which the studio cannot know here.
 */
export function textLines(lines: string[], x: number, top: number, bottom: number, widthDots: number, gap: number,
  options: PrintSymbolOptions, join: boolean, language: string): TextLine[] {
  if (!(options.hri ?? true) || !lines.length) return [];
  if (options.hriKey) lines = lines.slice(0, 1);
  const position = options.hriPosition ?? "below";
  if (position === "left" || position === "right") {
    throw new PrinterUnsupportedError(`${language} places the text below or above the symbol: beside it, the printer's font would set its width.`);
  }
  const t = hriTextDots(options.dpi, options.hriHeightMm);
  const step = Math.round(t * 1.4);
  const joined = (from: string[]) => (join && from.length ? [from.join("")] : from);
  const below = position === "below" ? joined(lines) : position === "split" ? [lines[0]!] : [];
  const above = position === "above" ? joined(lines) : position === "split" ? joined(lines.slice(1)) : [];
  const line = (text: string, y: number): TextLine => ({ x, y, width: widthDots, height: t, text });
  return [
    ...above.map((text, index) => line(text, top - gap - t - (above.length - 1 - index) * step)),
    ...below.map((text, index) => line(text, bottom + gap + index * step)),
  ];
}

/** A fixed-pitch bitmap font of the printer: its number and its cell at multiplier 1, in dots. */
export interface BitmapFont {
  name: string;
  width: number;
  height: number;
}

/**
 * The font and whole multiplier whose cell height comes closest to `heightDots` without passing it by more than a
 * tenth (a bitmap font cannot be scaled finely); the smallest font at multiplier 1 when none is that small.
 */
export function bitmapFontFor(fonts: readonly BitmapFont[], heightDots: number): { font: BitmapFont; multiplier: number } {
  let best = { font: fonts[0]!, multiplier: 1 };
  let bestHeight = 0;
  for (const font of fonts) {
    for (let multiplier = 1; multiplier <= 10; multiplier++) {
      const h = font.height * multiplier;
      if (h <= heightDots * 1.1 && h > bestHeight) {
        best = { font, multiplier };
        bestHeight = h;
      }
    }
  }
  return best;
}
