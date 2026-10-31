import { aiEntry } from "./dictionary.ts";
import { parseElementString, type Element } from "./elementString.ts";
import { encode, widthInModules } from "./encode.ts";
import { GS1_128_MAX_MM, splitGs1128 } from "./gs1128.ts";
import type { HriFont } from "./hri.ts";
import { layoutLabel, type LabelOptions, type LabelText, type Layout } from "./layout.ts";
import { specSizesFor, type SymbolSpecification } from "./specifications.ts";

// The GS1 Logistic Label (backlog 4.1; General Specifications 26.0, section 6.6): a page of A6 or 4 × 6 inches with
// its building blocks from the top — free text (who sends, who receives), text with data titles, and at the bottom the
// GS1-128 symbols with their text, the one carrying the SSCC lowest. Laid out as one Layout in units of the symbols'
// X-dimension, so that the SVG, PNG, PDF and EPS draw it as they draw a symbol.

/** Section 6.6.4.5's sizes: A6 and 4 × 6 inches for an SSCC and a little more, A5 and 6 × 8 inches for more data. */
export const LOGISTIC_SIZES = {
  a6: { name: "A6", widthMm: 105, heightMm: 148 },
  "4x6": { name: "4 × 6 in", widthMm: 101.6, heightMm: 152.4 },
  a5: { name: "A5", widthMm: 148, heightMm: 210 },
  "6x8": { name: "6 × 8 in", widthMm: 152.4, heightMm: 203.2 },
} as const;
export type LogisticSize = keyof typeof LOGISTIC_SIZES;

const MARGIN_MM = 4;
const FREE_TEXT_MM = 3.5; // 6.6.4.4: no less than 3 mm
const DATA_TITLE_MM = 2.5;
const DATA_CONTENT_MM = 7; // 6.6.4.2: at least 7 mm
const HRI_MM = 3; // 4.14, rule 5c: no less than 3 mm on a GS1 Logistic Label
const RULE_MM = 0.3; // the lines between the building blocks
const BLOCK_GAP_MM = 3;

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
}

export interface LogisticLabel {
  layout: Layout;
  /** What the files' descriptions take: GS1-128 at its row, the whole element string as data. */
  options: LabelOptions;
  /** The GS1-128 symbols' element strings, from the top; the SSCC's last. */
  parts: string[];
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
  const em = (mm: number) => (u(mm) * font.unitsPerEm) / font.capHeight;
  const text = (value: string, x: number, top: number, mm: number) => {
    texts.push({ text: value, x, baseline: top + u(mm), em: em(mm), linear: false });
    return font.textWidth(value, em(mm));
  };
  const rule = (y: number) => rects.push([0, y, width, u(RULE_MM)]);

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
  for (const [i, l] of layouts.entries()) {
    const [dx, dy] = placed[i]!;
    for (const [x, y, w, h] of l.rects) rects.push([x + dx, y + dy, w, h]);
    for (const t of l.texts) texts.push({ ...t, x: t.x + dx, baseline: t.baseline + dy });
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
  let x = u(MARGIN_MM);
  const rowHeight = u(DATA_TITLE_MM * 1.6 + DATA_CONTENT_MM * 1.3);
  for (const e of elements) {
    const title = aiEntry(e.ai)?.title ?? `AI (${e.ai})`;
    const w = Math.max(font.textWidth(title, em(DATA_TITLE_MM)), font.textWidth(e.value, em(DATA_CONTENT_MM)));
    if (x > u(MARGIN_MM) && x + w > width - u(MARGIN_MM)) {
      x = u(MARGIN_MM);
      y += rowHeight;
    }
    text(title, x, y, DATA_TITLE_MM);
    text(e.value, x, y + u(DATA_TITLE_MM * 1.6), DATA_CONTENT_MM);
    x += w + u(6);
  }
  y += rowHeight + u(BLOCK_GAP_MM / 2);
  if (y > bottomTop - u(RULE_MM)) {
    throw new RangeError(`The label's text and symbols need ${((y + (height - bottomTop)) * xMm).toFixed(0)} mm; the ${page.name} label is ${page.heightMm} mm high. Choose a smaller size, fewer element strings, or the larger label.`);
  }
  rule(Math.min(y, bottomTop - u(RULE_MM)));

  const options: LabelOptions = { ...base, data: input.elementString, hriLines: parts };
  return {
    layout: { width, height, rects, symbolRects, texts, xMm, modules: 0, version: null, barHeight: layouts[0]!.barHeight, barRects: [0, symbolRects], parts },
    options,
    parts,
  };
}
