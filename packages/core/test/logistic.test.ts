import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { labelPdf, labelSvg, logisticLabel, specificationFor, type LogisticInput } from "../src/index.ts";
import { drawPdf } from "./files.ts";
import { hriFont } from "./font.ts";

// The GS1 Logistic Label (backlog 4.1; General Specifications 26.0, 6.6): free text, text with data titles, and the
// GS1-128 symbols at the bottom, the SSCC's lowest; every symbol read back by ZXing from the SVG and the PDF.

const font = hriFont();
const SLOW = 90_000;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});
async function read(png: Uint8Array) {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 6,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const INPUT: LogisticInput = {
  elementString: "(00)106141411234567897(02)09506000134376(37)24(10)ABC123",
  size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
  from: ["Dal Giardino S.p.A.", "Via Roma 1, Milano"], to: ["Supermarket DC 12", "São Paulo"],
};

describe("the GS1 Logistic Label", () => {
  it("is the page's size, its SSCC alone in the lowest symbol, the other element strings above it", () => {
    const { layout, parts } = logisticLabel(INPUT, font);
    expect(layout.width * layout.xMm).toBeCloseTo(148, 6);
    expect(layout.height * layout.xMm).toBeCloseTo(210, 6);
    expect(parts).toEqual(["(02)09506000134376(37)24(10)ABC123", "(00)106141411234567897"]);
    const lowest = Math.max(...layout.rects.slice(0, layout.symbolRects).map((r) => r[1] + r[3]));
    const sscc = layout.texts.find((t) => t.text === "(00)106141411234567897")!;
    expect(sscc.baseline).toBeGreaterThan(lowest - 40); // the SSCC's text under the lowest bars
    // Data titles from the dictionary, the content 7 mm high, the free text 3.5 mm, the HRI 3 mm
    const capital = (t: { em: number }) => ((t.em * font.capHeight) / font.unitsPerEm) * layout.xMm;
    expect(layout.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["SSCC", "CONTENT", "COUNT", "BATCH/LOT", "FROM", "TO", "São Paulo"]));
    expect(capital(layout.texts.find((t) => t.text === "106141411234567897")!)).toBeCloseTo(7, 6);
    expect(capital(layout.texts.find((t) => t.text === "São Paulo")!)).toBeCloseTo(3.5, 6);
    expect(capital(sscc)).toBeCloseTo(3, 6);
    // Everything on the page
    for (const t of layout.texts) expect(t.x + font.textWidth(t.text, t.em)).toBeLessThanOrEqual(layout.width + 1e-9);
  });

  it("reads back every symbol from the SVG and the PDF", async () => {
    const { layout, options, parts } = logisticLabel(INPUT, font);
    const expected = parts.map((p) => `]C1 ${p}`).sort();
    const svg = labelSvg(options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(expected);
    expect(await read(drawPdf(await labelPdf(options, layout, font), 300))).toEqual(expected);
  }, SLOW);

  it("refuses data without an SSCC, a symbol wider than the page, and more than the page holds", () => {
    expect(() => logisticLabel({ ...INPUT, elementString: "(01)09506000134376" }, font)).toThrow(/needs an SSCC/);
    expect(() => logisticLabel({ ...INPUT, percent: 190 }, font)).toThrow(RangeError);
    const many = "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJKLMNOPQRST(15)271231(3102)001250(401)9506000134376ABCDEFGHIJKLMNO(403)ROUTE-12345";
    expect(() => logisticLabel({ ...INPUT, elementString: many, percent: 150 }, font)).toThrow(/label is 148 mm high|wider than|165.10 mm/);
    expect(logisticLabel({ ...INPUT, from: [], to: [] }, font).layout.texts.some((t) => t.text === "FROM")).toBe(false);
    // The same data on A6: two of its element strings take a symbol each, and the page is too short
    expect(() => logisticLabel({ ...INPUT, size: "a6" }, font)).toThrow(/the A6 label is 148 mm high/);
    const small = logisticLabel({ ...INPUT, size: "4x6", elementString: "(00)106141411234567897(02)09506000134376(37)24" }, font);
    expect(small.layout.height * small.layout.xMm).toBeCloseTo(152.4, 6);
    expect(small.parts).toEqual(["(02)09506000134376(37)24", "(00)106141411234567897"]);
  });
});
