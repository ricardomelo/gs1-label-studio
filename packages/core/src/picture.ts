import type { Bitmap } from "./raster.ts";
import { InputError } from "./syntax.ts";

// An image on a label of one's own (backlog 4.2, step d): a logo, kept as label printers print it — one bit a pixel,
// dark or light — so that what the editor draws is what ZPL's ^GF sends, and the work file holds it in a few kilobytes.
// The browser decodes the file (PNG, JPEG, GIF, WebP, SVG) and gives its pixels; the core turns them into the picture,
// draws it on the page and sends it to the printer at the printer's dots.

/** A one-bit picture: `width` × `height` pixels, each row in whole bytes, leftmost pixel in the highest bit, base64. */
export interface Picture {
  width: number;
  height: number;
  bits: string;
}

/**
 * The longest side a picture may have, in pixels: a 50 mm logo at 300 dpi takes 591 dots, and the work file carries
 * the picture (in a ZPL's ^FX comments too), so the browser scales a larger image down to this.
 */
export const PICTURE_MAX_SIDE = 600;

/** The grey level, 0 (black) to 255 (white), below which a pixel prints dark: half way. */
export const PICTURE_THRESHOLD = 128;

const bytesPerRow = (width: number) => Math.ceil(width / 8);

function checkSize(width: number, height: number): void {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1)) {
    throw new InputError("The image has no pixels.");
  }
  if (Math.max(width, height) > PICTURE_MAX_SIDE) {
    throw new InputError(`The image is ${width} × ${height} pixels: an image on the label takes at most ${PICTURE_MAX_SIDE} pixels a side.`);
  }
}

/**
 * The picture of `rgba` (four bytes a pixel, as a canvas gives them): each pixel's grey (ITU-R BT.601's weights) over
 * white by its transparency, dark below `threshold`. A transparent pixel is light, as the label's paper is.
 */
export function pictureOf(rgba: ArrayLike<number>, width: number, height: number, threshold = PICTURE_THRESHOLD): Picture {
  checkSize(width, height);
  if (rgba.length !== width * height * 4) throw new InputError("The image has no pixels.");
  const row = bytesPerRow(width);
  const bytes = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const grey = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
      const seen = 255 - (rgba[i + 3]! / 255) * (255 - grey);
      if (Math.round(seen) < threshold) bytes[y * row + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { width, height, bits: btoa(binary) };
}

/** The picture's pixels, `dark[y * width + x]`; a picture whose bits do not fill its size raises an `InputError`. */
export function pictureBitmap(picture: Picture): Bitmap {
  const { width, height } = picture;
  checkSize(width, height);
  let binary: string;
  try {
    binary = atob(picture.bits);
  } catch {
    throw new InputError("The image's pixels are damaged.");
  }
  const row = bytesPerRow(width);
  if (binary.length !== row * height) throw new InputError("The image's pixels are damaged.");
  const dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary.charCodeAt(y * row + (x >> 3)) & (0x80 >> (x & 7))) dark[y * width + x] = 1;
    }
  }
  return { width, height, dark };
}

/** A bitmap as a picture: one bit a pixel, rows in whole bytes, leftmost pixel in the highest bit, base64. */
function pictureFrom(bitmap: Bitmap): Picture {
  const { width, height, dark } = bitmap;
  const row = bytesPerRow(width);
  const bytes = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (dark[y * width + x]) bytes[y * row + (x >> 3)]! |= 0x80 >> (x & 7);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { width, height, bits: btoa(binary) };
}

/**
 * The picture turned clockwise by `rotation` degrees, a quarter turn at a time (backlog 4.2): the printer is sent the
 * picture as turned, as no printer language turns a graphic field.
 */
export function turnedPicture(picture: Picture, rotation: 0 | 90 | 180 | 270): Picture {
  if (!rotation) return picture;
  const { width: w, height: h, dark } = pictureBitmap(picture);
  const [width, height] = rotation === 180 ? [w, h] : [h, w];
  const turned = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [tx, ty] = rotation === 90 ? [h - 1 - y, x] : rotation === 180 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
      turned[ty * width + tx] = dark[y * w + x]!;
    }
  }
  return pictureFrom({ width, height, dark: turned });
}

/** The bitmap at `width` × `height` (a printer's dots): each dot takes the pixel under its centre. */
export function resample(bitmap: Bitmap, width: number, height: number): Bitmap {
  const dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(bitmap.height - 1, Math.floor(((y + 0.5) * bitmap.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(bitmap.width - 1, Math.floor(((x + 0.5) * bitmap.width) / width));
      dark[y * width + x] = bitmap.dark[sy * bitmap.width + sx]!;
    }
  }
  return { width, height, dark };
}

/**
 * The bitmap's dark pixels as rectangles `[x, y, width, height]` in pixels: each row's runs, a run that the row above
 * has at the same place growing down instead of starting again (fewer rectangles for the SVG and PDF).
 */
export function bitmapRects(bitmap: Bitmap): [number, number, number, number][] {
  const rects: [number, number, number, number][] = [];
  let open = new Map<string, [number, number, number, number]>();
  for (let y = 0; y < bitmap.height; y++) {
    const next = new Map<string, [number, number, number, number]>();
    for (let x = 0; x < bitmap.width; x++) {
      if (!bitmap.dark[y * bitmap.width + x]) continue;
      const start = x;
      while (x + 1 < bitmap.width && bitmap.dark[y * bitmap.width + x + 1]) x++;
      const key = `${start},${x}`;
      const above = open.get(key);
      if (above) {
        above[3]++;
        next.set(key, above);
      } else {
        const rect: [number, number, number, number] = [start, y, x - start + 1, 1];
        rects.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  return rects;
}
