import { dotsWithin, MM_PER_INCH, snapToDots } from "./dots.ts";
import { encode, widthInModules, type QrMode, type SymbolGeometry } from "./encode.ts";
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
import { columnCell, designLabel, turnedRect, type DesignedLabel, type DesignPage } from "./design.ts";
import { logisticLabel, logisticPage, type LogisticLabel, type LogisticSize, type LogisticTwoD } from "./logistic.ts";
import { pictureBitmap, resample } from "./picture.ts";
import { joinPrintFiles, printFileBytes, PrinterUnsupportedError, type PrintFile, type PrintPage } from "./printers.ts";
import { eplLogisticLabel, eplPage } from "./epl.ts";
import { tsplPage } from "./tspl.ts";
import { dplPage } from "./dpl.ts";
import { gs1128FieldData, gs1128Modules, gs1128StackDots, zplLogisticLabel, zplPage, zplTextAbove, ZplUnsupportedError, type ZplLabelOptions } from "./zpl.ts";
import { parseElementString } from "./elementString.ts";
import { PRINTER_LANGUAGES, printLabel, printTestLabel, type PrinterLanguage } from "./printFile.ts";

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
  /** A QR code's one encoding mode (backlog 1.14), and its URI's scheme and domain in capitals for alphanumeric mode. */
  qrMode?: QrMode;
  qrUpperDomain?: boolean;
  /**
   * A GS1 Logistic Label rather than the symbol alone (backlog 4.1): its size and free text, GS1-128 at `spec`, and a 2D
   * symbol beside the middle block if asked for (QR at `error`).
   */
  logistic?: { size: LogisticSize; from: readonly string[]; to: readonly string[]; twoD?: LogisticTwoD };
  /** A label of one's own (backlog 4.2): barcodes and text blocks on a page, sized by `environment` and `table`. */
  page?: DesignPage;
  /** The symbol carries the GTIN alone (an EAN-13 chosen alone in step 2): the other element strings are left out. */
  gtinOnly?: boolean;
}

const TWO_D: SymbologyId[] = ["dl-qrcode", "gs1-qrcode", "dl-datamatrix", "gs1-datamatrix"];

export interface DrawnLabel {
  data: string;
  options: LabelOptions;
  layout: Layout;
  geometry: SymbolGeometry;
  /** A GS1 Logistic Label's own description, which its print file is written from (backlog 4.1). */
  logistic?: LogisticLabel;
  /** A label of one's own: where each element landed, what the scan test expects, what is wrong with the page. */
  designed?: DesignedLabel;
}

/**
 * The label of `identified` as `design` lays it out; an `InputError` when this data cannot be drawn so. In bulk, `cells`
 * (a row's cells by their column's header) fill a label of one's own's `{column}` fields.
 */
export function labelFor(identified: Identified, design: LabelDesign, font: HriFont, cells?: Readonly<Record<string, string>>): DrawnLabel {
  const { symbology } = design;
  if (design.page) {
    if (!design.page.elements.some((e) => e.kind === "symbol")) throw new InputError("A label of one's own needs a barcode: add one.");
    const designed = designLabel(design.page, identified, font, {
      environment: design.environment ?? "retail", ...(design.table ? { table: design.table } : {}), error: design.error, cells,
    });
    // The first barcode's geometry from the data it carries (an ITF-14 the GTIN alone, its element strings chosen)
    const first = designed.printer.symbols[0]!;
    return { data: identified.elementString, options: designed.options, layout: designed.layout, geometry: encode(first.options.symbology, first.data), designed };
  }
  if (design.logistic) {
    if (!design.spec) throw new InputError("A GS1 Logistic Label takes GS1-128 at its table's row.");
    const logistic = logisticLabel({
      elementString: identified.elementString, size: design.logistic.size, spec: design.spec,
      ...(design.table ? { table: design.table } : {}), percent: design.size, from: design.logistic.from, to: design.logistic.to,
      ...(design.logistic.twoD ? { twoD: { symbology: design.logistic.twoD, data: dataFor(design.logistic.twoD, identified), error: design.error } } : {}),
    }, font);
    return { data: identified.elementString, options: logistic.options, layout: logistic.layout, geometry: encode("gs1-128", logistic.parts.at(-1)!), logistic };
  }
  const shown = design.gtinOnly ? { ...identified, elements: identified.elements.filter((e) => e.ai === "01") } : identified;
  const encoded = dataFor(symbology, shown);
  // A URI's scheme and domain are not case-sensitive (RFC 3986), its path and query are: capitals only there
  const data = design.qrUpperDomain && symbology === "dl-qrcode" ? upperCaseDomain(encoded) : encoded;
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
    ...(design.qrMode && symbology === "dl-qrcode" ? { qrMode: design.qrMode } : {}),
    bearer: design.bearer, ...(design.reduction ? { barWidthReduction: design.reduction } : {}),
    ...(design.hriPosition && design.hriPosition !== "below" ? { hriPosition: design.hriPosition } : {}),
    ...(design.hriHeightMm ? { hriHeightMm: design.hriHeightMm } : {}),
  };
  const layout = layoutLabel(options, font);
  return { data, options, layout, geometry: geometryOf(options, layout) };
}

