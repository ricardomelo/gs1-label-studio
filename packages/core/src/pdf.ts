import { deflate } from "./deflate.ts";
import type { HriFont } from "./hri.ts";
import type { LabelOptions, Layout } from "./layout.ts";
import { MM_PER_INCH } from "./dots.ts";
import { pyFixed } from "./pyformat.ts";

// The label as a PDF, written without a library as the resolver's render_pdf wrote it (ADR 0004): one page the size of
// the label, the modules and bars as filled rectangles, the human readable text as glyph outlines (no font to embed,
// nothing to substitute where it is printed). The content stream is the resolver's, operator for operator.

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

/** The page's operators: white page, black rectangles, then each line of text as outlines (quadratic curves as cubic). */
export function pdfContent(layout: Layout, font: HriFont): { content: string; width: number; height: number } {
  const scale = (layout.xMm * 72) / MM_PER_INCH; // points per unit
  const pageW = layout.width * scale;
  const pageH = layout.height * scale;
  const f = (value: number) => pyFixed(value, 3);
  const point = (x: number, y: number) => `${f(x * scale)} ${f(pageH - y * scale)}`;
  const ops = ["1 g", `0 0 ${f(pageW)} ${f(pageH)} re f`, "0 g"];
  for (const [x, y, w, h] of layout.rects) ops.push(`${point(x, y + h)} ${f(w * scale)} ${f(h * scale)} re`);
  ops.push("f");
  for (const t of layout.texts) {
    // fontTools' BasePen: a quadratic segment becomes the cubic with control points two thirds of the way to its own.
    let cx = 0;
    let cy = 0;
    for (const c of font.commands(t.text, t.x, t.baseline, t.em)) {
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

/** The label as a one-page PDF the size of the label: vector modules, bars and glyph outlines, no fonts. */
export async function labelPdf(options: LabelOptions, layout: Layout, font: HriFont): Promise<Uint8Array<ArrayBuffer>> {
  const { content, width, height } = pdfContent(layout, font);
  const stream = await deflate(new TextEncoder().encode(content), "deflate");
  const ascii = latin1; // the structure is ASCII
  const objects: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pyFixed(width, 3)} ${pyFixed(height, 3)}] /Contents 4 0 R /Resources << >> >>`)],
    [ascii(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, ascii("\nendstream")],
    [latin1(`<< /Title ${pdfText(options.data)} /Producer (GS1 Label Studio) >>`)],
  ];
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
