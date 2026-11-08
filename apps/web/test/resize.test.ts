import {
  ENVIRONMENTS, HriFont, layoutLabel, SIZES, specificationFor, specSizesFor, type DesignBox, type DesignImage, type DesignLine,
  type DesignSymbol, type DesignText, type LabelOptions, type PlacedElement, type Rotation,
} from "@gs1-label-studio/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boxAfter, handleAt, heldResize, keyResized, nearest, resized, symbolSizing, TEXT_HEIGHTS, type SymbolSizing } from "../src/resize.ts";

// Resizing an element by dragging its bottom right corner on a label of one's own (backlog 4.2, mock-up A of two,
// 7 November 2026): its top left corner kept, a box to the corner, a line to its length, an image, a barcode and a text
// block along their diagonal, a barcode and a text block to the sizes their properties offer.

const at = (xMm: number, yMm: number, widthMm: number, heightMm: number): PlacedElement => ({ id: "e1", xMm, yMm, widthMm, heightMm });

describe("resizing by dragging a corner", () => {
  it("gives a box the corner's width and height by half millimetres, its corner and outline kept", () => {
    const box: DesignBox = { id: "e1", kind: "box", widthMm: 20, heightMm: 10, thicknessMm: 0.5, filled: false, xMm: 5, yMm: 4 };
    expect(resized(box, at(5, 4, 20, 10), 40.2, 20.3)).toEqual({ ...box, widthMm: 35, heightMm: 16.5 });
    expect(resized(box, at(5, 4, 20, 10), 32.76, 14)).toEqual({ ...box, widthMm: 28, heightMm: 10 });
    // Never smaller than a step, even past its top left corner
    expect(resized(box, at(5, 4, 20, 10), 1, 2)).toEqual({ ...box, widthMm: 0.5, heightMm: 0.5 });
  });

  it("gives a line its length across or down, whichever way the corner moves the other", () => {
    const across: DesignLine = { id: "e1", kind: "line", vertical: false, lengthMm: 40, thicknessMm: 0.5, xMm: 4, yMm: 4 };
    expect(resized(across, at(4, 4, 40, 0.5), 60, 30)).toEqual({ ...across, lengthMm: 56 });
    const down: DesignLine = { ...across, vertical: true };
    expect(resized(down, at(4, 4, 0.5, 40), 60, 30)).toEqual({ ...down, lengthMm: 26 });
  });

  it("keeps an image's proportions, its width following the corner along its diagonal, turned or not", () => {
    const picture = { width: 360, height: 150, bits: "" };
    const image: DesignImage = { id: "e1", kind: "image", name: "logo", picture, widthMm: 20, xMm: 60, yMm: 6 };
    // Upright, 20 × 8.33 mm: the corner half as far again along the diagonal gives 30 mm
    expect(resized(image, at(60, 6, 20, 25 / 3), 90, 6 + 12.5)).toEqual({ ...image, widthMm: 30 });
    // Off the diagonal, the nearest point of it: right by 10 mm and no lower gives about 28.5 mm
    expect(resized(image, at(60, 6, 20, 25 / 3), 90, 6 + 25 / 3)).toEqual({ ...image, widthMm: 28.5 });
    // A quarter turn: the box is 8.33 wide and 20 high, and a corner 10 mm lower still makes it half as large again
    const turned = { ...image, rotation: 90 as const };
    expect(resized(turned, at(60, 6, 25 / 3, 20), 60 + 12.5, 36)).toEqual({ ...turned, widthMm: 30 });
    expect(resized(image, at(60, 6, 20, 25 / 3), 59, 5)).toEqual({ ...image, widthMm: 0.5 });
  });

  it("gives a barcode the nearest of the sizes its properties offer, from its size when the drag began", () => {
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 2, yMm: 2 };
    const placed = at(2, 2, 20, 30);
    const to = (scale: number) => resized(symbol, placed, 2 + 20 * scale, 2 + 30 * scale);
    expect(to(1)).toEqual(symbol);
    expect(to(1.5)).toEqual({ ...symbol, size: 150 });
    expect(to(1.16)).toEqual({ ...symbol, size: 120 });
    expect(to(1.04)).toEqual({ ...symbol, size: 100 });
    expect(to(0.94)).toEqual({ ...symbol, size: 90 });
    expect(to(3)).toEqual({ ...symbol, size: 200 });
    expect(to(0.2)).toEqual({ ...symbol, size: 80 });
    const sizes = new Set(Array.from({ length: 60 }, (_, n) => (to(0.5 + n / 20) as DesignSymbol).size));
    expect([...sizes].sort((a, b) => a - b)).toEqual([...SIZES]);
  });

  it("gives a text block the nearest of the heights its properties offer, its text and corner kept", () => {
    const text: DesignText = { id: "e1", kind: "text", text: "BATCH {10}", heightMm: 3, months: "pt", rotation: 270, xMm: 4, yMm: 52 };
    const placed = at(4, 30, 3, 22);
    const to = (scale: number) => resized(text, placed, 4 + 3 * scale, 30 + 22 * scale);
    expect(to(2)).toEqual({ ...text, heightMm: 6 });
    expect(to(1.2)).toEqual({ ...text, heightMm: 3.5 });
    expect(to(0.5)).toEqual({ ...text, heightMm: 2 });
    expect(to(5)).toEqual({ ...text, heightMm: 12 });
  });

  it("finds the nearest value by ratio, so that a step up and a step down weigh the same", () => {
    expect(nearest(TEXT_HEIGHTS, 9)).toBe(10); // 9 is nearer 8 by difference but nearer 10 by ratio (1.11 to 1.125)
    expect(nearest(TEXT_HEIGHTS, 8.9)).toBe(8);
    expect(nearest(SIZES, 135)).toBe(150); // 120 and 150 meet at 134.2
    expect(nearest(SIZES, 134)).toBe(120);
  });
});

