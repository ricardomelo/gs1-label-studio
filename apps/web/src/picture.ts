import { greyLevels, PICTURE_MAX_SIDE, PICTURE_THRESHOLD, pictureFromGrey, type Picture } from "@gs1-label-studio/core";
import { t } from "./i18n.ts";

// An image file for a label of one's own (backlog 4.2, step d): the browser decodes it (PNG, JPEG, GIF, WebP, SVG),
// scales it so that its longest side is no more than the core takes, and gives its pixels to the core, which makes the
// one-bit picture that label printers print. The file's grey levels are kept beside each picture made from them, in
// this page's memory only (the work keeps the one-bit picture, a few kilobytes), so that the image's darkness can be
// changed, and the picture dithered for a photo, until the page is reloaded; after that, choosing the file again brings
// them back.

/** A file's grey levels (`greyLevels`), from which its picture is made at any darkness. */
interface Grey {
  grey: Uint8Array;
  width: number;
  height: number;
}

/** The grey levels each picture was made from, while this page lives. */
const greys = new WeakMap<Picture, Grey>();

function made(grey: Grey, threshold: number, dither: boolean): Picture {
  const picture = pictureFromGrey(grey.grey, grey.width, grey.height, threshold, dither);
  greys.set(picture, grey);
  return picture;
}

/** Whether the picture's darkness and dithering can be changed: its file was chosen since the page was loaded. */
export const canDarken = (picture: Picture): boolean => greys.has(picture);

/**
 * The picture made again from its file's grey levels, dark below `threshold`, or dithered at that darkness; null when
 * they are not kept.
 */
export function darkened(picture: Picture, threshold: number, dither = false): Picture | null {
  const grey = greys.get(picture);
  return grey ? made(grey, threshold, dither) : null;
}

/** A darkness in per cent (5 to 95, 50 the usual) as the threshold below which a pixel prints dark, and back. */
export const thresholdOf = (percent: number): number => Math.round((percent * 256) / 100);
export const percentOf = (threshold: number): number => Math.round((threshold * 100) / 256);

/** An SVG without a size of its own is drawn this many pixels a side. */
const SVG_SIDE = 400;

/** The pixel size an image of `width` × `height` is drawn at: its own, or scaled down to `PICTURE_MAX_SIDE`. */
export function drawnSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PICTURE_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The file's picture, dark below `threshold` or dithered at that darkness; refused (an Error with a message for the person) when the browser cannot
 * read it as an image.
 */
export async function pictureFromFile(file: File, threshold = PICTURE_THRESHOLD, dither = false): Promise<Picture> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(t("“{name}” is not an image this browser can read: choose a PNG, JPEG, GIF, WebP or SVG file.", { name: file.name }));
    }
    const own = { width: image.naturalWidth || SVG_SIDE, height: image.naturalHeight || SVG_SIDE };
    const { width, height } = drawnSize(own.width, own.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, width, height);
    return made({ grey: greyLevels(context.getImageData(0, 0, width, height).data, width, height), width, height }, threshold, dither);
  } finally {
    URL.revokeObjectURL(url);
  }
}
