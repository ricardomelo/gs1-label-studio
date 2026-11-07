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

/** The grey level, 0 (black) to 255 (white), below which a pixel prints dark: half way, unless the image's darkness is changed. */
export const PICTURE_THRESHOLD = 128;

/** The thresholds the image's darkness may take (backlog 4.2): none so low that nothing prints, nor so high that all does. */
export const PICTURE_THRESHOLD_MIN = 13;
export const PICTURE_THRESHOLD_MAX = 243;

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
 * The grey each pixel of `rgba` (four bytes a pixel, as a canvas gives them) shows on the label's paper, 0 (black) to
 * 255 (white): its grey by ITU-R BT.601's weights, over white by its transparency, so a transparent pixel is light.
 * The editor keeps these while the file is open, so that the image's darkness can be changed (`pictureFromGrey`).
 */
export function greyLevels(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  checkSize(width, height);
  if (rgba.length !== width * height * 4) throw new InputError("The image has no pixels.");
  const grey = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const own = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    grey[p] = Math.round(255 - (rgba[i + 3]! / 255) * (255 - own));
  }
  return grey;
}

/**
 * The picture of the grey levels `grey` (`greyLevels`), a pixel dark below `threshold`: the higher the threshold, the
 * more of a logo's light colours print dark (the image's darkness, backlog 4.2). Dithered (`dither`), a photo's greys
 * become dots, the darker the closer together (`dithered`), and the threshold darkens the greys instead.
 */
export function pictureFromGrey(grey: ArrayLike<number>, width: number, height: number, threshold = PICTURE_THRESHOLD, dither = false): Picture {
  checkSize(width, height);
  if (grey.length !== width * height) throw new InputError("The image has no pixels.");
  if (dither) return pictureFrom(dithered(Float32Array.from(grey, (level) => toned(level, threshold)), width, height));
  const dark = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) if (grey[p]! < threshold) dark[p] = 1;
  return pictureFrom({ width, height, dark });
}

/** The picture of `rgba` (four bytes a pixel, as a canvas gives them): its `greyLevels`, dark below `threshold`. */
export function pictureOf(rgba: ArrayLike<number>, width: number, height: number, threshold = PICTURE_THRESHOLD, dither = false): Picture {
  return pictureFromGrey(greyLevels(rgba, width, height), width, height, threshold, dither);
}

/**
 * A grey level as a dithered picture takes it at `threshold`: unchanged at the usual threshold; above it, darker by a
 * curve that sends the threshold's grey to half way (so half its dots print) and keeps white white and black black, so
 * that the paper around a photo stays clean; below it, lighter.
 */
export function toned(level: number, threshold: number): number {
  if (threshold === PICTURE_THRESHOLD) return level;
  return 255 * (level / 255) ** (Math.log(0.5) / Math.log(threshold / 255));
}

/**
 * The greys `grey` (0 black to 255 white, a pixel's own at `y * width + x`) as dots by Floyd and Steinberg's error
 * diffusion: each pixel prints dark below half way and hands what it got wrong to the pixels right of it and below,
 * 7, 3, 5 and 1 sixteenths, every other row from right to left (fewer worm-like trails). A grey area prints as dots
 * as many as its darkness; black and white stay as they are. `grey` is used up.
 */
export function dithered(grey: Float32Array, width: number, height: number): Bitmap {
  const dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const back = y % 2 === 1;
    for (let i = 0; i < width; i++) {
      const x = back ? width - 1 - i : i;
      const p = y * width + x;
      const level = grey[p]!;
      const printed = level < 128 ? 0 : 255;
      if (!printed) dark[p] = 1;
      const error = level - printed;
      if (!error) continue;
      const ahead = back ? -1 : 1;
      if (x + ahead >= 0 && x + ahead < width) grey[p + ahead]! += (error * 7) / 16;
      if (y + 1 < height) {
        if (x - ahead >= 0 && x - ahead < width) grey[p + width - ahead]! += (error * 3) / 16;
        grey[p + width]! += (error * 5) / 16;
        if (x + ahead >= 0 && x + ahead < width) grey[p + width + ahead]! += error / 16;
      }
    }
  }
  return { width, height, dark };
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
 * A dithered bitmap at `width` × `height` (a printer's dots), dithered again there: each dot takes the share of its
 * area that the pixels under it print dark, and those greys are dithered (`dithered`). Taking the pixel under each
 * dot's centre (`resample`) would print a fine pattern of dots darker or lighter than it is, or even solid, when the
 * dots are fewer than the pixels; at the picture's own size or a whole multiple of it, the dots are the pixels'.
 */
export function redithered(bitmap: Bitmap, width: number, height: number): Bitmap {
  const grey = new Float32Array(width * height);
  const [sx, sy] = [bitmap.width / width, bitmap.height / height];
  for (let y = 0; y < height; y++) {
    const [top, bottom] = [y * sy, (y + 1) * sy];
    for (let x = 0; x < width; x++) {
      const [left, right] = [x * sx, (x + 1) * sx];
      let covered = 0;
      for (let py = Math.floor(top); py < Math.min(bitmap.height, Math.ceil(bottom)); py++) {
        const h = Math.min(bottom, py + 1) - Math.max(top, py);
        for (let px = Math.floor(left); px < Math.min(bitmap.width, Math.ceil(right)); px++) {
          if (bitmap.dark[py * bitmap.width + px]) covered += h * (Math.min(right, px + 1) - Math.max(left, px));
        }
      }
      grey[y * width + x] = 255 * (1 - covered / (sx * sy));
    }
  }
  return dithered(grey, width, height);
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
