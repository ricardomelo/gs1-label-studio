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
  printFileFor,
  printWidthDots,
  rowCells,
  specificationFor,
  sheetCells,
  sheetPages,
  sheetProblem,
  syntaxEngine,
  type BatchRow,
  type Identified,
  type LabelDesign,
  type LabelSheet,
  type SyntaxEngine,
} from "../src/index.ts";
import { drawPdf, textFile, unzip } from "./files.ts";
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

  // Backlog 4.2: a column's header in braces names the files by the row's cell, on any label, not only one's own
  it("replaces a column's header by the row's cell, its case and surrounding spaces aside, and knows the headers", () => {
    const identified = engine.parse("(01)09506000134376(10)B42") as never;
    const cells = { " Produto ": "Pesto alla genovese", Região: "Sul", "10": "ten", row: "r", Vazio: "" };
    expect(patternName("{produto}_{10}", 7, "dl-qrcode", identified, cells)).toBe("Pesto-alla-genovese_B42");
    expect(patternName("{ REGIÃO }-{row}", 7, "dl-qrcode", identified, cells)).toBe("Sul-7"); // {row} is the row, not the column
    expect(patternName("{Cor}{Vazio}", 7, "dl-qrcode", identified, cells)).toBe("row-7"); // no such column, an empty cell
    expect(patternName("{Produto}", 7, "dl-qrcode", identified)).toBe("row-7"); // no cells
    expect(patternName("{Produto}", 7, "dl-qrcode", identified, { Produto: "Feijão Ñandú" })).toBe("Feijao-Nandu");
    const headers = ["GTIN", " Produto ", "Região", ""];
    expect(patternProblem("{produto}_{ Região }_{01}", headers)).toBeNull();
    expect(patternProblem("{Produto}_{Cor}", headers)).toBe(
      "Not a name the pattern knows: {Cor}. Use {row}, {symbol}, {key}, an AI such as {01} or {10}, or a column's header such as {Produto}.");
    expect(patternProblem("{Produto}_{}", headers)).toMatch(/knows: \{\}\./); // an empty header is no name
    expect(patternProblem("{Produto}")).toMatch(/knows: \{Produto\}\./); // no spreadsheet
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

  // The print file in the profile's language (ADR 0002): TSPL, one label after another, named .prn
  it("writes the print file in the printer's language: TSPL, each label its own SIZE and PRINT", async () => {
    const result = await generateBatch(batchRows([4]), { design: QR, files: [], pattern: "{01}", pdf: false, zplDpi: 300, printLanguage: "tspl" }, font);
    const files = unzip(result.zip);
    expect([...files.keys()]).toEqual(["labels_dl-qrcode_300dpi.prn", "generated.csv"]);
    const tspl = new TextDecoder().decode(files.get("labels_dl-qrcode_300dpi.prn"));
    expect(tspl.match(/^SIZE /gm)).toHaveLength(3);
    expect(tspl.match(/^QRCODE /gm)).toHaveLength(3);
    expect(tspl).toContain("09506000134352");
  }, SLOW);

  // The GS1 Logistic Label in ZPL (backlog 4.1, 3.2): every row's label in the one file, written by zplLogisticLabel;
  // another language refuses it, each row naming the reason in the CSV
  // The editor's choice of human readable text reaches the print file as it reaches the PDF: every element string, the
  // key's alone, or none (the printer's interpretation line off too)
  it("prints the human readable text chosen: every element string, the key's alone, or none", () => {
    const data = engine.parse("(01)09506000134352(10)B42(17)271231") as Identified;
    const gs1128: LabelDesign = { ...QR, symbology: "gs1-128", environment: "distribution", spec: specificationFor(5, "gs1-128")!, table: 5 };
    const zpl = (hri: LabelDesign["hri"]) => printFileFor("zpl", labelFor(data, { ...gs1128, hri }, font), { ...gs1128, hri }, 203);
    expect(zpl("full")).toContain("^FD(01)09506000134352(10)B42(17)271231^FS");
    expect(zpl("key")).toContain("^FD(01)09506000134352^FS");
    expect(zpl("key")).not.toContain("(10)B42");
    expect(zpl("none")).not.toContain("^A0");
    // Over two symbols, the key's line under the first alone
    const two: LabelDesign = { ...gs1128, hri: "key", gs1128Starts: [0, 1] };
    expect(textFile(printFileFor("zpl", labelFor(data, two, font), two, 203)).match(/\^A0/g)).toHaveLength(1);
    const last = engine.parse("(01)09506000134352(17)271231(10)B42") as Identified;
    expect(textFile(printFileFor("epl2", labelFor(last, two, font), two, 203)).match(/^A\d/gm)).toHaveLength(1);
    const matrix: LabelDesign = { ...QR, symbology: "gs1-datamatrix", hri: "key" };
    expect(textFile(printFileFor("tspl", labelFor(data, matrix, font), matrix, 203)).match(/^TEXT /gm)).toHaveLength(1);
    expect(printFileFor("zpl", labelFor(data, { ...matrix, hri: "none" }, font), { ...matrix, hri: "none" }, 203)).not.toContain("^A0");
    const ean: LabelDesign = { ...QR, symbology: "ean13", hri: "none", gtinOnly: true };
    const drawn = labelFor(data, ean, font);
    expect(printFileFor("zpl", drawn, ean, 203)).toMatch(/\^BEN,\d+,N,N/);
    expect(printFileFor("epl2", drawn, ean, 203)).toMatch(/,N,"950600013435"/);
    expect(printFileFor("tspl", drawn, ean, 203)).toMatch(/"EAN13",\d+,0,/);
  });

  it("writes the GS1 Logistic Label of every row in ZPL, and says another language cannot", async () => {
    const sscc = checkRows(engine, parseDelimited("SSCC,GTIN,Count\n106141411234567897,09506000134376,24\n106141411234567903,09506000134376,12"),
      ["00", "02", "37"], [], "https://id.gs1.org").map((row) => ({ row: row.row, identified: row.identified! }));
    const design: LabelDesign = {
      symbology: "gs1-128", hri: "full", version: null, error: "m", size: 100, linear: "none", linearSize: null, bearer: "frame",
      reduction: 0, spec: specificationFor(5, "gs1-128")!, table: 5, logistic: { size: "a5", from: ["Dal Giardino S.p.A."], to: [] },
    };
    const zpl = await generateBatch(sscc, { design, files: [], pattern: "{00}", pdf: false, zplDpi: 203 }, font);
    const file = new TextDecoder().decode(unzip(zpl.zip).get("labels_gs1-128_203dpi.zpl"));
    expect(file.match(/\^XA/g)).toHaveLength(2);
    expect(file.match(/\^BCN/g)).toHaveLength(4);
    expect(file).toContain("^FD>;>800106141411234567903^FS");
    const drawn = labelFor(sscc[0]!.identified, design, font);
    expect(drawn.logistic?.parts).toEqual(["(02)09506000134376(37)24", "(00)106141411234567897"]);
    expect(printFileFor("zpl", drawn, design, 203, 4, ["a note"])).toContain("50 mm: measure this line");
    expect(printWidthDots(drawn, design, 203)).toBe(Math.round((148 / 25.4) * 203));
    // TSPL and DPL write it where their GS1-128 carries it, an SSCC alone (printlangs.test.ts prints it): this one's
    // (02) and (37) refused with the reason, in the bulk file's report too
    expect(() => printFileFor("tspl", drawn, design, 203)).toThrow(/TSPL's GS1-128 is offered for an SSCC \(00\) alone/);
    expect(() => printFileFor("dpl", drawn, design, 203)).toThrow(/DPL's GS1-128 is offered for an SSCC \(00\) alone/);
    const ssccAlone = labelFor(engine.parse("(00)106141411234567897") as Identified, design, font);
    expect(textFile(printFileFor("tspl", ssccAlone, design, 203))).toMatch(/\r\nBARCODE \d+,\d+,"EAN128",\d+,0,0,4,4,"00106141411234567897"\r\n/);
    expect(textFile(printFileFor("dpl", ssccAlone, design, 203, 4, ["a note"]))).toContain("50 mm: measure this line");
    expect(textFile(printFileFor("epl2", drawn, design, 203)).match(/,1E,/g)).toHaveLength(2); // EPL2 writes it (backlog 4.1)
    const tspl = await generateBatch(sscc, { design, files: [], pattern: "{00}", pdf: false, zplDpi: 203, printLanguage: "tspl" }, font);
    expect(tspl.csv.split("\r\n")[1]).toMatch(/TSPL: TSPL's GS1-128 is offered for an SSCC \(00\) alone/);
    // With a QR code beside the middle block: each row's own GS1 Digital Link URI, in the drawing and in the ZPL
    const withQr: LabelDesign = { ...design, logistic: { ...design.logistic!, twoD: "dl-qrcode" } };
    expect(labelFor(sscc[1]!.identified, withQr, font).logistic?.printer.twoD?.data).toBe("https://id.gs1.org/00/106141411234567903?02=09506000134376&37=12");
    const qr = await generateBatch(sscc, { design: withQr, files: [], pattern: "{00}", pdf: false, zplDpi: 203 }, font);
    const qrFile = new TextDecoder().decode(unzip(qr.zip).get("labels_gs1-128_203dpi.zpl"));
    expect(qrFile.match(/\^BQN,2,6\^FDMA,https:\/\/id\.gs1\.org\/00\/10614141123456\d{4}\?02=09506000134376&37=\d\d\^FS/g)).toHaveLength(2);
  }, SLOW);

  // A label of one's own in bulk (backlog 4.2): each row's {column} fields from its own cells, in the drawing and in
  // the print file, the barcodes read back
  it("fills each row's {column} fields of a label of one's own from that row's cells", async () => {
    const table = parseDelimited("GTIN,Lote,Produto\n09506000134376,B42,Tapenade\n09506000134352,B43,Pesto alla genovese");
    const rows: BatchRow[] = checkRows(engine, table, ["01", "10", null], [], "https://id.gs1.org").map((row, i) => ({
      row: row.row, identified: row.identified!, cells: rowCells(table.headers, table.rows[i]!),
    }));
    const design: LabelDesign = {
      ...QR, page: {
        widthMm: 60, heightMm: 40, elements: [
          { id: "t", kind: "text", text: "{Produto}\nLOTE {10}", heightMm: 3, xMm: 3, yMm: 3 },
          { id: "q", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, xMm: 35, yMm: 12 },
        ],
      },
    };
    const result = await generateBatch(rows, { design, files: ["svg"], pattern: "{10}", pdf: false, zplDpi: 203 }, font);
    const files = unzip(result.zip);
    const svg = (name: string) => new TextDecoder().decode(files.get(name));
    expect(labelFor(rows[1]!.identified!, design, font, rows[1]!.cells).layout.texts.map((t) => t.text)).toEqual(["Pesto alla genovese", "LOTE B43"]);
    expect(await read(svgPng(svg("B42.svg")))).toEqual(["]Q1 https://id.gs1.org/01/09506000134376/10/B42"]);
    const zpl = new TextDecoder().decode(files.get("labels_dl-qrcode_203dpi.zpl"));
    expect(zpl.match(/\^FD(Tapenade|Pesto alla genovese|LOTE B4\d)\^FS/g)).toEqual(["^FDTapenade^FS", "^FDLOTE B42^FS", "^FDPesto alla genovese^FS", "^FDLOTE B43^FS"]);
    // The files named by a column, a design without fields too
    const named = await generateBatch(rows, { design: QR, files: ["svg"], pattern: "{produto}_{row}", pdf: false }, font);
    expect([...unzip(named.zip).keys()]).toEqual(["Tapenade_2.svg", "Pesto-alla-genovese_3.svg", "generated.csv"]);
    // Without the cells (a single label) the field stays as typed
    expect(labelFor(rows[0]!.identified!, design, font).layout.texts.map((t) => t.text)).toEqual(["{Produto}", "LOTE B42"]);
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
