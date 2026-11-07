import {
  ENVIRONMENTS, HriFont, layoutLabel, SIZES, specificationFor, specSizesFor, type DesignBox, type DesignImage, type DesignLine,
  type DesignSymbol, type DesignText, type LabelOptions, type PlacedElement, type Rotation,
} from "@gs1-label-studio/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleAt, keyResized, nearest, resized, symbolSizing, TEXT_HEIGHTS } from "../src/resize.ts";

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
