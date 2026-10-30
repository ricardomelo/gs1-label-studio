import type { HriFont } from "./hri.ts";
import type { Layout } from "./layout.ts";
import { MM_PER_INCH } from "./dots.ts";
import { pdfContent, type PdfPage } from "./pdf.ts";
import { pyFixed } from "./pyformat.ts";

// Laser and inkjet label sheets (backlog 2.4): a page cut into labels of one size, in columns and rows. Each label is
// printed at 100 % — never scaled, so the symbol keeps its X-dimension — centred in its place on the sheet, and refused
// when it is larger than the sheet's label.

export interface LabelSheet {
  id: string;
  name: string;
  /** The page's width and height, mm. */
  page: readonly [number, number];
  /** Each label's width and height, mm. */
  label: readonly [number, number];
  columns: number;
  rows: number;
  /** From the page's left edge to the first column, and from its top edge to the first row, mm. */
  margin: readonly [number, number];
  /** From one column's left edge to the next, and from one row's top edge to the next, mm. */
  pitch: readonly [number, number];
}

const A4 = [210, 297] as const;
const LETTER = [215.9, 279.4] as const;

/** A sheet whose labels are centred on the page, as these makers lay them out: the margins follow from the rest. */
function centred(id: string, name: string, page: readonly [number, number], label: readonly [number, number],
  columns: number, rows: number, pitch: readonly [number, number]): LabelSheet {
  const left = (page[0] - (pitch[0] * (columns - 1) + label[0])) / 2;
  const top = (page[1] - (pitch[1] * (rows - 1) + label[1])) / 2;
  return { id, name, page, label, columns, rows, margin: [round(left), round(top)], pitch };
}

const round = (mm: number) => Math.round(mm * 1000) / 1000;

/**
 * The sheets offered: Avery's commonest address and product sheets, A4 and US Letter. Pimaco's are not offered until
 * each is checked against Pimaco's own catalogue; any other sheet can be described as a custom one.
 */
export const LABEL_SHEETS: readonly LabelSheet[] = [
  centred("avery-l7160", "Avery L7160 — A4, 21 labels of 63.5 × 38.1 mm", A4, [63.5, 38.1], 3, 7, [66.04, 38.1]),
  centred("avery-l7163", "Avery L7163 — A4, 14 labels of 99.1 × 38.1 mm", A4, [99.1, 38.1], 2, 7, [101.6, 38.1]),
  centred("avery-l7651", "Avery L7651 — A4, 65 labels of 38.1 × 21.2 mm", A4, [38.1, 21.2], 5, 13, [40.64, 21.2]),
  centred("avery-5160", "Avery 5160 — US Letter, 30 labels of 2⅝ × 1 in (66.7 × 25.4 mm)", LETTER, [66.675, 25.4], 3, 10, [69.85, 25.4]),
];

/** What is wrong with a sheet's description (a custom sheet), or null. */
export function sheetProblem(sheet: LabelSheet): string | null {
  const values = [...sheet.page, ...sheet.label, ...sheet.margin, ...sheet.pitch];
  if (values.some((v) => !Number.isFinite(v) || v < 0) || sheet.page.some((v) => v <= 0) || sheet.label.some((v) => v <= 0)) {
    return "Every size must be a number of millimetres, the page's and the label's above zero.";
  }
  if (!Number.isInteger(sheet.columns) || !Number.isInteger(sheet.rows) || sheet.columns < 1 || sheet.rows < 1) {
    return "Columns and rows must be whole numbers from 1.";
  }
  if ((sheet.columns > 1 && sheet.pitch[0] < sheet.label[0]) || (sheet.rows > 1 && sheet.pitch[1] < sheet.label[1])) {
    return "The labels overlap: the pitch must be at least the label's size.";
  }
  const right = sheet.margin[0] + sheet.pitch[0] * (sheet.columns - 1) + sheet.label[0];
  const bottom = sheet.margin[1] + sheet.pitch[1] * (sheet.rows - 1) + sheet.label[1];
  if (right > sheet.page[0] + 1e-9 || bottom > sheet.page[1] + 1e-9) return "The labels go beyond the page.";
  return null;
}

/** Each label's top left corner on its page, mm, row by row from the top left. */
export function sheetCells(sheet: LabelSheet): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.columns; c++) {
      cells.push([round(sheet.margin[0] + c * sheet.pitch[0]), round(sheet.margin[1] + r * sheet.pitch[1])]);
    }
  }
  return cells;
}

/** The reason a label of this size cannot go on the sheet, or null. */
export function fitsSheet(widthMm: number, heightMm: number, sheet: LabelSheet): string | null {
  return widthMm > sheet.label[0] + 1e-9 || heightMm > sheet.label[1] + 1e-9
    ? `The label (${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm at 100 %) is larger than the sheet's labels ` +
      `(${sheet.label[0]} × ${sheet.label[1]} mm); it is never scaled. Choose a smaller size or a larger sheet.`
    : null;
}

/**
 * The sheet's pages with these labels, in order, from the place `start` (1 for the first label of the first page, more
 * to use a sheet already partly used). Every label must fit (`fitsSheet`).
 */
export function sheetPages(layouts: readonly Layout[], sheet: LabelSheet, font: HriFont, start = 1): PdfPage[] {
  const pt = 72 / MM_PER_INCH;
  const cells = sheetCells(sheet);
  const width = sheet.page[0] * pt;
  const height = sheet.page[1] * pt;
  const f = (value: number) => pyFixed(value, 3);
  const pages: PdfPage[] = [];
  let ops: string[] = [];
  let place = Math.max(0, Math.min(start - 1, cells.length - 1));
  for (const layout of layouts) {
    const w = layout.width * layout.xMm;
    const h = layout.height * layout.xMm;
    const problem = fitsSheet(w, h, sheet);
    if (problem) throw new RangeError(problem);
    const [x, y] = cells[place]!;
    const left = x + (sheet.label[0] - w) / 2;
    const bottom = y + (sheet.label[1] + h) / 2;
    ops.push(`q 1 0 0 1 ${f(left * pt)} ${f(height - bottom * pt)} cm`, pdfContent(layout, font).content, "Q");
    place++;
    if (place === cells.length) {
      pages.push({ content: ops.join("\n"), width, height });
      ops = [];
      place = 0;
    }
  }
  if (ops.length) pages.push({ content: ops.join("\n"), width, height });
  return pages;
}
