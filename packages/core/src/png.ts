import { crc32, deflate } from "./deflate.ts";
import type { HriFont } from "./hri.ts";
import type { Layout } from "./layout.ts";
import { MM_PER_INCH } from "./dots.ts";

// The label as PNG, as the resolver's render_png drew it (ADR 0004): a whole number of pixels per module, so that every
// module is the same number of pixels, and the DPI recorded in the file so that it prints at the label's size. The text
// is drawn from the font's outlines, anti-aliased; written as 8-bit grey (the resolver wrote RGB: the same pixels).

/** About 616 dpi at the target X-dimension of 0.495 mm. */
export const PNG_PIXELS_PER_MODULE = 12;

/** Python's round(): halves to the even neighbour. */
function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The DPI at which the PNG prints at the label's size. */
export function pngDpi(layout: Layout, pixelsPerModule = PNG_PIXELS_PER_MODULE): number {
  return (pixelsPerModule / layout.xMm) * MM_PER_INCH;
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  winding: number;
}

const SUBSCANLINES = 8;

/**
 * Fills outlines with the non-zero rule (TrueType's) onto a grey image, anti-aliased: per pixel row, SUBSCANLINES
 * sample lines, each span's horizontal coverage exact.
 */
function fillOutlines(grey: Uint8Array, width: number, height: number, contours: [number, number][][]): void {
  const edges: Edge[] = [];
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = contour[i]!;
      const [x1, y1] = contour[(i + 1) % contour.length]!;
      if (y0 === y1) continue;
      edges.push(y0 < y1 ? { x0, y0, x1, y1, winding: 1 } : { x0: x1, y0: y1, x1: x0, y1: y0, winding: -1 });
    }
  }
  if (!edges.length) return;
  const top = Math.max(0, Math.floor(Math.min(...edges.map((e) => e.y0))));
  const bottom = Math.min(height, Math.ceil(Math.max(...edges.map((e) => e.y1))));
  const coverage = new Float64Array(width);
  for (let row = top; row < bottom; row++) {
    coverage.fill(0);
    for (let s = 0; s < SUBSCANLINES; s++) {
      const y = row + (s + 0.5) / SUBSCANLINES;
      const crossings: [number, number][] = [];
      for (const e of edges) {
        if (y < e.y0 || y >= e.y1) continue;
        crossings.push([e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), e.winding]);
      }
      crossings.sort((a, b) => a[0] - b[0]);
      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i++) {
        winding += crossings[i]![1];
        if (winding === 0) continue;
        const from = Math.max(0, crossings[i]![0]);
        const to = Math.min(width, crossings[i + 1]![0]);
        for (let x = Math.floor(from); x < to; x++) {
          coverage[x]! += Math.min(x + 1, to) - Math.max(x, from);
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const c = Math.min(1, coverage[x]! / SUBSCANLINES);
      if (c > 0) grey[row * width + x] = Math.min(grey[row * width + x]!, Math.round(255 * (1 - c)));
    }
  }
}

/** Glyph outlines as polygons: quadratic curves flattened to within a twentieth of a pixel. */
function outlines(font: HriFont, text: string, x: number, baseline: number, em: number): [number, number][][] {
  const contours: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const c of font.commands(text, x, baseline, em)) {
    if (c.type === "M") {
      current = [[c.x!, c.y!]];
      contours.push(current);
    } else if (c.type === "L") {
      current.push([c.x!, c.y!]);
    } else if (c.type === "Q") {
      const [x0, y0] = current.at(-1)!;
      const deviation = Math.hypot(x0 - 2 * c.x1! + c.x!, y0 - 2 * c.y1! + c.y!);
      const steps = Math.max(1, Math.ceil(Math.sqrt(deviation / (8 * 0.05))));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current.push([u * u * x0 + 2 * u * t * c.x1! + t * t * c.x!, u * u * y0 + 2 * u * t * c.y1! + t * t * c.y!]);
      }
    }
  }
  return contours;
}

/** The label's pixels, 8-bit grey (0 black, 255 white), as the resolver placed them. */
export function labelPixels(layout: Layout, font: HriFont, pixelsPerModule = PNG_PIXELS_PER_MODULE) {
  const p = (value: number) => pyRound(value * pixelsPerModule);
  const width = p(layout.width);
  const height = p(layout.height);
  const grey = new Uint8Array(width * height).fill(255);
  for (const [x, y, w, h] of layout.rects) {
    const [left, right, upper, lower] = [p(x), p(x + w), p(y), p(y + h)];
    for (let row = Math.max(0, upper); row < Math.min(height, lower); row++) {
      grey.fill(0, row * width + Math.max(0, left), row * width + Math.min(width, right));
    }
  }
  // As Pillow placed it: a whole-pixel font size, the baseline's left end on a whole pixel.
  for (const t of layout.texts) {
    const em = Math.max(1, pyRound(t.em * pixelsPerModule));
    fillOutlines(grey, width, height, outlines(font, t.text, p(t.x), p(t.baseline), em));
  }
  return { width, height, grey };
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The label as PNG at `pixelsPerModule` pixels per module, its DPI giving the size when printed. */
export async function labelPng(layout: Layout, font: HriFont, pixelsPerModule = PNG_PIXELS_PER_MODULE): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, grey } = labelPixels(layout, font, pixelsPerModule);
  // Every row with the "Up" filter: rows repeat (bars, module rows), so they become zeros.
  const raw = new Uint8Array((width + 1) * height);
  for (let row = 0; row < height; row++) {
    raw[row * (width + 1)] = 2;
    for (let x = 0; x < width; x++) {
      const above = row ? grey[(row - 1) * width + x]! : 0;
      raw[row * (width + 1) + 1 + x] = (grey[row * width + x]! - above) & 0xff;
    }
  }
  const header = new Uint8Array(13);
  const h = new DataView(header.buffer);
  h.setUint32(0, width);
  h.setUint32(4, height);
  header.set([8, 0, 0, 0, 0], 8); // 8 bits, grey, deflate, adaptive filters, not interlaced
  const physical = new Uint8Array(9);
  const perMetre = Math.floor(pngDpi(layout, pixelsPerModule) / 0.0254 + 0.5); // Pillow's rounding
  new DataView(physical.buffer).setUint32(0, perMetre);
  new DataView(physical.buffer).setUint32(4, perMetre);
  physical[8] = 1; // the unit is the metre
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("pHYs", physical),
    chunk("IDAT", await deflate(raw, "deflate")),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
