import { describe, expect, it } from "vitest";
import { bitmapRects, dithered, greyLevels, InputError, PICTURE_MAX_SIDE, PICTURE_THRESHOLD, PICTURE_THRESHOLD_MAX, PICTURE_THRESHOLD_MIN, pictureBitmap, pictureFromGrey, pictureOf, redithered, resample, toned, type Bitmap } from "../src/index.ts";
import { logo } from "./fixtures/graphics.ts";

// An image on a label of one's own (backlog 4.2, step d): a one-bit picture, as label printers print it.

/** Pixels of one colour each, `[r, g, b, a]`, in a row. */
const row = (...pixels: number[][]) => Uint8Array.from(pixels.flat());

describe("a picture", () => {
  it("is dark where a pixel's grey over white is below half way, a transparent pixel light", () => {
    const picture = pictureOf(row([0, 0, 0, 255], [255, 255, 255, 255], [127, 127, 127, 255], [128, 128, 128, 255], [0, 0, 0, 0], [0, 0, 0, 120], [0, 0, 0, 140], [255, 214, 0, 255], [27, 94, 32, 255]), 9, 1);
    expect([...pictureBitmap(picture).dark]).toEqual([1, 0, 1, 0, 0, 0, 1, 0, 1]);
  });

  it("is made from the grey levels the pixels show on paper, darker as the threshold rises (the image's darkness)", () => {
    const rgba = row([0, 0, 0, 255], [255, 255, 255, 255], [127, 127, 127, 255], [128, 128, 128, 255], [0, 0, 0, 0], [0, 0, 0, 120], [200, 200, 200, 255], [255, 214, 0, 255], [27, 94, 32, 255]);
    const grey = greyLevels(rgba, 9, 1);
    expect([...grey]).toEqual([0, 255, 127, 128, 255, 135, 200, 202, 67]);
    const dark = (threshold?: number) => [...pictureBitmap(pictureFromGrey(grey, 9, 1, threshold)).dark];
    expect(dark()).toEqual([...pictureBitmap(pictureOf(rgba, 9, 1)).dark]);
    expect(dark(PICTURE_THRESHOLD)).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 1]);
    expect(dark(128)).toEqual(dark(PICTURE_THRESHOLD));
    expect(dark(PICTURE_THRESHOLD_MIN)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]); // only what is near black
    expect(dark(136)).toEqual([1, 0, 1, 1, 0, 1, 0, 0, 1]); // a grey at 128 and the half-transparent black join in
    expect(dark(PICTURE_THRESHOLD_MAX)).toEqual([1, 0, 1, 1, 0, 1, 1, 1, 1]); // the light grey and the yellow too; white never
    expect(pictureOf(rgba, 9, 1, 136)).toEqual(pictureFromGrey(grey, 9, 1, 136));
    expect(() => pictureFromGrey(grey, 8, 1)).toThrow("The image has no pixels.");
    expect(() => greyLevels(rgba, 8, 1)).toThrow("The image has no pixels.");
    expect(() => pictureFromGrey(new Uint8Array(PICTURE_MAX_SIDE + 1), PICTURE_MAX_SIDE + 1, 1)).toThrow(`at most ${PICTURE_MAX_SIDE} pixels a side`);
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

  // Dithering (backlog 4.2, 7 November 2026): a photo's greys as dots, as many as its darkness, for a printer that
  // prints only black dots.
  /** The share of a bitmap's pixels that are dark. */
  const share = (bitmap: Bitmap) => bitmap.dark.reduce((a, b) => a + b, 0) / bitmap.dark.length;
  /** A flat grey `level`, `width` × `height`. */
  const flat = (level: number, width: number, height: number) => new Float32Array(width * height).fill(level);

  it("is dithered by error diffusion: each grey as dots as many as its darkness, black and white as they are", () => {
    // By hand: 96 prints dark and hands 7/16 right, 5/16 and 1/16 below; 138 light, -117 handed 3/16 and 5/16 below;
    // the second row runs right to left, 65.4 dark handing 7/16 left, 132.7 light (left to right it would be 1, 0, 1, 1)
    expect([...dithered(flat(96, 2, 2), 2, 2).dark]).toEqual([1, 0, 0, 1]);
    expect([...dithered(flat(128, 4, 1), 4, 1).dark]).toEqual([0, 1, 0, 1]);
    for (const level of [0, 32, 64, 128, 192, 224, 255]) {
      expect(share(dithered(flat(level, 200, 200), 200, 200))).toBeCloseTo((255 - level) / 255, 2);
    }
    // A grey at half way as a fine checkerboard: nearly every pixel unlike the one to its right
    const half = dithered(flat(128, 100, 100), 100, 100);
    let unlike = 0;
    for (let y = 0; y < 100; y++) for (let x = 0; x < 99; x++) unlike += half.dark[y * 100 + x] !== half.dark[y * 100 + x + 1] ? 1 : 0;
    expect(unlike / (100 * 99)).toBeGreaterThan(0.9);
  });

  it("is dithered from its grey levels at its darkness, which darkens or lightens the greys and keeps white and black", () => {
    expect(toned(77, PICTURE_THRESHOLD)).toBe(77);
    expect(toned(205, 205)).toBeCloseTo(127.5, 6); // the threshold's grey sent to half way
    expect(toned(64, 64)).toBeCloseTo(127.5, 6);
    for (const threshold of [PICTURE_THRESHOLD_MIN, 64, 205, PICTURE_THRESHOLD_MAX]) {
      expect(toned(0, threshold)).toBe(0);
      expect(toned(255, threshold)).toBe(255);
    }
    expect(toned(200, 205)).toBeLessThan(200);
    expect(toned(200, 64)).toBeGreaterThan(200);
    const grey = new Uint8Array(300 * 200).fill(160);
    const at = (threshold: number) => share(pictureBitmap(pictureFromGrey(grey, 300, 200, threshold, true)));
    expect(at(PICTURE_THRESHOLD)).toBeCloseTo(1 - 160 / 255, 2);
    expect(at(205)).toBeGreaterThan(at(PICTURE_THRESHOLD) + 0.1);
    expect(at(64)).toBeLessThan(at(PICTURE_THRESHOLD) - 0.1);
    expect(pictureFromGrey(grey, 300, 200, PICTURE_THRESHOLD, true)).not.toEqual(pictureFromGrey(grey, 300, 200));
    expect(share(pictureBitmap(pictureFromGrey(grey, 300, 200)))).toBe(0); // at the threshold, all of it light
    const rgba = row([0, 0, 0, 255], [128, 128, 128, 255], [128, 128, 128, 255], [255, 255, 255, 255]);
    expect(pictureOf(rgba, 4, 1, 160, true)).toEqual(pictureFromGrey(greyLevels(rgba, 4, 1), 4, 1, 160, true));
    expect(() => pictureFromGrey(grey, 299, 200, PICTURE_THRESHOLD, true)).toThrow("The image has no pixels.");
  });

  it("is dithered again at a printer's dots when dithered, where each dot under its centre would print it wrong", () => {
    const half = dithered(flat(128, 200, 200), 200, 200);
    expect(Math.abs(share(resample(half, 100, 100)) - 0.5)).toBeGreaterThan(0.2); // every other pixel of a checkerboard
    for (const [w, h] of [[100, 100], [87, 133], [150, 61], [317, 250]] as const) expect(share(redithered(half, w, h))).toBeCloseTo(0.5, 2);
    // At its own size or a whole multiple of it, the dots are the pixels'
    expect(redithered(half, 200, 200)).toEqual(half);
    expect(redithered(half, 400, 600)).toEqual(resample(half, 400, 600));
    // Black stays black and white white; an edge falls where it was
    const edge: Bitmap = { width: 10, height: 4, dark: Uint8Array.from({ length: 40 }, (_, p) => (p % 10 < 5 ? 1 : 0)) };
    expect([...redithered(edge, 4, 3).dark]).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
    expect([...redithered(edge, 3, 2).dark].filter((_, p) => p % 3 !== 1)).toEqual([1, 0, 1, 0]);
  });
});