describe("a barcode's sizing", () => {
  const bytes = readFileSync(new URL("../../../packages/core/assets/fonts/LiberationSans-Regular.ttf", import.meta.url));
  const font = HriFont.fromBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const written = (options: LabelOptions, rotation: Rotation = 0) =>
    ({ id: "e1", xMm: 2, yMm: 2, rotation, data: options.data, options, layout: layoutLabel(options, font) });
  const qr = (environment: string): LabelOptions => ({
    symbology: "dl-qrcode", data: "https://id.gs1.org/01/09506000134376/10/B42", showHri: true, size: 100, environment, error: "m", version: null,
    hriLines: ["(01)09506000134376", "(10)B42"],
  });

  it("is a QR code's modules alone, not its text, and the sizes its scanning environment allows", () => {
    const symbol = written(qr("retail"));
    const sizing = symbolSizing(symbol);
    const modules = sizing.widthMm / symbol.layout.xMm;
    expect(Number.isInteger(Math.round(modules * 1e6) / 1e6) && (modules - 21) % 4 === 0).toBe(true);
    expect(sizing.heightMm).toBeCloseTo(sizing.widthMm, 9);
    expect(sizing.widthMm).toBeLessThan(symbol.layout.width * symbol.layout.xMm); // its text is wider
    expect(sizing.sizes).toEqual([...SIZES]);
    expect(symbolSizing(written(qr("distribution"))).sizes).toEqual([100, 120, 150, 200]);
  });

  it("is a GS1-128's bars, turned with it, and the sizes its table's row allows", () => {
    const spec = specificationFor(ENVIRONMENTS.logistics!.table, "gs1-128")!;
    const options: LabelOptions = { symbology: "gs1-128", data: "(01)09506000134376", showHri: true, hriLines: ["(01)09506000134376"], size: 100, spec, table: ENVIRONMENTS.logistics!.table };
    const upright = symbolSizing(written(options));
    const turned = symbolSizing(written(options, 90));
    expect(upright.widthMm).toBeGreaterThan(upright.heightMm);
    expect([turned.widthMm, turned.heightMm]).toEqual([upright.heightMm, upright.widthMm]);
    expect(upright.sizes).toEqual(specSizesFor(spec, SIZES));
  });

  it("with the font, lays out its whole box at each size as the page does, turned with it; without it, none", () => {
    const options = qr("retail");
    const sizing = symbolSizing(written(options), font);
    for (const size of SIZES) {
      const layout = layoutLabel({ ...options, size }, font);
      expect(sizing.boxAt!(size)).toEqual({ widthMm: layout.width * layout.xMm, heightMm: layout.height * layout.xMm });
    }
    // Its text keeps its height and width: at 200 % it is less than twice as wide, so its size alone cannot say
    expect(sizing.boxAt!(200)!.widthMm).toBeGreaterThan(sizing.boxAt!(100)!.widthMm);
    expect(sizing.boxAt!(200)!.widthMm).toBeLessThan(sizing.boxAt!(100)!.widthMm * 1.5);
    const spec = specificationFor(ENVIRONMENTS.logistics!.table, "gs1-128")!;
    const gs1128: LabelOptions = { symbology: "gs1-128", data: "(01)09506000134376", showHri: true, hriLines: ["(01)09506000134376"], size: 100, spec, table: ENVIRONMENTS.logistics!.table };
    const upright = symbolSizing(written(gs1128), font).boxAt!(specSizesFor(spec, SIZES).at(-1)!)!;
    const turned = symbolSizing(written(gs1128, 270), font).boxAt!(specSizesFor(spec, SIZES).at(-1)!)!;
    expect([turned.widthMm, turned.heightMm]).toEqual([upright.heightMm, upright.widthMm]);
    // A size it cannot be laid out at
    expect(symbolSizing(written(options), font).boxAt!(75)).toBeUndefined();
    expect(symbolSizing(written(options)).boxAt).toBeUndefined();
  });

  it("makes a barcode follow the corner by its modules: half its side again gives 150 %, and only a size allowed", () => {
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 2, yMm: 2 };
    const written100 = written(qr("distribution"));
    const sizing = symbolSizing(written100);
    const box = at(2, 2, written100.layout.width * written100.layout.xMm, written100.layout.height * written100.layout.xMm);
    const by = (scale: number) => resized(symbol, box, 2 + box.widthMm + sizing.widthMm * (scale - 1), 2 + box.heightMm + sizing.heightMm * (scale - 1), sizing);
    expect(by(1.5)).toEqual({ ...symbol, size: 150 });
    expect(by(2)).toEqual({ ...symbol, size: 200 });
    // Smaller than 100 % is not allowed in general distribution: it stays at 100 %
    expect(by(0.8)).toEqual(symbol);
    // Without its sizing, its whole box, text and all, and every size
    expect(resized(symbol, box, 2 + box.widthMm * 0.8, 2 + box.heightMm * 0.8)).toEqual({ ...symbol, size: 80 });
  });
});

