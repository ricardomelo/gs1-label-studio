import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  expectedReads,
  labelSvg,
  layoutLabel,
  specificationFor,
  symbolFor,
  type HriPosition,
  type LabelOptions,
  type Layout,
} from "../src/index.ts";
import { hriFont } from "./font.ts";

// The human readable text placed and sized as the General Specifications 26.0 allow (backlog 1.16; section 4.14):
// below, above, left or right of the symbol, or split with the key below; at least 2 mm high. The symbol still reads.

const font = hriFont();
const SLOW = 60_000;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function reads(options: LabelOptions, layout: Layout) {
  const png = new Resvg(labelSvg(options, layout, font), { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng();
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const LINES = ["(01)09506000134376", "(10)B42", "(17)271231"];
const QR: LabelOptions = {
  symbology: "dl-qrcode", data: "https://id.gs1.org/01/09506000134376/10/B42?17=271231", hriLines: LINES, showHri: true,
  environment: "retail", size: 100,
};
const spec = specificationFor(9, "gs1-128")!;
const GS1_128: LabelOptions = {
  symbology: "gs1-128", data: "(01)09506000134376(10)B42(17)271231", hriLines: LINES, showHri: true, spec, table: 9, size: 100,
};

/** The symbol's extent: its rectangles (the 2D symbol's, or every bar). */
function symbolBox(layout: Layout, count = layout.symbolRects) {
  const rects = layout.rects.slice(0, count);
  return {
    left: Math.min(...rects.map((r) => r[0])), right: Math.max(...rects.map((r) => r[0] + r[2])),
    top: Math.min(...rects.map((r) => r[1])), bottom: Math.max(...rects.map((r) => r[1] + r[3])),
  };
}
const textBox = (layout: Layout, index: number) => {
  const t = layout.texts[index]!;
  const capital = (t.em * font.capHeight) / font.unitsPerEm;
  return { left: t.x, right: t.x + font.textWidth(t.text, t.em), top: t.baseline - capital, bottom: t.baseline };
};

describe.each([["a QR code", QR], ["GS1-128", GS1_128]] as const)("%s", (_name, base) => {
  it.each(["above", "split", "left", "right"] as HriPosition[])("text %s the symbol, clear of it and its quiet zone; still read", async (position) => {
    const options = { ...base, hriPosition: position };
    const layout = layoutLabel(options, font);
    const box = symbolBox(layout);
    const quiet = base.symbology === "dl-qrcode" ? 4 : 10;
    expect(layout.texts.length).toBeGreaterThan(0);
    layout.texts.forEach((_, i) => {
      const t = textBox(layout, i);
      const where = position === "split" ? (i === 0 ? "below" : "above") : position;
      if (where === "above") expect(t.bottom, layout.texts[i]!.text).toBeLessThan(box.top - (base.symbology === "dl-qrcode" ? quiet : 0));
      if (where === "below") expect(t.top).toBeGreaterThan(box.bottom);
      if (where === "left") expect(t.right).toBeLessThan(box.left - quiet);
      if (where === "right") expect(t.left).toBeGreaterThan(box.right + quiet);
      // Inside the label, with its margin
      expect(t.left).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(t.right).toBeLessThanOrEqual(layout.width - 2 + 1e-9);
    });
    if (position === "split") expect(layout.texts[0]!.text).toBe("(01)09506000134376");
    // Above: the text's lowest point a gap above the symbol's quiet zone (1 module) or bars (1.02 mm, section 5.3.2.2)
    if (position === "above" || position === "split") {
      const lastAbove = layout.texts.at(-1)!;
      const gap = base.symbology === "dl-qrcode" ? quiet + 1 : 1.02 / layout.xMm;
      expect(lastAbove.baseline + (font.descent * lastAbove.em) / font.unitsPerEm).toBeCloseTo(box.top - gap, 9);
    }
    // Beside the symbol, an element string a line, never broken
    if (position === "left" || position === "right") expect(layout.texts.map((t) => t.text)).toEqual(LINES);
    expect(await reads(options, layout)).toEqual(expectedReads(options));
  }, SLOW);

  it("sizes the text from 2 mm, and refuses less", () => {
    const layout = layoutLabel({ ...base, hriHeightMm: 3 }, font);
    const t = layout.texts[0]!;
    expect(((t.em * font.capHeight) / font.unitsPerEm) * layout.xMm).toBeCloseTo(3, 9);
    expect(layout.height).toBeGreaterThan(layoutLabel(base, font).height);
    expect(() => layoutLabel({ ...base, hriHeightMm: 1.9 }, font)).toThrow(/from 2 mm high/);
    expect(() => layoutLabel({ ...base, hriHeightMm: 11 }, font)).toThrow(RangeError);
  });
});

describe("where the text cannot go", () => {
  it("keeps a 2D symbol's text below or above when an EAN/UPC is beside it, which still reads", async () => {
    const options: LabelOptions = { ...QR, linear: symbolFor("09506000134376", "auto"), hriPosition: "above" };
    const layout = layoutLabel(options, font);
    expect(textBox(layout, 0).bottom).toBeLessThan(symbolBox(layout).top);
    expect(await reads(options, layout)).toEqual(expectedReads(options));
    expect(() => layoutLabel({ ...options, hriPosition: "right" }, font)).toThrow(/goes below or above/);
  }, SLOW);

  it("keeps ITF-14's digits below when split is asked (it has one line); none moves when there is no text", () => {
    const itf: LabelOptions = { symbology: "itf14", data: "19506000134373", hriLines: ["(01)19506000134373"], showHri: true,
      spec: specificationFor(2, "itf14")!, table: 2, size: 100 };
    expect(layoutLabel({ ...itf, hriPosition: "split" }, font)).toEqual(layoutLabel(itf, font));
    expect(layoutLabel({ ...QR, showHri: false, hriPosition: "left" }, font)).toEqual(layoutLabel({ ...QR, showHri: false }, font));
  });
});
