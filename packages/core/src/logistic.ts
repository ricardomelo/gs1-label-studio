import { aiEntry } from "./dictionary.ts";
import { parseElementString, type Element } from "./elementString.ts";
import { encode, widthInModules } from "./encode.ts";
import { GS1_128_MAX_MM, splitGs1128 } from "./gs1128.ts";
import type { HriFont } from "./hri.ts";
import { layoutLabel, symbolMatrix, type ErrorLevel, type LabelOptions, type LabelText, type Layout } from "./layout.ts";
import { baseX, specificationFor, specSizesFor, type SymbolSpecification } from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";

// The GS1 Logistic Label (backlog 4.1; General Specifications 26.0, section 6.6): a page of A6 or 4 × 6 inches with
// its building blocks from the top — free text (who sends, who receives), text with data titles, and at the bottom the
// GS1-128 symbols with their text, the one carrying the SSCC lowest. Laid out as one Layout in units of the symbols'
// X-dimension, so that the SVG, PNG, PDF and EPS draw it as they draw a symbol. A 2D symbol, if asked for, goes to the
// right of the middle block (6.6.3.1, 6.6.4.1.1).

/** Section 6.6.4.5's sizes: A6 and 4 × 6 inches for an SSCC and a little more, A5 and 6 × 8 inches for more data. */
export const LOGISTIC_SIZES = {
  a6: { name: "A6", widthMm: 105, heightMm: 148 },
  "4x6": { name: "4 × 6 in", widthMm: 101.6, heightMm: 152.4 },
  a5: { name: "A5", widthMm: 148, heightMm: 210 },
  "6x8": { name: "6 × 8 in", widthMm: 152.4, heightMm: 203.2 },
} as const;
export type LogisticSize = keyof typeof LOGISTIC_SIZES;

const MARGIN_MM = 4;
const NARROW_MARGIN_MM = 2; // a line of data content too wide for MARGIN_MM: an SSCC at 7 mm is 96 mm, a 4 × 6 in label 101.6
const FREE_TEXT_MM = 3.5; // 6.6.4.4: no less than 3 mm
const DATA_TITLE_MM = 2.5;
const DATA_CONTENT_MM = 7; // 6.6.4.2: at least 7 mm
const HRI_MM = 3; // 4.14, rule 5c: no less than 3 mm on a GS1 Logistic Label
const RULE_MM = 0.3; // the lines between the building blocks
const BLOCK_GAP_MM = 3;
const TWO_D_GAP_MM = 3; // between the middle block's text and the 2D symbol's quiet zone

/**
 * The 2D symbols table 5 allows beside the GS1-128: GS1 DataMatrix with the element string, and a QR code or a Data
 * Matrix with its GS1 Digital Link URI (GS1 QR Code is not offered: ADR 0003).
 */
export const LOGISTIC_TWO_D = ["gs1-datamatrix", "dl-qrcode", "dl-datamatrix"] as const satisfies readonly SymbologyId[];
export type LogisticTwoD = (typeof LOGISTIC_TWO_D)[number];

export interface LogisticInput {
  /** The element string the label carries, its SSCC (00) among them. */
  elementString: string;
  size: LogisticSize;
  /** GS1-128's row of its table (table 5 for an SSCC) and the size, a percentage of the row's base X-dimension. */
  spec: SymbolSpecification;
  table?: number;
  percent: number;
  /** The top block's free text: who sends it, who receives it; a line an entry. */
  from?: readonly string[];
  to?: readonly string[];
  /**
   * A 2D symbol to the right of the middle block: what it carries (`dataFor()`: the element string, or the GS1 Digital
   * Link URI) and, for a QR code, its error correction level (M when not given). Sized by table 5's row for it, at the
   * same percentage of that row's target as GS1-128 of its own: 0.743 mm at 100 %.
   */
  twoD?: { symbology: LogisticTwoD; data: string; error?: ErrorLevel };
}

