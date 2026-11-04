import { describe, expect, it } from "vitest";
import { bitmapRects, InputError, PICTURE_MAX_SIDE, pictureBitmap, pictureOf, resample, type Bitmap } from "../src/index.ts";
import { logo } from "./fixtures/graphics.ts";

// An image on a label of one's own (backlog 4.2, step d): a one-bit picture, as label printers print it.

/** Pixels of one colour each, `[r, g, b, a]`, in a row. */
const row = (...pixels: number[][]) => Uint8Array.from(pixels.flat());

describe("a picture", () => {
  it("is dark where a pixel's grey over white is below half way, a transparent pixel light", () => {
    const picture = pictureOf(row([0, 0, 0, 255], [255, 255, 255, 255], [127, 127, 127, 255], [128, 128, 128, 255], [0, 0, 0, 0], [0, 0, 0, 120], [0, 0, 0, 140], [255, 214, 0, 255], [27, 94, 32, 255]), 9, 1);
    expect([...pictureBitmap(picture).dark]).toEqual([1, 0, 1, 0, 0, 0, 1, 0, 1]);
  });

  it("keeps each row in whole bytes, leftmost pixel in the highest bit, and gives back the same pixels", () => {
    const dark = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const rgba = Uint8Array.from(dark.flatMap((d) => (d ? [0, 0, 0, 255] : [255, 255, 255, 255])));
    const picture = pictureOf(rgba, 9, 2);
    expect([...atob(picture.bits)].map((c) => c.charCodeAt(0))).toEqual([0x80, 0x80, 0x40, 0x00]);
    expect([...pictureBitmap(picture).dark]).toEqual(dark);
    const big = logo();
    expect(pictureBitmap(big).dark.reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
  });

  it("refuses an image without pixels, one larger than the studio takes, and bits that do not fill it", () => {
    expect(() => pictureOf(new Uint8Array(0), 0, 0)).toThrow(InputError);
    expect(() => pictureOf(new Uint8Array(4 * (PICTURE_MAX_SIDE + 1)), PICTURE_MAX_SIDE + 1, 1)).toThrow(`at most ${PICTURE_MAX_SIDE} pixels a side`);
    expect(() => pictureOf(new Uint8Array(4 * PICTURE_MAX_SIDE), PICTURE_MAX_SIDE, 1)).not.toThrow();
    expect(() => pictureOf(new Uint8Array(8), 3, 1)).toThrow(InputError);
    expect(() => pictureBitmap({ width: 9, height: 2, bits: btoa("\x80\x80\x80") })).toThrow("The image's pixels are damaged.");
    expect(() => pictureBitmap({ width: 9, height: 2, bits: btoa("\x80\x80\x80\x40\x00") })).toThrow("The image's pixels are damaged.");
    expect(() => pictureBitmap({ width: 9, height: 2, bits: btoa("\x80\x80\x80\x40") })).not.toThrow();
    expect(() => pictureBitmap({ width: 9, height: 2, bits: "not base64!" })).toThrow("The image's pixels are damaged.");
  });

  it("is resampled to a printer's dots, each dot the pixel under its centre", () => {
    const bitmap: Bitmap = { width: 2, height: 2, dark: Uint8Array.from([1, 0, 0, 1]) };
    expect([...resample(bitmap, 4, 2).dark]).toEqual([1, 1, 0, 0, 0, 0, 1, 1]);
    expect([...resample(bitmap, 4, 4).dark]).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]);
    const three: Bitmap = { width: 3, height: 1, dark: Uint8Array.from([0, 1, 0]) };
    expect([...resample(three, 1, 1).dark]).toEqual([1]);
    expect([...resample(three, 3, 1).dark]).toEqual([0, 1, 0]);
  });

  it("is drawn as rectangles that cover its dark pixels and nothing else, a run the row above has growing down", () => {
    const bitmap = pictureBitmap(logo());
    const rects = bitmapRects(bitmap);
    const covered = new Uint8Array(bitmap.width * bitmap.height);
    for (const [x, y, w, h] of rects) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) covered[yy * bitmap.width + xx]! += 1;
    }
    expect([...covered]).toEqual([...bitmap.dark]);
    expect(bitmapRects({ width: 3, height: 3, dark: Uint8Array.from([1, 1, 0, 1, 1, 0, 0, 0, 1]) })).toEqual([[0, 0, 2, 2], [2, 2, 1, 1]]);
    const runs = [...Array(bitmap.height).keys()].reduce((n, y) => n + bitmapRects({ width: bitmap.width, height: 1, dark: bitmap.dark.subarray(y * bitmap.width, (y + 1) * bitmap.width) }).length, 0);
    expect(rects.length).toBeLessThan(runs);
  });
});
