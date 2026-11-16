import { pdfDocument, type PdfPage } from "./pdf.ts";
import { pyFixed } from "./pyformat.ts";

// The Check Studio's reports as PDF (backlog 7.1 k; the check studio's project, section 7.3; ADR 0007 decision 17): one
// reading, one item (a group) and a session, written by the core without a library as pdf.ts writes labels (the
// project's Q5). Reports need running text, so this file has fonts where a label has outlines: the standard Helvetica,
// Helvetica-Bold and Courier, which every PDF reader has, in WinAnsi encoding, which holds the six languages of the
// interface (Q6: the report in the interface's language, the codes and sections unchanged) — nothing embedded, the
// text selectable and searchable. The words come in already translated: the web builds the blocks, this file lays
// them out on A4 pages, wraps the lines by the fonts' widths, breaks tables between rows with their heads repeated,
// and numbers the pages.

/** One block of a report, laid out top to bottom. */
export type ReportBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; style?: "bold" | "mono" | "small" }
  /** Label and value lines, the labels in a column of their own. */
  | { kind: "pairs"; rows: readonly (readonly [string, string])[] }
  /** A table: `widths` are the columns' shares of the line (equal when not given); `bold` marks cells (a matrix's differences). */
  | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[]; widths?: readonly number[]; bold?: readonly (readonly boolean[])[]; mono?: readonly number[] }
  /** The next block starts a new page. */
  | { kind: "page-break" };

export interface ReportDocument {
  /** The document's title, in its properties. */
  title: string;
  /** The line at the foot of every page, left; the page's number and the count go right ("2 / 3"). */
  footer: string;
  blocks: readonly ReportBlock[];
}

/** A4 in points, and the margins. */
export const REPORT_PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;

type Font = "F1" | "F2" | "F3";
const FONTS = "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> "
  + "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> "
  + "/F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >> >>";

// The advance widths of Helvetica and Helvetica-Bold for WinAnsi codes 32 to 255, in thousandths of the size (Adobe's
// metrics, which the URW Nimbus Sans fonts of Ghostscript share; 0 where WinAnsi has no character). Courier is 600.
const HELVETICA = "278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500";
const HELVETICA_BOLD = "278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556";
const WIDTHS: Record<Font, number[]> = {
  F1: HELVETICA.split(",").map(Number),
  F2: HELVETICA_BOLD.split(",").map(Number),
  F3: Array<number>(224).fill(600),
};

/** The characters of WinAnsi's codes 128 to 159 (Windows-1252), by their code. */
const CP1252: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** A character's WinAnsi code; "?" for what WinAnsi cannot hold, a space for a control character or a line break. */
export function winAnsiCode(char: string): number {
  const code = char.codePointAt(0)!;
  if (code < 0x20 || code === 0x7f) return 0x20;
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code;
  return CP1252[code] ?? 0x3f;
}

/** The text's width in points at `size`. */
export function textWidth(text: string, font: Font, size: number): number {
  let width = 0;
  for (const char of text) width += WIDTHS[font][winAnsiCode(char) - 32] || WIDTHS[font][0x3f - 32]!;
  return (width * size) / 1000;
}

