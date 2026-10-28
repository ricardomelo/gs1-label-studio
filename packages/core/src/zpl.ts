import type { Bitmap } from "./raster.ts";

/**
 * ZPL II through a graphic field (^GFA): the symbol drawn by the studio, sent as an image. Every ZPL printer and every
 * ZPL emulation (Honeywell, SATO, TSC, Godex, Citizen, Elgin, Argox…) prints a graphic field the same way, whereas
 * their native barcode commands differ in how they take GS1 data (FNC1, AI separators). Native commands come later,
 * per symbology, where they are proven to give the same symbol.
 */
export function bitmapToGraphicField(bitmap: Bitmap): string {
  const bytesPerRow = Math.ceil(bitmap.width / 8);
  let hex = "";
  for (let y = 0; y < bitmap.height; y++) {
    for (let byte = 0; byte < bytesPerRow; byte++) {
      let value = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit;
        if (x < bitmap.width && bitmap.dark[y * bitmap.width + x]) value |= 0x80 >> bit;
      }
      hex += value.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  const total = bytesPerRow * bitmap.height;
  return `^GFA,${total},${total},${bytesPerRow},${hex}`;
}

export interface ZplLabelOptions {
  /** Label width and height in dots. */
  widthDots: number;
  heightDots: number;
  /** Position of the symbol's top left corner, in dots. */
  x: number;
  y: number;
  copies?: number;
}

/** One label with one symbol. */
export function zplLabel(bitmap: Bitmap, options: ZplLabelOptions): string {
  return [
    "^XA",
    "^CI28",
    `^PW${options.widthDots}`,
    `^LL${options.heightDots}`,
    `^FO${options.x},${options.y}${bitmapToGraphicField(bitmap)}^FS`,
    `^PQ${options.copies ?? 1}`,
    "^XZ",
    "",
  ].join("\n");
}