/** The symbol's modules as the encoder gives them; GS1-128 over several symbols: the first one's. */
function geometryOf(options: LabelOptions, layout: Layout): SymbolGeometry {
  const { symbology } = options;
  return encode(symbology, layout.parts?.[0] ?? options.data, symbology.endsWith("qrcode")
    ? { eclevel: (options.error ?? "m").toUpperCase() as "M", ...(options.version ? { version: options.version } : {}), ...(options.qrMode ? { mode: options.qrMode } : {}) }
    : {});
}

/** The modules of light before a symbol's first dark one, from the left and from the top. */
function leadingSpace(geometry: SymbolGeometry): [number, number] {
  if (geometry.kind === "linear") return [geometry.widths[0] === 0 ? geometry.widths[1]! : 0, 0];
  const { rows, cols, dark } = geometry;
  const col = Array.from({ length: cols }, (_, c) => c).find((c) => Array.from({ length: rows }, (_, r) => r).some((r) => dark[r * cols + c])) ?? 0;
  const row = Array.from({ length: rows }, (_, r) => r).find((r) => dark.slice(r * cols, (r + 1) * cols).some(Boolean)) ?? 0;
  return [col, row];
}

/**
 * A label of one's own in dots at `dpi` (backlog 4.2): each barcode placed and sized as the editor's symbol alone is
 * in a print file (`zplOptionsFor`), at the whole dots a module within its table's row nearest to the layout's (the
 * nearest when no row sizes it), its bars' top left corner where the page's layout puts them; each line of text at its
 * capitals' corner and height; each line and box with its edges at the nearest dots. A barcode whose bars, or a line or
 * box, would run past the label's edge is refused.
 */
