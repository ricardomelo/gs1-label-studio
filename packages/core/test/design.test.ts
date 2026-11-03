import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  checkRows,
  designLabel,
  eplPage,
  DATE_FORMATS,
  fillFields,
  formatDate,
  generateBatch,
  MONTH_NAMES,
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
  type DesignPage,
  type DesignText,
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

  // In ZPL (backlog 4.2): each barcode with the commands of a symbol alone at its own whole dots a module, its bars'
  // corner where the layout puts them; each line of text with ^A0 at its capitals' corner and height (Labelary prints
  // it in labelary.test.ts)
  it("writes the page in ZPL: each barcode as a symbol alone, where the layout puts it, and the text with ^A0", () => {
    const design: LabelDesign = {
      symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "distribution", size: 100, linear: "none",
      linearSize: null, bearer: "frame", reduction: 0, page: PAGE,
    };
    const drawn = labelFor(data, design, font);
    const dots = (mm: number) => Math.round((mm / 25.4) * 203);
    const zpl = printFileFor("zpl", drawn, design, 203);
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
    // Another language says it cannot write it yet; a barcode past the label's edge is refused, not cut
    expect(() => printFileFor("tspl", drawn, design, 203)).toThrow(/written in ZPL and EPL2 only/);
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
    // A line past the label's edge is named in the editor and refused in a print file, not cut
    const past: DesignPage = { ...graphics, elements: [...graphics.elements.slice(0, 2), { id: "long", kind: "line", vertical: false, lengthMm: 130, thicknessMm: 0.5, xMm: 5, yMm: 35 }] };
    const pastLabel = designLabel(past, data, font, { environment: "distribution" });
    expect(pastLabel.problems).toEqual([{ kind: "edge", id: "long" }]);
    expect(() => printPageFor(pastLabel, 203)).toThrow(/A line or box runs past the label's edge/);
    // A line or box without a size or thickness is refused, naming what it needs
    const flat: DesignPage = { ...graphics, elements: [...graphics.elements.slice(0, 1), { id: "z", kind: "line", vertical: false, lengthMm: 0, thicknessMm: 0.5, xMm: 5, yMm: 35 }] };
    expect(() => designLabel(flat, data, font, { environment: "distribution" })).toThrow(/A line or box needs a length, a width and a thickness greater than 0 mm/);
  }, SLOW);

  it("fills a text's fields from the data, an AI it does not have leaving nothing", () => {
    expect(fillFields("BATCH {10} · SERIAL {21}", data)).toBe("BATCH B42 · SERIAL ");
    expect(fillFields("{01}", data)).toBe("09506000134376");
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
    expect(() => fillFields("{17:dd/mm/yy}", data)).toThrow("The date format “dd/mm/yy” has none of DD, MM, MMM, YY and YYYY.");
  });

  it("writes a date's month in the text block's language: English, Portuguese or Spanish", () => {
    const today = new Date(Date.UTC(2026, 10, 3));
    const month = (months: "en" | "pt" | "es") =>
      Array.from({ length: 12 }, (_, i) => formatDate(`27${String(i + 1).padStart(2, "0")}15`, "MMM", { today, months })).join(" ");
    expect(month("en")).toBe("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC");
    expect(month("pt")).toBe("JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ");
    expect(month("es")).toBe("ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC");
    expect(Object.keys(MONTH_NAMES)).toEqual(["en", "pt", "es"]);
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