/** A line of the label's own text (not a symbol's): its left edge and its capitals' top, in the label's units. */
export interface LogisticText {
  text: string;
  x: number;
  top: number;
  /** Its capitals' height in mm. */
  heightMm: number;
  /** Its width in the layout's font, in the label's units: the room a printer's own font must keep within. */
  width: number;
}

export interface LogisticLabel {
  layout: Layout;
  /** What the files' descriptions take: GS1-128 at its row, the whole element string as data. */
  options: LabelOptions;
  /** The GS1-128 symbols' element strings, from the top; the SSCC's last. */
  parts: string[];
  /**
   * What a printer language needs to write the label with its own commands (backlog 3.2): each symbol's bars' top left
   * corner, its bar height, the label's own text and the rules between the blocks, in the label's units.
   */
  printer: {
    symbols: { part: string; x: number; y: number }[];
    barHeight: number;
    texts: LogisticText[];
    rules: [number, number, number, number][];
    /** The 2D symbol: its top left module's corner, its modules a side and their size in the label's units. */
    twoD?: {
      symbology: LogisticTwoD; data: string; error: ErrorLevel; x: number; y: number; modules: number; module: number; version: number | null;
      /** Table 5's range for its X-dimension, in mm: a printer's whole dots are chosen within it. */
      rangeMm: readonly [number, number];
    };
  };
}

/** The label's GS1-128 symbols, from the top: the other element strings as they fit, then the SSCC alone at the bottom. */
function symbols(elements: Element[], fits: (part: string) => boolean): string[] {
  const text = (list: Element[]) => list.map((e) => `(${e.ai})${e.value}`).join("");
  const sscc = elements.filter((e) => e.ai === "00");
  const others = elements.filter((e) => e.ai !== "00");
  return [...(others.length ? splitGs1128(text(others), undefined, fits) : []), text(sscc)];
}