// An element run past the label's edge (mock-up A of two, 7 November 2026): its handle held at the edge, where the
// element is cut, and dragging it from there puts the corner under the pointer.
describe("the handle of an element past the label's edge", () => {
  const page = { widthMm: 100, heightMm: 60 };

  it("is at the box's bottom right corner while it is on the label, its edges included", () => {
    expect(handleAt(at(10, 5, 30, 20), page)).toEqual({ xMm: 40, yMm: 25, past: false });
    expect(handleAt(at(70, 40, 30, 20), page)).toEqual({ xMm: 100, yMm: 60, past: false });
  });

  it("is held within the label, across, down or both, and says so", () => {
    expect(handleAt(at(80, 5, 40, 20), page)).toEqual({ xMm: 100, yMm: 25, past: true });
    expect(handleAt(at(10, 50, 30, 20), page)).toEqual({ xMm: 40, yMm: 60, past: true });
    expect(handleAt(at(90, 55, 30, 20), page)).toEqual({ xMm: 100, yMm: 60, past: true });
    // Wholly off the label, to the left or above
    expect(handleAt(at(-40, -30, 20, 10), page)).toEqual({ xMm: 0, yMm: 0, past: true });
  });

  it("dragged from where it is held, puts the corner under the pointer", () => {
    const box: DesignBox = { id: "e1", kind: "box", widthMm: 40, heightMm: 20, thicknessMm: 0.5, filled: false, xMm: 80, yMm: 5 };
    const placed = at(80, 5, 40, 20);
    const { xMm, yMm } = handleAt(placed, page);
    expect(resized(box, placed, xMm - 1, yMm)).toEqual({ ...box, widthMm: 19, heightMm: 20 });
  });
});

