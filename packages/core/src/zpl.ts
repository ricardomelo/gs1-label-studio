import type { Bitmap } from "./raster.ts";

/**
 * ZPL II through a graphic field (^GFA): the symbol drawn by the studio, sent as an image. Every ZPL printer and every
 * ZPL emulation (Honeywell, SATO, TSC, Godex, Citizen, Elgin, Argox…) prints a graphic field the same way, whereas
 * their native barcode commands differ in how they take GS1 data (FNC1, AI separators). Native commands come later,
 * per symbology, where they are proven to give the same symbol.
 */
/**
 * The largest graphic field: the byte counts of ^GF take 1 to 99999 (ZPL II Programming Guide, P1134473-11EN Rev A,
 * ^GF). A larger image — a whole label at 300 or 600 dpi, a big 2D symbol at 600 dpi — is sent as horizontal stripes.
 */
export const MAX_GRAPHIC_FIELD_BYTES = 99999;

/** Rows `fromRow` (inclusive) to `toRow` (exclusive) of `bitmap` as one ^GFA, eight dots a byte, leftmost dot first. */
export function bitmapToGraphicField(bitmap: Bitmap, fromRow = 0, toRow = bitmap.height): string {
  const bytesPerRow = Math.ceil(bitmap.width / 8);
  let hex = "";
  for (let y = fromRow; y < toRow; y++) {
    for (let byte = 0; byte < bytesPerRow; byte++) {
      let value = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit;
        if (x < bitmap.width && bitmap.dark[y * bitmap.width + x]) value |= 0x80 >> bit;
      }
      hex += value.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  const total = bytesPerRow * (toRow - fromRow);
  if (total > MAX_GRAPHIC_FIELD_BYTES) throw new Error(`a graphic field holds at most ${MAX_GRAPHIC_FIELD_BYTES} bytes`);
  return `^GFA,${total},${total},${bytesPerRow},${hex}`;
}

/** The bitmap placed at (x, y) in dots, as one field or as stripes that each fit a graphic field. */
export function graphicFields(bitmap: Bitmap, x: number, y: number): string[] {
  const rowsPerField = Math.floor(MAX_GRAPHIC_FIELD_BYTES / Math.ceil(bitmap.width / 8));
  if (rowsPerField < 1) throw new Error("the image is too wide for a graphic field");
  const fields: string[] = [];
  for (let row = 0; row < bitmap.height; row += rowsPerField) {
    const end = Math.min(bitmap.height, row + rowsPerField);
    fields.push(`^FO${x},${y + row}${bitmapToGraphicField(bitmap, row, end)}^FS`);
  }
  return fields;
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
    ...graphicFields(bitmap, options.x, options.y),
    `^PQ${options.copies ?? 1}`,
    "^XZ",
    "",
  ].join("\n");
}
