import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  checkRows,
  fitsSheet,
  generateBatch,
  LABEL_SHEETS,
  labelFor,
  labelPdf,
  parseDelimited,
  patternName,
  patternProblem,
  pdfDocument,
  pdfContent,
  sheetCells,
  sheetPages,
  sheetProblem,
  syntaxEngine,
  type BatchRow,
  type LabelDesign,
  type LabelSheet,
  type SyntaxEngine,
} from "../src/index.ts";
import { drawPdf, unzip } from "./files.ts";
import { hriFont } from "./font.ts";

// Outputs in bulk (backlog 2.4): one design drawn for every row, the files of each row named by a pattern, one PDF a
// label a page, label sheets, one ZPL file and the CSV of what was generated; every symbol read back by ZXing.

const font = hriFont();
const SLOW = 120_000;
let engine: SyntaxEngine;

beforeAll(async () => {
  engine = await syntaxEngine();
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(png: Uint8Array, symbols = 4) {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: symbols,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const svgPng = (svg: string) => new Uint8Array(new Resvg(svg, { fitTo: { mode: "zoom", value: 8 }, background: "white" }).render().asPng());

const QR: LabelDesign = {
  symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "retail", size: 100, linear: "none",
  linearSize: null, bearer: "frame", reduction: 0,
};

const CSV = [
  "GTIN,Lote,Validade",
  "09506000134376,B42,2027-12-31",
  "09506000134352,B43,2027-11-30",
  "09506000134370,B44,2027-10-31", // wrong check digit
  "09506000134376,B42,2027-12-31", // the same as the first: the same name, numbered
  "09506000134352,C1,2028-01-31",
].join("\n");

function batchRows(skip: number[] = []): BatchRow[] {
  return checkRows(engine, parseDelimited(CSV), ["01", "10", "17"], [], "https://id.gs1.org").map((row, i) => ({
    row: row.row, ...(row.identified ? { identified: row.identified } : {}), ...(row.error ? { error: row.error } : {}),
    ...(skip.includes(i) ? { skipped: true } : {}),
  }));
}

describe("label sheets", () => {
  it("describes each sheet offered within its page, its labels centred", () => {
    for (const sheet of LABEL_SHEETS) {
      expect(sheetProblem(sheet), sheet.id).toBeNull();
      expect(sheetCells(sheet)).toHaveLength(sheet.columns * sheet.rows);
      const right = sheet.page[0] - (sheet.margin[0] + sheet.pitch[0] * (sheet.columns - 1) + sheet.label[0]);
      const bottom = sheet.page[1] - (sheet.margin[1] + sheet.pitch[1] * (sheet.rows - 1) + sheet.label[1]);
      expect(right).toBeCloseTo(sheet.margin[0], 2);
      expect(bottom).toBeCloseTo(sheet.margin[1], 2);
    }
    const l7160 = LABEL_SHEETS.find((s) => s.id === "avery-l7160")!;
    expect([l7160.margin, l7160.columns * l7160.rows]).toEqual([[7.21, 15.15], 21]);
    const a5160 = LABEL_SHEETS.find((s) => s.id === "avery-5160")!;
    expect(a5160.margin).toEqual([4.763, 12.7]); // 3/16 in and 1/2 in
  });

  it("refuses a custom sheet whose labels overlap or leave the page, or whose numbers are not sizes", () => {
    const base: LabelSheet = { id: "custom", name: "Custom", page: [210, 297], label: [70, 37], columns: 3, rows: 8, margin: [0, 0.5], pitch: [70, 37] };
    expect(sheetProblem(base)).toBeNull();
    expect(sheetProblem({ ...base, pitch: [69, 37] })).toMatch(/overlap/);
    expect(sheetProblem({ ...base, margin: [1, 0.5] })).toMatch(/beyond the page/);
    expect(sheetProblem({ ...base, rows: 0 })).toMatch(/whole numbers/);
    expect(sheetProblem({ ...base, label: [Number.NaN, 37] })).toMatch(/millimetres/);
    expect(sheetProblem({ ...base, columns: 1, pitch: [0, 37] })).toBeNull(); // one column: no pitch needed
  });

  it("never scales a label: one larger than the sheet's is refused", () => {
    const sheet = LABEL_SHEETS.find((s) => s.id === "avery-l7651")!; // 38.1 × 21.2 mm
    expect(fitsSheet(38.1, 21.2, sheet)).toBeNull();
    expect(fitsSheet(38.2, 20, sheet)).toMatch(/larger than the sheet's labels \(38.1 × 21.2 mm\)/);
    const big = labelFor(engine.parse("(01)09506000134376(10)B42(17)271231") as never, QR, font);
    expect(() => sheetPages([big.layout], sheet, font)).toThrow(/never scaled/);
  });

  it("lays the labels row by row from the place given, a new page when one is full; each read back", async () => {
    const sheet = LABEL_SHEETS.find((s) => s.id === "avery-l7163")!; // 2 × 7 labels of 99.1 × 38.1 mm
    const rows = batchRows().filter((r) => r.identified);
    const layouts = rows.map((r) => labelFor(r.identified!, QR, font).layout);
    // 4 labels from the 13th place: two on the first page, two on the second
    const pages = sheetPages(layouts, sheet, font, 13);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.content.split("\nQ").length - 1)).toEqual([2, 2]);
    const [x, y] = sheetCells(sheet)[12]!;
    const w = layouts[0]!.width * layouts[0]!.xMm;
    const h = layouts[0]!.height * layouts[0]!.xMm;
    const pt = 72 / 25.4;
    const f = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);
    expect(pages[0]!.content.startsWith(`q 1 0 0 1 ${f((x + (99.1 - w) / 2) * pt)} ${f((297 - (y + (38.1 + h) / 2)) * pt)} cm\n`)).toBe(true);
    const pdf = await pdfDocument(pages, "sheet");
    const expected = rows.map((r) => `]Q1 ${r.identified!.digitalLinkUri}`);
    expect(await read(drawPdf(pdf, 300, 1))).toEqual(expected.slice(0, 2).sort());
    expect(await read(drawPdf(pdf, 300, 2))).toEqual(expected.slice(2).sort());
  }, SLOW);
});

describe("a PDF of several pages", () => {
  it("writes each page its size, the cross-reference table right, and one page as labelPdf writes it", async () => {
    const a = labelFor(engine.parse("(01)09506000134376(10)B42") as never, QR, font);
    const b = labelFor(engine.parse("(01)09506000134352") as never, { ...QR, symbology: "ean13" }, font);
    const pdf = await pdfDocument([pdfContent(a.layout, font), pdfContent(b.layout, font)], "two");
    const text = Buffer.from(pdf).toString("latin1");
    expect(text).toContain("/Kids [3 0 R 5 0 R] /Count 2");
    const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(7);
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`));
    const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(boxes).toHaveLength(2);
    expect(boxes[1]![0]).toBeCloseTo((b.layout.width * b.layout.xMm * 72) / 25.4, 2);
    const streams = [...text.matchAll(/>>\nstream\n/g)].map((m) => m.index! + 10);
    expect(inflateSync(pdf.subarray(streams[1]!, text.indexOf("\nendstream", streams[1]))).toString("ascii"))
      .toBe(pdfContent(b.layout, font).content);
    expect(await pdfDocument([pdfContent(a.layout, font)], a.data)).toEqual(await labelPdf(a.options, a.layout, font));
  });
});

describe("file names", () => {
  it("replaces the row, the symbol, the key's value and any AI, and makes the name safe", () => {
    const identified = engine.parse("(01)09506000134376(10)B/42(17)271231") as never;
    expect(patternName("{symbol}_{key}_{row}", 7, "dl-qrcode", identified)).toBe("dl-qrcode_09506000134376_7");
    expect(patternName("{01}-{10}", 7, "dl-qrcode", identified)).toBe("09506000134376-B-42");
    expect(patternName("{21}", 7, "dl-qrcode", identified)).toBe("row-7"); // no serial: nothing left
    expect(patternProblem("{01}_{lot}")).toMatch(/\{lot\}/);
    expect(patternProblem("{row}{8020}")).toBeNull();
    expect(patternProblem("  ")).toMatch(/empty/);
  });
});

describe("generating every row", () => {
  it("makes each row's files, numbers repeated names, leaves out errors and skipped rows, and lists them all", async () => {
    const rows = batchRows([4]);
    const progress: number[] = [];
    const result = await generateBatch(rows, { design: QR, files: ["svg", "png"], pattern: "{01}_{10}", pdf: true, zplDpi: 203 }, font,
      (done) => progress.push(done));
    expect([result.generated, result.left, progress]).toEqual([3, 2, [1, 2, 3]]);
    const files = unzip(result.zip);
    expect([...files.keys()]).toEqual([
      "09506000134376_B42.svg", "09506000134376_B42.png",
      "09506000134352_B43.svg", "09506000134352_B43.png",
      "09506000134376_B42-2.svg", "09506000134376_B42-2.png",
      "labels_dl-qrcode.pdf", "labels_dl-qrcode_203dpi.zpl", "generated.csv",
    ]);
    const csv = new TextDecoder().decode(files.get("generated.csv")).split("\r\n");
    expect(csv[0]).toBe("Row,Status,Files,GS1 element string,GS1 Digital Link URI,Reason");
    expect(csv[1]).toBe("2,generated,09506000134376_B42.svg; 09506000134376_B42.png; labels_dl-qrcode.pdf; labels_dl-qrcode_203dpi.zpl,"
      + "(01)09506000134376(10)B42(17)271231,https://id.gs1.org/01/09506000134376/10/B42?17=271231,");
    expect(csv[3]).toMatch(/^4,error,,,,.*check digit/i);
    expect(csv[5]).toBe("6,skipped,,(01)09506000134352(10)C1(17)280131,https://id.gs1.org/01/09506000134352/10/C1?17=280131,Skipped");
    expect(result.csv.split("\r\n")).toEqual(csv);

    const uris = rows.filter((r) => r.identified && !r.skipped).map((r) => `]Q1 ${r.identified!.digitalLinkUri}`);
    const svgs = [...files.keys()].filter((n) => n.endsWith(".svg"));
    for (const [i, name] of svgs.entries()) {
      expect(await read(svgPng(new TextDecoder().decode(files.get(name)))), name).toEqual([uris[i]]);
      expect(await read(files.get(name.replace(/svg$/, "png"))!), name).toEqual([uris[i]]);
    }
    const pdf = files.get("labels_dl-qrcode.pdf")!;
    expect(Buffer.from(pdf).toString("latin1")).toContain("/Count 3");
    for (let page = 1; page <= 3; page++) expect(await read(drawPdf(pdf, 600, page))).toEqual([uris[page - 1]]);
    const zpl = new TextDecoder().decode(files.get("labels_dl-qrcode_203dpi.zpl"));
    expect(zpl.match(/\^XA/g)).toHaveLength(3);
    expect(zpl).toContain("09506000134352");
  }, SLOW);

  it("names a row its design cannot draw, and a label larger than the sheet's, in the CSV", async () => {
    const rows = batchRows();
    // UPC-E beside a GTIN-13: no row can take it
    const upce = await generateBatch(rows, { design: { ...QR, linear: "upce" }, files: ["svg"], pattern: "{row}", pdf: false }, font);
    expect(upce.generated).toBe(0);
    expect(upce.csv.split("\r\n")[1]).toMatch(/^2,error,.*UPC-E is only for a GTIN-12/);
    const small = LABEL_SHEETS.find((s) => s.id === "avery-l7651")!;
    const sheet = await generateBatch(rows, { design: QR, files: [], pattern: "{row}", pdf: false, sheet: { sheet: small, start: 1 } }, font);
    expect(sheet.generated).toBe(0);
    expect(sheet.csv).toMatch(/larger than the sheet's labels/);
    expect([...unzip(sheet.zip).keys()]).toEqual(["generated.csv"]);
  });

  it("puts every label on the sheet chosen, read back", async () => {
    const rows = batchRows();
    const l7160 = LABEL_SHEETS.find((s) => s.id === "avery-l7160")!;
    const result = await generateBatch(rows, {
      design: { ...QR, symbology: "dl-datamatrix", size: 100 }, files: [], pattern: "{row}", pdf: false, sheet: { sheet: l7160, start: 1 },
    }, font);
    expect(result.generated).toBe(4);
    const files = unzip(result.zip);
    const pdf = files.get("labels_dl-datamatrix_avery-l7160.pdf")!;
    const expected = rows.filter((r) => r.identified).map((r) => `]d1 ${r.identified!.digitalLinkUri}`).sort();
    expect(await read(drawPdf(pdf, 300), 8)).toEqual(expected);
  }, SLOW);
});
