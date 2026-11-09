import { deflate } from "./deflate.ts";
import type { HriFont } from "./hri.ts";
import type { LabelOptions, Layout } from "./layout.ts";
import { SYNTAX_ENGINE_NAME } from "./dictionary.ts";
import { MM_PER_INCH } from "./dots.ts";
import { pyFixed } from "./pyformat.ts";

// The label as a PDF, written without a library as the resolver's render_pdf wrote it (ADR 0004): one page the size of
// the label, the modules and bars as filled rectangles, the human readable text as glyph outlines (no font to embed,
// nothing to substitute where it is printed). The content stream is the resolver's, operator for operator, except the
// colours: process black alone (100 % K) on white, in DeviceCMYK, as prepress asks (the resolver wrote DeviceGray).

/** The document's Producer, which a PDF reader shows among its properties: the tool, and the engine that checked the data. */
export const PRODUCER = `GS1 Label Studio, data checked by the ${SYNTAX_ENGINE_NAME}`;

export const CMYK_WHITE = "0 0 0 0 k";
export const CMYK_BLACK = "0 0 0 1 k";

/** A PDF literal string. */
function pdfText(value: string): string {
  return "(" + value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";
}

/** Latin-1 bytes, "?" for what Latin-1 cannot hold (Python's encode("latin-1", "replace")). */
function latin1(text: string): Uint8Array {
  return Uint8Array.from([...text], (char) => {
    const code = char.codePointAt(0)!;
    return code < 256 ? code : 0x3f;
  });
}

/**
 * Crop marks (backlog 1.5, for labels cut from a larger sheet): the page grows by `marginMm` on every side, and at each
 * corner of the label two hairlines, `lengthMm` long, start `offsetMm` outside its edges, on the lines of those edges —
 * clear of a 3 mm bleed, as printers expect. In process black, the one ink the file uses, so they print on the black
 * plate (registration colour would put them on four). The PDF's TrimBox and BleedBox are the label, as nothing bleeds.
 */
export const CROP_MARKS = { marginMm: 10, offsetMm: 3, lengthMm: 5, linePt: 0.25 } as const;

/** The CMYK stroke colour of the crop marks: process black alone. */
export const CMYK_BLACK_STROKE = "0 0 0 1 K";

/** The page's operators, with crop marks around the label on a larger page when `cropMarks` is true. */
export function pdfContent(layout: Layout, font: HriFont, cropMarks = false): PdfPage {
  const label = labelContent(layout, font);
  if (!cropMarks) return label;
  const f = (value: number) => pyFixed(value, 3);
  const pt = (mm: number) => (mm * 72) / MM_PER_INCH;
  const [margin, offset, length] = [pt(CROP_MARKS.marginMm), pt(CROP_MARKS.offsetMm), pt(CROP_MARKS.lengthMm)];
  const marks: string[] = [];
  for (const x of [margin, margin + label.width]) {
    for (const y of [margin, margin + label.height]) {
      const sx = x === margin ? -1 : 1; // outwards
      const sy = y === margin ? -1 : 1;
      marks.push(`${f(x + sx * offset)} ${f(y)} m ${f(x + sx * (offset + length))} ${f(y)} l`);
      marks.push(`${f(x)} ${f(y + sy * offset)} m ${f(x)} ${f(y + sy * (offset + length))} l`);
    }
  }
  return {
    content: [`q 1 0 0 1 ${f(margin)} ${f(margin)} cm`, label.content, "Q", CMYK_BLACK_STROKE, `${f(CROP_MARKS.linePt)} w`, ...marks, "S"].join("\n"),
    width: label.width + 2 * margin,
    height: label.height + 2 * margin,
    trim: [margin, margin, label.width, label.height],
  };
}

