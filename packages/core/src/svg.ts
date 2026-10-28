import type { SymbolGeometry } from "./encode.ts";

export interface SvgOptions {
  /** X-dimension in mm: the SVG is sized in millimetres, so it prints at the size chosen. */
  xMm: number;
  /** Quiet zone on each side, in modules. */
  quietZone: number;
  /** Bar height of a linear symbol, in mm. Ignored for matrix symbols. */
  barHeightMm?: number;
}

const round = (value: number) => Number(value.toFixed(4));

/** A vector SVG of the symbol (modules and bars as rectangles in units of the module), without human readable text. */
export function toSvg(geometry: SymbolGeometry, options: SvgOptions): string {
  const q = options.quietZone;
  const rects: string[] = [];
  let widthModules: number;
  let heightModules: number;
  if (geometry.kind === "linear") {
    heightModules = round((options.barHeightMm ?? 50 * options.xMm) / options.xMm);
    let x = q;
    geometry.widths.forEach((width, index) => {
      if (index % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="${heightModules}"/>`);
      x += width;
    });
    widthModules = x + q;
  } else {
    widthModules = geometry.cols + 2 * q;
    heightModules = geometry.rows + 2 * q;
    // One rectangle per horizontal run of dark modules keeps the file small.
    for (let row = 0; row < geometry.rows; row++) {
      let col = 0;
      while (col < geometry.cols) {
        if (!geometry.dark[row * geometry.cols + col]) { col++; continue; }
        const start = col;
        while (col < geometry.cols && geometry.dark[row * geometry.cols + col]) col++;
        rects.push(`<rect x="${start + q}" y="${row + q}" width="${col - start}" height="1"/>`);
      }
    }
  }
  const widthMm = round(widthModules * options.xMm);
  const heightMm = round(heightModules * options.xMm);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" ` +
    `viewBox="0 0 ${widthModules} ${heightModules}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`
  );
}