export function printPageFor(designed: DesignedLabel, dpi: number): PrintPage {
  const dots = (mm: number) => Math.round((mm / MM_PER_INCH) * dpi);
  const widthDots = dots(designed.layout.width * designed.layout.xMm);
  const heightDots = dots(designed.layout.height * designed.layout.xMm);
  const symbols = designed.printer.symbols.map(({ xMm, yMm, rotation, data, options, layout }) => {
    const { symbology, spec } = options;
    const name = SYMBOLOGIES[symbology].name;
    let d = snapToDots(layout.xMm, dpi).dots;
    if (spec) {
      const choices = dotsWithin(spec.x[0], spec.x[2], dpi);
      if (!choices.length) throw new PrinterUnsupportedError(`A ${dpi} dpi printer cannot print the ${name} within its table's X-dimensions.`);
      d = choices.reduce((best, c) => (Math.abs(c.xMm - layout.xMm) < Math.abs(best.xMm - layout.xMm) - 1e-9 ? c : best)).dots;
    }
    const alone: LabelDesign = {
      symbology, hri: options.showHri ? "full" : "none", version: options.version ?? null, error: options.error ?? "m",
      ...(options.environment ? { environment: options.environment } : {}), size: options.size ?? 100, linear: "none", linearSize: null,
      ...(spec ? { spec, table: options.table } : {}), bearer: options.bearer ?? "frame", reduction: 0,
    };
    const geometry = geometryOf(options, layout);
    const { widthDots: boxWidth, heightDots: _, ...placement } = zplOptionsFor({ data, options, layout, geometry }, alone, dpi, d);
    // The bars' (or modules') top left corner in the layout, ITF-14's bearer bars left out; the printer's corner is
    // the symbol's, which starts with a space in GS1 DataBar (its left guard): that space's modules before it
    const [from, to] = layout.barRects && layout.barRects[1] > layout.barRects[0] ? layout.barRects : [0, layout.rects.length];
    const bars = layout.rects.slice(from, to);
    const [spaceLeft, spaceTop] = leadingSpace(geometry);
    // The symbol's own box in dots, upright: its box less a quiet zone (and frame) each side, its bars' or modules' height
    const width = boxWidth - 2 * placement.x;
    const height = geometry.kind === "matrix" && SYMBOLOGIES[symbology].kind === "matrix" ? geometry.rows * d : placement.barHeightDots;
    // Turned (backlog 4.2), the bars' box as the page turns it, its top left corner where the page puts it; the
    // printer language places its field from there (zpl.ts, zplTurnedField)
    const [bx, by] = [Math.min(...bars.map((r) => r[0])), Math.min(...bars.map((r) => r[1]))];
    const own = [bx, by, Math.max(...bars.map((r) => r[0] + r[2])) - bx, Math.max(...bars.map((r) => r[1] + r[3])) - by];
    const [rx, ry] = turnedRect(own, layout.width, layout.height, rotation);
    const x = dots(xMm + rx * layout.xMm) - (rotation === 0 ? spaceLeft * d : 0);
    const y = dots(yMm + ry * layout.xMm) - (rotation === 0 ? spaceTop * d : 0);
    const [right, bottom] = rotation === 90 || rotation === 270 ? [x + height, y + width] : [x + width, y + height];
    if (x < 0 || y < 0 || right > widthDots || bottom > heightDots) {
      throw new PrinterUnsupportedError(`The ${name} runs past the label's edge at ${d} dots a module: move it inside the label.`);
    }
    return { symbology, data, options: { ...placement, x, y, ...(rotation ? { turned: { rotation, width, height } } : {}) } };
  });
  const texts = designed.printer.texts.map((t) => ({
    x: dots(t.xMm), y: dots(t.yMm), heightDots: dots(t.heightMm), widthDots: Math.floor((t.widthMm / MM_PER_INCH) * dpi), text: t.text,
    ...(t.rotation ? { rotation: t.rotation } : {}),
  }));
  // Each line and box from the dots its edges round to, so that boxes side by side meet; its outline at least a dot
  const boxes = designed.printer.boxes.map((b) => {
    const [x, y] = [dots(b.xMm), dots(b.yMm)];
    const [width, height] = [Math.max(1, dots(b.xMm + b.widthMm) - x), Math.max(1, dots(b.yMm + b.heightMm) - y)];
    const narrow = Math.min(width, height);
    const thickness = b.thicknessMm >= Math.min(b.widthMm, b.heightMm) ? narrow : Math.min(narrow, Math.max(1, dots(b.thicknessMm)));
    if (x < 0 || y < 0 || x + width > widthDots || y + height > heightDots) {
      throw new PrinterUnsupportedError("A line or box runs past the label's edge: move it inside the label.");
    }
    return { x, y, width, height, thickness };
  });
  // Each image at the dots its edges round to, as a line or box is, each dot the picture's pixel under its centre
  const images = designed.printer.images.map((image) => {
    const [x, y] = [dots(image.xMm), dots(image.yMm)];
    const [width, height] = [Math.max(1, dots(image.xMm + image.widthMm) - x), Math.max(1, dots(image.yMm + image.heightMm) - y)];
    if (x < 0 || y < 0 || x + width > widthDots || y + height > heightDots) {
      throw new PrinterUnsupportedError("An image runs past the label's edge: move it inside the label.");
    }
    return { x, y, bitmap: resample(pictureBitmap(image.picture), width, height) };
  });
  return { widthDots, heightDots, dpi, symbols, texts, boxes, images };
}

