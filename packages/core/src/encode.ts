import bwipjs from "bwip-js";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

/**
 * A symbol as modules, independent of any output format: every exporter (SVG, PNG, PDF, the printer languages) draws
 * from this, so that all of them carry the same symbol and can be snapped to a printer's dot grid.
 *
 * - linear: `widths` alternate bar, space, bar… in modules, starting with a bar; quiet zones are not included.
 * - matrix: `rows` × `cols` modules, `dark[row * cols + col]`; quiet zones are not included. A stacked GS1 DataBar is
 *   one too, its rows of bars and separator patterns at their least heights (`stackedRows()`).
 */
export type SymbolGeometry =
  | { kind: "linear"; symbology: SymbologyId; widths: number[] }
  | { kind: "matrix"; symbology: SymbologyId; rows: number; cols: number; dark: boolean[] };

export class EncodeError extends Error {}

/** QR code options: the error correction level, exactly as chosen (never raised), and a version (1–40). */
export interface EncodeOptions {
  eclevel?: "L" | "M" | "Q" | "H";
  version?: number;
}

/** Encodes `data` (see `Symbology.data`) and checks it on the way: GS1 syntax, check digits, lengths. */
export function encode(symbology: SymbologyId, data: string, options: EncodeOptions = {}): SymbolGeometry {
  const { bcid, kind } = SYMBOLOGIES[symbology];
  const extra: Record<string, string> = {};
  if (options.eclevel) extra.eclevel = options.eclevel;
  if (options.version) extra.version = String(options.version);
  let raw;
  try {
    raw = bwipjs.raw({ bcid, text: data, ...extra })[0];
  } catch (error) {
    throw new EncodeError(String(error instanceof Error ? error.message : error));
  }
  if (!raw) throw new EncodeError("encoder returned nothing");
  if (kind === "linear") {
    if (!("sbs" in raw)) throw new EncodeError("encoder returned no bars");
    return { kind, symbology, widths: [...raw.sbs] };
  }
  if (!("pixs" in raw)) throw new EncodeError("encoder returned no modules");
  const dark = raw.pixs.map((pixel) => pixel === 1);
  if (kind === "matrix") return { kind, symbology, rows: raw.pixy, cols: raw.pixx, dark };
  // A stacked symbol comes as its distinct rows, one module high each: each is repeated to its height.
  const heights = stackedRows(symbology, dark.length / raw.pixx);
  const rows = heights.flatMap((height, row) => Array.from({ length: height }, () => dark.slice(row * raw.pixx, (row + 1) * raw.pixx)));
  if (rows.length !== raw.pixy) throw new EncodeError(`${symbology}: ${rows.length} rows of modules, the encoder says ${raw.pixy}`);
  return { kind: "matrix", symbology, rows: rows.length, cols: raw.pixx, dark: rows.flat() };
}

/**
 * The heights in modules of a stacked GS1 DataBar's rows, as ISO/IEC 24724 gives their least: GS1 DataBar Stacked, a
 * row of 5 and one of 7 with a separator of 1 between them; GS1 DataBar Stacked Omnidirectional, rows of 33, and GS1
 * DataBar Expanded Stacked, rows of 34, with a separator pattern three modules high (three rows of 1) between them.
 */
export function stackedRows(symbology: SymbologyId, distinct: number): number[] {
  if (symbology === "databar-stacked") return [5, 1, 7];
  const row = symbology === "databar-stacked-omni" ? 33 : 34;
  return Array.from({ length: distinct }, (_, index) => (index % 4 === 0 ? row : 1));
}

/** The symbol's width in modules (without quiet zones). */
export function widthInModules(geometry: SymbolGeometry): number {
  return geometry.kind === "linear" ? geometry.widths.reduce((sum, width) => sum + width, 0) : geometry.cols;
}
