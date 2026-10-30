import { snapToDots } from "./dots.ts";
import { encode, widthInModules, type SymbolGeometry } from "./encode.ts";
import type { HriFont } from "./hri.ts";
import type { Identified } from "./identify.ts";
import { labelSvg, layoutLabel, BEARER_FRAME_MM, type Bearer, type ErrorLevel, type HriPosition, type LabelOptions, type Layout } from "./layout.ts";
import { symbolFor } from "./linear.ts";
import type { SymbolSpecification } from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { dataFor, InputError } from "./syntax.ts";
import { utf8 } from "./deflate.ts";
import { labelEps } from "./eps.ts";
import { labelPdf, pdfContent, pdfDocument } from "./pdf.ts";
import { labelPng, pngAt } from "./png.ts";
import { toDelimited } from "./report.ts";
import { fitsSheet, sheetPages, type LabelSheet } from "./sheets.ts";
import { fileName, zipArchive } from "./zip.ts";
import { zplLabel, ZplUnsupportedError, type ZplLabelOptions } from "./zpl.ts";

// One label designed once and drawn for any identification (backlog 2.4): the editor's label for the code typed or
// the row shown, and in bulk the same design for every row. What the design does not decide comes from the row.

export interface LabelDesign {
  symbology: SymbologyId;
  /** Human readable text: every element string, the key's alone, or none. */
  hri: "full" | "key" | "none";
  version: number | null;
  error: ErrorLevel;
  /** The scanning environment that sizes the symbol, when no table's row does. */
  environment?: string;
  /** Percentage of the environment's target X-dimension, or of the row's `baseX()`. */
  size: number;
  /** An EAN/UPC beside a 2D symbol: as the GTIN takes, UPC-E, or none. */
  linear: "none" | "auto" | "upce";
  linearSize: number | null;
  spec?: SymbolSpecification;
  table?: number;
  bearer: Bearer;
  /** Bar width reduction in mm; 0 for none. */
  reduction: number;
  /** Where the human readable text goes and its height in mm (backlog 1.16); below and 2.2 mm when not given. */
  hriPosition?: HriPosition;
  hriHeightMm?: number;
  /** GS1-128 over several symbols: the element strings that start a symbol; as many as fit in each when not given. */
  gs1128Starts?: readonly number[];
  /** The symbol carries the GTIN alone (an EAN-13 chosen alone in step 2): the other element strings are left out. */
  gtinOnly?: boolean;
}

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];

export interface DrawnLabel {
  data: string;
  options: LabelOptions;
  layout: Layout;
  geometry: SymbolGeometry;
}

/** The label of `identified` as `design` lays it out; an `InputError` when this data cannot be drawn so. */
export function labelFor(identified: Identified, design: LabelDesign, font: HriFont): DrawnLabel {
  const { symbology } = design;
  const shown = design.gtinOnly ? { ...identified, elements: identified.elements.filter((e) => e.ai === "01") } : identified;
  const data = dataFor(symbology, shown);
  const lines = shown.elements.map((e) => `(${e.ai})${e.value}`);
  const twoD = TWO_D.includes(symbology);
  let linear: LabelOptions["linear"] = null;
  if (twoD && design.linear !== "none") {
    const gtin = shown.elements.find((e) => e.ai === "01")?.value;
    if (!gtin) throw new InputError("A linear barcode beside the 2D symbol needs a GTIN (01).");
    try {
      linear = symbolFor(gtin, design.linear);
    } catch {
      throw new InputError(
        design.linear === "upce"
          ? "UPC-E is only for a GTIN-12 that zero-suppresses."
          : "An EAN/UPC is only for GTINs of consumer units (indicator 0).",
      );
    }
  }
  const options: LabelOptions = {
    symbology, data, showHri: design.hri !== "none", hriLines: design.hri === "key" ? lines.slice(0, 1) : lines,
    version: design.version, error: design.error, environment: design.environment, size: design.size, linear,
    linearSize: twoD ? design.linearSize : null, ...(design.spec ? { spec: design.spec, table: design.table } : {}),
    ...(design.gs1128Starts ? { gs1128Starts: design.gs1128Starts } : {}),
    bearer: design.bearer, ...(design.reduction ? { barWidthReduction: design.reduction } : {}),
    ...(design.hriPosition && design.hriPosition !== "below" ? { hriPosition: design.hriPosition } : {}),
    ...(design.hriHeightMm ? { hriHeightMm: design.hriHeightMm } : {}),
  };
  const layout = layoutLabel(options, font);
  // GS1-128 over several symbols: the first one's geometry
  const geometry = encode(symbology, layout.parts?.[0] ?? data, symbology.endsWith("qrcode")
    ? { eclevel: design.error.toUpperCase() as "M", ...(layout.version ? { version: layout.version } : {}) }
    : {});
  return { data, options, layout, geometry };
}