/**
 * ZPL's placement of the label at `dpi`, with the printer's own commands (ADR 0002): a label just large enough for the
 * symbol, its quiet zones (the table's row's; GS1 DataBar has none, so two modules) and text; ITF-14's bearer bars as
 * the label has them, printed at ratio 3 (135 modules).
 */
export function zplOptionsFor(drawn: DrawnLabel, design: LabelDesign, dpi: number, dotsPerModule?: number): ZplLabelOptions {
  const { geometry, layout } = drawn;
  if (design.logistic) throw new ZplUnsupportedError("The GS1 Logistic Label has no ZPL template yet: its ZPL file prints it, or its PDF.");
  if (design.page) throw new ZplUnsupportedError("A label of one's own has no ZPL template yet: its ZPL file prints it, or its PDF.");
  // The whole dots a module takes: the printer profile's choice within the table's range (backlog 3.1), else the nearest
  const d = dotsPerModule ?? snapToDots(layout.xMm, dpi).dots;
  const linearKind = SYMBOLOGIES[design.symbology].kind !== "matrix";
  const quietZone = design.spec && typeof design.spec.quietZone !== "number"
    ? Math.max(2, ...design.spec.quietZone)
    : linearKind ? 10 : 2;
  const barHeightDots = Math.round((layout.barHeight ?? 50) * d);
  const symbolHeight = geometry.kind === "matrix" ? geometry.rows * d : barHeightDots;
  const itf = design.symbology === "itf14";
  const bearer = itf
    ? { kind: design.bearer, thicknessDots: design.bearer === "frame" ? Math.round((BEARER_FRAME_MM / 25.4) * dpi) : 2 * d }
    : undefined;
  const t = bearer?.thicknessDots ?? 0;
  const side = bearer?.kind === "frame" ? t : 0;
  // GS1-128 over several symbols: as wide as the widest, as high as the stack (backlog 1.13)
  const parts = layout.parts && layout.parts.length > 1 ? layout.parts : undefined;
  // GS1-128 as wide as ^BC prints it, which may take more codewords than the encoder chose
  const symbolWidth = itf ? 135
    : design.symbology === "gs1-128" ? Math.max(...(parts ?? [drawn.data]).map((part) => Math.max(widthInModules(encode("gs1-128", part)), gs1128Modules(gs1128FieldData(parseElementString(part))))))
    : widthInModules(geometry);
  // Text above the symbol (backlog 1.16): one line for the linear symbols, which join their element strings, one an
  // element string for GS1 DataMatrix
  const hri = {
    ...(design.hriPosition && design.hriPosition !== "below" ? { hriPosition: design.hriPosition } : {}),
    ...(design.hriHeightMm ? { hriHeightMm: design.hriHeightMm } : {}),
  };
  const lines = design.hri === "none" ? 0 : design.symbology === "gs1-datamatrix" ? Math.max(1, drawn.options.hriLines.length) : 1;
  const above = zplTextAbove({ ...hri, dpi, dotsPerModule: d }, lines);
  const stackAbove = parts && design.hriPosition === "split" ? (parts.length - 1) * zplTextAbove({ ...hri, dpi, dotsPerModule: d }, 1) : 0;
  return {
    ...hri,
    hri: design.hri !== "none", ...(design.hri === "key" ? { hriKey: true } : {}),
    x: quietZone * d + side, y: quietZone * d + t + above, dotsPerModule: d, barHeightDots, dpi,
    widthDots: (symbolWidth + 2 * quietZone) * d + 2 * side,
    heightDots: (parts ? (parts.length - 1) * gs1128StackDots({ barHeightDots, dotsPerModule: d, dpi, ...hri }) + stackAbove : 0) + above +
      symbolHeight + 2 * quietZone * d + 2 * t + 6 * Math.round(((design.hriHeightMm ?? 2.2) / 25.4) * dpi),
    ...(bearer ? { bearer } : {}),
    ...(parts ? { parts } : {}),
    ...(design.symbology === "dl-qrcode" ? { qrError: design.error.toUpperCase() as "L" | "M" | "Q" | "H", ...(design.qrMode ? { qrMode: design.qrMode } : {}) } : {}),
  };
}

