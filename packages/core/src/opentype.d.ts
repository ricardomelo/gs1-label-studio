// The part of opentype.js (MIT) the human readable text uses: glyph outlines and metrics.
declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface GlyphPoint {
    x: number;
    y: number;
    onCurve: boolean;
    lastPointOfContour?: boolean;
  }
  export interface Glyph {
    advanceWidth?: number;
    points?: GlyphPoint[];
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export interface Font {
    unitsPerEm: number;
    tables: { os2: { sCapHeight: number }; hhea: { descender: number } };
    charToGlyph(char: string): Glyph;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