/**
 * ZPL's placement of the label at `dpi`, with the printer's own commands (ADR 0002): a label just large enough for the
 * symbol, its quiet zones (the table's row's; GS1 DataBar has none, so two modules) and text; ITF-14's bearer bars as
 * the label has them, printed at ratio 3 (135 modules).
 */
export function zplOptionsFor(drawn: DrawnLabel, design: LabelDesign, dpi: number): ZplLabelOptions {
  const { geometry, layout } = drawn;
  if (layout.parts && layout.parts.length > 1) {
    throw new ZplUnsupportedError(`GS1-128 in ${layout.parts.length} symbols is not written in ZPL yet: it comes with the label layout of 3.2.`);
  }
  const d = snapToDots(layout.xMm, dpi).dots;
  const linearKind = SYMBOLOGIES[design.symbology].kind !== "matrix";
  const quietZone = design.spec && typeof design.spec.quietZone !== "number"
    ? Math.max(2, ...design.spec.quietZone)
    : linearKind ? 10 : 2;
  const barHeightDots = Math.round((layout.barHeight ?? 50) * d);
  const textDots = Math.round((2.2 / 25.4) * dpi);
  const symbolHeight = geometry.kind === "matrix" ? geometry.rows * d : barHeightDots;
  const itf = design.symbology === "itf14";
  const bearer = itf
    ? { kind: design.bearer, thicknessDots: design.bearer === "frame" ? Math.round((BEARER_FRAME_MM / 25.4) * dpi) : 2 * d }
    : undefined;
  const t = bearer?.thicknessDots ?? 0;
  const side = bearer?.kind === "frame" ? t : 0;
  const symbolWidth = itf ? 135 : widthInModules(geometry);
  return {
    x: quietZone * d + side, y: quietZone * d + t, dotsPerModule: d, barHeightDots, dpi,
    widthDots: (symbolWidth + 2 * quietZone) * d + 2 * side,
    heightDots: symbolHeight + 2 * quietZone * d + 2 * t + 6 * textDots,
    ...(bearer ? { bearer } : {}),
  };
}

// In bulk (backlog 2.4): every row's label from one design, in the files chosen, with a CSV of what was generated.

export type BatchFile = "svg" | "png" | "pdf" | "eps";

export interface BatchRow {
  /** The row's number in the file, as a spreadsheet numbers it. */
  row: number;
  identified?: Identified;
  /** Why the row cannot be drawn (the Syntax Engine's message), or that it was skipped. */
  error?: string;
  skipped?: boolean;
}

export interface BatchRequest {
  design: LabelDesign;
  /** A file of each kind for every row. */
  files: readonly BatchFile[];
  /** The files' names: `{row}`, `{symbol}`, `{key}` (the key's value) and any AI in braces, such as `{01}` or `{10}`. */
  pattern: string;
  /** One PDF with a label a page. */
  pdf: boolean;
  /** One PDF of label sheets, from the place `start` of the first sheet. */
  sheet?: { sheet: LabelSheet; start: number };
  /** One ZPL file with every label, at this printer resolution. */
  zplDpi?: number;
  /** The PNG's resolution; none: the one at which it prints at the label's size. */
  pngResolution?: number | null;
  /** The SVG's text as text rather than outlines. */
  hriAsText?: boolean;
}

export interface BatchResult {
  zip: Uint8Array<ArrayBuffer>;
  generated: number;
  /** Rows not generated: skipped or in error (their reasons are in the CSV). */
  left: number;
  csv: string;
}

export const DEFAULT_PATTERN = "{symbol}_{key}_{row}";

/** The names a pattern may hold, for the screen's hint. */
export function patternTokens(pattern: string): string[] {
  return [...pattern.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
}

/** What is wrong with a name pattern, or null: an unknown name in braces. */
export function patternProblem(pattern: string): string | null {
  if (!pattern.trim()) return "The pattern is empty.";
  const unknown = patternTokens(pattern).filter((t) => !["row", "symbol", "key"].includes(t) && !/^\d{2,4}$/.test(t));
  return unknown.length
    ? `Not a name the pattern knows: ${unknown.map((t) => `{${t}}`).join(", ")}. Use {row}, {symbol}, {key} or an AI such as {01} or {10}.`
    : null;
}

/** A row's file name, without its extension: the pattern's names replaced, then made safe for a file system. */
export function patternName(pattern: string, row: number, symbology: SymbologyId, identified: Identified): string {
  const values = new Map(identified.elements.map((e) => [e.ai, e.value]));
  const name = pattern.replace(/\{([^{}]*)\}/g, (_, token: string) =>
    token === "row" ? String(row)
    : token === "symbol" ? symbology
    : token === "key" ? (identified.elements[0]?.value ?? "")
    : (values.get(token) ?? ""));
  return fileName(name).replace(/^[-_.]+|[-_.]+$/g, "") || `row-${row}`;
}

/** Names made unique in their order: a name seen before gets "-2", "-3"…. */
function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  const taken = new Set(names);
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    let n = count;
    while (taken.has(`${name}-${n}`)) n++;
    const unique = `${name}-${n}`;
    taken.add(unique);
    return unique;
  });
}