/**
 * The label's print file in the printer's language at `dpi`, a module `dotsPerModule` whole dots (the nearest when not
 * given); with `notes`, the test label (backlog 3.1). The GS1 Logistic Label is written in ZPL and EPL2 (backlog 4.1),
 * and in TSPL and DPL as a page of their own (`logisticPage`) where their GS1-128 carries it (an SSCC alone), a
 * label of one's own in ZPL, EPL2, TSPL and DPL (backlog 4.2), each of its barcodes at its own whole dots a module: text, or
 * bytes when EPL2 or TSPL sends an image (GW, BITMAP).
 */
export function printFileFor(language: PrinterLanguage, drawn: DrawnLabel, design: LabelDesign, dpi: number, dotsPerModule?: number,
  notes?: readonly string[]): PrintFile {
  if (drawn.designed) {
    if (language === "epl2") return eplPage(printPageFor(drawn.designed, dpi), notes ? { notes } : {});
    if (language === "tspl") return tsplPage(printPageFor(drawn.designed, dpi), notes ? { notes } : {});
    if (language === "dpl") return dplPage(printPageFor(drawn.designed, dpi), notes ? { notes } : {});
    return zplPage(printPageFor(drawn.designed, dpi), notes ? { notes } : {});
  }
  if (drawn.logistic) {
    const d = dotsPerModule ?? snapToDots(drawn.layout.xMm, dpi).dots;
    if (language === "epl2") return eplLogisticLabel(drawn.logistic, dpi, d, notes ? { notes } : {});
    if (language === "tspl") return tsplPage(logisticPage(drawn.logistic, dpi, d), notes ? { notes } : {});
    if (language === "dpl") return dplPage(logisticPage(drawn.logistic, dpi, d), notes ? { notes } : {});
    return zplLogisticLabel(drawn.logistic, dpi, d, notes ? { notes } : {});
  }
  const options = zplOptionsFor(drawn, design, dpi, dotsPerModule);
  return notes ? printTestLabel(language, design.symbology, drawn.data, options, notes) : printLabel(language, design.symbology, drawn.data, options);
}

/** How wide the label's print file is, in dots at `dpi`: what a printer profile's print width is checked against. */
export function printWidthDots(drawn: DrawnLabel, design: LabelDesign, dpi: number, dotsPerModule?: number): number {
  return drawn.logistic || drawn.designed
    ? Math.round(((drawn.layout.width * drawn.layout.xMm) / 25.4) * dpi)
    : zplOptionsFor(drawn, design, dpi, dotsPerModule).widthDots;
}

// In bulk (backlog 2.4): every row's label from one design, in the files chosen, with a CSV of what was generated.

export type BatchFile = "svg" | "png" | "pdf" | "eps";

export interface BatchRow {
  /** The row's number in the file, as a spreadsheet numbers it. */
  row: number;
  identified?: Identified;
  /**
   * The row's cells by their column's header, for a label of one's own's `{column}` fields (`fillFields`) and the file
   * names' (`patternName`).
   */
  cells?: Record<string, string>;
  /** Why the row cannot be drawn (the Syntax Engine's message), or that it was skipped. */
  error?: string;
  skipped?: boolean;
}

