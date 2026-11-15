import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  dataFor,
  labelFor,
  labelSvg,
  layoutLabel,
  printFileFor,
  syntaxEngine,
  type DesignPage,
  type DesignSymbol,
  type Identified,
  type LabelDesign,
  type SyntaxEngine,
  turnedRect,
} from "../src/index.ts";
import { textFile } from "./files.ts";
import { hriFont } from "./font.ts";

// A barcode on a label of one's own with the options of the symbol alone (backlog 6.6): the text's place and height,
// a QR code's error correction level and encoding mode, the bar width reduction and ITF-14's bearer bars, each the
// barcode's own; drawn as the symbol alone draws them, read back by ZXing, and written by the printer languages.

const font = hriFont();
let engine: SyntaxEngine;
let data: Identified;
beforeAll(async () => {
  engine = await syntaxEngine();
  data = engine.parse("(01)09506000134376(10)B42(17)271231") as Identified;
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function reads(svg: string) {
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 5 }, background: "#fff" }).render().asPng();
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 6,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const DESIGN: LabelDesign = {
  symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "distribution", size: 100, linear: "none",
  linearSize: null, bearer: "frame", reduction: 0,
};
const symbol = (id: string, rest: Partial<DesignSymbol> & Pick<DesignSymbol, "symbology" | "xMm" | "yMm">): DesignSymbol => ({
  id, kind: "symbol", ais: null, size: 100, hri: true, ...rest,
});
const page = (...elements: DesignSymbol[]): DesignPage => ({ widthMm: 150, heightMm: 110, elements });

describe("a barcode on a label of one's own with the options of the symbol alone", () => {
  it("draws each barcode as the symbol alone with the same options, and every one reads back", async () => {
    const designed = labelFor(data, {
      ...DESIGN,
      page: page(
        symbol("qr", { symbology: "dl-qrcode", xMm: 2, yMm: 2, error: "h", qrMode: "byte", hriPosition: "above", hriHeightMm: 3 }),
        symbol("bars", { symbology: "gs1-128", xMm: 2, yMm: 55, reduction: 0.02, hriPosition: "split" }),
        symbol("itf", { symbology: "itf14", ais: ["01"], xMm: 2, yMm: 82, bearer: "bars" }),
      ),
    }, font);
    const [qr, bars, itf] = designed.designed!.printer.symbols;
    expect(qr!.options).toMatchObject({ error: "h", qrMode: "byte", hriPosition: "above", hriHeightMm: 3 });
    expect(bars!.options).toMatchObject({ barWidthReduction: 0.02, hriPosition: "split" });
    expect(itf!.options).toMatchObject({ bearer: "bars" });
    // As the symbol alone lays them out with those options
    for (const s of [qr!, bars!, itf!]) expect(s.layout).toEqual(layoutLabel(s.options, font));
    // A higher level than the page's makes a larger QR code than the same symbol at the page's level
    const plain = labelFor(data, { ...DESIGN, page: page(symbol("qr", { symbology: "dl-qrcode", xMm: 2, yMm: 2 })) }, font);
    expect(qr!.layout.modules).toBeGreaterThan(plain.designed!.printer.symbols[0]!.layout.modules);
    // The text above the QR code: its baseline over the modules
    expect(Math.max(...qr!.layout.texts.map((t) => t.baseline))).toBeLessThan(qr!.layout.rects[0]![1]);
    expect(await reads(labelSvg(designed.options, designed.layout, font))).toEqual([
      "]C1 (01)09506000134376(10)B42(17)271231",
      `]Q1 ${dataFor("dl-qrcode", data)}`,
      "]I1 09506000134376",
    ].sort());
  });

  it("takes the label's options where the barcode has none of its own, and leaves out what does not apply to it", () => {
    const designed = labelFor(data, {
      ...DESIGN, error: "q",
      page: page(
        symbol("qr", { symbology: "dl-qrcode", xMm: 2, yMm: 2 }),
        // A reduction asked of a 2D symbol, a mode of a Data Matrix, bearer bars of a GS1-128: none applies
        symbol("dm", { symbology: "gs1-datamatrix", xMm: 60, yMm: 2, reduction: 0.02, qrMode: "byte", bearer: "bars" }),
      ),
    }, font);
    const [qr, dm] = designed.designed!.printer.symbols;
    expect(qr!.options.error).toBe("q");
    expect(qr!.options.hriPosition).toBeUndefined();
    expect(dm!.options.barWidthReduction).toBeUndefined();
    expect(dm!.options.qrMode).toBeUndefined();
    expect(dm!.options.bearer).toBeUndefined();
  });

  it("writes each barcode's level, text place and height and bearer bars in ZPL; a QR code's one mode is refused as alone", () => {
    const design: LabelDesign = {
      ...DESIGN,
      page: page(
        symbol("dm", { symbology: "gs1-datamatrix", xMm: 2, yMm: 2, hriPosition: "above", hriHeightMm: 3 }),
        symbol("high", { symbology: "dl-qrcode", xMm: 75, yMm: 2, error: "h" }),
        symbol("low", { symbology: "dl-qrcode", xMm: 110, yMm: 2, error: "l" }),
        symbol("itf", { symbology: "itf14", ais: ["01"], xMm: 2, yMm: 70, bearer: "bars" }),
      ),
    };
    const zpl = textFile(printFileFor("zpl", labelFor(data, design, font), design, 203));
    const uri = dataFor("dl-qrcode", data);
    expect(zpl).toContain(`^FDHA,${uri}^FS`);
    expect(zpl).toContain(`^FDLA,${uri}^FS`);
    // The Data Matrix's text above it, at 3 mm: each line's field above the symbol's, taller than 2.2 mm's
    const symbolY = Number(/\^FO\d+,(\d+)\^BX/.exec(zpl)![1]);
    const lines = [...zpl.matchAll(/\^FO\d+,(\d+)\^A0N,(\d+),\d+[^\n]*\^FD\((01|10|17)\)/g)];
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(Number(line[1])).toBeLessThan(symbolY);
    const plain = textFile(printFileFor("zpl", labelFor(data, { ...design, page: page(symbol("dm", { symbology: "gs1-datamatrix", xMm: 2, yMm: 2 })) }, font), design, 203));
    const plainHeight = Number(/\^A0N,(\d+),/.exec(plain)![1]);
    expect(Number(lines[0]![2])).toBeGreaterThan(plainHeight);
    // ITF-14's bearer bars, top and bottom only: two boxes, where the frame is one box round the symbol
    const frame = textFile(printFileFor("zpl", labelFor(data, {
      ...design, page: page(symbol("itf", { symbology: "itf14", ais: ["01"], xMm: 2, yMm: 70 })),
    }, font), design, 203));
    const bearer = textFile(printFileFor("zpl", labelFor(data, {
      ...design, page: page(symbol("itf", { symbology: "itf14", ais: ["01"], xMm: 2, yMm: 70, bearer: "bars" })),
    }, font), design, 203));
    expect((frame.match(/\^GB/g) ?? []).length).toBe(1);
    expect((bearer.match(/\^GB/g) ?? []).length).toBe(2);
    // One mode for a QR code's whole data: refused in ZPL, as for the symbol alone (ADR 0002)
    const mode: LabelDesign = { ...design, page: page(symbol("qr", { symbology: "dl-qrcode", xMm: 2, yMm: 2, qrMode: "byte" })) };
    expect(() => printFileFor("zpl", labelFor(data, mode, font), mode, 203)).toThrow(/automatic mode/);
  });
});

