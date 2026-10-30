/// <reference path="./opentype.d.ts" />
import { parse, type Font, type GlyphPoint, type PathCommand } from "opentype.js";
import { pyFixed } from "./pyformat.ts";

function drawContour(contour: GlyphPoint[], at: (p: GlyphPoint) => [number, number], out: PathCommand[]): void {
  const first = contour.findIndex((p) => p.onCurve);
  if (first < 0) throw new Error("a contour without on-curve points"); // none in the HRI font's characters
  const points = [...contour.slice(first + 1), ...contour.slice(0, first + 1)].map((p) => ({ xy: at(p), on: p.onCurve }));
  const [mx, my] = points.at(-1)!.xy;
  out.push({ type: "M", x: mx, y: my });
  let rest = points;
  while (rest.length) {
    const next = rest.findIndex((p) => p.on) + 1;
    if (next === 1) {
      if (rest.length > 1) out.push({ type: "L", x: rest[0]!.xy[0], y: rest[0]!.xy[1] });
    } else {
      // pen.qCurveTo(off…, on): atomic segments with implied on-curve points between consecutive off-curve ones
      const segment = rest.slice(0, next).map((p) => p.xy);
      for (let i = 0; i < segment.length - 2; i++) {
        const [cx, cy] = segment[i]!;
        const [nx, ny] = segment[i + 1]!;
        out.push({ type: "Q", x1: cx, y1: cy, x: 0.5 * (cx + nx), y: 0.5 * (cy + ny) });
      }
      const [cx, cy] = segment.at(-2)!;
      const [ex, ey] = segment.at(-1)!;
      out.push({ type: "Q", x1: cx, y1: cy, x: ex, y: ey });
    }
    rest = rest.slice(next);
  }
  out.push({ type: "Z" });
}

/**
 * The font of the human readable text (Liberation Sans, SIL Open Font License, `assets/fonts`), as the resolver's label
 * studio drew it with fontTools (ADR 0004): metrics to size the text in millimetres, advance widths without kerning,
 * and glyph outlines so that an SVG or PDF needs no font to be viewed or printed. The outline is written as fontTools'
 * SVGPathPen writes it (H and V for straight lines, three decimals), so that both give the same path.
 */
export class HriFont {
  readonly unitsPerEm: number;
  readonly capHeight: number;
  /** Below the baseline, positive. */
  readonly descent: number;

  /** Each character's glyph points and advance, read once: opentype.js builds a glyph's points again on each access. */
  private readonly glyphs = new Map<string, { points: GlyphPoint[]; advance: number }>();

  private glyph(char: string): { points: GlyphPoint[]; advance: number } {
    let glyph = this.glyphs.get(char);
    if (!glyph) {
      const g = this.font.charToGlyph(char);
      glyph = { points: g.points ?? [], advance: g.advanceWidth ?? 0 };
      this.glyphs.set(char, glyph);
    }
    return glyph;
  }

  constructor(private readonly font: Font) {
    this.unitsPerEm = font.unitsPerEm;
    this.capHeight = font.tables.os2.sCapHeight;
    this.descent = -font.tables.hhea.descender;
  }

  static fromBytes(bytes: ArrayBuffer): HriFont {
    return new HriFont(parse(bytes));
  }

  /** Advance width of `text` at an em size given in the layout's units. */
  textWidth(text: string, em: number): number {
    let units = 0;
    for (const char of text) units += this.glyph(char).advance;
    return (units * em) / this.unitsPerEm;
  }

  /**
   * The glyph outlines of `text`, its baseline starting at (x, baseline), as pen operations in the layout's units —
   * exactly as fontTools draws a TrueType glyph (`_g_l_y_f.Glyph.draw` through a TransformPen): each contour rotated to
   * end on its first on-curve point, which the move goes to; lines, and quadratic curves split at the implied points
   * (the middle of two off-curve points, taken after the transform); the line back to the start left to the close.
   */
  commands(text: string, x: number, baseline: number, em: number): PathCommand[] {
    const out: PathCommand[] = [];
    const scale = em / this.unitsPerEm;
    let cursor = x;
    for (const char of text) {
      const { points, advance } = this.glyph(char);
      const at = (p: GlyphPoint): [number, number] => [scale * p.x + cursor, -scale * p.y + baseline];
      let contour: GlyphPoint[] = [];
      for (const point of points) {
        contour.push(point);
        if (!point.lastPointOfContour) continue;
        drawContour(contour, at, out);
        contour = [];
      }
      cursor += advance * scale;
    }
    return out;
  }

  /** The outlines as SVG path data. */
  svgPath(text: string, x: number, baseline: number, em: number): string {
    // The resolver's ntos: f"{v:.3f}" without trailing zeros (so -0.0004 is "-0", as in Python).
    const ntos = (v: number) => pyFixed(v, 3).replace(/0+$/, "").replace(/\.$/, "");
    const out: string[] = [];
    let last: string | null = null;
    let lastX: number | null = null;
    let lastY: number | null = null;
    for (const c of this.commands(text, x, baseline, em)) {
      if (c.type === "M") {
        if (last === "M") out.pop();
        out.push(`M${ntos(c.x!)} ${ntos(c.y!)}`);
        last = "M";
        [lastX, lastY] = [c.x!, c.y!];
      } else if (c.type === "L") {
        const [px, py] = [c.x!, c.y!];
        if (px === lastX && py === lastY) continue;
        if (px === lastX) {
          out.push(`V${ntos(py)}`);
          last = "V";
        } else if (py === lastY) {
          out.push(`H${ntos(px)}`);
          last = "H";
        } else if (last === "M") {
          out.push(` ${ntos(px)} ${ntos(py)}`);
        } else {
          out.push(`L${ntos(px)} ${ntos(py)}`);
          last = "L";
        }
        [lastX, lastY] = [px, py];
      } else if (c.type === "Q") {
        out.push(`Q${ntos(c.x1!)} ${ntos(c.y1!)} ${ntos(c.x!)} ${ntos(c.y!)}`);
        last = "Q";
        [lastX, lastY] = [c.x!, c.y!];
      } else if (c.type === "C") {
        out.push(`C${ntos(c.x1!)} ${ntos(c.y1!)} ${ntos(c.x2!)} ${ntos(c.y2!)} ${ntos(c.x!)} ${ntos(c.y!)}`);
        last = "C";
        [lastX, lastY] = [c.x!, c.y!];
      } else {
        out.push("Z");
        last = "Z";
        lastX = lastY = null;
      }
    }
    return out.join("");
  }
}