/** A PDF string of the text in WinAnsi, every byte past ASCII written as an octal escape so the stream stays ASCII. */
function pdfString(text: string): string {
  let out = "(";
  for (const char of text) {
    const code = winAnsiCode(char);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += "\\" + char;
    else if (code > 0x7e) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out + ")";
}

/**
 * The text cut into lines no wider than `width`: at spaces, and inside a word only where a word alone is wider (a
 * hexadecimal string, a URI). A line break in the text starts a new line.
 */
export function wrapText(text: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, font, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (textWidth(rest, font, size) > width) {
        let cut = 1;
        while (cut < rest.length && textWidth(rest.slice(0, cut + 1), font, size) <= width) cut++;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const SIZES = { title: 16, heading: 11.5, body: 9.5, small: 8, table: 8, footer: 7.5 } as const;
const LEADING = 1.3;

/** The pages' content streams, laid out from the blocks. */
export function reportPages(doc: ReportDocument): string[] {
  const { width, height, margin } = REPORT_PAGE;
  const line = width - 2 * margin;
  const bottom = margin + 18; // above the footer
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  const f = (v: number) => pyFixed(v, 2);
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = height - margin;
  };
  const text = (x: number, baseline: number, content: string, font: Font, size: number) =>
    ops.push(`BT /${font} ${f(size)} Tf ${f(x)} ${f(baseline)} Td ${pdfString(content)} Tj ET`);
  /** Room for `needed` points, on a new page when this one has not got it. */
  const room = (needed: number) => {
    if (y - needed < bottom) newPage();
  };
  const lines = (content: string[], x: number, font: Font, size: number) => {
    for (const l of content) {
      room(size * LEADING);
      y -= size * LEADING;
      text(x, y + size * 0.25, l, font, size);
    }
  };
  newPage();
  for (const block of doc.blocks) {
    switch (block.kind) {
      case "title":
        lines(wrapText(block.text, "F2", SIZES.title, line), margin, "F2", SIZES.title);
        y -= 6;
        break;
      case "heading":
        room(SIZES.heading * LEADING * 3); // a heading is not left alone at a page's foot
        y -= 8;
        lines(wrapText(block.text, "F2", SIZES.heading, line), margin, "F2", SIZES.heading);
        y -= 2;
        break;
      case "paragraph": {
        const font: Font = block.style === "bold" ? "F2" : block.style === "mono" ? "F3" : "F1";
        const size = block.style === "small" ? SIZES.small : SIZES.body;
        lines(wrapText(block.text, font, size, line), margin, font, size);
        y -= 3;
        break;
      }
      case "pairs": {
        const size = SIZES.body;
        const labelWidth = Math.min(line * 0.38, Math.max(...block.rows.map(([label]) => textWidth(label, "F2", size))) + 10);
        for (const [label, value] of block.rows) {
          const left = wrapText(label, "F2", size, labelWidth - 8);
          const right = wrapText(value, "F1", size, line - labelWidth);
          const count = Math.max(left.length, right.length);
          room(count * size * LEADING);
          const top = y;
          left.forEach((l, i) => text(margin, top - (i + 1) * size * LEADING + size * 0.25, l, "F2", size));
          right.forEach((l, i) => text(margin + labelWidth, top - (i + 1) * size * LEADING + size * 0.25, l, "F1", size));
          y = top - count * size * LEADING;
        }
        y -= 3;
        break;
      }
      case "table": {
        const size = SIZES.table;
        const lead = size * LEADING;
        const columns = block.head.length;
        const shares = block.widths ?? Array<number>(columns).fill(1);
        const total = shares.reduce((a, b) => a + b, 0);
        const widths = shares.map((s) => (s / total) * line);
        const pad = 3;
        const fontOf = (row: number, column: number): Font =>
          row < 0 || block.bold?.[row]?.[column] ? "F2" : block.mono?.includes(column) ? "F3" : "F1";
        const cells = (values: readonly string[], row: number) =>
          values.map((v, c) => wrapText(v, fontOf(row, c), size, widths[c]! - 2 * pad));
        const draw = (wrapped: string[][], row: number) => {
          const count = Math.max(1, ...wrapped.map((c) => c.length));
          const top = y;
          let x = margin;
          wrapped.forEach((c, column) => {
            c.forEach((l, i) => text(x + pad, top - pad - (i + 1) * lead + size * 0.25, l, fontOf(row, column), size));
            x += widths[column]!;
          });
          y = top - count * lead - 2 * pad;
          ops.push(`0.6 G 0.4 w ${f(margin)} ${f(y)} m ${f(margin + line)} ${f(y)} l S`);
        };
        const head = cells(block.head, -1);
        const headHeight = Math.max(1, ...head.map((c) => c.length)) * lead + 2 * pad;
        room(headHeight + lead + 2 * pad);
        draw(head, -1);
        block.rows.forEach((values, row) => {
          const wrapped = cells(values, row);
          const needed = Math.max(1, ...wrapped.map((c) => c.length)) * lead + 2 * pad;
          if (y - needed < bottom) {
            newPage();
            draw(head, -1); // the head again on the new page
          }
          draw(wrapped, row);
        });
        y -= 6;
        break;
      }
      case "page-break":
        newPage();
        break;
    }
  }
  return pages.map((page, i) => {
    const number = `${i + 1} / ${pages.length}`;
    const foot = margin - 6;
    const footer = [
      `0.6 G 0.4 w ${f(margin)} ${f(margin + 6)} m ${f(width - margin)} ${f(margin + 6)} l S`,
      `BT /F1 ${f(SIZES.footer)} Tf ${f(margin)} ${f(foot)} Td ${pdfString(doc.footer)} Tj ET`,
      `BT /F1 ${f(SIZES.footer)} Tf ${f(width - margin - textWidth(number, "F1", SIZES.footer))} ${f(foot)} Td ${pdfString(number)} Tj ET`,
    ];
    return ["0 g", ...page, ...footer].join("\n");
  });
}

/** The report as a PDF on A4 pages, its text in the standard fonts. */
export async function reportPdf(doc: ReportDocument): Promise<Uint8Array<ArrayBuffer>> {
  const pages: PdfPage[] = reportPages(doc).map((content) => ({ content, width: REPORT_PAGE.width, height: REPORT_PAGE.height, resources: FONTS }));
  return pdfDocument(pages, doc.title);
}