// The linear symbol beside a 2D one (backlog 6.6): an EAN/UPC with the GTIN beside a QR code or Data Matrix, as the
// symbol alone's Linear barcode beside it; drawn as the symbol alone draws the pair, and printed as two symbols, each
// with the printer's own command, its bars where the pair puts them.
describe("a linear symbol beside a 2D one on a label of one's own", () => {
  const box = (rects: readonly (readonly number[])[]) => {
    const [x, y] = [Math.min(...rects.map((r) => r[0]!)), Math.min(...rects.map((r) => r[1]!))];
    return [x, y, Math.max(...rects.map((r) => r[0]! + r[2]!)) - x, Math.max(...rects.map((r) => r[1]! + r[3]!)) - y];
  };

  it("draws the pair as the symbol alone does, both read back, and prints it as two symbols where the pair puts them", async () => {
    for (const rotation of [0, 90] as const) {
      const element = symbol("qr", { symbology: "dl-qrcode", xMm: 4, yMm: 4, linear: "auto", rotation });
      const design: LabelDesign = { ...DESIGN, environment: "retail", page: page(element) };
      const designed = labelFor(data, design, font).designed!;
      // The pair as the symbol alone lays out a QR code with an EAN-13 beside it
      const alone = labelFor(data, { ...DESIGN, environment: "retail", linear: "auto" }, font);
      const pair = alone.layout;
      expect(designed.placed[0]!.widthMm).toBeCloseTo((rotation ? pair.height : pair.width) * pair.xMm, 6);
      expect(designed.expected).toEqual([`]Q1 ${dataFor("dl-qrcode", data)}`, "]E0 9506000134376"].sort());
      expect(await reads(labelSvg(designed.options, designed.layout, font))).toEqual(designed.expected);
      // Two symbols for the printer: the QR code alone, and the EAN-13 alone at its own X-dimension
      const [twoD, linear] = designed.printer.symbols;
      expect([twoD!.options.symbology, linear!.options.symbology, linear!.data]).toEqual(["dl-qrcode", "ean13", "9506000134376"]);
      expect(twoD!.options.linear).toBeNull();
      for (const s of [twoD!, linear!]) {
        expect(s.layout).toEqual(layoutLabel(s.options, font));
        expect(s.rotation).toBe(rotation);
      }
      expect(linear!.layout.xMm).toBeCloseTo(0.33, 6);
      // Each part's bars where the pair's are on the page, as turned
      const parts = [pair.rects.slice(0, pair.symbolRects), pair.rects.slice(pair.symbolRects)];
      [twoD!, linear!].forEach((s, i) => {
        const [px, py] = turnedRect(box(parts[i]!), pair.width, pair.height, rotation);
        const [ox, oy] = turnedRect(box(s.layout.rects), s.layout.width, s.layout.height, rotation);
        expect(s.xMm + ox * s.layout.xMm).toBeCloseTo(element.xMm + px * pair.xMm, 6);
        expect(s.yMm + oy * s.layout.xMm).toBeCloseTo(element.yMm + py * pair.xMm, 6);
      });
    }
  });

  it("takes its own size and a bar width reduction; UPC-E where asked; nothing beside a linear symbol", () => {
    const upc = engine.parse("(01)00042100005264(10)B42") as Identified;
    const designed = labelFor(upc, {
      ...DESIGN, environment: "retail",
      page: page(
        symbol("dm", { symbology: "gs1-datamatrix", xMm: 4, yMm: 4, linear: "upce", linearSize: 80, reduction: 0.02, hriPosition: "left" }),
        symbol("bars", { symbology: "upca", ais: ["01"], xMm: 4, yMm: 60, linear: "auto" }),
      ),
    }, font).designed!;
    const [dm, linear, bars] = designed.printer.symbols;
    expect(linear!.options.symbology).toBe("upce");
    expect(linear!.layout.xMm).toBeCloseTo(0.33 * 0.8, 6);
    expect(designed.options.symbology).toBe("gs1-datamatrix");
    // The text beside the 2D symbol goes below it, as for the symbol alone; the printer's bars unreduced
    expect(dm!.options.hriPosition).toBeUndefined();
    expect(dm!.options.barWidthReduction).toBeUndefined();
    expect(bars!.options.linear).toBeUndefined();
    expect(designed.printer.symbols).toHaveLength(3);
    expect(linear!.data).toBe("04252614");
    // The reduction narrows the UPC-E's bars in the files, and leaves the printer's symbols as they are without it
    const plain = labelFor(upc, {
      ...DESIGN, environment: "retail",
      page: page(
        symbol("dm", { symbology: "gs1-datamatrix", xMm: 4, yMm: 4, linear: "upce", linearSize: 80, hriPosition: "left" }),
        symbol("bars", { symbology: "upca", ais: ["01"], xMm: 4, yMm: 60, linear: "auto" }),
      ),
    }, font).designed!;
    const ink = (l: typeof plain.layout) => l.rects.reduce((sum, r) => sum + r[2] * r[3], 0);
    expect(ink(designed.layout)).toBeLessThan(ink(plain.layout));
    expect(designed.printer.symbols).toEqual(plain.printer.symbols);
  });

  it("is refused without a GTIN of a consumer unit, a scanning environment with an EAN/UPC, or a GTIN-12 for UPC-E", () => {
    const refused = (d: Identified, environment: string, rest: Partial<DesignSymbol>) =>
      () => labelFor(d, { ...DESIGN, environment, page: page(symbol("dm", { symbology: "gs1-datamatrix", xMm: 4, yMm: 4, linear: "auto", ...rest })) }, font);
    expect(refused(data, "retail", { ais: ["10", "17"] })).toThrow(/needs a GTIN \(01\)/);
    expect(refused(engine.parse("(01)19506000134373(10)B42") as Identified, "retail", {})).toThrow(/consumer units/);
    expect(refused(data, "assets", {})).toThrow(/no EAN\/UPC/);
    expect(refused(data, "retail", { linear: "upce" })).toThrow(/UPC-E is only/);
  });

  it("writes the pair in every printer language with its own commands: the 2D symbol's and the EAN-13's", () => {
    const design: LabelDesign = { ...DESIGN, environment: "retail", page: page(symbol("dm", { symbology: "dl-datamatrix", xMm: 4, yMm: 4, linear: "auto" })) };
    const drawn = labelFor(data, design, font);
    const files = Object.fromEntries((["zpl", "tspl", "epl2", "dpl", "ppla"] as const).map((l) => [l, textFile(printFileFor(l, drawn, design, 203))]));
    // PPLB has no Data Matrix: refused as for the 2D symbol alone
    expect(() => printFileFor("pplb", drawn, design, 203)).toThrow(/PPLB has no Data Matrix/);
    expect(files.zpl).toMatch(/\^BX/);
    expect(files.zpl).toMatch(/\^BE[^\n]*\^FD950600013437/);
    expect(files.tspl).toMatch(/DMATRIX/);
    expect(files.tspl).toMatch(/BARCODE [^\n]*"EAN13"[^\n]*"950600013437/);
    expect(files.epl2).toMatch(/,E30,[^\n]*"950600013437/);
    expect(files.dpl).toMatch(/950600013437/);
    expect(files.ppla).toMatch(/950600013437/);
  });
});
