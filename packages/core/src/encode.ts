import bwipjs from "bwip-js";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

/**
 * A symbol as modules, independent of any output format: every exporter (SVG, PNG, PDF, the printer languages) draws
 * from this, so that all of them carry the same symbol and can be snapped to a printer's dot grid.
 *
 * - linear: `widths` alternate bar, space, bar… in modules, starting with a bar; quiet zones are not included.
 * - matrix: `rows` × `cols` modules, `dark[row * cols + col]`; quiet zones are not included.
 */
export type SymbolGeometry =
  | { kind: "linear"; symbology: SymbologyId; widths: number[] }
  | { kind: "matrix"; symbology: SymbologyId; rows: number; cols: number; dark: boolean[] };

export class EncodeError extends Error {}

/** Encodes `data` (see `Symbology.data`) and checks it on the way: GS1 syntax, check digits, lengths. */
export function encode(symbology: SymbologyId, data: string): SymbolGeometry {
  const { bcid, kind } = SYMBOLOGIES[symbology];
  let raw;
  try {
    raw = bwipjs.raw({ bcid, text: data })[0];
  } catch (error) {
    throw new EncodeError(String(error instanceof Error ? error.message : error));
  }
  if (!raw) throw new EncodeError("encoder returned nothing");
  if (kind === "linear") {
    if (!("sbs" in raw)) throw new EncodeError("encoder returned no bars");
    return { kind, symbology, widths: [...raw.sbs] };
  }
  if (!("pixs" in raw)) throw new EncodeError("encoder returned no modules");
  return { kind, symbology, rows: raw.pixy, cols: raw.pixx, dark: raw.pixs.map((pixel) => pixel === 1) };
}

/** The symbol's width in modules (without quiet zones). */
export function widthInModules(geometry: SymbolGeometry): number {
  return geometry.kind === "linear" ? geometry.widths.reduce((sum, width) => sum + width, 0) : geometry.cols;
}
