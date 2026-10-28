import type { SymbolGeometry } from "./encode.ts";

/**
 * A one-bit image: `width` × `height` pixels, `dark[y * width + x]`. The printer outputs send it as a graphic, the
 * route every label printer language supports, whatever its firmware's own barcode commands do with GS1 data.
 */
export interface Bitmap {
  width: number;
  height: number;
  dark: Uint8Array;
}

export interface RasterOptions {
  /** Pixels (printer dots) per module: a whole number, see dots.ts. */
  dotsPerModule: number;
  /** Quiet zone on each side, in modules. */
  quietZone: number;
  /** Bar height of a linear symbol, in dots. Ignored for matrix symbols. */
  barHeight?: number;
}

export function rasterize(geometry: SymbolGeometry, options: RasterOptions): Bitmap {
  const { dotsPerModule: d, quietZone: q } = options;
  if (!Number.isInteger(d) || d < 1) throw new Error("dotsPerModule must be a whole number of dots");
  if (geometry.kind === "linear") {
    const modules = geometry.widths.reduce((sum, width) => sum + width, 0);
    const width = (modules + 2 * q) * d;
    const height = options.barHeight ?? 50 * d;
    const row = new Uint8Array(width);
    let x = q * d;
    geometry.widths.forEach((modulesWide, index) => {
      if (index % 2 === 0) row.fill(1, x, x + modulesWide * d);
      x += modulesWide * d;
    });
    const dark = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) dark.set(row, y * width);
    return { width, height, dark };
  }
  const width = (geometry.cols + 2 * q) * d;
  const height = (geometry.rows + 2 * q) * d;
  const dark = new Uint8Array(width * height);
  for (let row = 0; row < geometry.rows; row++) {
    for (let col = 0; col < geometry.cols; col++) {
      if (!geometry.dark[row * geometry.cols + col]) continue;
      for (let dy = 0; dy < d; dy++) {
        const start = ((row + q) * d + dy) * width + (col + q) * d;
        dark.fill(1, start, start + d);
      }
    }
  }
  return { width, height, dark };
}
