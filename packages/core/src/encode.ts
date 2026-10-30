import bwipjs from "bwip-js";
import { create as createQr, type QRCodeSegment } from "qrcode";
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

/** QR Code's encoding modes (ISO/IEC 18004), for the whole data (backlog 1.14). */
export const QR_MODES = ["numeric", "alphanumeric", "byte"] as const;
export type QrMode = (typeof QR_MODES)[number];

/** Each mode's characters: digits; digits, upper case letters, space and $ % * + - . / :; any byte. */
const QR_MODE_CHARACTERS: Record<QrMode, RegExp> = { numeric: /^[0-9]*$/, alphanumeric: /^[0-9A-Z $%*+\-./:]*$/, byte: /^/ };

/**
 * QR code options: the error correction level, exactly as chosen (never raised), a version (1–40), and one encoding
 * mode for the whole data; without one the encoder mixes modes for the smallest symbol.
 */
export interface EncodeOptions {
  eclevel?: "L" | "M" | "Q" | "H";
  version?: number;
  mode?: QrMode;
}

/** The first character a mode cannot encode, or null. */
export function qrModeProblem(data: string, mode: QrMode): string | null {
  if (QR_MODE_CHARACTERS[mode].test(data)) return null;
  const bad = [...data].find((char) => !QR_MODE_CHARACTERS[mode].test(char))!;
  return `QR Code's ${mode} mode cannot encode “${bad}”: it takes ${mode === "numeric" ? "digits only" : "digits, capital letters, space and $ % * + - . / : only"}.`;
}

// The last symbols encoded, by symbology, data and options: a label encodes its symbol once to lay it out and once more
// for its files, and bulk generation does so for every row (backlog 2.5). Each caller gets its own copy.
const RECENT = new Map<string, SymbolGeometry>();
const RECENT_MAX = 32;

/** Encodes `data` (see `Symbology.data`) and checks it on the way: GS1 syntax, check digits, lengths. */
export function encode(symbology: SymbologyId, data: string, options: EncodeOptions = {}): SymbolGeometry {
  const key = `${symbology}\u0000${data}\u0000${options.eclevel ?? ""}\u0000${options.version ?? ""}\u0000${options.mode ?? ""}`;
  let geometry = RECENT.get(key);
  if (!geometry) {
    geometry = encodeNow(symbology, data, options);
    RECENT.set(key, geometry);
    if (RECENT.size > RECENT_MAX) RECENT.delete(RECENT.keys().next().value!);
  }
  return geometry.kind === "linear" ? { ...geometry, widths: [...geometry.widths] } : { ...geometry, dark: [...geometry.dark] };
}

function encodeNow(symbology: SymbologyId, data: string, options: EncodeOptions): SymbolGeometry {
  if (options.mode) return encodeQrMode(symbology, data, options);
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
 * A QR code with a GS1 Digital Link URI in one encoding mode (backlog 1.14), through node-qrcode, which takes segments
 * (bwip-js chooses its own). Not for GS1 QR Code, whose FNC1 node-qrcode does not write.
 */
function encodeQrMode(symbology: SymbologyId, data: string, options: EncodeOptions): SymbolGeometry {
  if (symbology !== "dl-qrcode") throw new EncodeError(`an encoding mode is chosen for a QR code with a GS1 Digital Link URI only, not ${symbology}`);
  const mode = options.mode!;
  const problem = qrModeProblem(data, mode);
  if (problem) throw new EncodeError(problem);
  let qr;
  try {
    qr = createQr([{ data, mode } as QRCodeSegment], { errorCorrectionLevel: options.eclevel ?? "M", ...(options.version ? { version: options.version } : {}) });
  } catch (error) {
    // Worded so that the layout knows the data does not fit, as with bwip-js
    throw new EncodeError(`data too long: ${error instanceof Error ? error.message : String(error)}`);
  }
  const size = qr.modules.size;
  return { kind: "matrix", symbology, rows: size, cols: size, dark: Array.from(qr.modules.data, (dark) => dark === 1) };
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