/** The GS1 Logistic Label of an element string with an SSCC; a `RangeError` when it has none or does not fit the page. */
export function logisticLabel(input: LogisticInput, font: HriFont): LogisticLabel {
  const elements = parseElementString(input.elementString);
  if (!elements.some((e) => e.ai === "00")) throw new RangeError("A GS1 Logistic Label needs an SSCC (00): it is its one mandatory element.");
  if (!specSizesFor(input.spec, [input.percent]).length) throw new RangeError(`${input.percent} % is outside the table's range for GS1-128.`);
  const page = LOGISTIC_SIZES[input.size];
  const base = { symbology: "gs1-128" as const, showHri: true, spec: input.spec, ...(input.table ? { table: input.table } : {}), size: input.percent, hriHeightMm: HRI_MM };
  // Each symbol as the editor lays it out; the first one's X-dimension is the page's unit
  const xMm = layoutLabel({ ...base, data: `(${elements[0]!.ai})${elements[0]!.value}`, hriLines: [] }, font).xMm;
  const u = (mm: number) => mm / xMm;
  const quiet = typeof input.spec.quietZone === "number" ? [input.spec.quietZone, input.spec.quietZone] : input.spec.quietZone;
  const room = page.widthMm - 2; // the quiet zones are white already: a millimetre of the page on each side
  const fits = (part: string) => (quiet[0]! + widthInModules(encode("gs1-128", part)) + quiet[1]!) * xMm <= Math.min(room, GS1_128_MAX_MM) + 1e-9;
  const parts = symbols(elements, fits);
  const layouts = parts.map((part) => layoutLabel({ ...base, data: part, hriLines: parseElementString(part).map((e) => `(${e.ai})${e.value}`) }, font));
  for (const [index, l] of layouts.entries()) {
    if (l.width * l.xMm > page.widthMm + 1e-9) {
      throw new RangeError(`The GS1-128 of ${parts[index]} is ${(l.width * l.xMm).toFixed(1)} mm wide with its quiet zones, wider than the ${page.name} label: choose a smaller size.`);
    }
  }

  const width = u(page.widthMm);
  const height = u(page.heightMm);
  const rects: [number, number, number, number][] = [];
  const texts: LabelText[] = [];
  const own: LogisticText[] = [];
  const rules: [number, number, number, number][] = [];
  const em = (mm: number) => (u(mm) * font.unitsPerEm) / font.capHeight;
  const text = (value: string, x: number, top: number, mm: number) => {
    const w = font.textWidth(value, em(mm));
    texts.push({ text: value, x, baseline: top + u(mm), em: em(mm), linear: false });
    own.push({ text: value, x, top, heightMm: mm, width: w });
    return w;
  };
  const rule = (y: number) => {
    rects.push([0, y, width, u(RULE_MM)]);
    rules.push([0, y, width, u(RULE_MM)]);
  };

  // Bottom block, from the bottom up: the SSCC's symbol lowest (6.6.4.1.1), each centred
  let bottom = height - u(MARGIN_MM);
  const placed: [number, number][] = [];
  for (let i = layouts.length - 1; i >= 0; i--) {
    const l = layouts[i]!;
    const top = bottom - l.height;
    placed[i] = [(width - l.width) / 2, top];
    bottom = top;
  }
  const bottomTop = bottom;
  const bars: LogisticLabel["printer"]["symbols"] = [];
  for (const [i, l] of layouts.entries()) {
    const [dx, dy] = placed[i]!;
    for (const [x, y, w, h] of l.rects) rects.push([x + dx, y + dy, w, h]);
    for (const t of l.texts) texts.push({ ...t, x: t.x + dx, baseline: t.baseline + dy });
    // The bars' top left corner: the first bar's left edge (a bar width reduction narrows bars, not the first's start)
    bars.push({ part: parts[i]!, x: Math.min(...l.rects.map((r) => r[0])) + dx, y: Math.min(...l.rects.map((r) => r[1])) + dy });
  }
  const symbolRects = rects.length;

  // Top block: who sends it and who receives it, side by side
  let y = u(MARGIN_MM);
  const from = (input.from ?? []).map((l) => l.trim()).filter(Boolean);
  const to = (input.to ?? []).map((l) => l.trim()).filter(Boolean);
  if (from.length || to.length) {
    const column = (title: string, lines: string[], x: number) => {
      let cy = y;
      if (!lines.length) return cy;
      text(title, x, cy, DATA_TITLE_MM);
      cy += u(DATA_TITLE_MM * 1.6);
      for (const line of lines) {
        text(line, x, cy, FREE_TEXT_MM);
        cy += u(FREE_TEXT_MM * 1.5);
      }
      return cy;
    };
    y = Math.max(column("FROM", from, u(MARGIN_MM)), column("TO", to, width / 2)) + u(BLOCK_GAP_MM / 2);
    rule(y);
    y += u(BLOCK_GAP_MM);
  }

  // Middle block: each element string's data title above its content, as many on a row as fit (6.6.4.2, 6.6.4.3)
  const items = elements.map((e) => {
    const title = aiEntry(e.ai)?.title ?? `AI (${e.ai})`;
    // A content wider than the page with its margins takes narrower margins, and a smaller height only when even they fail
    const room = width - 2 * u(NARROW_MARGIN_MM);
    const content = Math.min(DATA_CONTENT_MM, (DATA_CONTENT_MM * room) / font.textWidth(e.value, em(DATA_CONTENT_MM)));
    return { title, value: e.value, content, w: Math.max(font.textWidth(title, em(DATA_TITLE_MM)), font.textWidth(e.value, em(content))) };
  });
  // The block's left edge: the margin, or as far left as its widest line needs
  const left = Math.max(u(NARROW_MARGIN_MM), Math.min(u(MARGIN_MM), width - u(NARROW_MARGIN_MM) - Math.max(...items.map((i) => i.w))));
  const right = width - left;
  const rowHeight = u(DATA_TITLE_MM * 1.6 + DATA_CONTENT_MM * 1.3);

  // The 2D symbol at the block's top right, its quiet zone kept clear of the rule above and of the page's edge
  let twoD: LogisticLabel["printer"]["twoD"];
  let narrowRight = right; // where the text stops beside the symbol
  let besideUntil = y; // the text beside the symbol: rows that start above this
  if (input.twoD) {
    const row = specificationFor(5, input.twoD.symbology === "dl-qrcode" ? "gs1-qrcode" : "gs1-datamatrix")!;
    const moduleMm = (baseX(row) * input.percent) / 100;
    const error = input.twoD.error ?? "m";
    const { matrix, version } = symbolMatrix({ symbology: input.twoD.symbology, data: input.twoD.data, hriLines: [], showHri: false, error, version: null });
    const n = matrix.length;
    const m = u(moduleMm);
    const quiet = (row.quietZone as number) * m;
    const above = from.length || to.length ? u(BLOCK_GAP_MM - RULE_MM) : u(MARGIN_MM); // white between the symbol's top and the rule or the edge
    const sx = width - Math.max(u(MARGIN_MM), quiet) - n * m;
    const sy = y + Math.max(0, quiet - above);
    if (sx - quiet < u(NARROW_MARGIN_MM)) {
      const symbol = SYMBOLOGIES[input.twoD.symbology].name;
      const mm = (n * moduleMm).toFixed(1);
      throw new RangeError(`The ${symbol} is ${mm} mm wide, too wide for the ${page.name} label: choose a smaller size, fewer element strings, or the larger label.`);
    }
    for (const r of matrix.keys()) {
      let c = 0;
      while (c < n) {
        if (!matrix[r]![c]) {
          c++;
          continue;
        }
        const start = c;
        while (c < n && matrix[r]![c]) c++;
        rects.push([sx + start * m, sy + r * m, (c - start) * m, m]);
      }
    }
    twoD = { symbology: input.twoD.symbology, data: input.twoD.data, error, x: sx, y: sy, modules: n, module: m, version, rangeMm: [row.x[0], row.x[2]] };
    narrowRight = sx - quiet - u(TWO_D_GAP_MM);
    besideUntil = sy + n * m + quiet;
  }

  // The text in rows from the top; a line too wide for the room beside the symbol waits for the first row below it
  let x = left;
  let rowTop = y;
  let textBottom = y;
  const waiting: typeof items = [];
  const rowRight = () => (rowTop < besideUntil ? narrowRight : right);
  const newRow = () => {
    x = left;
    rowTop += rowHeight;
    if (rowTop >= besideUntil) waiting.splice(0).forEach(put);
  };
  function put(item: (typeof items)[number]) {
    for (;;) {
      if (x > left && x + item.w > rowRight()) {
        newRow();
        continue;
      }
      if (x + item.w > rowRight() && rowTop < besideUntil) {
        waiting.push(item);
        return;
      }
      text(item.title, x, rowTop, DATA_TITLE_MM);
      text(item.value, x, rowTop + u(DATA_TITLE_MM * 1.6), item.content);
      x += item.w + u(6);
      textBottom = rowTop + rowHeight;
      return;
    }
  }
  items.forEach(put);
  while (waiting.length) newRow();
  y = Math.max(textBottom, besideUntil) + u(BLOCK_GAP_MM / 2);
  if (y > bottomTop - u(RULE_MM)) {
    throw new RangeError(`The label's text and symbols need ${((y + (height - bottomTop)) * xMm).toFixed(0)} mm; the ${page.name} label is ${page.heightMm} mm high. Choose a smaller size, fewer element strings, or the larger label.`);
  }
  rule(Math.min(y, bottomTop - u(RULE_MM)));

  const options: LabelOptions = { ...base, data: input.elementString, hriLines: parts };
  return {
    layout: { width, height, rects, symbolRects, texts, xMm, modules: 0, version: null, barHeight: layouts[0]!.barHeight, barRects: [0, symbolRects], parts },
    options,
    parts,
    printer: { symbols: bars, barHeight: layouts[0]!.barHeight!, texts: own, rules, ...(twoD ? { twoD } : {}) },
  };
}