/** The label's operators: white page, black rectangles, then each line of text as outlines (quadratic curves as cubic). */
function labelContent(layout: Layout, font: HriFont): PdfPage {
  const scale = (layout.xMm * 72) / MM_PER_INCH; // points per unit
  const pageW = layout.width * scale;
  const pageH = layout.height * scale;
  const f = (value: number) => pyFixed(value, 3);
  const point = (x: number, y: number) => `${f(x * scale)} ${f(pageH - y * scale)}`;
  const ops = [CMYK_WHITE, `0 0 ${f(pageW)} ${f(pageH)} re f`, CMYK_BLACK];
  for (const [x, y, w, h] of layout.rects) ops.push(`${point(x, y + h)} ${f(w * scale)} ${f(h * scale)} re`);
  ops.push("f");
  for (const t of layout.texts) {
    // fontTools' BasePen: a quadratic segment becomes the cubic with control points two thirds of the way to its own.
    let cx = 0;
    let cy = 0;
    for (const c of font.commands(t.text, t.x, t.baseline, t.em, t.turn)) {
      if (c.type === "M" || c.type === "L") {
        ops.push(`${point(c.x!, c.y!)} ${c.type === "M" ? "m" : "l"}`);
        [cx, cy] = [c.x!, c.y!];
      } else if (c.type === "Q") {
        const [qx, qy, ex, ey] = [c.x1!, c.y1!, c.x!, c.y!];
        const third = 0.66666666666666667;
        const mid1 = point(cx + third * (qx - cx), cy + third * (qy - cy));
        const mid2 = point(ex + third * (qx - ex), ey + third * (qy - ey));
        ops.push(`${mid1} ${mid2} ${point(ex, ey)} c`);
        [cx, cy] = [ex, ey];
      } else if (c.type === "Z") {
        ops.push("h");
      }
    }
    ops.push("f");
  }
  return { content: ops.join("\n"), width: pageW, height: pageH };
}

/**
 * The label as a one-page PDF the size of the label: vector modules, bars and glyph outlines, no fonts; with crop marks,
 * on a page `CROP_MARKS.marginMm` larger on every side.
 */
export async function labelPdf(options: LabelOptions, layout: Layout, font: HriFont, cropMarks = false): Promise<Uint8Array<ArrayBuffer>> {
  return pdfDocument([pdfContent(layout, font, cropMarks)], options.data);
}

/** A page of a PDF: its size in points and its content stream. */
export interface PdfPage {
  content: string;
  width: number;
  height: number;
  /** The label's place on a page with crop marks, in points from the bottom left: x, y, width, height (its TrimBox). */
  trim?: readonly [number, number, number, number];
}

/**
 * A PDF of `pages`, each its own size (backlog 2.4: labels a page each, or label sheets). Objects: the catalogue, the
 * page tree, then each page followed by its content, then the document's information, so that one page gives the
 * bytes the resolver's render_pdf gave.
 */
export async function pdfDocument(pages: readonly PdfPage[], title: string): Promise<Uint8Array<ArrayBuffer>> {
  const ascii = latin1; // the structure is ASCII
  const kids = pages.map((_, i) => `${3 + 2 * i} 0 R`).join(" ");
  const objects: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)],
  ];
  for (const [i, page] of pages.entries()) {
    const stream = await deflate(new TextEncoder().encode(page.content), "deflate");
    const box = page.trim
      ? `[${[page.trim[0], page.trim[1], page.trim[0] + page.trim[2], page.trim[1] + page.trim[3]].map((v) => pyFixed(v, 3)).join(" ")}]`
      : "";
    const boxes = box ? ` /TrimBox ${box} /BleedBox ${box}` : "";
    objects.push(
      [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pyFixed(page.width, 3)} ${pyFixed(page.height, 3)}]${boxes} /Contents ${4 + 2 * i} 0 R /Resources << >> >>`)],
      [ascii(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, ascii("\nendstream")],
    );
  }
  objects.push([latin1(`<< /Title ${pdfText(title)} /Producer (${PRODUCER}) >>`)]);
  const parts: Uint8Array[] = [Uint8Array.from([...ascii("%PDF-1.4\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let length = parts[0]!.length;
  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    push(ascii(`${i + 1} 0 obj\n`));
    body.forEach(push);
    push(ascii("\nendobj\n"));
  });
  const xref = length;
  push(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const offset of offsets) push(ascii(`${String(offset).padStart(10, "0")} 00000 n \n`));
  push(ascii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