export interface BatchRequest {
  design: LabelDesign;
  /** A file of each kind for every row. */
  files: readonly BatchFile[];
  /**
   * The files' names: `{row}`, `{symbol}`, `{key}` (the key's value), any AI in braces, such as `{01}` or `{10}`, and
   * any column's header, such as `{Produto}` (the row's cell).
   */
  pattern: string;
  /** One PDF with a label a page. */
  pdf: boolean;
  /** One PDF of label sheets, from the place `start` of the first sheet. */
  sheet?: { sheet: LabelSheet; start: number };
  /**
   * One print file with every label, at this printer resolution, a module this many whole dots (the nearest when not
   * given), in the printer's language (ZPL when not given).
   */
  zplDpi?: number;
  zplDots?: number;
  printLanguage?: PrinterLanguage;
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

/**
 * What is wrong with a name pattern, or null: an unknown name in braces. The spreadsheet's `columns` (its headers) are
 * names it knows, their case and surrounding spaces aside.
 */
export function patternProblem(pattern: string, columns: readonly string[] = []): string | null {
  if (!pattern.trim()) return "The pattern is empty.";
  const headers = new Set(columns.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const unknown = patternTokens(pattern).filter((t) =>
    !["row", "symbol", "key"].includes(t) && !/^\d{2,4}$/.test(t) && !headers.has(t.trim().toLowerCase()));
  if (!unknown.length) return null;
  const names = unknown.map((name) => "{" + name + "}").join(", ");
  return `Not a name the pattern knows: ${names}. Use {row}, {symbol}, {key}, an AI such as {01} or {10}, or a column's header such as {Produto}.`;
}

/**
 * A row's file name, without its extension: the pattern's names replaced, then made safe for a file system. A name that
 * is neither {row}, {symbol}, {key} nor an AI is a column's header: the row's cell under it (`columnCell`, from `cells`).
 * Letters lose their accents.
 */
export function patternName(pattern: string, row: number, symbology: SymbologyId, identified: Identified,
  cells?: Readonly<Record<string, string>>): string {
  const values = new Map(identified.elements.map((e) => [e.ai, e.value]));
  const name = pattern.replace(/\{([^{}]*)\}/g, (_, token: string) =>
    token === "row" ? String(row)
    : token === "symbol" ? symbology
    : token === "key" ? (identified.elements[0]?.value ?? "")
    : /^\d{2,4}$/.test(token) ? (values.get(token) ?? "")
    : (columnCell(cells, token) ?? ""));
  // Accents dropped first ("Feijão" → "Feijao"), as fileName keeps ASCII letters only
  return fileName(name.normalize("NFD").replace(/\p{M}/gu, "")).replace(/^[-_.]+|[-_.]+$/g, "") || `row-${row}`;
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
  const language = request.printLanguage ?? "zpl";
  const languageName = PRINTER_LANGUAGES[language].name;
  const drawn: { row: BatchRow; label?: DrawnLabel; error?: string; name?: string }[] = rows.map((row) => {
    if (row.skipped) return { row, error: "Skipped" };
    if (!row.identified) return { row, error: row.error ?? "Not checked" };
    try {
      const label = labelFor(row.identified, design, font, row.cells);
      const problem = request.sheet && fitsSheet(label.layout.width * label.layout.xMm, label.layout.height * label.layout.xMm, request.sheet.sheet);
      return problem ? { row, error: problem } : { row, label };
    } catch (error) {
      return { row, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const ready = drawn.filter((d) => d.label);
  const names = uniqueNames(ready.map((d) => patternName(request.pattern, d.row.row, design.symbology, d.row.identified!, d.row.cells)));
  ready.forEach((d, i) => (d.name = names[i]));

  const files: { name: string; bytes: Uint8Array }[] = [];
  const made = new Map<BatchRow, string[]>();
  const notes = new Map<BatchRow, string[]>();
  const note = (row: BatchRow, text: string) => notes.set(row, [...(notes.get(row) ?? []), text]);
  const zpl: PrintFile[] = [];
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
        zpl.push(printFileFor(language, d.label!, design, request.zplDpi, request.zplDots));
      } catch (error) {
        note(d.row, `${languageName}: ${error instanceof Error ? error.message : String(error)}`);
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
    const name = `${stem}_${request.zplDpi}dpi.${PRINTER_LANGUAGES[language].extension}`;
    files.push({ name, bytes: printFileBytes(joinPrintFiles(zpl)) });
    for (const d of ready) if (!notes.get(d.row)?.some((n) => n.startsWith(`${languageName}:`))) made.get(d.row)!.push(name);
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

/** A URI with its scheme and domain in capitals, which a QR code's alphanumeric mode can encode (backlog 1.14). */
export function upperCaseDomain(uri: string): string {
  return uri.replace(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)/i, (stem) => stem.toUpperCase());
}
