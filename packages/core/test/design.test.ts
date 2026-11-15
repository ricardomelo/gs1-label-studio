import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  checkRows,
  columnCell,
  pictogramSize,
  pictogramContours,
  pictogramLabel,
  PICTOGRAM_NAMES,
  PICTOGRAM_SEGMENTS,
  PICTOGRAMS,
  fillOutlines,
  designLabel,
  POS_RADIUS_MM,
  dplPage,
  encode,
  eplPage,
  tsplPage,
  DATE_FORMATS,
  TIME_FORMATS,
  carriesTime,
  isDateAi,
  isFullYearDate,
  isPercentEncoded,
  percentDecode,
  percentEncode,
  fillFields,
  formatDate,
  generateBatch,
  MONTH_NAMES,
  type MonthLanguage,
  InputError,
  labelFor,
  parseDelimited,
  printFileFor,
  printPageFor,
  printWidthDots,
  snapToDots,
  zplFontHeight,
  zplPage,
  type LabelDesign,
  labelPdf,
  labelSvg,
  syntaxEngine,
  xDimension,
  type DesignElement,
  type DesignPage,
  type DesignSymbol,
  type DesignText,
  type Identified,
  type SyntaxEngine,
} from "../src/index.ts";
import { bitmapRects, graphicFields, labelPixels, labelPng, PICTURE_THRESHOLD, pictureBitmap, pictureFromGrey, redithered, resample, turnedPicture, turnedRect } from "../src/index.ts";
import { WITH_LOGO } from "./fixtures/graphics.ts";
import { drawPdf, textFile, unzip } from "./files.ts";
import { decodePng } from "./png.ts";
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

  // Session 55: the text under each barcode in the order its data carries: a GS1 DataMatrix's in the element string's
  // order, the QR code's in its URI's
  it("writes the text under each barcode in its data's order: the element string's, or the URI's", () => {
    const page: DesignPage = { widthMm: 80, heightMm: 40, elements: [
      { id: "qr", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: true, xMm: 4, yMm: 4 },
      { id: "dm", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: true, xMm: 44, yMm: 4 },
    ] };
    const label = designLabel(page, engine.parse("(01)09506000134376(17)271231(10)B42") as Identified, font, { environment: "distribution" });
    const lines = (id: string) => label.printer.symbols.find((s) => s.id === id)!.options.hriLines;
    expect(lines("dm")).toEqual(["(01)09506000134376", "(17)271231", "(10)B42"]);
    expect(lines("qr")).toEqual(["(01)09506000134376", "(10)B42", "(17)271231"]);
  });

  it("reads back every barcode from the SVG and the PDF", async () => {
    const label = designLabel(PAGE, data, font, { environment: "distribution" });
    const svg = labelSvg(label.options, label.layout, font);
    expect(svg).toContain("<desc>A label of one's own, 130 × 80 mm");
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    expect(await read(drawPdf(await labelPdf(label.options, label.layout, font), 300))).toEqual(label.expected);
  }, SLOW);

  // In ZPL (backlog 4.2): each barcode with the commands of a symbol alone at its own whole dots a module, its bars'
  // corner where the layout puts them; each line of text with ^A0 at its capitals' corner and height (Labelary prints
  // it in labelary.test.ts)
  it("writes the page in ZPL: each barcode as a symbol alone, where the layout puts it, and the text with ^A0", () => {
    const design: LabelDesign = {
      symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "distribution", size: 100, linear: "none",
      linearSize: null, bearer: "frame", reduction: 0, page: PAGE,
    };
    const drawn = labelFor(data, design, font);
    // A first barcode that carries the GTIN alone (an ITF-14 with its element strings chosen) is drawn from that, not
    // refused for the data's other element strings
    const itfFirst: LabelDesign = { ...design, page: { ...PAGE, elements: [{ id: "i", kind: "symbol", symbology: "itf14", ais: ["01"], size: 100, hri: true, xMm: 4, yMm: 40 }, ...PAGE.elements.filter((e) => e.kind !== "symbol")] } };
    expect(labelFor(data, itfFirst, font).geometry).toEqual(encode("itf14", "09506000134376"));
    const dots = (mm: number) => Math.round((mm / 25.4) * 203);
    const zpl = textFile(printFileFor("zpl", drawn, design, 203));
    expect(zpl).toContain(`^PW${dots(130)}\n^LL${dots(80)}`);
    expect(zpl).toContain(`^FO${dots(6)},${dots(6)}^A0N,${zplFontHeight(dots(5))},${zplFontHeight(dots(5))}^FDFinest Truffle Tapenade^FS`);
    expect(zpl).toContain(`^FO${dots(6)},${dots(18 + 3.5 * 1.4)}^A0N,${zplFontHeight(dots(3.5))},${zplFontHeight(dots(3.5))}^FDBEST BEFORE 271231^FS`);
    // The QR code's modules and the GS1-128's bars start where the layout's do; the GS1-128 carries (01) and (17) with
    // its text below, the QR code none
    const page = printPageFor(drawn.designed!, 203);
    for (const [index, s] of drawn.designed!.printer.symbols.entries()) {
      const bars = s.layout.rects.slice(...(s.layout.barRects && s.layout.barRects[1] > s.layout.barRects[0] ? s.layout.barRects : [0, s.layout.rects.length]));
      expect([page.symbols[index]!.options.x, page.symbols[index]!.options.y]).toEqual([
        dots(s.xMm + Math.min(...bars.map((r) => r[0])) * s.layout.xMm), dots(s.yMm + Math.min(...bars.map((r) => r[1])) * s.layout.xMm),
      ]);
    }
    expect(zpl).toMatch(/\^BQN,2,\d+\^FDMA,https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231\^FS/);
    expect(zpl).toContain("^FD>;>8010950600013437617271231^FS");
    expect(zpl).toContain("^FD(01)09506000134376(17)271231^FS");
    expect(zpl.match(/\^A0/g)).toHaveLength(4);
    // Each at the whole dots within its table's row nearest to the layout's module
    expect(page.symbols.map((s) => s.options.dotsPerModule)).toEqual([snapToDots(drawn.designed!.printer.symbols[0]!.layout.xMm, 203).dots, 4]);
    // A test label adds the ruler; the print width is the page's
    expect(printFileFor("zpl", drawn, design, 203, undefined, ["a note"])).toContain("50 mm: measure this line");
    expect(printWidthDots(drawn, design, 203)).toBe(dots(130));
    // GS1 DataBar starts with a space, its left guard's: the printer's corner a module before the first bar
    const databar: DesignPage = { widthMm: 80, heightMm: 30, elements: [{ id: "x", kind: "symbol", symbology: "databar-expanded", ais: ["01", "17"], size: 100, hri: false, xMm: 2, yMm: 2 }] };
    const bar = designLabel(databar, data, font, { environment: "retail" });
    const first = Math.min(...bar.printer.symbols[0]!.layout.rects.map((r) => r[0])) * bar.printer.symbols[0]!.layout.xMm;
    const d = printPageFor(bar, 300).symbols[0]!.options;
    expect(d.x).toBe(Math.round(((2 + first) / 25.4) * 300) - d.dotsPerModule);
    // EPL2 writes it too (printlangs.test.ts prints it): its QR code refused with the reason, as for a symbol alone
    expect(() => printFileFor("epl2", drawn, design, 203)).toThrow(/QR/);
    const noQr: LabelDesign = { ...design, page: { ...PAGE, elements: PAGE.elements.filter((e) => e.id !== "qr") } };
    const epl = printFileFor("epl2", labelFor(data, noQr, font), noQr, 203);
    expect(epl).toContain(`q${dots(130)}`);
    expect(epl).toMatch(new RegExp(`^A${dots(6)},${dots(6)},0,\\d,\\d,\\d,N,"Finest Truffle Tapenade"$`, "m"));
    expect(epl).toMatch(/^B\d+,\d+,0,1E,4,4,\d+,N,"010950600013437617271231"$/m);
    // TSPL writes it too (printlangs.test.ts prints it): its GS1-128 of a GTIN refused with the reason (an SSCC alone is
    // printed), as for a symbol alone; each
    // line of text with TEXT in the dot font whose capitals (0.75 of its cell) come nearest, from its corner
    expect(() => printFileFor("tspl", drawn, design, 203)).toThrow(/TSPL's GS1-128 is offered for an SSCC \(00\) alone/);
    const noLinear: LabelDesign = { ...design, page: { ...PAGE, elements: PAGE.elements.filter((e) => e.id !== "b1") } };
    const tspl = textFile(printFileFor("tspl", labelFor(data, noLinear, font), noLinear, 203));
    expect(tspl).toMatch(/^SIZE 130 mm,79.95 mm\r$/m); // the label's dots, 639 at 203 dpi
    // Each line from its capitals' corner, in the tallest cell within a tenth of its capitals / 0.75 that keeps it within
    // the width the page gives it: 5 mm (40 dots) asks a 53-dot cell; font 1 at 4 (48 dots) would run 736 dots wide
    const tsplPrinted = printPageFor(labelFor(data, noLinear, font).designed!, 203);
    const PITCH = { 1: 8, 2: 12, 3: 16, 4: 24, 5: 32 } as Record<string, number>;
    const CELL = { 1: 12, 2: 20, 3: 24, 4: 32, 5: 48 } as Record<string, number>;
    for (const t of tsplPrinted.texts) {
      const [, f, m] = tspl.match(new RegExp(`^TEXT ${t.x},${t.y},"(\\d)",0,(\\d+),\\2,"${t.text}"\r$`, "m"))!;
      expect([...t.text].length * PITCH[f!]! * Number(m)).toBeLessThanOrEqual(t.widthDots);
      expect(CELL[f!]! * Number(m)).toBeLessThanOrEqual(Math.round(t.heightDots / 0.75) * 1.1);
    }
    expect(tspl).toContain('TEXT 48,48,"2",0,2,2,"Finest Truffle Tapenade"');
    expect(tspl).toMatch(/^QRCODE \d+,\d+,M,\d+,A,0,"https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231"\r$/m);
    expect(textFile(printFileFor("tspl", labelFor(data, noLinear, font), noLinear, 203, undefined, ["a note"]))).toContain("50 mm: measure this line");
    // DPL: rows count up from the label's bottom, in tenths of a millimetre; each line's record at its cell's bottom (the
    // capitals' top at the cell's top), in the tallest internal font within a tenth of its capitals / 0.72 that keeps it
    // within its width; the QR code by its bottom left corner. A GS1-128 other than an SSCC alone is refused, as alone
    const dpl = printFileFor("dpl", labelFor(data, noLinear, font), noLinear, 203) as string;
    expect(dpl.startsWith("\x02L\rm\rD11\rz\r")).toBe(true);
    expect(dpl.endsWith("\rQ0001\rE\r")).toBe(true);
    const tenths = (v: number) => String(Math.round((v / 203) * 254)).padStart(4, "0");
    const DPL_PITCH = [6, 9, 12];
    const DPL_CELL = [7, 13, 18];
    for (const t of tsplPrinted.texts) {
      const [, f, m] = dpl.match(new RegExp(`\r1(\\d)(\\w)\\w000(\\d{8})${t.text}\r`))!.slice(0, 3) as [string, string, string];
      const cell = DPL_CELL[Number(f)]! * Number.parseInt(m, 36);
      expect(dpl).toContain(`\r1${f}${m}${m}000${tenths(639 - t.y - cell)}${tenths(t.x)}${t.text}\r`);
      // The tallest of fonts 0 to 2 at multipliers 1 to 24 within a tenth of the cell asked that keeps the line in its width
      const asked = Math.round(t.heightDots / 0.72) * 1.1;
      const tallest = Math.max(...[0, 1, 2].flatMap((font) => Array.from({ length: 24 }, (_, i) => i + 1)
        .filter((k) => DPL_CELL[font]! * k <= asked && [...t.text].length * DPL_PITCH[font]! * k <= t.widthDots).map((k) => DPL_CELL[font]! * k)));
      expect([t.text, cell]).toEqual([t.text, tallest]);
      expect([...t.text].length * DPL_PITCH[Number(f)]! * Number.parseInt(m, 36)).toBeLessThanOrEqual(t.widthDots);
    }
    expect(dpl).toMatch(/\r1W1D\w\w000\d{8}MA,https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231\r\r/);
    expect(printFileFor("dpl", labelFor(data, noLinear, font), noLinear, 203, undefined, ["a note"])).toContain("50 mm: measure this line");
    expect(() => printFileFor("dpl", drawn, design, 203)).toThrow(/DPL's GS1-128 is offered for an SSCC \(00\) alone/);
    // A barcode past the label's edge is refused, not cut
    const past: LabelDesign = { ...design, page: { ...PAGE, elements: PAGE.elements.map((e) => (e.id === "b1" ? { ...e, xMm: 40 } : e)) } };
    expect(() => printFileFor("zpl", labelFor(data, past, font), past, 203)).toThrow(/The GS1-128 runs past the label's edge at 4 dots a module/);
  });

  // Lines and boxes (backlog 4.2, step b): drawn as dark rectangles after the symbols', a box's outline inside its size;
  // in ZPL with ^GB, in EPL2 with LO (a line, a filled box) and X (an outline), each edge at the nearest dot
  it("draws lines and boxes, a frame clear of a barcode's quiet zones not an overlap, and writes them in ZPL and EPL2", async () => {
    const graphics: DesignPage = {
      widthMm: 130, heightMm: 80,
      elements: [
        { id: "b1", kind: "symbol", symbology: "gs1-128", ais: ["01", "17"], size: 100, hri: true, xMm: 4, yMm: 38 },
        { id: "frame", kind: "box", widthMm: 126, heightMm: 76, thicknessMm: 0.8, filled: false, xMm: 2, yMm: 2 },
        { id: "rule", kind: "line", vertical: false, lengthMm: 120, thicknessMm: 0.5, xMm: 5, yMm: 35 },
        { id: "post", kind: "line", vertical: true, lengthMm: 25, thicknessMm: 0.3, xMm: 90, yMm: 6 },
        { id: "spot", kind: "box", widthMm: 10, heightMm: 6, thicknessMm: 0.5, filled: true, xMm: 110, yMm: 8 },
        { id: "thick", kind: "box", widthMm: 4, heightMm: 4, thicknessMm: 3, filled: false, xMm: 100, yMm: 8 },
      ],
    };
    const label = designLabel(graphics, data, font, { environment: "distribution" });
    const { layout } = label;
    expect(label.problems).toEqual([]);
    // The symbol's rectangles first, then the frame's four sides, each line, the filled box whole, and a box whose
    // outline would pass its middle filled
    const mm = layout.rects.slice(layout.symbolRects).map((r) => r.map((v) => Math.round(v * layout.xMm * 1000) / 1000));
    expect(mm).toEqual([
      [2, 2, 126, 0.8], [2, 77.2, 126, 0.8], [2, 2.8, 0.8, 74.4], [127.2, 2.8, 0.8, 74.4],
      [5, 35, 120, 0.5], [90, 6, 0.3, 25], [110, 8, 10, 6], [100, 8, 4, 4],
    ]);
    expect(layout.symbolRects).toBe(layout.rects.length - 8);
    expect(label.placed.find((p) => p.id === "post")).toEqual({ id: "post", xMm: 90, yMm: 6, widthMm: 0.3, heightMm: 25 });
    // Still read back with its frame and rules
    const svg = labelSvg(label.options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    // A line across the barcode overlaps it; a box over it too
    const across: DesignPage = { ...graphics, elements: [...graphics.elements, { id: "x", kind: "line", vertical: true, lengthMm: 30, thicknessMm: 0.5, xMm: 20, yMm: 38 }] };
    expect(designLabel(across, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "overlap", ids: ["b1", "x"] }]);
    // The print file: each edge at the nearest dot, the outline at least a dot
    const dots = (v: number) => Math.round((v / 25.4) * 203);
    const page = printPageFor(label, 203);
    expect(page.boxes).toEqual([
      { x: dots(2), y: dots(2), width: dots(128) - dots(2), height: dots(78) - dots(2), thickness: dots(0.8) },
      { x: dots(5), y: dots(35), width: dots(125) - dots(5), height: dots(35.5) - dots(35), thickness: dots(35.5) - dots(35) },
      { x: dots(90), y: dots(6), width: dots(90.3) - dots(90), height: dots(31) - dots(6), thickness: dots(90.3) - dots(90) },
      { x: dots(110), y: dots(8), width: dots(120) - dots(110), height: dots(14) - dots(8), thickness: dots(14) - dots(8) },
      { x: dots(100), y: dots(8), width: dots(104) - dots(100), height: dots(12) - dots(8), thickness: dots(104) - dots(100) },
    ]);
    const zpl = zplPage(page);
    expect(zpl).toContain(`^FO${dots(2)},${dots(2)}^GB${dots(128) - dots(2)},${dots(78) - dots(2)},${dots(0.8)}^FS`);
    expect(zpl).toContain(`^FO${dots(90)},${dots(6)}^GB${dots(90.3) - dots(90)},${dots(31) - dots(6)},${dots(90.3) - dots(90)}^FS`);
    const epl = eplPage(page);
    expect(epl).toContain(`\r\nX${dots(2)},${dots(2)},${dots(0.8)},${dots(128)},${dots(78)}\r\n`);
    expect(epl).toContain(`\r\nLO${dots(110)},${dots(8)},${dots(120) - dots(110)},${dots(14) - dots(8)}\r\n`);
    // TSPL: BOX's far corner is the box's outer edge, BAR fills
    const tspl = tsplPage({ ...page, symbols: [] });
    expect(tspl).toContain(`\r\nBOX ${dots(2)},${dots(2)},${dots(128)},${dots(78)},${dots(0.8)}\r\n`);
    expect(tspl).toContain(`\r\nBAR ${dots(110)},${dots(8)},${dots(120) - dots(110)},${dots(14) - dots(8)}\r\n`);
    // DPL: an X record's box b and line l by their bottom left corner, rows up from the label's bottom, the corner and
    // the size each in tenths of a millimetre rounded on its own
    const dpl = dplPage({ ...page, symbols: [] });
    const tenth = (d: number) => Math.round((d / 203) * 254);
    const four = (v: number) => String(v).padStart(4, "0");
    const corner = (left: number, bottom: number) => four(tenth(page.heightDots - bottom)) + four(tenth(left));
    const size = (left: number, top: number, right: number, bottom: number) => four(tenth(right - left)) + four(tenth(bottom - top));
    expect(dpl).toContain(`\r1X11000${corner(dots(2), dots(78))}b${size(dots(2), dots(2), dots(128), dots(78))}${four(tenth(dots(0.8)))}${four(tenth(dots(0.8)))}\r`);
    expect(dpl).toContain(`\r1X11000${corner(dots(110), dots(14))}l${size(dots(110), dots(8), dots(120), dots(14))}\r`);
    // A line past the label's edge is named in the editor and refused in a print file, not cut
    const past: DesignPage = { ...graphics, elements: [...graphics.elements.slice(0, 2), { id: "long", kind: "line", vertical: false, lengthMm: 130, thicknessMm: 0.5, xMm: 5, yMm: 35 }] };
    const pastLabel = designLabel(past, data, font, { environment: "distribution" });
    expect(pastLabel.problems).toEqual([{ kind: "edge", id: "long" }]);
    expect(() => printPageFor(pastLabel, 203)).toThrow(/A line or box runs past the label's edge/);
    // A line or box without a size or thickness is refused, naming what it needs
    const flat: DesignPage = { ...graphics, elements: [...graphics.elements.slice(0, 1), { id: "z", kind: "line", vertical: false, lengthMm: 0, thicknessMm: 0.5, xMm: 5, yMm: 35 }] };
    expect(() => designLabel(flat, data, font, { environment: "distribution" })).toThrow(/A line or box needs a length, a width and a thickness greater than 0 mm/);
  }, SLOW);

  it("draws a pictogram of ISO 15223-1 as its letters centred in a frame, turned or not, and prints it as a box and a line of text", async () => {
    // Backlog 6.5 (the owner, 15 November 2026): the UDI pictogram beside the carrier of a medical device's UDI
    const pictograms: DesignPage = {
      widthMm: 60, heightMm: 30,
      elements: [
        { id: "dm", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 1, yMm: 8 },
        { id: "udi", kind: "pictogram", pictogram: "udi", heightMm: 4, xMm: 2, yMm: 2 },
        { id: "md", kind: "pictogram", pictogram: "md", heightMm: 5, rotation: 90, xMm: 40, yMm: 10 },
      ],
    };
    const label = designLabel(pictograms, data, font, { environment: "healthcare" });
    expect(label.problems).toEqual([]);
    const udi = pictogramSize({ pictogram: "udi", heightMm: 4 }, font);
    const md = pictogramSize({ pictogram: "md", heightMm: 5 }, font);
    // The frame as wide as the letters and 0.3 of its height each side; turned, its width and height change places
    expect(udi.widthMm).toBeCloseTo(udi.lettersMm[0]! + 2.4, 9);
    expect(udi.lettersMm[0]).toBeCloseTo((font.textWidth("UDI", font.unitsPerEm) * 2) / font.capHeight, 9);
    expect(label.placed.find((p) => p.id === "udi")).toEqual({ id: "udi", xMm: 2, yMm: 2, widthMm: udi.widthMm, heightMm: 4 });
    expect(label.placed.find((p) => p.id === "md")).toEqual({ id: "md", xMm: 40, yMm: 10, widthMm: 5, heightMm: md.widthMm });
    // The frames' outlines, a sixteenth of their height, after the symbol's rectangles
    const { layout } = label;
    const mm = layout.rects.slice(layout.symbolRects).map((r) => r.map((v) => Math.round(v * layout.xMm * 1000) / 1000));
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    expect(mm).toEqual([
      [2, 2, r3(udi.widthMm), 0.25], [2, 5.75, r3(udi.widthMm), 0.25], [2, 2.25, 0.25, 3.5], [r3(2 + udi.widthMm - 0.25), 2.25, 0.25, 3.5],
      [40, 10, 5, 0.313], [40, r3(10 + md.widthMm - 0.3125), 5, 0.313], [40, 10.313, 0.313, r3(md.widthMm - 0.625)], [44.688, 10.313, 0.313, r3(md.widthMm - 0.625)],
    ].map((r) => r.map(r3)));
    // The letters: half the frame's height, centred; MD read downwards
    const letters = layout.texts.filter((t) => t.text === "UDI" || t.text === "MD");
    expect(letters.map((t) => [t.text, t.turn])).toEqual([["UDI", undefined], ["MD", 1]]);
    expect(letters[0]!.x * layout.xMm).toBeCloseTo(2 + 1.2, 6);
    expect(letters[0]!.baseline * layout.xMm).toBeCloseTo(2 + 3, 6);
    // Turned a quarter, the baseline runs down at the frame's left: 5 − 1.25 − 2.5 mm in, from 1.5 mm below its top
    expect(letters[1]!.x * layout.xMm).toBeCloseTo(40 + 1.25, 6);
    expect(letters[1]!.baseline * layout.xMm).toBeCloseTo(10 + 1.5, 6);
    expect(label.printer.texts).toEqual([
      { text: "UDI", xMm: 3.2, yMm: 3, heightMm: 2, widthMm: udi.lettersMm[0], rotation: 0 },
      { text: "MD", xMm: 41.25, yMm: 11.5, heightMm: 2.5, widthMm: md.lettersMm[0], rotation: 90 },
    ].map((t) => ({ ...t, xMm: expect.closeTo(t.xMm, 9), yMm: expect.closeTo(t.yMm, 9) })));
    expect(label.printer.boxes).toEqual([
      { id: "udi", xMm: 2, yMm: 2, widthMm: udi.widthMm, heightMm: 4, thicknessMm: 0.25 },
      { id: "md", xMm: 40, yMm: 10, widthMm: 5, heightMm: md.widthMm, thicknessMm: 0.3125 },
    ]);
    // The symbol still read back beside them
    const svg = labelSvg(label.options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 6 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    // Each printer language writes the frame as a box and the letters as text
    const page = printPageFor(label, 300);
    const zpl = zplPage(page);
    expect(zpl).toMatch(/\^GB\d+,\d+,\d+\^FS[\s\S]*\^GB\d+,\d+,\d+\^FS/);
    expect(zpl).toContain("^FDUDI^FS");
    expect(zpl).toMatch(/\^A0R,[^\n]*\^FDMD\^FS/);
    const shapes = { ...page, symbols: [] }; // EPL2 has no GS1 DataMatrix
    for (const file of [textFile(eplPage(shapes)), tsplPage(shapes), dplPage(shapes)]) expect(file).toMatch(/UDI[\s\S]*MD/);
    // Over the symbol's quiet zone, an overlap; no height, refused
    const over: DesignPage = { ...pictograms, elements: [...pictograms.elements, { id: "x", kind: "pictogram", pictogram: "udi", heightMm: 4, xMm: 3, yMm: 9 }] };
    expect(designLabel(over, data, font, { environment: "healthcare" }).problems).toEqual([{ kind: "overlap", ids: ["dm", "x"] }]);
    const flat: DesignPage = { ...pictograms, elements: [{ id: "x", kind: "pictogram", pictogram: "md", heightMm: 0, xMm: 3, yMm: 9 }] };
    expect(() => designLabel(flat, data, font, { environment: "healthcare" })).toThrow(/A pictogram needs a height greater than 0 mm/);
  }, SLOW);

  it("offers the pictograms by segment, each letters in a frame or a drawing within its box", () => {
    // Backlog 6.13 (the owner, 15 November 2026): + Pictogram's arrow lists them by segment, each segment's together
    expect(PICTOGRAM_NAMES).toEqual(Object.keys(PICTOGRAMS));
    const segments = PICTOGRAM_NAMES.map((name) => PICTOGRAMS[name].segment).filter((segment, i, all) => segment !== all[i - 1]);
    expect(segments).toEqual(PICTOGRAM_SEGMENTS.map((s) => s.segment));
    expect(PICTOGRAM_NAMES.filter((name) => PICTOGRAMS[name].segment === "healthcare")).toHaveLength(13);
    for (const name of PICTOGRAM_NAMES) {
      const pictogram = PICTOGRAMS[name];
      expect([!!pictogram.cells, !!pictogram.drawing], name).toEqual(pictogram.cells ? [true, false] : [false, true]);
      expect(pictogram.source, name).toMatch(/^(ISO 15223-1:2021, symbol 5\.\d+\.\d+|ISO 7000-\d{4} \(ISO 780\)|Directive 76\/211\/EEC)/);
      expect(pictogram.heightMm, name).toBeGreaterThan(0);
      if (!pictogram.drawing) continue;
      // A drawing's contours inside its box, filling some of it but not all: measured at 200 pixels a unit
      const { aspect } = pictogram.drawing;
      const contours = pictogramContours(name);
      expect(contours.length, name).toBeGreaterThan(0);
      for (const contour of contours) {
        expect(contour.length, name).toBeGreaterThanOrEqual(3);
        for (const [x, y] of contour) {
          expect(x, name).toBeGreaterThanOrEqual(0);
          expect(x, name).toBeLessThanOrEqual(aspect);
          expect(y, name).toBeGreaterThanOrEqual(0);
          expect(y, name).toBeLessThanOrEqual(1);
        }
      }
      const [w, h] = [Math.round(aspect * 200), 200];
      const grey = new Uint8Array(w * h).fill(255);
      fillOutlines(grey, w, h, contours.map((contour) => contour.map(([x, y]) => [x * 200, y * 200])));
      const covered = grey.filter((level) => level < 128).length / (w * h);
      expect(covered, name).toBeGreaterThan(0.1);
      expect(covered, name).toBeLessThan(0.7);
    }
    expect(pictogramLabel("sterile-eo")).toBe("STERILE EO");
    expect(pictogramLabel("use-by")).toBe("Use-by date");
    // Every drawing different from the others
    const drawings = PICTOGRAM_NAMES.filter((name) => PICTOGRAMS[name].drawing).map((name) => JSON.stringify(pictogramContours(name)));
    expect(new Set(drawings).size).toBe(drawings.length);
  });

  it("draws STERILE EO as two cells with a rule between, and a drawing as contours in every file and as an image at the printer's dots", async () => {
    // Backlog 6.13: letters in cells, as ISO 15223-1 draws STERILE EO; the hourglass (use-by date, turned) and the
    // fragile glass as contours: SVG, PNG and PDF agree, the symbol beside them is still read, and each printer
    // language but DPL prints a drawing as an image filled at its own dots
    const page: DesignPage = {
      widthMm: 60, heightMm: 30,
      elements: [
        { id: "dm", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 1, yMm: 8 },
        { id: "eo", kind: "pictogram", pictogram: "sterile-eo", heightMm: 4, xMm: 2, yMm: 2 },
        { id: "use", kind: "pictogram", pictogram: "use-by", heightMm: 6, rotation: 90, xMm: 40, yMm: 4 },
        { id: "glass", kind: "pictogram", pictogram: "fragile", heightMm: 10, xMm: 50, yMm: 15 },
      ],
    };
    const label = designLabel(page, data, font, { environment: "healthcare" });
    const { layout } = label;
    expect(label.problems).toEqual([]);
    // Two cells: each as wide as its letters and 0.3 heights each side, a rule a sixteenth thick on their border
    const eo = pictogramSize({ pictogram: "sterile-eo", heightMm: 4 }, font);
    const [sterile, oxide] = eo.lettersMm as [number, number];
    expect(eo.widthMm).toBeCloseTo(sterile + oxide + 4.8, 9);
    expect(label.placed.find((p) => p.id === "eo")).toEqual({ id: "eo", xMm: 2, yMm: 2, widthMm: eo.widthMm, heightMm: 4 });
    expect(label.printer.boxes).toEqual([
      { id: "eo", xMm: 2, yMm: 2, widthMm: eo.widthMm, heightMm: 4, thicknessMm: 0.25 },
      { id: "eo", xMm: expect.closeTo(2 + sterile + 2.4 - 0.125, 9), yMm: 2, widthMm: 0.25, heightMm: 4, thicknessMm: 0.25 },
    ]);
    expect(label.printer.texts).toEqual([
      { text: "STERILE", xMm: expect.closeTo(3.2, 9), yMm: 3, heightMm: 2, widthMm: sterile, rotation: 0 },
      { text: "EO", xMm: expect.closeTo(2 + sterile + 2.4 + 1.2, 9), yMm: 3, heightMm: 2, widthMm: oxide, rotation: 0 },
    ]);
    // The drawings: as wide as their aspect, turned with their box; no rectangle, no text, each contour in its box
    expect(label.placed.find((p) => p.id === "use")).toEqual({ id: "use", xMm: 40, yMm: 4, widthMm: 6, heightMm: expect.closeTo(4.2, 9) });
    expect(label.placed.find((p) => p.id === "glass")).toEqual({ id: "glass", xMm: 50, yMm: 15, widthMm: expect.closeTo(6.2, 9), heightMm: 10 });
    expect(layout.shapes).toHaveLength(pictogramContours("use-by").length + pictogramContours("fragile").length);
    expect(layout.texts.map((t) => t.text)).toEqual(["STERILE", "EO"]);
    const mm = (contour: [number, number][]) => contour.map(([x, y]) => [x * layout.xMm, y * layout.xMm]);
    // The hourglass's upper plate's first corner, (0.04, 0.03) of a 4.2 × 6 mm box, turned a quarter: 6 − 0.18 mm in
    const [first] = mm(layout.shapes![0]!);
    expect(first![0]).toBeCloseTo(40 + 6 - 0.18, 9);
    expect(first![1]).toBeCloseTo(4 + 0.24, 9);
    for (const [id, contours] of [["use", layout.shapes!.slice(0, pictogramContours("use-by").length)], ["glass", layout.shapes!.slice(pictogramContours("use-by").length)]] as const) {
      const box = label.placed.find((p) => p.id === id)!;
      for (const [x, y] of contours.flatMap(mm)) {
        expect(x).toBeGreaterThanOrEqual(box.xMm - 1e-9);
        expect(x).toBeLessThanOrEqual(box.xMm + box.widthMm + 1e-9);
        expect(y).toBeGreaterThanOrEqual(box.yMm - 1e-9);
        expect(y).toBeLessThanOrEqual(box.yMm + box.heightMm + 1e-9);
      }
    }
    expect(label.printer.shapes.map((s) => [s.id, s.widthMm, s.heightMm])).toEqual([["use", 6, expect.closeTo(4.2, 9)], ["glass", expect.closeTo(6.2, 9), 10]]);
    // The same drawing in the SVG, the PNG and the PDF, at 20 pixels a millimetre: as dark within each drawing's box
    const svg = labelSvg(label.options, layout, font);
    expect(svg).toContain('<path fill="#000" fill-rule="nonzero" d="M');
    const perMm = 20;
    const fromSvg = decodePng(new Resvg(svg, { fitTo: { mode: "width", value: 60 * perMm }, background: "#fff" }).render().asPng());
    const own = labelPixels(layout, font, perMm * layout.xMm);
    const fromPdf = decodePng(drawPdf(await labelPdf(label.options, layout, font), 25.4 * perMm));
    const dark = (image: { width: number; grey: ArrayLike<number> }, [x, y, w, h]: number[]) => {
      let count = 0;
      for (let row = Math.round(y! * perMm); row < Math.round((y! + h!) * perMm); row++) {
        for (let col = Math.round(x! * perMm); col < Math.round((x! + w!) * perMm); col++) if (image.grey[row * image.width + col]! < 128) count++;
      }
      return count / (Math.round(w! * perMm) * Math.round(h! * perMm));
    };
    for (const id of ["use", "glass"]) {
      const { xMm, yMm, widthMm, heightMm } = label.placed.find((p) => p.id === id)!;
      const box = [xMm, yMm, widthMm, heightMm];
      const reference = dark(own, box);
      expect(reference, id).toBeGreaterThan(0.1);
      expect(Math.abs(dark(fromSvg, box) - reference), id).toBeLessThan(0.02);
      expect(Math.abs(dark(fromPdf, box) - reference), id).toBeLessThan(0.02);
    }
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 6 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    // At the printer's dots: each drawing an image in its box, as dark as the PNG draws it; the letters as text
    for (const dpi of [203, 300]) {
      const dots = (v: number) => Math.round((v / 25.4) * dpi);
      const print = printPageFor(label, dpi);
      expect(print.images).toHaveLength(2);
      for (const [image, id] of [[print.images![0]!, "use"], [print.images![1]!, "glass"]] as const) {
        const { xMm, yMm, widthMm, heightMm } = label.placed.find((p) => p.id === id)!;
        expect([image.x, image.y, image.bitmap.width, image.bitmap.height, image.drawing]).toEqual([dots(xMm), dots(yMm), dots(xMm + widthMm) - dots(xMm), dots(yMm + heightMm) - dots(yMm), true]);
        const share = image.bitmap.dark.reduce((sum, d) => sum + d, 0) / image.bitmap.dark.length;
        expect(Math.abs(share - dark(own, [xMm, yMm, widthMm, heightMm])), `${id} at ${dpi} dpi`).toBeLessThan(0.03);
      }
      const zpl = zplPage(print);
      for (const image of print.images!) expect(zpl).toContain(graphicFields(image.bitmap, image.x, image.y).join("\n"));
      expect(zpl).toContain("^FDSTERILE^FS");
      expect(zpl).toContain("^FDEO^FS");
      const shapes = { ...print, symbols: [] }; // EPL2 has no GS1 DataMatrix
      expect(new TextDecoder("latin1").decode(eplPage(shapes) as Uint8Array)).toMatch(/GW\d+,\d+,\d+,\d+,[\s\S]*GW\d+,\d+,\d+,\d+,/);
      expect(new TextDecoder("latin1").decode(tsplPage(shapes) as Uint8Array)).toMatch(/BITMAP \d+,\d+,\d+,\d+,0,[\s\S]*BITMAP /);
      // DPL refuses a drawing with its own reason, and prints the letters
      expect(() => dplPage(shapes)).toThrow(/a drawn pictogram is not offered in DPL yet/);
      expect(dplPage({ ...shapes, images: [] })).toMatch(/STERILE[\s\S]*EO/);
    }
    // A drawing past the label's edge: named on the page, refused by a printer language
    const past: DesignPage = { ...page, elements: [...page.elements.slice(0, 3), { ...page.elements[3]!, xMm: 55 } as DesignElement] };
    const outside = designLabel(past, data, font, { environment: "healthcare" });
    expect(outside.problems).toEqual([{ kind: "edge", id: "glass" }]);
    expect(() => printPageFor(outside, 203)).toThrow(/A pictogram runs past the label's edge/);
  }, SLOW);

  // An image (backlog 4.2, step d): a logo as a one-bit picture, drawn where the page puts it in every output and sent
  // to a ZPL printer as a graphic field at its dots, to an EPL2 printer as GW's raw bytes
  it("draws an image where the page puts it, as high as its proportions make it, and sends it in ZPL as ^GF and in EPL2 as GW", async () => {
    const label = designLabel(WITH_LOGO, data, font, { environment: "distribution" });
    const { layout } = label;
    expect(label.problems).toEqual([]);
    const image = WITH_LOGO.elements[0]!;
    if (image.kind !== "image") throw new Error("the fixture's first element is its image");
    expect(label.placed.find((p) => p.id === "logo")).toEqual({ id: "logo", xMm: 4, yMm: 4, widthMm: 40, heightMm: 20 });
    // Its rectangles after the symbol's: the picture's, each pixel 40 / 120 mm
    const bitmap = pictureBitmap(image.picture);
    const pixel = 40 / 120;
    const mm = (r: number[]) => r.map((v) => Math.round(v * 1000) / 1000);
    expect(layout.rects.slice(layout.symbolRects).map((r) => mm(r.map((v) => v * layout.xMm))))
      .toEqual(bitmapRects(bitmap).map(([x, y, w, h]) => mm([4 + x * pixel, 4 + y * pixel, w * pixel, h * pixel])));
    // Still read back beside it
    const svg = labelSvg(label.options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    // Over the symbol, an overlap
    const over: DesignPage = { ...WITH_LOGO, elements: [{ ...image, xMm: 50 }, WITH_LOGO.elements[1]!] };
    expect(designLabel(over, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "overlap", ids: ["logo", "m"] }]);
    // The print file: its edges at the nearest dots, each dot the picture's pixel under its centre
    for (const dpi of [203, 300]) {
      const dots = (v: number) => Math.round((v / 25.4) * dpi);
      const page = printPageFor(label, dpi);
      const at = { x: dots(4), y: dots(4), bitmap: resample(bitmap, dots(44) - dots(4), dots(24) - dots(4)) };
      expect(page.images).toEqual([at]);
      expect(zplPage(page)).toContain(graphicFields(at.bitmap, at.x, at.y).join("\n"));
      // EPL2's GW: its corner, its bytes a row and its rows, then each dot a bit, 0 where it is dark (Zebra), the last
      // byte's spare dots 1; the rest of the file as text
      const epl = eplPage(page) as Uint8Array;
      const header = `GW${at.x},${at.y},${Math.ceil(at.bitmap.width / 8)},${at.bitmap.height},`;
      const start = new TextDecoder("latin1").decode(epl).indexOf(`\r\n${header}`) + 2 + header.length;
      const row = Math.ceil(at.bitmap.width / 8);
      for (let yy = 0; yy < at.bitmap.height; yy++) {
        for (let xx = 0; xx < row * 8; xx++) {
          const bit = (epl[start + yy * row + (xx >> 3)]! >> (7 - (xx & 7))) & 1;
          if (bit !== (xx < at.bitmap.width && at.bitmap.dark[yy * at.bitmap.width + xx] ? 0 : 1)) throw new Error(`dot ${xx},${yy} at ${dpi} dpi`);
        }
      }
      expect(new TextDecoder().decode(epl.subarray(start + row * at.bitmap.height))).toMatch(/^\r\nb\d+,\d+,D,/);
      expect(typeof eplPage({ ...page, images: [] })).toBe("string");
      // TSPL's BITMAP: the same bits after its corner, bytes a row, rows and mode 0 (overwrite)
      const tspl = tsplPage(page) as Uint8Array;
      const bitmapHeader = `BITMAP ${at.x},${at.y},${row},${at.bitmap.height},0,`;
      const from = new TextDecoder("latin1").decode(tspl).indexOf(`\r\n${bitmapHeader}`) + 2 + bitmapHeader.length;
      expect(tspl.subarray(from, from + row * at.bitmap.height)).toEqual(epl.subarray(start, start + row * at.bitmap.height));
      expect(new TextDecoder().decode(tspl.subarray(from + row * at.bitmap.height))).toMatch(/^\r\nDMATRIX \d+,\d+,/);
      expect(typeof tsplPage({ ...page, images: [] })).toBe("string");
      // DPL prints a stored image (a Y record), which Labelize does not draw: refused, the rest written without it
      expect(() => dplPage(page)).toThrow(/an image is not offered in DPL yet/);
      expect(dplPage({ ...page, images: [] })).toMatch(/\r1W1c/);
    }
    // Dithered (backlog 4.2): drawn as its picture's pixels, but dithered again at each printer's dots, so that a
    // photo's greys print as dark as they are whatever the dots; a picture at the threshold keeps the pixel under each dot
    const photo = pictureFromGrey(Uint8Array.from({ length: 120 * 60 }, (_, p) => (p % 120) * 2), 120, 60, PICTURE_THRESHOLD, true);
    const dither: DesignPage = { ...WITH_LOGO, elements: [{ ...image, picture: photo, dither: true }, WITH_LOGO.elements[1]!] };
    const ditheredLabel = designLabel(dither, data, font, { environment: "distribution" });
    expect(ditheredLabel.layout.rects.slice(ditheredLabel.layout.symbolRects).map((r) => mm(r.map((v) => v * ditheredLabel.layout.xMm))))
      .toEqual(bitmapRects(pictureBitmap(photo)).map(([x, y, w, h]) => mm([4 + x * pixel, 4 + y * pixel, w * pixel, h * pixel])));
    for (const dpi of [203, 300, 600]) {
      const dots = (v: number) => Math.round((v / 25.4) * dpi);
      const [w, h] = [dots(44) - dots(4), dots(24) - dots(4)];
      expect(printPageFor(ditheredLabel, dpi).images).toEqual([{ x: dots(4), y: dots(4), bitmap: redithered(pictureBitmap(photo), w, h) }]);
      expect(redithered(pictureBitmap(photo), w, h)).not.toEqual(resample(pictureBitmap(photo), w, h));
      const plain = designLabel({ ...dither, elements: [{ ...image, picture: photo }, WITH_LOGO.elements[1]!] }, data, font, { environment: "distribution" });
      expect(printPageFor(plain, dpi).images![0]!.bitmap).toEqual(resample(pictureBitmap(photo), w, h));
    }
    // Past the label's edge: named in the editor, refused in a print file
    const past = designLabel({ ...WITH_LOGO, elements: [{ ...image, widthMm: 99 }] }, data, font, { environment: "distribution" });
    expect(past.problems).toEqual([{ kind: "edge", id: "logo" }]);
    expect(() => printPageFor(past, 203)).toThrow(/An image runs past the label's edge/);
    // Without a width, refused
    expect(() => designLabel({ ...WITH_LOGO, elements: [{ ...image, widthMm: 0 }] }, data, font, { environment: "distribution" })).toThrow(/An image needs a width greater than 0 mm/);
  }, SLOW);

  // Rotation (backlog 4.2): a barcode, a text block and an image turned a quarter, a half or three quarters about their
  // box, whose top left corner as turned stays where the page puts it; drawn turned in every output, read back, and in
  // ZPL and EPL2 each field with its orientation; ^BQ and EPL2's b refuse what they cannot print turned
  it("turns a barcode, a text block and an image about their box, in the drawing, in ZPL and in EPL2", async () => {
    expect(turnedRect([1, 2, 3, 4], 10, 20, 90, 100, 200)).toEqual([114, 201, 4, 3]);
    expect(turnedRect([1, 2, 3, 4], 10, 20, 180, 100, 200)).toEqual([106, 214, 3, 4]);
    expect(turnedRect([1, 2, 3, 4], 10, 20, 270, 100, 200)).toEqual([102, 206, 4, 3]);
    const image = WITH_LOGO.elements[0]!;
    if (image.kind !== "image") throw new Error("the fixture's first element is its image");
    const page: DesignPage = {
      widthMm: 150, heightMm: 120,
      elements: [
        { id: "c", kind: "symbol", symbology: "gs1-128", ais: ["01", "10"], size: 100, hri: true, rotation: 90, xMm: 4, yMm: 4 },
        { id: "m", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: true, rotation: 180, xMm: 60, yMm: 70 },
        { id: "t", kind: "text", text: "BATCH {10}\nEXP {17:DD.MM.YYYY}", heightMm: 4, rotation: 270, xMm: 120, yMm: 10 },
        { ...image, rotation: 90, xMm: 60, yMm: 4 },
      ],
    };
    const label = designLabel(page, data, font, { environment: "distribution" });
    expect(label.problems).toEqual([]);
    const upright = designLabel({ ...page, elements: page.elements.map((e) => ({ ...e, rotation: 0 as const })) }, data, font, { environment: "distribution" });
    // Each box as turned: its width and height the other way round for a quarter turn, its corner where the page puts it
    for (const p of label.placed) {
      const u = upright.placed.find((q) => q.id === p.id)!;
      const element = page.elements.find((e) => e.id === p.id)!;
      const turn = "rotation" in element ? element.rotation : 0;
      expect([p.xMm, p.yMm, p.widthMm, p.heightMm]).toEqual(turn === 180 ? [u.xMm, u.yMm, u.widthMm, u.heightMm] : [u.xMm, u.yMm, u.heightMm, u.widthMm]);
    }
    // Every dark rectangle inside its element's box; the image's the picture turned
    const { layout } = label;
    const inside = (r: number[], p: { xMm: number; yMm: number; widthMm: number; heightMm: number }) =>
      r[0]! * layout.xMm >= p.xMm - 1e-6 && r[1]! * layout.xMm >= p.yMm - 1e-6
      && (r[0]! + r[2]!) * layout.xMm <= p.xMm + p.widthMm + 1e-6 && (r[1]! + r[3]!) * layout.xMm <= p.yMm + p.heightMm + 1e-6;
    expect(layout.rects.every((r) => label.placed.some((p) => inside(r, p)))).toBe(true);
    const turned = turnedPicture(image.picture, 90);
    expect([turned.width, turned.height]).toEqual([image.picture.height, image.picture.width]);
    expect(turnedPicture(turnedPicture(turned, 180), 90)).toEqual(image.picture);
    const pixel = 40 / 120;
    const mm = (r: number[]) => r.map((v) => Math.round(v * 1000) / 1000);
    expect(layout.rects.slice(layout.symbolRects).map((r) => mm(r.map((v) => v * layout.xMm))))
      .toEqual(bitmapRects(pictureBitmap(turned)).map(([x, y, w, h]) => mm([60 + x * pixel, 4 + y * pixel, w * pixel, h * pixel])));
    // The text turned with its block: read upwards, its capitals' top on the left and its descenders on the right, its
    // glyphs inside the block's box but for those and a round letter's overshoot
    const lines = layout.texts.filter((t) => t.turn === 3);
    expect(lines.map((t) => t.text)).toEqual(["BATCH B42", "EXP 31.12.2027"]);
    const box = label.placed.find((p) => p.id === "t")!;
    for (const t of lines) {
      for (const c of font.commands(t.text, t.x, t.baseline, t.em, t.turn).filter((c) => c.type !== "Z")) {
        expect(c.x! * layout.xMm).toBeGreaterThanOrEqual(box.xMm - 0.1);
        expect(c.x! * layout.xMm).toBeLessThanOrEqual(box.xMm + box.widthMm + 1.5);
        expect(c.y! * layout.xMm).toBeGreaterThanOrEqual(box.yMm - 1e-6);
        expect(c.y! * layout.xMm).toBeLessThanOrEqual(box.yMm + box.heightMm + 1e-6);
      }
    }
    // Every turned text, the barcodes' too, inside its element's box: a turned line drawn upright would run out of it
    for (const t of layout.texts) {
      const points = font.commands(t.text, t.x, t.baseline, t.em, t.turn).filter((c) => c.type !== "Z").map((c) => [c.x! * layout.xMm, c.y! * layout.xMm]);
      const near = 0.3; // a round letter's overshoot
      expect(label.placed.some((p) => points.every(([x, y]) => x! >= p.xMm - near && x! <= p.xMm + p.widthMm + near && y! >= p.yMm - near && y! <= p.yMm + p.heightMm + near))).toBe(true);
    }
    // Upside down by the label's left edge, the text's ^FB block ends at the edge
    const edge = designLabel({ widthMm: 60, heightMm: 30, elements: [{ id: "e", kind: "text", text: "BATCH {10}", heightMm: 4, rotation: 180, xMm: 1, yMm: 10 }] }, data, font, { environment: "distribution" });
    expect(zplPage(printPageFor(edge, 203))).toMatch(/\^FO0,\d+\^A0I,/);
    // The PNG draws the text turned too: nothing dark right of its block, where an upright line would run
    const pixels = labelPixels(layout, font, 4);
    const px = (mm: number) => Math.round((mm / layout.xMm) * 4);
    let past = 0;
    for (let y = px(box.yMm); y < px(box.yMm + box.heightMm); y++) {
      for (let x = px(box.xMm + box.widthMm + 2); x < pixels.width; x++) if (pixels.grey[y * pixels.width + x]! < 128) past++;
    }
    expect(past).toBe(0);
    // Read back turned from the SVG, the PNG and the PDF
    const svg = labelSvg(label.options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(label.expected);
    expect(await read(await labelPng(layout, font))).toEqual(label.expected);
    expect(await read(drawPdf(await labelPdf(label.options, layout, font), 300))).toEqual(label.expected);
    expect(labelSvg(label.options, layout, font, true)).toContain(`transform="rotate(270 `);
    // In ZPL: each field turned (Labelary prints them in labelary.test.ts); a QR code refused turned, upright not
    const printed = printPageFor(label, 203);
    expect(printed.symbols.map((s) => s.options.turned?.rotation)).toEqual([90, 180]);
    const zpl = zplPage(printed);
    expect(zpl).toMatch(/\^BCR,/);
    expect(zpl).toMatch(/\^BXI,/);
    expect(zpl).toMatch(/\^A0R,.*\^FB\d+,1,0,C\^FD\(01\)/);
    expect(zpl).toMatch(/\^A0B,\d+,\d+\^FB\d+,1,0,L\^FDBATCH B42/);
    expect(zpl).not.toMatch(/\^(A0|B[A-Z0-9])N/);
    // In EPL2 (Labelize prints them in printlangs.test.ts): B and A with their rotation, each origin the dot its
    // upright top left one was, turned about the symbol's box or the text's capitals' box; a Data Matrix refused turned
    expect(() => eplPage({ ...printed, images: [] })).toThrow(/no FNC1/);
    const epl = textFile(eplPage({ ...printed, images: [], symbols: printed.symbols.slice(0, 1) }));
    const c = printed.symbols[0]!.options;
    expect(epl).toContain(`\r\nB${c.x + c.turned!.height - 1},${c.y},1,1E,`);
    expect(epl.match(/^A\d+,\d+,1,/gm)).toHaveLength(1);
    const lineAt = printed.texts.map((t) => `\r\nA${t.x},${t.y + t.widthDots - 1},3,`);
    for (const at of lineAt) expect(epl).toContain(at);
    expect(epl).not.toMatch(/^[AB]\d+,\d+,0,/m);
    const dm: DesignPage = { widthMm: 60, heightMm: 60, elements: [{ id: "d", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, rotation: 90, xMm: 4, yMm: 4 }] };
    const dmPrinted = printPageFor(designLabel(dm, data, font, { environment: "distribution" }), 203);
    expect(() => eplPage(dmPrinted)).toThrow(/EPL2 prints a Data Matrix upright only \(its b command has no rotation\)/);
    expect(textFile(eplPage({ ...dmPrinted, symbols: dmPrinted.symbols.map((s) => ({ ...s, options: { ...s.options, turned: undefined } })) }))).toMatch(/^b\d+,\d+,D,/m);
    // In TSPL (Labelize prints them in printlangs.test.ts): BARCODE, TEXT and DMATRIX with their rotation, each origin
    // the dot its upright top left one was, turned about the symbol's box or the text's capitals' box, as TSC's printers
    // turn a field about its origin; a GS1 DataMatrix's text lines turned with it, each from its left edge
    expect(() => tsplPage({ ...printed, images: [] })).toThrow(/TSPL's GS1-128 is offered for an SSCC \(00\) alone/);
    const tspl = textFile(tsplPage({ ...printed, images: [], symbols: printed.symbols.slice(1) }));
    const g = printed.symbols[1]!.options;
    expect(tspl).toMatch(new RegExp(`^DMATRIX ${g.x + g.turned!.width - 1},${g.y + g.turned!.height - 1},\\d+,\\d+,c126,x\\d+,r180,`, "m"));
    expect(tspl.match(/^TEXT \d+,\d+,"\d",180,\d+,\d+,"\(01\)/gm)).toHaveLength(1);
    for (const t of printed.texts) expect(tspl).toContain(`\r\nTEXT ${t.x},${t.y + t.widthDots - 1},`);
    expect(tspl.match(/^TEXT \d+,\d+,"\d",270,/gm)).toHaveLength(printed.texts.length);
    expect(tspl).not.toMatch(/^(TEXT \d+,\d+,"\d",0|DMATRIX (?!.*,r180,))/m);
    expect(textFile(tsplPage(dmPrinted))).toMatch(/^DMATRIX \d+,\d+,\d+,\d+,c126,x\d+,r90,/m);
    // In DPL (Labelize prints them in printlangs.test.ts): each record with its rotation, 2, 3 or 4 for 90°, 180° and
    // 270° clockwise, its bottom left corner (the manual's pivot) turned with the symbol's box or the text's capitals'
    // box; at 270° a line's cell's bottom left corner, x and y + its cell upright, goes to x + its cell and y + its width.
    // A GS1-128 with more than an SSCC refused, as alone; a turned Data Matrix refused (Labelize does not turn W1c)
    expect(() => dplPage({ ...printed, images: [] })).toThrow(/DPL's GS1-128 is offered for an SSCC \(00\) alone/);
    const dplText = dplPage({ ...printed, images: [], symbols: [] });
    const tenth = (d: number) => String(Math.round((d / 203) * 254)).padStart(4, "0");
    for (const t of printed.texts) {
      const [, f, k] = dplText.match(new RegExp(`\r4(\\d)(\\w)\\w000\\d{8}${t.text}\r`))!;
      const cell = [7, 13, 18][Number(f)]! * Number.parseInt(k!, 36);
      expect(dplText).toContain(`\r4${f}${k}${k}000${tenth(printed.heightDots - (t.y + t.widthDots))}${tenth(t.x + cell)}${t.text}\r`);
    }
    expect(dplText).not.toMatch(/\r[1-3]\d/);
    expect(() => dplPage(dmPrinted)).toThrow(/DPL's Data Matrix is printed upright only for now/);
    // An ITF-14 turned a quarter by the label's top edge: its bearer frame, left of its bars upright, would start above
    // the label, refused; a little lower, the frame's top on the edge
    const itf = (y: number, kind: "frame" | "bars" = "frame") => eplPage({
      widthDots: 800, heightDots: 800, dpi: 203, texts: [], boxes: [],
      symbols: [{ symbology: "itf14", data: "19506000134359", options: { x: 100, y, dotsPerModule: 2, barHeightDots: 100, dpi: 203, hri: true, bearer: { kind, thicknessDots: 8 }, turned: { rotation: 90, width: 270, height: 100 } } }],
    });
    expect(() => itf(27)).toThrow(/A barcode's text runs past the label's edge/);
    expect(textFile(itf(28))).toMatch(/^X\d+,0,8,/m);
    // Its bearer bars (LO, 310 dots long with the quiet zones, 8 thick, above and below the bars) turned beside them:
    // the top one right of the 100-dot bars, the bottom one left
    expect(textFile(itf(28, "bars")).match(/^LO.*$/gm)).toEqual(["LO200,8,8,310", "LO92,8,8,310"]);
    // The same in TSPL: BOX and BAR turned with it
    const tsplItf = (y: number, kind: "frame" | "bars" = "frame") => tsplPage({
      widthDots: 800, heightDots: 800, dpi: 203, texts: [], boxes: [],
      symbols: [{ symbology: "itf14", data: "19506000134359", options: { x: 100, y, dotsPerModule: 2, barHeightDots: 100, dpi: 203, hri: true, bearer: { kind, thicknessDots: 8 }, turned: { rotation: 90, width: 270, height: 100 } } }],
    });
    expect(() => tsplItf(27)).toThrow(/A barcode's text runs past the label's edge/);
    expect(textFile(tsplItf(28))).toMatch(/^BOX \d+,0,\d+,\d+,8\r$/m);
    expect(textFile(tsplItf(28, "bars")).match(/^BAR .*(?=\r$)/gm)).toEqual(["BAR 200,8,8,310", "BAR 92,8,8,310"]);
    // The same in DPL: the d record turned (2), its pivot the bars' bottom left corner upright, (100, 128) turned to
    // (100, 28) with the box (x 100, y 28, 270 by 100 upright); the frame and bars as turned rectangles, X records upright
    const dplItf = (y: number, kind: "frame" | "bars" = "frame") => dplPage({
      widthDots: 800, heightDots: 800, dpi: 203, texts: [], boxes: [],
      symbols: [{ symbology: "itf14", data: "19506000134359", options: { x: 100, y, dotsPerModule: 2, barHeightDots: 100, dpi: 203, hri: true, bearer: { kind, thicknessDots: 8 }, turned: { rotation: 90, width: 270, height: 100 } } }],
    });
    expect(() => dplItf(27)).toThrow(/A barcode's text runs past the label's edge/);
    // Without bearer bars, its digits below the bars upright are left of them turned a quarter: by the left edge, refused
    const bare = (x: number) => dplPage({
      widthDots: 800, heightDots: 800, dpi: 203, texts: [], boxes: [],
      symbols: [{ symbology: "itf14", data: "19506000134359", options: { x, y: 100, dotsPerModule: 2, barHeightDots: 100, dpi: 203, hri: true, turned: { rotation: 90, width: 270, height: 100 } } }],
    });
    expect(() => bare(10)).toThrow(/A barcode's text runs past the label's edge/);
    expect(bare(60)).toMatch(/\r2[0-2]\w\w000\d{8}19506000134359\r/);
    expect(dplItf(28)).toContain(`\r2d62125${tenth(800 - 28)}${tenth(100)}19506000134359\r`);
    // The frame (72, 20) to (398, 136) upright, 8 thick: turned, 92 to 208 across and 0 to 326 down
    expect(dplItf(28)).toContain(`\r1X11000${tenth(800 - 326)}${tenth(92)}b${tenth(116)}${tenth(326)}${tenth(8)}${tenth(8)}\r`);
    expect(dplItf(28, "bars").match(/\r1X11000\d{8}l\d{8}(?=\r)/g)).toEqual([
      `\r1X11000${tenth(800 - 318)}${tenth(200)}l${tenth(8)}${tenth(310)}`, `\r1X11000${tenth(800 - 318)}${tenth(92)}l${tenth(8)}${tenth(310)}`,
    ]);
    const qr: DesignPage = { widthMm: 60, heightMm: 60, elements: [{ id: "q", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, rotation: 90, xMm: 4, yMm: 4 }] };
    const qrLabel = designLabel(qr, data, font, { environment: "distribution" });
    expect(() => zplPage(printPageFor(qrLabel, 203))).toThrow(/ZPL prints a QR code upright only/);
    expect(() => tsplPage(printPageFor(qrLabel, 203))).toThrow(/TSPL's QR code is printed upright only for now/);
    expect(() => dplPage(printPageFor(qrLabel, 203))).toThrow(/DPL's QR code is printed upright only for now/);
    expect(zplPage(printPageFor(designLabel({ ...qr, elements: [{ ...(qr.elements[0] as DesignSymbol), rotation: 0 }] }, data, font, { environment: "distribution" }), 203))).toMatch(/\^BQN/);
  }, SLOW);

  it("fills a text's fields from the data, an AI it does not have leaving nothing", () => {
    expect(fillFields("BATCH {10} · SERIAL {21}", data)).toBe("BATCH B42 · SERIAL ");
    expect(fillFields("{01}", data)).toBe("09506000134376");
  });

  // Fields bound to spreadsheet columns (backlog 4.2): any other name in braces is a column's header, its letters'
  // case and the spaces around it aside; a name no column has stays as typed, so that a mistyped field shows
  it("fills a {column} field from the row's cell, and leaves a name no column has as typed", () => {
    const cells = { "Product name": "Finest Truffle Tapenade", Price: " ", "10": "not the batch", Weight: "" };
    expect(fillFields("{Product name} · {10}", data, { cells })).toBe("Finest Truffle Tapenade · B42");
    expect(fillFields("{product NAME }", data, { cells })).toBe("Finest Truffle Tapenade");
    expect(fillFields("[{Weight}]", data, { cells })).toBe("[]"); // an empty cell leaves nothing
    expect(fillFields("{Colour} {12x} {}", data, { cells })).toBe("{Colour} {12x} {}");
    expect(fillFields("{Product name}", data)).toBe("{Product name}"); // a single label has no columns
    expect(columnCell(cells, " price")).toBe(" ");
    expect(columnCell(cells, "Colour")).toBeUndefined();
    expect(columnCell({ " Price ": "4,50" }, "Price")).toBe("4,50"); // a header with spaces around it, as rowCells keeps it
    expect(columnCell(undefined, "Price")).toBeUndefined();
    // Through the page: the text's lines, and the print file's
    const page: DesignPage = { ...PAGE, elements: PAGE.elements.map((e) => (e.id === "t1" ? { ...e, text: "{Product name}\n{Origin}" } : e)) };
    const label = designLabel(page, data, font, { environment: "distribution", cells: { ...cells, Origin: "Liguria" } });
    expect(label.layout.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["Finest Truffle Tapenade", "Liguria", "BATCH B42"]));
    expect(label.printer.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["Finest Truffle Tapenade", "Liguria"]));
    expect(designLabel(page, data, font, { environment: "distribution" }).layout.texts.map((t) => t.text)).toContain("{Origin}");
  });

  it("writes a date field in the format it names, the century as section 7.12 chooses it", () => {
    const today = new Date(Date.UTC(2026, 10, 3));
    expect(fillFields("BEST BEFORE {17:DD.MM.YYYY}", data, { today })).toBe("BEST BEFORE 31.12.2027");
    expect(DATE_FORMATS.map((format) => fillFields(`{17:${format}}`, data, { today }))).toEqual(["31/12/2027", "31.12.2027", "2027-12-31", "12/2027", "31 DEC 2027"]);
    expect(fillFields("{17:YYMMDD} {17:MMM YY}", data, { today })).toBe("271231 DEC 27");
    expect(fillFields("{17}", data, { today })).toBe("271231"); // without a format, as in the data
    expect(fillFields("{15:DD/MM/YYYY}", data, { today })).toBe(""); // an AI the data does not have
    // Section 7.12: 51 years or more ahead is the last century, 50 or more behind the next; day 00 is the month's last
    expect(formatDate("770101", "YYYY", { today })).toBe("1977");
    expect(formatDate("760101", "YYYY", { today })).toBe("2076");
    expect(formatDate("300101", "YYYY", { today: new Date(Date.UTC(2080, 0, 1)) })).toBe("2130");
    expect(formatDate("310101", "YYYY", { today: new Date(Date.UTC(2080, 0, 1)) })).toBe("2031");
    expect(formatDate("280200", "DD/MM/YYYY", { today })).toBe("29/02/2028");
    // A date AI with a time after its date, such as (7003), takes the date's six digits
    const dated = engine.parse("(01)09506000134376(7003)2712311530") as Identified;
    expect(fillFields("{7003:YYYY-MM-DD}", dated, { today })).toBe("2027-12-31");
    // A format after an AI that is not a date, and a format with no date in it, are refused, naming them
    expect(() => fillFields("{10:DD/MM/YYYY}", data)).toThrow(InputError);
    expect(() => fillFields("{10:DD/MM/YYYY}", data)).toThrow("(10) is not a date, so its field takes no date format.");
    expect(() => fillFields("{17:dd/yy}", data)).toThrow("The date format “dd/yy” has none of DD, MM, MMM, YY, YYYY, hh, mm and ss.");
  });

  it("writes a date's time in hh, mm and ss, leaving out a part the value does not have", () => {
    const today = new Date(Date.UTC(2026, 10, 3));
    const timed = (s: string) => engine.parse(`(01)09506000134376${s}`) as Identified;
    const expiry = timed("(7003)2712311530");
    expect(TIME_FORMATS.map((format) => fillFields(`{7003:${format}}`, expiry, { today }))).toEqual(["31/12/2027 15:30", "31.12.2027 15:30", "2027-12-31 15:30", "15:30"]);
    expect(fillFields("{7003:hh'h'mm DD MMM}", expiry, { today, months: "pt" })).toBe("15'h'30 31 DEZ");
    expect(fillFields("{7003:MM mm}", expiry, { today })).toBe("12 30"); // MM the month, mm the minutes
    expect(fillFields("{7003}", expiry, { today })).toBe("2712311530");
    // (8008) YYMMDDHH[MM[SS]]: each part from its own digits; the seconds and minutes optional
    const production = (t: string) => timed(`(10)B42(8008)271231${t}`);
    expect(fillFields("{8008:YYYY-MM-DD hh:mm:ss}", production("153045"), { today })).toBe("2027-12-31 15:30:45");
    expect(fillFields("{8008:YYYY-MM-DD hh:mm:ss}", production("1530"), { today })).toBe("2027-12-31 15:30");
    expect(fillFields("{8008:YYYY-MM-DD hh:mm:ss}", production("15"), { today })).toBe("2027-12-31 15");
    // (7011) YYMMDD[HHMM]: a date alone leaves out its time with the text before it
    expect(fillFields("TEST BY {7011:DD/MM/YYYY hh:mm}!", timed("(7011)2712310800"), { today })).toBe("TEST BY 31/12/2027 08:00!");
    expect(fillFields("TEST BY {7011:DD/MM/YYYY hh:mm}!", timed("(7011)271231"), { today })).toBe("TEST BY 31/12/2027!");
    expect(fillFields("{4324:DD.MM.YYYY hh:mm}", engine.parse("(00)106141411234567897(4324)2712312359") as Identified, { today })).toBe("31.12.2027 23:59");
    // (7007) HARVEST DATE YYMMDD[YYMMDD] carries no time: its second date is not read as one
    expect(fillFields("{7007:DD/MM/YYYY}", timed("(7007)271201271231"), { today })).toBe("01/12/2027");
    expect(() => fillFields("{7007:DD/MM/YYYY hh:mm}", timed("(7007)271201271231"), { today })).toThrow("(7007) carries no time, so its field takes no hh, mm or ss.");
    // A time after a date that carries none is refused, naming the AI
    expect(() => fillFields("{17:DD/MM/YYYY hh:mm}", data)).toThrow(InputError);
    expect(() => fillFields("{17:ss}", data)).toThrow("(17) carries no time, so its field takes no hh, mm or ss.");
    expect(["7003", "7011", "8008", "4324", "4325"].every(carriesTime)).toBe(true);
    expect(["17", "11", "7006", "7007", "4326", "10", "7250"].some(carriesTime)).toBe(false);
    // Through the page: the drawing and the print file
    const page: DesignPage = { widthMm: 80, heightMm: 30, elements: [{ id: "t", kind: "text", text: "EXP {7003:DD/MM/YYYY hh:mm}", heightMm: 4, xMm: 4, yMm: 4 }] };
    const designed = designLabel(page, expiry, font, { environment: "distribution" });
    expect(designed.layout.texts.map((t) => t.text)).toEqual(["EXP 31/12/2027 15:30"]);
    expect(zplPage(printPageFor(designed, 203))).toContain("^FDEXP 31/12/2027 15:30^FS");
  });

  it("writes a date of birth, YYYYMMDD, with its year as given, and (7251)'s time", () => {
    const today = new Date(Date.UTC(2026, 10, 3));
    const patient = (s: string) => engine.parse(`(8018)950600013435200008${s}`) as Identified;
    const born = patient("(7250)19600115");
    // The century as given: by the rule for YYMMDD (section 7.12), 60 would be 2060 in 2026
    expect(DATE_FORMATS.map((format) => fillFields(`{7250:${format}}`, born, { today }))).toEqual(["15/01/1960", "15.01.1960", "1960-01-15", "01/1960", "15 JAN 1960"]);
    expect(fillFields("{7250:DD MMM YY}", born, { today, months: "pt" })).toBe("15 JAN 60");
    expect(fillFields("{7250:DD/MM/YYYY}", patient("(7250)20191231"), { today })).toBe("31/12/2019");
    expect(fillFields("{7250}", born, { today })).toBe("19600115");
    expect(() => fillFields("{7250:DD/MM/YYYY hh:mm}", born, { today })).toThrow("(7250) carries no time, so its field takes no hh, mm or ss.");
    // (7251) YYYYMMDDHHMM: the time from the digits after the eight of the date
    const bornAt = patient("(7251)196001150830");
    expect(TIME_FORMATS.map((format) => fillFields(`{7251:${format}}`, bornAt, { today }))).toEqual(["15/01/1960 08:30", "15.01.1960 08:30", "1960-01-15 08:30", "08:30"]);
    expect(fillFields("{7251:DD MMM YYYY}", bornAt, { today, months: "es" })).toBe("15 ENE 1960");
    expect([isDateAi("7250"), isDateAi("7251"), carriesTime("7251"), isFullYearDate("7250"), isFullYearDate("7251")]).toEqual([true, true, true, true, true]);
    expect(["17", "7003", "8008", "7007", "10", "8018"].some(isFullYearDate)).toBe(false);
    expect(formatDate("19600115", "DD/MM/YYYY", { today, fullYear: true })).toBe("15/01/1960");
    expect(formatDate("600115", "DD/MM/YYYY", { today })).toBe("15/01/2060"); // a YYMMDD date's century by the rule
    // Through the page: the drawing and the print file
    const page: DesignPage = { widthMm: 80, heightMm: 30, elements: [{ id: "t", kind: "text", text: "DOB {7251:DD/MM/YYYY hh:mm}", heightMm: 4, xMm: 4, yMm: 4 }] };
    const designed = designLabel(page, bornAt, font, { environment: "distribution" });
    expect(designed.layout.texts.map((t) => t.text)).toEqual(["DOB 15/01/1960 08:30"]);
    expect(zplPage(printPageFor(designed, 203))).toContain("^FDDOB 15/01/1960 08:30^FS");
  });

  it("shows a percent-encoded name or address as people read it, in the drawing and the print file", () => {
    const patient = engine.parse("(8018)950600013435200008(7254)Maria%20Jos%C3%A9(7253)Concei%C3%A7%C3%A3o(7257)Rua%20A,%2050%25") as Identified;
    expect(fillFields("{7254} {7253}", patient)).toBe("Maria José Conceição");
    expect(fillFields("{7257}", patient)).toBe("Rua A, 50%");
    expect(fillFields("{7254}", engine.parse("(8018)950600013435200008(7254)Maria+Jos%C3%A9") as Identified)).toBe("Maria José");
    expect(fillFields("{8018}", patient)).toBe("950600013435200008");
    // Only a percent-encoded AI is decoded: %41 in a batch is what the data says
    expect(fillFields("{10}", { elements: [{ ai: "10", title: "BATCH/LOT", value: "B%41" }] })).toBe("B%41");
    expect(["7253", "7254", "7255", "7256", "7257", "7259", "4300", "4320"].map(isPercentEncoded)).toEqual([true, true, false, true, true, true, true, true]);
    expect(["10", "21", "7250", "8018", "90"].some(isPercentEncoded)).toBe(false);
    // Encoded once, decoded back: four-byte characters, a bare % and %XX already written, lower-case hexadecimal
    expect(percentEncode("Zoë 😀")).toBe("Zo%C3%AB+%F0%9F%98%80"); // a space as + (General Specifications 3.8.29, 7.11)
    expect(percentEncode("100% %2a %G1")).toBe("100%25+%2a+%25G1");
    expect(percentEncode('ABC-123_(x) "a";b+c')).toBe('ABC-123_(x)+"a";b+c'); // CSET 82 as it is, quotes and + too
    expect(percentEncode(percentEncode("Rua São João, 50% + 1"))).toBe("Rua+S%C3%A3o+Jo%C3%A3o,+50%25+++1"); // once
    expect(percentEncode("a\tb")).toBe("a%09b"); // a byte below 16 with its leading zero
    expect(percentDecode("Zo%C3%AB%20%F0%9F%98%80")).toBe("Zoë 😀");
    expect(percentDecode("Zo%C3%AB+%F0%9F%98%80")).toBe("Zoë 😀"); // + as a space
    expect(percentDecode("A%2BB+C%2b")).toBe("A+B C+"); // %2B a plus sign, not a space
    expect(percentDecode("%2a%2A")).toBe("**");
    expect(percentDecode("bad %C3 here %FF%FE")).toBe("bad %C3 here %FF%FE"); // not UTF-8: kept as it is
    // Through the page: the drawing and the print file
    const page: DesignPage = { widthMm: 80, heightMm: 30, elements: [{ id: "t", kind: "text", text: "{7254} {7253}", heightMm: 4, xMm: 4, yMm: 4 }] };
    const designed = designLabel(page, patient, font, { environment: "distribution" });
    expect(designed.layout.texts.map((t) => t.text)).toEqual(["Maria José Conceição"]);
    expect(zplPage(printPageFor(designed, 203))).toContain("^FDMaria José Conceição^FS");
  });

  it("writes a date's month in the text block's language: English, Portuguese, Spanish, French, German or Italian", () => {
    const today = new Date(Date.UTC(2026, 10, 3));
    const month = (months: MonthLanguage) =>
      Array.from({ length: 12 }, (_, i) => formatDate(`27${String(i + 1).padStart(2, "0")}15`, "MMM", { today, months })).join(" ");
    expect(month("en")).toBe("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC");
    expect(month("pt")).toBe("JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ");
    expect(month("es")).toBe("ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC");
    expect(month("fr")).toBe("JAN FEV MAR AVR MAI JUN JUL AOU SEP OCT NOV DEC");
    expect(month("de")).toBe("JAN FEB MRZ APR MAI JUN JUL AUG SEP OKT NOV DEZ");
    expect(month("it")).toBe("GEN FEB MAR APR MAG GIU LUG AGO SET OTT NOV DIC");
    expect(Object.keys(MONTH_NAMES)).toEqual(["en", "pt", "es", "fr", "de", "it"]);
    // In the letters every printer language's font has: no accents, no umlauts
    for (const names of Object.values(MONTH_NAMES)) for (const name of names) expect(name).toMatch(/^[A-Z]{3}$/);
    expect(fillFields("{17:DD MMM YYYY}", data, { today, months: "de" })).toBe("31 DEZ 2027");
    expect(fillFields("{17:DD MMM YYYY}", data, { today, months: "it" })).toBe("31 DIC 2027");
    expect(fillFields("VAL {17:DD MMM YYYY}", data, { today, months: "pt" })).toBe("VAL 31 DEZ 2027");
    expect(fillFields("{17:MMM/YY}", data, { today, months: "es" })).toBe("DIC/27");
    expect(fillFields("{17:DD/MM/YYYY}", data, { today, months: "pt" })).toBe("31/12/2027"); // only MMM changes
  });

  it("prints a date field in its format, in the drawing and in a printer language", () => {
    const page: DesignPage = { widthMm: 80, heightMm: 30, elements: [{ id: "t", kind: "text", text: "EXP {17:DD MMM YYYY}", heightMm: 4, xMm: 4, yMm: 4 }] };
    const designed = designLabel(page, data, font, { environment: "distribution" });
    expect(designed.layout.texts.map((t) => t.text)).toEqual(["EXP 31 DEC 2027"]);
    expect(zplPage(printPageFor(designed, 203))).toContain("^FDEXP 31 DEC 2027^FS");
    // The text block's month language, in the drawing and the print file alike
    const pt: DesignPage = { ...page, elements: [{ ...(page.elements[0] as DesignText), text: "VAL {17:DD MMM YYYY}", months: "pt" }] };
    const designedPt = designLabel(pt, data, font, { environment: "distribution" });
    expect(designedPt.layout.texts.map((t) => t.text)).toEqual(["VAL 31 DEZ 2027"]);
    expect(zplPage(printPageFor(designedPt, 203))).toContain("^FDVAL 31 DEZ 2027^FS");
  });

  it("names an element past the page's edge and a symbol overlapping another element, and still draws the page", () => {
    const page: DesignPage = { ...PAGE, elements: [...PAGE.elements.slice(0, 3), { ...(PAGE.elements[3] as DesignPage["elements"][number] & { kind: "symbol" }), xMm: 40 }] };
    expect(designLabel(page, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "edge", id: "b1" }]);
    const over: DesignPage = { ...PAGE, elements: [...PAGE.elements, { id: "t3", kind: "text", text: "190 g", heightMm: 3, xMm: 100, yMm: 10 }] };
    expect(designLabel(over, data, font, { environment: "distribution" }).problems).toEqual([{ kind: "overlap", ids: ["qr", "t3"] }]);
  });

  // General Specifications 6.3.3.1: a linear and a 2D barcode both scanned at the point of sale, the 2D symbol with its
  // quiet zones within 50 mm of the linear's centre
  it("names a 2D barcode further than 50 mm from the centre of the nearest point-of-sale linear barcode, at the point of sale only", () => {
    const at = (qrX: number, environment = "retail", linear: "ean13" | "gs1-128" | "databar-omni" = "ean13", more: DesignPage["elements"] = [], twoD: "dl-qrcode" | "dl-datamatrix" = "dl-qrcode") => {
      const page: DesignPage = { widthMm: 200, heightMm: 80, elements: [
        { id: "lin", kind: "symbol", symbology: linear, ais: ["01"], size: 100, hri: true, xMm: 2, yMm: 2 },
        { id: "qr", kind: "symbol", symbology: twoD, ais: null, size: 100, hri: false, xMm: qrX, yMm: 2 },
        ...more,
      ] };
      const designed = designLabel(page, data, font, { environment });
      const [l, q] = ["lin", "qr"].map((id) => designed.placed.find((p) => p.id === id)!);
      const [cx, cy] = [l!.xMm + l!.widthMm / 2, l!.yMm + l!.heightMm / 2];
      const reach = Math.hypot(Math.max(Math.abs(q!.xMm - cx), Math.abs(q!.xMm + q!.widthMm - cx)), Math.max(Math.abs(q!.yMm - cy), Math.abs(q!.yMm + q!.heightMm - cy)));
      return { problems: designed.problems, reach };
    };
    const near = at(42);
    expect(near.reach).toBeLessThan(POS_RADIUS_MM);
    expect(near.problems).toEqual([]);
    // Just past the radius, and well past it
    const just = at(42 + (POS_RADIUS_MM - near.reach) + 0.5);
    expect(just.reach).toBeGreaterThan(POS_RADIUS_MM);
    expect(just.problems).toEqual([{ kind: "far", ids: ["lin", "qr"] }]);
    expect(at(120).problems).toEqual([{ kind: "far", ids: ["lin", "qr"] }]);
    // The healthcare point of sale (table 10) too; not in general distribution, nor beside a GS1-128
    expect(at(120, "pharmacy", "ean13", [], "dl-datamatrix").problems).toEqual([{ kind: "far", ids: ["lin", "qr"] }]);
    expect(at(120, "distribution").problems).toEqual([]);
    expect(at(120, "retail-gd").problems).toEqual([{ kind: "far", ids: ["lin", "qr"] }]);
    expect(at(120, "pharmacy", "gs1-128", [], "dl-datamatrix").problems.filter((p) => p.kind === "far")).toEqual([]);
    expect(at(120, "retail", "databar-omni").problems).toEqual([{ kind: "far", ids: ["lin", "qr"] }]);
    // A second EAN-13 near the QR code: the nearest linear is the one it is measured from
    expect(at(120, "retail", "ean13", [{ id: "lin2", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 113, yMm: 34 }]).problems).toEqual([]);
    expect(at(150, "retail", "ean13", [{ id: "lin2", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 75, yMm: 2 }]).problems)
      .toEqual([{ kind: "far", ids: ["lin2", "qr"] }]);
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

  // In bulk (backlog 2.4): every row's page with its own data in the text and the barcodes, in the drawing and in ZPL
  it("draws every row's page in bulk, each with its own data, in the files and in ZPL", async () => {
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
    const zpl = await generateBatch(rows, { design, files: [], pattern: "{10}", pdf: false, zplDpi: 203 }, font);
    const file = new TextDecoder().decode(unzip(zpl.zip).get("labels_dl-qrcode_203dpi.zpl"));
    expect(file.match(/\^XA/g)).toHaveLength(2);
    expect(file).toContain("^FDBATCH C7^FS");
    expect(file).toContain("^FDMA,https://id.gs1.org/01/09506000134376/10/C7?17=280630^FS");
    expect(() => labelFor(rows[0]!.identified, { ...design, page: { ...PAGE, elements: PAGE.elements.filter((e) => e.kind === "text") } }, font)).toThrow(/needs a barcode/);
  }, SLOW);
});
