import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  checkRows,
  designLabel,
  fillFields,
  generateBatch,
  InputError,
  labelFor,
  parseDelimited,
  printFileFor,
  type LabelDesign,
  labelPdf,
  labelSvg,
  syntaxEngine,
  xDimension,
  type DesignPage,
  type Identified,
  type SyntaxEngine,
} from "../src/index.ts";
import { drawPdf, unzip } from "./files.ts";
import { hriFont } from "./font.ts";

// A label of one's own (backlog 4.2): barcodes and text blocks placed on a page in millimetres, one Layout drawn by the
// SVG, PNG, PDF and EPS; every barcode read back by ZXing from the SVG and the PDF, each at its own X-dimension.

const font = hriFont();
const SLOW = 90_000;
let engine: SyntaxEngine;
let data: Identified;
beforeAll(async () => {
  engine = await syntaxEngine();
  data = engine.parse("(01)09506000134376(10)B42(17)271231") as Identified;
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

const PAGE: DesignPage = {
  widthMm: 130, heightMm: 80,
  elements: [
    { id: "t1", kind: "text", text: "Finest Truffle Tapenade", heightMm: 5, xMm: 6, yMm: 6 },
    { id: "t2", kind: "text", text: "BATCH {10}\nBEST BEFORE {17}", heightMm: 3.5, xMm: 6, yMm: 18 },
    { id: "qr", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, xMm: 94, yMm: 3 },
    { id: "b1", kind: "symbol", symbology: "gs1-128", ais: ["01", "17"], size: 100, hri: true, xMm: 4, yMm: 40 },
  ],
};

describe("a label of one's own", () => {
  it("places each barcode and text block where the page says, each symbol at its own X-dimension", () => {
    const label = designLabel(PAGE, data, font, { environment: "distribution" });
    const { layout } = label;
    expect(layout.width * layout.xMm).toBeCloseTo(130, 9);
    expect(layout.height * layout.xMm).toBeCloseTo(80, 9);
    expect(label.problems).toEqual([]);
    // The text's fields filled from the data, a line a line, at its capitals' height
    expect(layout.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["Finest Truffle Tapenade", "BATCH B42", "BEST BEFORE 271231", "(01)09506000134376(17)271231"]));
    const title = layout.texts.find((t) => t.text === "Finest Truffle Tapenade")!;
    expect(((title.em * font.capHeight) / font.unitsPerEm) * layout.xMm).toBeCloseTo(5, 9);
    expect((title.baseline * layout.xMm)).toBeCloseTo(11, 9);
    // The QR code's modules at the environment's X-dimension; the GS1-128 carries only (01) and (17)
    const qr = label.placed.find((p) => p.id === "qr")!;
    expect(qr.xMm).toBe(94);
    const module = Math.min(...layout.rects.filter(([x, y]) => x * layout.xMm >= 94 && y * layout.xMm < 40).map((r) => r[3])) * layout.xMm;
    expect(module).toBeCloseTo(xDimension("distribution", 100), 9);
    expect(label.expected).toEqual(["]C1 (01)09506000134376(17)271231", "]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231"]);
    expect(label.symbols.map((s) => s.symbology)).toEqual(["dl-qrcode", "gs1-128"]);
    expect(label.options.description).toBe("A label of one's own, 130 × 80 mm: QR code (GS1 Digital Link), GS1-128");
  });

  it("reads back every barcode from the SVG and the PDF", async () => {
    const label = designLabel(PAGE, data, font, { environment: "distribution" });
    const svg = labelSvg(label.options, label.layout, font);
    expect(svg).toContain("<desc>A label of one's own, 130 × 80 mm");
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    expect(await read(drawPdf(await labelPdf(label.options, label.layout, font), 300))).toEqual(label.expected);
  }, SLOW);

  it("fills a text's fields from the data, an AI it does not have leaving nothing", () => {
    expect(fillFields("BATCH {10} · SERIAL {21}", data)).toBe("BATCH B42 · SERIAL ");
    expect(fillFields("{01}", data)).toBe("09506000134376");
  });

  it("names an element past the page's edge and a symbol overlapping another element, and still draws the page", () => {
    const page: DesignPage = { ...PAGE, elements: [...PAGE.elements.slice(0, 3), { ...(PAGE.elements[3] as DesignPage["elements"][number] & { kind: "symbol" }), xMm: 40 }] };
    expect(designLabel(page, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "edge", id: "b1" }]);
    const over: DesignPage = { ...PAGE, elements: [...PAGE.elements, { id: "t3", kind: "text", text: "190 g", heightMm: 3, xMm: 100, yMm: 10 }] };
    expect(designLabel(over, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "overlap", ids: ["qr", "t3"] }]);
  });

  it("refuses a barcode the data or the table cannot give, naming it", () => {
    const none: DesignPage = { ...PAGE, elements: [{ id: "b", kind: "symbol", symbology: "gs1-128", ais: ["21"], size: 100, hri: true, xMm: 0, yMm: 0 }] };
    expect(() => designLabel(none, data, font, { environment: "distribution" })).toThrow(InputError);
    const itf: DesignPage = { ...PAGE, elements: [{ id: "b", kind: "symbol", symbology: "itf14", ais: ["01"], size: 100, hri: true, xMm: 0, yMm: 0 }] };
    expect(() => designLabel(itf, data, font, { environment: "logistics" })).toThrow(/Table 5 does not allow ITF-14/);
    // An EAN-13 takes the GTIN alone of the element strings chosen
    const ean: DesignPage = { ...PAGE, elements: [{ id: "e", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 2, yMm: 2 }] };
    expect(designLabel(ean, data, font, { environment: "retail" }).expected).toEqual(["]E0 9506000134376"]);
  });

  // In bulk (backlog 2.4): every row's page with its own data in the text and the barcodes; no printer language yet
  it("draws every row's page in bulk, each with its own data, and says the printer languages cannot write it yet", async () => {
    const rows = checkRows(engine, parseDelimited("GTIN,Batch,Expiry\n09506000134376,B42,271231\n09506000134376,C7,280630"), ["01", "10", "17"], [], "https://id.gs1.org")
      .map((row) => ({ row: row.row, identified: row.identified! }));
    const design: LabelDesign = {
      symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "distribution", size: 100, linear: "none",
      linearSize: null, bearer: "frame", reduction: 0, page: PAGE,
    };
    const drawn = rows.map((r) => labelFor(r.identified, design, font));
    expect(drawn[1]!.layout.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["BATCH C7", "BEST BEFORE 280630"]));
    expect(drawn[1]!.designed!.expected).toContain("]Q1 https://id.gs1.org/01/09506000134376/10/C7?17=280630");
    const batch = await generateBatch(rows, { design, files: ["svg"], pattern: "{10}", pdf: false }, font);
    expect(batch.generated).toBe(2);
    const files = unzip(batch.zip);
    expect(new TextDecoder().decode(files.get("C7.svg"))).toContain('aria-label="BATCH C7"');
    expect(() => printFileFor("zpl", drawn[0]!, design, 203)).toThrow(/not written in printer languages yet/);
    expect(() => labelFor(rows[0]!.identified, { ...design, page: { ...PAGE, elements: PAGE.elements.filter((e) => e.kind === "text") } }, font)).toThrow(/needs a barcode/);
  }, SLOW);
});