// Resizing from the keyboard (mock-up A of two, 7 November 2026): the arrow keys on the chosen element's handle move its
// corner one step, 0.5 mm, or 5 mm with Shift; a barcode and a text block go to their next size.
describe("resizing from the keyboard", () => {
  it("gives a box half a millimetre, or 5 mm with Shift, across with Right and Left and down with Down and Up", () => {
    const box: DesignBox = { id: "e1", kind: "box", widthMm: 20, heightMm: 10, thicknessMm: 0.5, filled: false, xMm: 5, yMm: 4 };
    const placed = at(5, 4, 20, 10);
    expect(keyResized(box, placed, "ArrowRight", false)).toEqual({ ...box, widthMm: 20.5 });
    expect(keyResized(box, placed, "ArrowLeft", false)).toEqual({ ...box, widthMm: 19.5 });
    expect(keyResized(box, placed, "ArrowDown", false)).toEqual({ ...box, heightMm: 10.5 });
    expect(keyResized(box, placed, "ArrowUp", false)).toEqual({ ...box, heightMm: 9.5 });
    expect(keyResized(box, placed, "ArrowRight", true)).toEqual({ ...box, widthMm: 25 });
    expect(keyResized(box, placed, "ArrowUp", true)).toEqual({ ...box, heightMm: 5 });
    // Never smaller than a step; a size typed off the half millimetres comes back to them
    expect(keyResized({ ...box, widthMm: 3 }, placed, "ArrowLeft", true)).toEqual({ ...box, widthMm: 0.5 });
    expect(keyResized({ ...box, widthMm: 20.3 }, placed, "ArrowRight", false)).toEqual({ ...box, widthMm: 21 });
  });

  it("gives a line its length with the two keys along it, and ignores the other two", () => {
    const across: DesignLine = { id: "e1", kind: "line", vertical: false, lengthMm: 40, thicknessMm: 0.5, xMm: 4, yMm: 4 };
    expect(keyResized(across, at(4, 4, 40, 0.5), "ArrowRight", false)).toEqual({ ...across, lengthMm: 40.5 });
    expect(keyResized(across, at(4, 4, 40, 0.5), "ArrowLeft", true)).toEqual({ ...across, lengthMm: 35 });
    expect(keyResized(across, at(4, 4, 40, 0.5), "ArrowDown", false)).toEqual(across);
    const down: DesignLine = { ...across, vertical: true };
    expect(keyResized(down, at(4, 4, 0.5, 40), "ArrowDown", true)).toEqual({ ...down, lengthMm: 45 });
    expect(keyResized(down, at(4, 4, 0.5, 40), "ArrowUp", false)).toEqual({ ...down, lengthMm: 39.5 });
    expect(keyResized(down, at(4, 4, 0.5, 40), "ArrowRight", false)).toEqual(down);
  });

  it("keeps an image's proportions: Right and Down make it wider, Left and Up narrower, turned or not", () => {
    const picture = { width: 360, height: 150, bits: "" };
    const image: DesignImage = { id: "e1", kind: "image", name: "logo", picture, widthMm: 20, xMm: 60, yMm: 6 };
    const placed = at(60, 6, 20, 25 / 3);
    expect(keyResized(image, placed, "ArrowRight", false)).toEqual({ ...image, widthMm: 20.5 });
    expect(keyResized(image, placed, "ArrowDown", true)).toEqual({ ...image, widthMm: 25 });
    expect(keyResized(image, placed, "ArrowUp", false)).toEqual({ ...image, widthMm: 19.5 });
    expect(keyResized(image, placed, "ArrowLeft", true)).toEqual({ ...image, widthMm: 15 });
    const turned = { ...image, rotation: 90 as const };
    expect(keyResized(turned, at(60, 6, 25 / 3, 20), "ArrowDown", false)).toEqual({ ...turned, widthMm: 20.5 });
  });

  it("gives a barcode its next size, or with Shift the one nearest its modules 5 mm larger, and stops at the ends", () => {
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 2, yMm: 2 };
    const placed = at(2, 2, 24, 30);
    const sizing = { widthMm: 20, heightMm: 20, sizes: SIZES };
    expect(keyResized(symbol, placed, "ArrowRight", false, sizing)).toEqual({ ...symbol, size: 120 });
    expect(keyResized(symbol, placed, "ArrowDown", false, sizing)).toEqual({ ...symbol, size: 120 });
    expect(keyResized(symbol, placed, "ArrowLeft", false, sizing)).toEqual({ ...symbol, size: 90 });
    expect(keyResized(symbol, placed, "ArrowUp", false, sizing)).toEqual({ ...symbol, size: 90 });
    // 20 mm of modules 5 mm larger is 125 %: 120; 10 mm 5 mm larger, 150 %; 10 mm 5 mm smaller, 50 %: the smallest, 80
    expect(keyResized(symbol, placed, "ArrowRight", true, sizing)).toEqual({ ...symbol, size: 120 });
    expect(keyResized(symbol, placed, "ArrowRight", true, { ...sizing, widthMm: 10, heightMm: 10 })).toEqual({ ...symbol, size: 150 });
    expect(keyResized({ ...symbol, size: 150 }, placed, "ArrowLeft", true, { ...sizing, widthMm: 10, heightMm: 10 })).toEqual({ ...symbol, size: 80 });
    // With Shift, at least the next size: 60 mm 5 mm larger is 108 %, nearer 100 than 120
    expect(keyResized(symbol, placed, "ArrowRight", true, { ...sizing, widthMm: 60, heightMm: 60 })).toEqual({ ...symbol, size: 120 });
    // At the ends of the sizes allowed, as it is
    expect(keyResized({ ...symbol, size: 200 }, placed, "ArrowRight", false, sizing)).toEqual({ ...symbol, size: 200 });
    expect(keyResized({ ...symbol, size: 80 }, placed, "ArrowLeft", true, sizing)).toEqual({ ...symbol, size: 80 });
    expect(keyResized(symbol, placed, "ArrowLeft", false, { ...sizing, sizes: [100, 120, 150, 200] })).toEqual(symbol);
    // Without its sizing, its whole box and every size: 30 mm 5 mm larger is 117 %, so 90 becomes 100 and 100 becomes 120
    expect(keyResized({ ...symbol, size: 90 }, placed, "ArrowRight", true)).toEqual({ ...symbol, size: 100 });
    expect(keyResized(symbol, placed, "ArrowRight", true)).toEqual({ ...symbol, size: 120 });
  });

  it("gives a text block its next height, or with Shift the one nearest its longer side 5 mm longer, and stops at the ends", () => {
    const text: DesignText = { id: "e1", kind: "text", text: "BATCH {10}", heightMm: 3, months: "pt", rotation: 270, xMm: 4, yMm: 52 };
    const placed = at(4, 42, 3, 10);
    expect(keyResized(text, placed, "ArrowDown", false)).toEqual({ ...text, heightMm: 3.5 });
    expect(keyResized(text, placed, "ArrowLeft", false)).toEqual({ ...text, heightMm: 2.5 });
    // 10 mm 5 mm longer is 4.5 mm high, nearer 5 than 4 by ratio
    expect(keyResized(text, placed, "ArrowRight", true)).toEqual({ ...text, heightMm: 5 });
    expect(keyResized({ ...text, heightMm: 4.2 }, placed, "ArrowRight", false)).toEqual({ ...text, heightMm: 5 });
    expect(keyResized({ ...text, heightMm: 4.2 }, placed, "ArrowUp", false)).toEqual({ ...text, heightMm: 4 });
    expect(keyResized({ ...text, heightMm: 12 }, placed, "ArrowDown", true)).toEqual({ ...text, heightMm: 12 });
    expect(keyResized({ ...text, heightMm: 2 }, placed, "ArrowUp", false)).toEqual({ ...text, heightMm: 2 });
  });
});

