/**
 * Thermal and thermal transfer printers print on a grid of dots (203, 300 or 600 dpi; some 152 or 406). A module must
 * be a whole number of dots, or the printer rounds each bar and space differently and the symbol's bar widths drift.
 * So a printer output never prints the X-dimension asked: it prints the nearest whole number of dots, and the studio
 * shows the X-dimension actually printed and checks it against the range of the application's symbol specification
 * table (GS1 General Specifications, section 5.12.3).
 */
export const MM_PER_INCH = 25.4;
export const COMMON_DPI = [152, 203, 300, 406, 600] as const;

export interface DotSnap {
  /** Dots per module. */
  dots: number;
  /** The X-dimension the printer prints, in mm. */
  xMm: number;
}

/** The whole number of dots per module nearest to `xMm` at `dpi`, never fewer than one. */
export function snapToDots(xMm: number, dpi: number): DotSnap {
  const dotMm = MM_PER_INCH / dpi;
  const dots = Math.max(1, Math.round(xMm / dotMm));
  return { dots, xMm: dots * dotMm };
}

/**
 * Every whole number of dots per module whose X-dimension lies within [minMm, maxMm] at `dpi`, smallest first. Empty
 * when the printer cannot print the symbol within the range (a 203 dpi printer has 0.125 mm dots: 0.250, 0.375,
 * 0.500 mm… so an EAN-13 at 100 % — 0.330 mm — prints at 0.375 mm, 114 %).
 */
export function dotsWithin(minMm: number, maxMm: number, dpi: number): DotSnap[] {
  const dotMm = MM_PER_INCH / dpi;
  const options: DotSnap[] = [];
  for (let dots = Math.max(1, Math.ceil(minMm / dotMm - 1e-9)); dots * dotMm <= maxMm + 1e-9; dots++) {
    options.push({ dots, xMm: dots * dotMm });
  }
  return options;
}