/**
 * Every row's label as the request asks, in one zip: the files of each row, the label-a-page PDF, the label sheets, the
 * ZPL file, and `generated.csv` listing each row, what was made of it, or why nothing was. Rows skipped or in error
 * are left out and named in the CSV, as are rows the design cannot draw (data its symbol cannot carry, a label larger
 * than the sheet's).
 */
export async function generateBatch(rows: readonly BatchRow[], request: BatchRequest, font: HriFont,
  onProgress?: (done: number, total: number) => void): Promise<BatchResult> {
  const { design } = request;
  const drawn: { row: BatchRow; label?: DrawnLabel; error?: string; name?: string }[] = rows.map((row) => {
    if (row.skipped) return { row, error: "Skipped" };
    if (!row.identified) return { row, error: row.error ?? "Not checked" };
    try {
      const label = labelFor(row.identified, design, font);
      const problem = request.sheet && fitsSheet(label.layout.width * label.layout.xMm, label.layout.height * label.layout.xMm, request.sheet.sheet);
      return problem ? { row, error: problem } : { row, label };
    } catch (error) {
      return { row, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const ready = drawn.filter((d) => d.label);
  const names = uniqueNames(ready.map((d) => patternName(request.pattern, d.row.row, design.symbology, d.row.identified!)));
  ready.forEach((d, i) => (d.name = names[i]));

  const files: { name: string; bytes: Uint8Array }[] = [];
  const made = new Map<BatchRow, string[]>();
  const notes = new Map<BatchRow, string[]>();
  const note = (row: BatchRow, text: string) => notes.set(row, [...(notes.get(row) ?? []), text]);
  const zpl: string[] = [];
  let done = 0;
  for (const d of ready) {
    const { options, layout } = d.label!;
    const own: string[] = [];
    for (const kind of request.files) {
      const name = `${d.name}.${kind}`;
      let bytes: Uint8Array;
      if (kind === "svg") bytes = utf8(labelSvg(options, layout, font, request.hriAsText));
      else if (kind === "png") {
        const at = request.pngResolution ? pngAt(layout, request.pngResolution) : null;
        bytes = at ? await labelPng(layout, font, at.pixelsPerModule, at.dpi) : await labelPng(layout, font);
      } else if (kind === "pdf") bytes = await labelPdf(options, layout, font);
      else bytes = utf8(labelEps(options, layout, font));
      files.push({ name, bytes });
      own.push(name);
    }
    if (request.zplDpi) {
      try {
        zpl.push(zplLabel(design.symbology, d.label!.data, zplOptionsFor(d.label!, design, request.zplDpi)));
      } catch (error) {
        note(d.row, `ZPL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    made.set(d.row, own);
    onProgress?.(++done, ready.length);
  }
  const stem = `labels_${design.symbology}`;
  const layouts = ready.map((d) => d.label!.layout);
  if (request.pdf && ready.length) {
    const name = `${stem}.pdf`;
    files.push({ name, bytes: await pdfDocument(layouts.map((layout) => pdfContent(layout, font)), `${ready.length} labels`) });
    for (const d of ready) made.get(d.row)!.push(name);
  }
  if (request.sheet && ready.length) {
    const { sheet, start } = request.sheet;
    const name = `${stem}_${fileName(sheet.id)}.pdf`;
    files.push({ name, bytes: await pdfDocument(sheetPages(layouts, sheet, font, start), `${ready.length} labels on ${sheet.name}`) });
    for (const d of ready) made.get(d.row)!.push(name);
  }
  if (request.zplDpi && zpl.length) {
    const name = `${stem}_${request.zplDpi}dpi.zpl`;
    files.push({ name, bytes: utf8(zpl.join("\n")) });
    for (const d of ready) if (!notes.get(d.row)?.some((n) => n.startsWith("ZPL:"))) made.get(d.row)!.push(name);
  }
  const csv = toDelimited([
    ["Row", "Status", "Files", "GS1 element string", "GS1 Digital Link URI", "Reason"],
    ...drawn.map((d) => [
      String(d.row.row),
      d.label ? "generated" : d.row.skipped ? "skipped" : "error",
      (made.get(d.row) ?? []).join("; "),
      d.row.identified?.elementString ?? "",
      d.row.identified?.digitalLinkUri ?? "",
      [d.error ?? "", ...(notes.get(d.row) ?? [])].filter(Boolean).join("; "),
    ]),
  ]);
  files.push({ name: "generated.csv", bytes: utf8(csv) });
  return { zip: await zipArchive(files), generated: ready.length, left: drawn.length - ready.length, csv };
}