// Resizing held within the label, as moving is (session 46, an open point since session 43): an element grows no
// further than the label's edge, or no further past it than it is; making it smaller is never held.
describe("resizing held within the label", () => {
  const page = { widthMm: 100, heightMm: 60 };
  const box: DesignBox = { id: "e1", kind: "box", widthMm: 20, heightMm: 10, thicknessMm: 0.5, filled: false, xMm: 60, yMm: 40 };
  const placedBox = at(60, 40, 20, 10);

  it("leaves a size that stays on the label as it is, its edges included", () => {
    expect(heldResize(box, { ...box, widthMm: 40, heightMm: 20 }, placedBox, page)).toEqual({ ...box, widthMm: 40, heightMm: 20 });
    expect(heldResize(box, { ...box, widthMm: 5 }, placedBox, page)).toEqual({ ...box, widthMm: 5 });
  });

  it("holds a box at the label's edge on the side that runs past it, across, down or both", () => {
    expect(heldResize(box, { ...box, widthMm: 45 }, placedBox, page)).toEqual({ ...box, widthMm: 40 });
    expect(heldResize(box, { ...box, heightMm: 25 }, placedBox, page)).toEqual({ ...box, heightMm: 20 });
    expect(heldResize(box, { ...box, widthMm: 45, heightMm: 15 }, placedBox, page)).toEqual({ ...box, widthMm: 40, heightMm: 15 });
    expect(heldResize(box, { ...box, widthMm: 41, heightMm: 30 }, placedBox, page)).toEqual({ ...box, widthMm: 40, heightMm: 20 });
    // Dragged and from the keyboard, as the overlay calls it
    expect(heldResize(box, resized(box, placedBox, 130, 55), placedBox, page)).toEqual({ ...box, widthMm: 40, heightMm: 15 });
    const full = { ...box, widthMm: 40 };
    expect(heldResize(full, keyResized(full, at(60, 40, 40, 10), "ArrowRight", false), at(60, 40, 40, 10), page)).toEqual(full);
    expect(heldResize(box, keyResized(box, placedBox, "ArrowDown", true), placedBox, page)).toEqual({ ...box, heightMm: 15 });
  });

  it("holds it on the last half millimetre, never smaller than it is", () => {
    // 39.7 mm of room: 39.5; a width of 39.7 typed stays 39.7
    const off = { ...box, xMm: 60.3 };
    expect(heldResize(off, { ...off, widthMm: 40 }, at(60.3, 40, 20, 10), page)).toEqual({ ...off, widthMm: 39.5 });
    expect(heldResize({ ...off, widthMm: 39.7 }, { ...off, widthMm: 40 }, at(60.3, 40, 39.7, 10), page)).toEqual({ ...off, widthMm: 39.7 });
    // A hair's rounding still leaves the last half millimetre
    const hair = { ...box, xMm: 60 + 1e-9 };
    expect(heldResize(hair, { ...hair, widthMm: 45 }, at(60 + 1e-9, 40, 20, 10), page)).toEqual({ ...hair, widthMm: 40 });
    // Under half a millimetre of room
    const tight = { ...box, xMm: 99.7, widthMm: 0.2 };
    expect(heldResize(tight, { ...tight, widthMm: 0.5 }, at(99.7, 40, 0.2, 10), page)).toEqual(tight);
  });

  it("never lets an element already past the edge grow further past it, but always smaller", () => {
    const past = { ...box, xMm: 80, widthMm: 40 };
    const placed = at(80, 40, 40, 10);
    expect(heldResize(past, { ...past, widthMm: 45 }, placed, page)).toEqual(past);
    expect(heldResize(past, { ...past, widthMm: 35 }, placed, page)).toEqual({ ...past, widthMm: 35 });
    // Down, where it is on the label, it still reaches the edge
    expect(heldResize(past, { ...past, heightMm: 30 }, placed, page)).toEqual({ ...past, heightMm: 20 });
    // Past the left edge, its corner further from the right one
    const left = { ...box, xMm: -10, widthMm: 30 };
    expect(heldResize(left, { ...left, widthMm: 200 }, at(-10, 40, 30, 10), page)).toEqual({ ...left, widthMm: 110 });
  });

  it("holds a line's length, across or down, its thickness aside", () => {
    const across: DesignLine = { id: "e1", kind: "line", vertical: false, lengthMm: 40, thicknessMm: 0.5, xMm: 4, yMm: 59.5 };
    expect(heldResize(across, { ...across, lengthMm: 120 }, at(4, 59.5, 40, 0.5), page)).toEqual({ ...across, lengthMm: 96 });
    const down: DesignLine = { ...across, vertical: true, xMm: 99.5, yMm: 4.3 };
    expect(heldResize(down, { ...down, lengthMm: 60 }, at(99.5, 4.3, 0.5, 40), page)).toEqual({ ...down, lengthMm: 55.5 });
    expect(heldResize(down, { ...down, lengthMm: 55.5 }, at(99.5, 4.3, 0.5, 40), page)).toEqual({ ...down, lengthMm: 55.5 });
    // Already past: no longer, but shorter
    const long = { ...across, lengthMm: 100 };
    expect(heldResize(long, { ...long, lengthMm: 105 }, at(4, 59.5, 100, 0.5), page)).toEqual(long);
    expect(heldResize(long, { ...long, lengthMm: 99.5 }, at(4, 59.5, 100, 0.5), page)).toEqual({ ...long, lengthMm: 99.5 });
  });

  it("holds an image on the last half millimetre of its width that keeps its whole box on the label, turned or not", () => {
    const picture = { width: 360, height: 150, bits: "" };
    const image: DesignImage = { id: "e1", kind: "image", name: "logo", picture, widthMm: 20, xMm: 60, yMm: 6 };
    const placed = at(60, 6, 20, 25 / 3);
    // Across: 40 mm of room
    expect(heldResize(image, { ...image, widthMm: 50 }, placed, page)).toEqual({ ...image, widthMm: 40 });
    // Down: 14 mm of room is 33.6 mm wide, so 33.5
    const low = { ...image, xMm: 0, yMm: 46 };
    expect(heldResize(low, { ...low, widthMm: 50 }, at(0, 46, 20, 25 / 3), page)).toEqual({ ...low, widthMm: 33.5 });
    // Turned, its width runs down: 54 mm of room
    const turned = { ...image, rotation: 90 as const, xMm: 0 };
    expect(heldResize(turned, { ...turned, widthMm: 80 }, at(0, 6, 25 / 3, 20), page)).toEqual({ ...turned, widthMm: 54 });
    // Already past the foot: no wider, its width typed off the half millimetres kept
    const deep = { ...image, xMm: 0, yMm: 55, widthMm: 20.3 };
    expect(heldResize(deep, { ...deep, widthMm: 20.5 }, at(0, 55, 20.3, (20.3 * 150) / 360), page)).toEqual(deep);
  });

  it("gives a text block the largest of its heights that keeps it on the label, or leaves it as it is", () => {
    const text: DesignText = { id: "e1", kind: "text", text: "BATCH {10}", heightMm: 3, xMm: 60, yMm: 4 };
    // 20 mm wide at 3 mm: 40 mm of room takes 6 mm (40 mm wide), not 7 (46.7)
    const placed = at(60, 4, 20, 3);
    expect(heldResize(text, { ...text, heightMm: 10 }, placed, page)).toEqual({ ...text, heightMm: 6 });
    expect(heldResize(text, { ...text, heightMm: 6 }, placed, page)).toEqual({ ...text, heightMm: 6 });
    // Room for no larger height: as it is
    expect(heldResize(text, { ...text, heightMm: 3.5 }, at(60, 4, 39, 3), page)).toEqual(text);
    // Smaller, never held, even past the edge
    expect(heldResize(text, { ...text, heightMm: 2 }, at(90, 4, 20, 3), page)).toEqual({ ...text, heightMm: 2 });
  });

  it("gives a barcode the largest of its sizes whose whole box, text included, stays on the label", () => {
    const symbol: DesignSymbol = { id: "e1", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 60, yMm: 2 };
    const boxes: Record<number, number> = { 80: 16, 90: 18, 100: 20, 120: 24, 150: 30, 200: 40 };
    const sizing: SymbolSizing = { widthMm: 15, heightMm: 15, sizes: SIZES, boxAt: (size) => ({ widthMm: boxes[size]!, heightMm: boxes[size]! + 5 }) };
    const placed = at(60, 2, 20, 25);
    // 40 mm across: 200 %; 35 mm down: 150 % is 35 high, 200 % 45
    expect(heldResize(symbol, { ...symbol, size: 200 }, placed, page, sizing)).toEqual({ ...symbol, size: 200 });
    expect(heldResize({ ...symbol, yMm: 25 }, { ...symbol, yMm: 25, size: 200 }, at(60, 25, 20, 25), page, sizing)).toEqual({ ...symbol, yMm: 25, size: 150 });
    expect(heldResize({ ...symbol, xMm: 75 }, { ...symbol, xMm: 75, size: 200 }, at(75, 2, 20, 25), page, sizing)).toEqual({ ...symbol, xMm: 75, size: 120 });
    // No larger size fits: as it is
    expect(heldResize({ ...symbol, xMm: 79 }, { ...symbol, xMm: 79, size: 120 }, at(79, 2, 20, 25), page, sizing)).toEqual({ ...symbol, xMm: 79 });
    // Without a box at each size, in proportion to its size
    expect(heldResize({ ...symbol, xMm: 75 }, { ...symbol, xMm: 75, size: 200 }, at(75, 2, 20, 25), page, { ...sizing, boxAt: undefined }))
      .toEqual({ ...symbol, xMm: 75, size: 120 });
    // A size it cannot be drawn at is left to the page, which says why
    expect(heldResize(symbol, { ...symbol, size: 150 }, placed, page, { ...sizing, boxAt: () => undefined })).toEqual({ ...symbol, size: 150 });
  });

  it("predicts each kind's box at its new size, its top left corner kept", () => {
    expect(boxAfter(box, { ...box, widthMm: 30 }, placedBox)).toEqual({ widthMm: 30, heightMm: 10, thicknessMm: 0.5 });
    const line: DesignLine = { id: "e1", kind: "line", vertical: true, lengthMm: 40, thicknessMm: 0.5, xMm: 4, yMm: 4 };
    expect(boxAfter(line, { ...line, lengthMm: 50 }, at(4, 4, 0.5, 40))).toMatchObject({ widthMm: 0.5, heightMm: 50 });
    const text: DesignText = { id: "e1", kind: "text", text: "T", heightMm: 3, xMm: 4, yMm: 4 };
    expect(boxAfter(text, { ...text, heightMm: 6 }, at(4, 4, 2, 3))).toEqual({ widthMm: 4, heightMm: 6 });
    const image: DesignImage = { id: "e1", kind: "image", name: "logo", picture: { width: 360, height: 150, bits: "" }, widthMm: 20, xMm: 0, yMm: 0 };
    expect(boxAfter(image, { ...image, widthMm: 30 }, at(0, 0, 25 / 3, 20))).toEqual({ widthMm: 12.5, heightMm: 30 });
  });
});
