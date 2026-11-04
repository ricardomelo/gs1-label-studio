import { PICTURE_MAX_SIDE, pictureOf, type Picture } from "@gs1-label-studio/core";
import { t } from "./i18n.ts";

// An image file for a label of one's own (backlog 4.2, step d): the browser decodes it (PNG, JPEG, GIF, WebP, SVG),
// scales it so that its longest side is no more than the core takes, and gives its pixels to the core, which makes the
// one-bit picture that label printers print.

/** An SVG without a size of its own is drawn this many pixels a side. */
const SVG_SIDE = 400;

/** The pixel size an image of `width` × `height` is drawn at: its own, or scaled down to `PICTURE_MAX_SIDE`. */
export function drawnSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PICTURE_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The file's picture; refused (an Error with a message for the person) when the browser cannot read it as an image. */
export async function pictureFromFile(file: File): Promise<Picture> {
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
    return pictureOf(context.getImageData(0, 0, width, height).data, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
