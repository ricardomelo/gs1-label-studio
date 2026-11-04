import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lz_render_lang } from "@goodboy008/labelize-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hriFont } from "./font.ts";
import { GRAPHICS, logo, WITH_LOGO } from "./fixtures/graphics.ts";
import { textFile } from "./files.ts";
import { decodePng, drawnBox } from "./png.ts";
import {
  dplLabel,
  dplTestLabel,
  DplUnsupportedError,
  eplLabel,
  eplLogisticLabel,
  eplTestLabel,
  logisticLabel,
  specificationFor,
  EplUnsupportedError,
  PrinterUnsupportedError,
  snapToDots,
  splitGs1128,
  tsplLabel,
  tsplTestLabel,
  TsplUnsupportedError,
  designLabel,
  eplPage,
  printPageFor,
  syntaxEngine,
  printFileBytes,
  turnedRect,
  type DesignPage,
  type Identified,
  type PrintFile,
  type SymbologyId,
} from "../src/index.ts";

// TSPL, EPL2 and DPL with the printer's own commands (ADR 0002, backlog 3.3, 3.6 and 3.7), rendered by Labelize 1.10.0,
// an open-source emulator of these languages (MIT; not a printer, and not the printers' firmware), and read back by ZXing:
// the symbology identifier and the data, as ZPL is through Labelary. What Labelize does not print as the manual says is
// refused by the writers; the refusals are tested below.

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

type Language = "tspl" | "epl" | "dpl";
const WRITERS = { tspl: tsplLabel, epl: eplLabel, dpl: dplLabel };

/**
 * Labelize's PNG of a print file, at the printer's dots a millimetre. DPL counts rows from the label's bottom, so its
 * canvas is made exactly the label's dots high at Labelize's whole dots a millimetre, or every row would move.
 */
function render(language: Language, file: PrintFile, widthDots: number, heightDots: number, dpi: number): Uint8Array {
  const mm = (dots: number) => (language === "dpl" ? dots / Math.round(dpi / 25.4) : (dots / dpi) * 25.4);
  return lz_render_lang(forLabelize(printFileBytes(file)), mm(widthDots), mm(heightDots), Math.round(dpi / 25.4), false, false, language);
}

/**
 * The print file as Labelize takes it. EPL2's GW prints a dot black where its bit is 0 (Zebra's support note on GW);
 * Labelize 1.10.0 prints it black where the bit is 1, as ZPL's ^GF does, so each GW's data bytes are inverted here,
 * found from the command's own width and height, and nothing else in the file is touched.
 */
function forLabelize(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const text = new TextDecoder("latin1").decode(bytes);
  const gw = /(?:^|\n)GW(\d+),(\d+),(\d+),(\d+),/g;
  let match: RegExpExecArray | null;
  while ((match = gw.exec(text))) {
    const start = match.index + match[0].length;
    const length = Number(match[3]) * Number(match[4]);
    for (let i = start; i < start + length; i++) out[i] = ~out[i]! & 0xff;
    gw.lastIndex = start + length;
  }
  return out;
}

/**
 * An EPL2 file with turned A and B commands as Labelize places them. The guide turns an object about its point of
 * origin, which turns with it (figure 2: at 90° the origin is the field's top right corner); Labelize puts the turned
 * field's top left corner at x, y, as ZPL does. Each turned command's origin is moved there here: its field's upright
 * width from Labelize's own print of it upright (a barcode without its interpretation line), its height Labelize's
 * (a barcode's bar height, a text's cell: the 203 dpi cells at any resolution, multiplied).
 */
function labelizeTurned(file: string, dpi: number): string {
  const CELLS = [12, 16, 20, 24, 48];
  return file.split("\r\n").map((line) => {
    const turned = /^([AB])(\d+),(\d+),([123]),(.*)$/.exec(line);
    if (!turned) return line;
    const [, kind, ox, oy, rotation, rest] = turned as unknown as [string, "A" | "B", string, string, string, string];
    const p = rest.split(",");
    const upright = kind === "B" ? `B20,20,0,${[...p.slice(0, 4), "N", ...p.slice(5)].join(",")}` : `A20,20,0,${rest}`;
    const { grey, width } = decodePng(render("epl", `\r\nN\r\nq4000\r\n${upright}\r\nP1\r\n`, 4000, 600, dpi));
    let right = 0;
    grey.forEach((value, index) => { if (value < 128) right = Math.max(right, index % width); });
    const w = right - 20 + 1;
    const h = kind === "B" ? Number(p[3]) : CELLS[Number(p[0]) - 1]! * Number(p[2]);
    const [x, y] = [Number(ox), Number(oy)];
    const [lx, ly] = rotation === "1" ? [x - h + 1, y] : rotation === "2" ? [x - w + 1, y - h + 1] : [x, y - w + 1];
    return `${kind}${lx},${ly},${rotation},${rest}`;
  }).join("\r\n");
}

async function reads(png: Uint8Array): Promise<string[]> {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

function options(xMm: number, dpi: number) {
  const { dots } = snapToDots(xMm, dpi);
  const margin = 15 * dots;
  return {
    x: margin, y: margin, dotsPerModule: dots, barHeightDots: Math.round((22.85 / 25.4) * dpi), dpi,
    widthDots: Math.round(6 * dpi), heightDots: Math.round(2.5 * dpi), hri: true,
  };
}

type Case = [Language, SymbologyId, string, number, number, string];
const CASES: Case[] = [
  ["tspl", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["tspl", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["tspl", "gs1-datamatrix", "(01)09506000134352(10)AB-C(17)271231(21)123", 0.38, 300, "]d2 (01)09506000134352(10)AB-C(17)271231(21)123"],
  ["tspl", "gs1-datamatrix", "(01)09506000134352(21)ABCDEFGH12345", 0.5, 203, "]d2 (01)09506000134352(21)ABCDEFGH12345"],
  ["tspl", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A~B", 0.495, 300, "]d1 https://id.gs1.org/01/09506000134352/10/A~B"],
  ["tspl", "dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123", 0.495, 203, "]Q1 https://id.gs1.org/01/09506000134352/10/ABC123"],
  ["tspl", "dl-qrcode", 'https://example.com/a"b', 0.495, 300, ']Q1 https://example.com/a"b'],
  ["epl", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["epl", "ean8", "95012346", 0.33, 300, "]E4 95012346"],
  ["epl", "upca", "614141000036", 0.33, 203, "]E0 0614141000036"],
  ["epl", "upce", "01234565", 0.33, 203, "]E0 0012345000065"],
  ["epl", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["epl", "gs1-128", "(00)106141411234567897", 0.33, 203, "]C1 (00)106141411234567897"],
  ["epl", "gs1-128", "(01)09506000134352(17)271231(10)Ab-1/2.%+'", 0.33, 300, "]C1 (01)09506000134352(17)271231(10)Ab-1/2.%+'"],
  ["epl", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A%22B", 0.495, 203, "]d1 https://id.gs1.org/01/09506000134352/10/A%22B"],
  ["dpl", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["dpl", "ean13", "9506000134352", 0.33, 300, "]E0 9506000134352"],
  ["dpl", "ean8", "95012346", 0.33, 300, "]E4 95012346"],
  ["dpl", "upca", "614141000036", 0.33, 203, "]E0 0614141000036"],
  ["dpl", "upce", "01234565", 0.33, 203, "]E0 0012345000065"],
  ["dpl", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["dpl", "gs1-128", "(00)106141411234567897", 0.33, 203, "]C1 (00)106141411234567897"],
  ["dpl", "gs1-128", "(00)095060001343520000", 0.495, 300, "]C1 (00)095060001343520000"],
  ["dpl", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A~B", 0.495, 300, "]d1 https://id.gs1.org/01/09506000134352/10/A~B"],
  ["dpl", "dl-datamatrix", 'https://example.com/a"b\\c', 0.495, 203, ']d1 https://example.com/a"b\\c'],
  ["dpl", "dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123", 0.495, 203, "]Q1 https://id.gs1.org/01/09506000134352/10/ABC123"],
  ["dpl", "dl-qrcode", "https://id.gs1.org/01/09506000134352/10/A,B", 0.38, 300, "]Q1 https://id.gs1.org/01/09506000134352/10/A,B"],
];

describe("TSPL, EPL2 and DPL rendered by Labelize and read back", () => {
  it.each(CASES)("%s %s %s at %s mm, %i dpi", async (language, symbology, data, xMm, dpi, read) => {
    const o = options(xMm, dpi);
    expect(await reads(render(language, WRITERS[language](symbology, data, o), o.widthDots, o.heightDots, dpi))).toEqual([read]);
  });

  it.each([["tspl", "frame"], ["tspl", "bars"], ["epl", "frame"], ["epl", "bars"], ["dpl", "frame"], ["dpl", "bars"]] as const)("%s: ITF-14 with its bearer %s, read back", async (language, kind) => {
    const o = { ...options(0.5, 203), bearer: { kind, thicknessDots: kind === "frame" ? 39 : 8 }, x: 150, y: 120 };
    const file = WRITERS[language]("itf14", "19506000134359", o);
    const command = {
      tspl: kind === "frame" ? /\nBOX / : /\nBAR /,
      epl: kind === "frame" ? /\nX\d/ : /\nLO\d/,
      dpl: kind === "frame" ? /\r1X11000\d{8}b\d{16}\r/ : /\r1X11000\d{8}l\d{8}\r/,
    }[language];
    expect(file).toMatch(command);
    if (language === "dpl") expect(file.match(/\r1X11000/g)).toHaveLength(kind === "frame" ? 1 : 2);
    expect(await reads(render(language, file, o.widthDots, o.heightDots, 203))).toEqual(["]I1 19506000134359"]);
  });

  // The symbol starts where the label's layout puts it. EPL2's printer draws a Data Matrix's quiet zone itself, a module
  // wide (guide, b command), so the command starts a module earlier; Labelize draws no such quiet zone, so there the
  // symbol shows a module before the corner — the difference between the guide and the emulator, kept in sight
  it.each([
    ["tspl", "dl-datamatrix"], ["epl", "dl-datamatrix"], ["tspl", "dl-qrcode"], ["epl", "ean13"], ["tspl", "ean13"],
    ["dpl", "dl-datamatrix"], ["dpl", "dl-qrcode"], ["dpl", "ean13"], ["dpl", "itf14"], ["dpl", "gs1-128"],
  ] as const)(
    "%s: %s starts at the layout's corner", (language, symbology) => {
      const o = { ...options(0.495, 203), hri: false, qrError: "H" as const }; // not the encoder's default level
      const data = { ean13: "9506000134352", itf14: "19506000134359", "gs1-128": "(00)106141411234567897" }[symbology as string]
        ?? "https://id.gs1.org/01/09506000134352";
      const { grey, width } = decodePng(render(language, WRITERS[language](symbology, data, o), o.widthDots, o.heightDots, 203));
      let left = width;
      let top = Infinity;
      grey.forEach((value, index) => {
        if (value >= 128) return;
        left = Math.min(left, index % width);
        top = Math.min(top, Math.floor(index / width));
      });
      const early = language === "epl" && symbology === "dl-datamatrix" ? o.dotsPerModule : 0;
      if (language !== "dpl") {
        expect([left, top]).toEqual([o.x - early, o.y - early]);
        return;
      }
      // DPL places a symbol by its bottom left corner (manual, ffff), in tenths of a millimetre: within a dot here.
      // Labelize draws a QR code eight modules higher (its image's quiet zone below the symbol, then a quiet zone taken
      // off once more, as for ZPL's ^FO), and an EAN's guard bars 12 dots below the others where the layout has 5X, so
      // its bars start 12 - 5X dots higher. The manual and the layout are followed, the emulator's way kept in sight
      const high = symbology === "dl-qrcode" ? 8 * o.dotsPerModule : symbology === "ean13" ? 12 - 5 * o.dotsPerModule : 0;
      expect(left).toBe(o.x);
      expect(Math.abs(top - (o.y - high))).toBeLessThanOrEqual(1);
    },
  );

  it("EPL2: GS1-128 in two symbols, stacked, each read back", async () => {
    const data = "(00)106141411234567897(02)09506000134376(37)24(15)271231(3102)001250(10)ABCDEFGHIJ";
    const parts = splitGs1128(data);
    expect(parts).toHaveLength(2);
    const o = { ...options(0.495, 203), parts, widthDots: Math.round(8 * 203), heightDots: Math.round(3 * 203) };
    const file = eplLabel("gs1-128", data, o);
    expect(file.match(/,1E,/g)).toHaveLength(2);
    expect(await reads(render("epl", file, o.widthDots, o.heightDots, 203))).toEqual(parts.map((p) => `]C1 ${p}`).sort());
  });

  // EPL2's text at its capitals' height: the fonts' capitals are 0.75 of their cell (measured through Labelize), so the
  // cell is asked that much larger; the HRI's last digit, as Labelize draws it, is as high as asked.
  it.each([2.2, 3, 4])("EPL2: the text's capitals %s mm high", (mm) => {
    const o = { ...options(0.495, 203), hriHeightMm: mm };
    const file = eplLabel("gs1-128", "(00)106141411234567897", o);
    const y = Number(file.match(/\r\nA\d+,(\d+),0,\d,\d,\d,N,"\(00\)106141411234567897"/)![1]);
    // The digits after "(00)": Labelize's font is proportional, so the glyphs are found by the blank columns between them
    const { grey, width } = decodePng(render("epl", file, o.widthDots, o.heightDots, 203));
    const height = grey.length / width;
    const ink = (row: number, col: number) => grey[row * width + col]! < 128;
    const inked = Array.from({ length: width }, (_, col) => Array.from({ length: height - y }, (_, i) => ink(y + i, col)).some(Boolean));
    const glyphs: [number, number][] = [];
    inked.forEach((on, col) => {
      if (on && !inked[col - 1]) glyphs.push([col, col]);
      if (on) glyphs.at(-1)![1] = col;
    });
    expect(glyphs).toHaveLength(22);
    const rows: number[] = [];
    for (let row = y; row < height; row++) {
      if (glyphs.slice(4).some(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => ink(row, from + i)).some(Boolean))) rows.push(row);
    }
    expect(Math.abs(Math.min(...rows) - y)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...rows) - Math.min(...rows) + 1 - Math.round((mm / 25.4) * 203))).toBeLessThanOrEqual(2);
  });

  // The GS1 Logistic Label in EPL2 (backlog 4.1): each GS1-128 as UCC/EAN 128, the text in the fixed-pitch font nearest
  // its height and never wider than the layout's, the rules with LO; with a Data Matrix and its GS1 Digital Link URI
  // beside the data. Every symbol read back from the whole label as Labelize draws it.
  it.each([[203, false], [300, true]] as const)("EPL2: the GS1 Logistic Label at %i dpi, every symbol read back (a Data Matrix: %s)", async (dpi, withDataMatrix) => {
    const elementString = "(00)106141411234567897(02)09506000134376(37)24";
    const uri = "https://id.gs1.org/00/106141411234567897?02=09506000134376&37=24";
    const label = logisticLabel({
      elementString, size: withDataMatrix ? "a5" : "4x6", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
      from: ["Dal Giardino S.p.A."], to: ["Supermarket DC 12"], ...(withDataMatrix ? { twoD: { symbology: "dl-datamatrix" as const, data: uri } } : {}),
    }, hriFont());
    const d = snapToDots(0.495, dpi).dots;
    const file = eplLogisticLabel(label, dpi, d);
    const width = Math.round((label.layout.width * label.layout.xMm / 25.4) * dpi);
    const height = Math.round((label.layout.height * label.layout.xMm / 25.4) * dpi);
    expect(file).toContain(`\r\nq${width}\r\n`);
    expect(file.match(/,1E,/g)).toHaveLength(2);
    expect(file).toMatch(/\r\nA\d+,\d+,0,\d,\d,\d,N,"FROM"\r\n/);
    // The HRI at 3 mm (rule 5c): at 203 dpi 24 dots of capitals, font 2's 16-dot cell twice
    if (dpi === 203) expect(file).toMatch(/\r\nA\d+,\d+,0,2,2,2,N,"\(00\)106141411234567897"\r\n/);
    // Each line of the label's own text no wider in the printer's font than the layout made room for
    const font = hriFont();
    for (const t of label.printer.texts) {
      const line = file.split("\r\n").find((l) => l.endsWith(`,N,"${t.text}"`))!;
      const [, fontName, h] = line.match(/^A\d+,\d+,0,(\d),(\d),\d,N,/)!;
      const pitch = (dpi < 250 ? [8, 10, 12, 14, 32] : [12, 16, 20, 24, 48])[Number(fontName) - 1]! * Number(h);
      const em = ((t.heightMm / label.layout.xMm) * font.unitsPerEm) / font.capHeight;
      expect([...t.text].length * pitch).toBeLessThanOrEqual(Math.ceil(font.textWidth(t.text, em) * (label.layout.xMm / 25.4) * dpi));
    }
    const expected = [...label.parts.map((p) => `]C1 ${p}`), ...(withDataMatrix ? [`]d1 ${uri}`] : [])].sort();
    expect(await reads(render("epl", file, width, height, dpi))).toEqual(expected);
  });

  // A label of one's own (backlog 4.2) in EPL2, as in ZPL: each barcode read back from the whole page, its first bar
  // where the page's layout puts it, to the dot; the text's capitals at their corner. Labelize draws the Data Matrix
  // without the one-module quiet zone the guide says the printer adds (b command), so a module up and left there.
  it.each([
    [203, "distribution", [
      { id: "t", kind: "text", text: "BATCH {10}", heightMm: 4, xMm: 6, yMm: 4 },
      { id: "c", kind: "symbol", symbology: "gs1-128", ais: null, size: 100, hri: true, xMm: 2, yMm: 36 },
      { id: "m", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, xMm: 90, yMm: 3 },
    ]],
    [300, "retail", [
      { id: "e", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 4, yMm: 30 },
      { id: "t", kind: "text", text: "BEST BEFORE {17}\nBATCH {10}", heightMm: 3, xMm: 4, yMm: 4 },
      { id: "m", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, xMm: 70, yMm: 4 },
    ]],
  ] as const)("EPL2: a label of one's own at %i dpi, every barcode read back, each where the layout puts it", async (dpi, environment, elements) => {
    const engine = await syntaxEngine();
    const page = { widthMm: 130, heightMm: 75, elements: elements as unknown as DesignPage["elements"] };
    const designed = designLabel(page, engine.parse("(01)09506000134376(17)271231(10)B42") as Identified, hriFont(), { environment });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    const png = render("epl", eplPage(printed), printed.widthDots, printed.heightDots, dpi);
    expect(await reads(png)).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    const dark = (x: number, y: number) => grey[y * width + x]! < 128;
    const dots = (mm: number) => Math.round((mm / 25.4) * dpi);
    for (const [index, s] of designed.printer.symbols.entries()) {
      const range = s.layout.barRects && s.layout.barRects[1] > s.layout.barRects[0] ? s.layout.barRects : [0, s.layout.rects.length] as const;
      const bars = s.layout.rects.slice(...range);
      const early = s.options.symbology === "dl-datamatrix" ? printed.symbols[index]!.options.dotsPerModule : 0;
      const [left, top] = [dots(s.xMm + Math.min(...bars.map((r) => r[0])) * s.layout.xMm) - early, dots(s.yMm + Math.min(...bars.map((r) => r[1])) * s.layout.xMm) - early];
      let x = left - 12;
      while (x < left + 12 && !dark(x, top + 4)) x++;
      let y = top - 12;
      while (y < top + 12 && !dark(left + 1, y)) y++;
      expect([s.id, x, y]).toEqual([s.id, left, top]);
    }
    for (const t of page.elements.filter((e) => e.kind === "text")) {
      let y = dots(t.yMm) - 8;
      const row = (yy: number) => Array.from({ length: dots(20) }, (_, i) => dots(t.xMm) + i).some((xx) => dark(xx, yy));
      while (y < dots(t.yMm) + 8 && !row(y)) y++;
      expect(Math.abs(y - dots(t.yMm))).toBeLessThanOrEqual(1);
    }
  });

  // Lines and boxes on a label of one's own (backlog 4.2): LO fills a line and a filled box, X draws an outline whose
  // ends are the box's outer edges; each where the page puts it, to the dot
  it.each([203, 300])("EPL2: a label of one's own at %i dpi, its lines and boxes drawn by LO and X where the page puts them", async (dpi) => {
    const engine = await syntaxEngine();
    const designed = designLabel(GRAPHICS, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
    const printed = printPageFor(designed, dpi);
    const epl = textFile(eplPage(printed));
    expect(epl.match(/^X\d/gm)).toHaveLength(2);
    expect(epl.match(/^LO\d/gm)).toHaveLength(3);
    const png = render("epl", epl, printed.widthDots, printed.heightDots, dpi);
    expect(await reads(png)).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    const dark = (x: number, y: number) => grey[y * width + x]! < 128;
    expect(printed.boxes.map((b) => drawnBox(dark, b))).toEqual(printed.boxes);
  });

  // An image on a label of one's own (backlog 4.2): GW sends its dots as raw bytes, so the print file is bytes; every
  // dot printed where the page puts it, the symbol beside it read back. The logo 39.5 mm wide is not a whole number of
  // bytes at 203 dpi, so its last byte's spare dots are white; a picture 1 134 dots square goes as one GW of 142 bytes a row.
  it.each([
    [203, { ...WITH_LOGO, elements: WITH_LOGO.elements.map((e) => (e.kind === "image" ? { ...e, widthMm: 39.5 } : e)) }],
    [300, { widthMm: 100, heightMm: 100, elements: [{ id: "big", kind: "image", name: "big", picture: logo(600, 600), widthMm: 96, xMm: 2, yMm: 3 }] } as DesignPage],
  ] as const)("EPL2: a label of one's own at %i dpi, its image printed dot for dot by GW", { timeout: 60000 }, async (dpi, page) => {
    const engine = await syntaxEngine();
    const designed = designLabel(page, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    const file = eplPage(printed);
    expect(file).toBeInstanceOf(Uint8Array);
    const { x, y, bitmap } = printed.images![0]!;
    expect(new TextDecoder().decode((file as Uint8Array).subarray(0, 40))).toContain(`\r\nGW${x},${y},${Math.ceil(bitmap.width / 8)},${bitmap.height},`);
    const png = render("epl", file, printed.widthDots, printed.heightDots, dpi);
    expect(await reads(png)).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    let differ = 0;
    for (let i = 0; i < bitmap.width * bitmap.height; i++) {
      const dark = grey[(y + Math.floor(i / bitmap.width)) * width + x + (i % bitmap.width)]! < 128;
      if (Number(dark) !== bitmap.dark[i]) differ++;
    }
    expect(differ).toBe(0);
    expect(bitmap.dark.reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
    // Nothing printed in the spare dots right of the image
    const spare = 8 * Math.ceil(bitmap.width / 8) - bitmap.width;
    if (dpi === 203) expect(spare).toBeGreaterThan(0);
    for (let row = 0; row < bitmap.height; row++) {
      for (let dot = 0; dot < spare; dot++) expect(grey[(y + row) * width + x + bitmap.width + dot]!).toBeGreaterThanOrEqual(128);
    }
  });

  // A turned barcode on a label of one's own (backlog 4.2, rotation): printed upright and turned a quarter, a half and
  // three quarters, each alone on a page, every dot of the turned symbol's own box is the upright one's turned about it,
  // the box's corner as turned where the page puts it, and read back each time. Labelize places turned fields otherwise
  // than the guide (labelizeTurned).
  it.each([
    [203, "distribution", "gs1-128", "(01)09506000134376(10)B42"],
    [300, "retail", "ean13", "(01)09506000134352"],
    [203, "distribution", "itf14", "(01)19506000134359"],
    [203, "retail", "upce", "(01)00012345000065"],
    [300, "retail", "ean8", "(01)00000095012346"],
  ] as const)("EPL2: a label of one's own at %i dpi: a %s %s turned, each dot the upright one's", { timeout: 60000 }, async (dpi, environment, symbology, elementString) => {
    const engine = await syntaxEngine();
    const identified = engine.parse(elementString) as Identified;
    const pageAt = (rotation: 0 | 90 | 180 | 270) => {
      const page: DesignPage = { widthMm: 150, heightMm: 150, elements: [{ id: "s", kind: "symbol", symbology, ais: null, size: 100, hri: true, rotation, xMm: 20, yMm: 25 }] };
      const designed = designLabel(page, identified, hriFont(), { environment });
      expect(designed.problems).toEqual([]);
      return { designed, printed: printPageFor(designed, dpi) };
    };
    const dark = async ({ printed }: ReturnType<typeof pageAt>) => {
      const file = textFile(eplPage(printed));
      const png = render("epl", labelizeTurned(file, dpi), printed.widthDots, printed.heightDots, dpi);
      const { grey, width } = decodePng(png);
      const dots = new Set<number>();
      for (let y = 0; y < printed.heightDots; y++) {
        for (let x = 0; x < printed.widthDots; x++) if (grey[y * width + x]! < 128) dots.add(y * printed.widthDots + x);
      }
      return { file, dots, read: await reads(png) };
    };
    const upright = pageAt(0);
    const before = await dark(upright);
    expect(before.read).toEqual(upright.designed.expected);
    const { x: x0, y: y0 } = upright.printed.symbols[0]!.options;
    for (const rotation of [90, 180, 270] as const) {
      const turned = pageAt(rotation);
      const { x, y, turned: t } = turned.printed.symbols[0]!.options;
      const [w, h] = [t!.width, t!.height];
      const after = await dark(turned);
      expect(after.file).toMatch(new RegExp(`^B\\d+,\\d+,${{ 90: 1, 180: 2, 270: 3 }[rotation]},`, "m"));
      expect(after.read).toEqual(upright.designed.expected);
      const W = upright.printed.widthDots;
      const moved = [...before.dots].map((i) => {
        const [px, py] = [i % W - x0, Math.floor(i / W) - y0];
        const [tx, ty] = rotation === 90 ? [x + h - 1 - py, y + px] : rotation === 180 ? [x + w - 1 - px, y + h - 1 - py] : [x + py, y + w - 1 - px];
        return ty * W + tx;
      });
      const [across, down] = rotation === 180 ? [w, h] : [h, w];
      const inBox = (i: number) => i % W >= x && i % W < x + across && Math.floor(i / W) >= y && Math.floor(i / W) < y + down;
      const turnedDots = new Set(moved);
      const inside = [moved.filter((i) => inBox(i) && !after.dots.has(i)).length, [...after.dots].filter((i) => inBox(i) && !turnedDots.has(i)).length];
      // The studio's text (A) within 3 dots: Labelize draws a turned glyph a dot of its cell off, two at multiplier 2.
      // EAN's and UPC's interpretation line is the printer's own, which Labelize does not turn with the bars (the
      // leading digit up to 23 dots away): read back only.
      const near = (dots: Set<number>, i: number) => Array.from({ length: 49 }, (_, k) => (Math.floor(k / 7) - 3) * W + (k % 7) - 3).some((d) => dots.has(i + d));
      const studioText = !["ean13", "ean8", "upca", "upce"].includes(symbology);
      const text = studioText ? [moved.filter((i) => !near(after.dots, i)).length, [...after.dots].filter((i) => !near(turnedDots, i)).length] : [0, 0];
      expect([rotation, inside, text]).toEqual([rotation, [0, 0], [0, 0]]);
      // The bars' top left corner as turned where the page's layout puts it
      const s = turned.designed.printer.symbols[0]!;
      const bars = s.layout.barRects && s.layout.barRects[1] > s.layout.barRects[0] ? s.layout.rects.slice(...s.layout.barRects) : s.layout.rects;
      const own = [Math.min(...bars.map((r) => r[0])), Math.min(...bars.map((r) => r[1])), Math.max(...bars.map((r) => r[0] + r[2])), Math.max(...bars.map((r) => r[1] + r[3]))];
      const [rx, ry] = turnedRect([own[0]!, own[1]!, own[2]! - own[0]!, own[3]! - own[1]!], s.layout.width, s.layout.height, rotation);
      const toDots = (mm: number) => Math.round((mm / 25.4) * dpi);
      const corner = [...after.dots].filter(inBox).reduce(([cx, cy], i) => [Math.min(cx!, i % W), Math.min(cy!, Math.floor(i / W))], [Infinity, Infinity]);
      expect(corner).toEqual([toDots(s.xMm + rx * s.layout.xMm), toDots(s.yMm + ry * s.layout.xMm)]);
      expect(moved.filter(inBox).length).toBeGreaterThan(500);
    }
  });

  // A turned text block on a label of one's own (backlog 4.2, rotation): A turned, its capitals' top side where the page
  // puts it and its first letter where the line starts, within Labelize's cell dot (two at multiplier 2) and the
  // letter's side bearing; the printer's fixed-pitch font sets how far it runs.
  it.each([203, 300])("EPL2: a label of one's own at %i dpi: a line of text turned each way, where the page puts it", { timeout: 60000 }, async (dpi) => {
    const engine = await syntaxEngine();
    for (const rotation of [90, 180, 270] as const) {
      const page: DesignPage = { widthMm: 80, heightMm: 80, elements: [{ id: "t", kind: "text", text: "EXP {10}", heightMm: 4, rotation, xMm: 30, yMm: 30 }] };
      const designed = designLabel(page, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
      const printed = printPageFor(designed, dpi);
      const epl = textFile(eplPage(printed));
      expect(epl).toMatch(new RegExp(`^A\\d+,\\d+,${{ 90: 1, 180: 2, 270: 3 }[rotation]},`, "m"));
      const { grey, width } = decodePng(render("epl", labelizeTurned(epl, dpi), printed.widthDots, printed.heightDots, dpi));
      let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
      for (let y = 0; y < printed.heightDots; y++) {
        for (let x = 0; x < printed.widthDots; x++) {
          if (grey[y * width + x]! >= 128) continue;
          [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
        }
      }
      const t = printed.texts[0]!;
      const [w, c] = [t.widthDots, t.heightDots];
      const [capitals, start] = rotation === 90 ? [right + 1 - (t.x + c), top - t.y]
        : rotation === 180 ? [bottom + 1 - (t.y + c), t.x + w - (right + 1)]
        : [left - t.x, t.y + w - (bottom + 1)];
      expect([rotation, Math.abs(capitals) <= 2]).toEqual([rotation, true]);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(Math.ceil(c / 5));
    }
  });

  it("EPL2: the GS1 Logistic Label refused where EPL2 cannot write it, with the reason", () => {
    const base = { size: "a5" as const, spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100 };
    // (37) has no predefined length and is not last in its symbol: EPL2's UCC/EAN 128 cannot separate it
    const batch = logisticLabel({ ...base, elementString: "(00)106141411234567897(02)09506000134376(37)24(10)ABC123" }, hriFont());
    expect(() => eplLogisticLabel(batch, 203, 4)).toThrow(/no predefined length only last/);
    const gs1dm = logisticLabel({ ...base, elementString: "(00)106141411234567897", twoD: { symbology: "gs1-datamatrix", data: "(00)106141411234567897" } }, hriFont());
    expect(() => eplLogisticLabel(gs1dm, 203, 4)).toThrow(/Data Matrix \(the b command\) has no FNC1/);
  });

  // The studio's text under a symbol in DPL: the cell's bottom is the record's row, so its top must land where the
  // layout puts it, the gap below the bars; centred by the font's pitch
  it.each([["gs1-128", "(00)106141411234567897", 0.495], ["itf14", "19506000134359", 0.5]] as const)("DPL: %s's text under the bars where the layout puts it", (symbology, data, xMm) => {
    const o = options(xMm, 203);
    const { grey, width } = decodePng(render("dpl", dplLabel(symbology, data, o), o.widthDots, o.heightDots, 203));
    const bottom = o.y + o.barHeightDots;
    let top = Infinity;
    let left = width;
    let right = 0;
    grey.forEach((value, index) => {
      const row = Math.floor(index / width);
      if (value >= 128 || row < bottom + 2) return;
      top = Math.min(top, row);
      left = Math.min(left, index % width);
      right = Math.max(right, index % width);
    });
    const gap = symbology === "itf14" ? Math.round((1.02 / 25.4) * 203) : 2 * o.dotsPerModule;
    expect(Math.abs(top - (bottom + gap))).toBeLessThanOrEqual(2);
    // ITF-14's 14 digits in font 2 (18 dots high at 203 dpi): the manual's pitch of 12 dots, the last one's spacing of 2
    // left out, centred under the symbol. Labelize draws the font a little narrower, so the left edge is what is compared
    if (symbology === "itf14") {
      const symbolWidth = (7 * 18 + 9) * o.dotsPerModule;
      expect(Math.abs(left - (o.x + Math.round((symbolWidth - (14 * 12 - 2)) / 2)))).toBeLessThanOrEqual(2);
    }
    expect(right).toBeGreaterThan(left);
  });

  it.each([["tspl", tsplTestLabel], ["epl", eplTestLabel], ["dpl", dplTestLabel]] as const)("%s: a test label, the symbol read and the ruler 50 mm", async (language, test) => {
    const o = { ...options(0.495, 203), heightDots: 400 };
    const file = test(language === "epl" ? "dl-datamatrix" : "dl-qrcode", "https://id.gs1.org/01/09506000134352", o, ["Printer: any printer, 203 dpi"]);
    // DPL's rows count from the bottom: its canvas is the test label's own height (the label, 14 mm, a line a note)
    const height = language === "dpl" ? o.heightDots + Math.round((14 / 25.4) * 203) + Math.round(Math.round((2.2 / 25.4) * 203) * 1.4) : o.heightDots + 200;
    const png = render(language, file, o.widthDots, height, 203);
    expect((await reads(png)).length).toBe(1);
    // The ruler's line: the longest run of black on a row below the label
    const { grey, width } = decodePng(png);
    let longest = 0;
    for (let row = o.heightDots; row < grey.length / width; row++) {
      let run = 0;
      for (let col = 0; col < width; col++) {
        run = grey[row * width + col]! < 128 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
    expect(longest).toBe(400); // 50 mm at 8 dots a millimetre
  });
});

describe("what TSPL, EPL2 and DPL refuse, with the reason", () => {
  const o = options(0.33, 203);
  it.each([
    ["tspl", "gs1-128", "(01)09506000134352(10)ABC", /encodes "!102" as text/],
    ["tspl", "ean8", "95012346", /does not draw it/],
    ["tspl", "upca", "614141000036", /does not draw it/],
    ["tspl", "databar-omni", "(01)09506000134352", /RSS command/],
    ["tspl", "gs1-qrcode", "(01)09506000134352", /no FNC1/],
    ["epl", "gs1-datamatrix", "(01)09506000134352", /has no FNC1/],
    ["epl", "dl-qrcode", "https://id.gs1.org/01/09506000134352", /Japanese printer models only/],
    ["epl", "gs1-128", "(01)09506000134352(10)ABC(17)271231", /only last/],
    ["epl", "databar-omni", "(01)09506000134352", /RSS-14/],
    ["epl", "dl-datamatrix", 'https://example.com/a"b', /double quote or a backslash/],
    ["epl", "gs1-128", '(01)09506000134352(10)a"b', /double quote or a backslash/],
    ["dpl", "gs1-datamatrix", "(01)09506000134352", /no FNC1/],
    ["dpl", "gs1-128", "(01)09506000134352(10)ABC", /SSCC \(00\) alone/],
    ["dpl", "gs1-128", "(00)106141411234567897(02)09506000134376(37)24", /SSCC \(00\) alone/],
    ["dpl", "databar-omni", "(01)09506000134352", /RSS \(W1k\)/],
    ["dpl", "gs1-qrcode", "(01)09506000134352", /cannot print a GS1 QR Code/],
  ] as const)("%s refuses %s %s", (language, symbology, data, reason) => {
    const error = (() => {
      try {
        WRITERS[language](symbology, data, o);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf({ tspl: TsplUnsupportedError, epl: EplUnsupportedError, dpl: DplUnsupportedError }[language]);
    expect(error).toBeInstanceOf(PrinterUnsupportedError);
    expect((error as Error).message).toMatch(reason);
  });

  it("EPL2 prints EAN and UPC with a narrow bar of 2 to 4 dots only", () => {
    expect(() => eplLabel("ean13", "9506000134352", { ...o, dotsPerModule: 5 })).toThrow(/2 to 4 dots/);
    expect(() => eplLabel("ean13", "9506000134352", { ...o, dotsPerModule: 1 })).toThrow(/2 to 4 dots/);
  });

  it("DPL refuses what its records cannot hold: a module over 24 dots, a QR module between tenths of a millimetre, a line break, one mode", () => {
    expect(() => dplLabel("ean13", "9506000134352", { ...o, dotsPerModule: 25 })).toThrow(/1 to 24/);
    expect(() => dplLabel("itf14", "19506000134359", { ...o, dotsPerModule: 9 })).toThrow(/a wide bar of 1 to 24 dots; ITF-14's needs 27/);
    expect(() => dplLabel("dl-qrcode", "https://id.gs1.org/01/09506000134352", { ...o, dpi: 600, dotsPerModule: 1 })).toThrow(/tenths of a millimetre: 1 dots at 600 dpi/);
    expect(() => dplLabel("dl-qrcode", "https://id.gs1.org/01/09506000134352", { ...o, qrMode: "byte" })).toThrow(/automatic mode/);
    expect(() => dplLabel("dl-datamatrix", "https://example.com/a\rb", o)).toThrow(/line break/);
    expect(() => dplLabel("gs1-128", "(00)106141411234567897", { ...o, parts: ["(00)106141411234567897", "(02)09506000134376(37)24"] })).toThrow(/SSCC \(00\) alone/);
  });

  it("DPL counts in tenths of a millimetre from the label's bottom left corner: the record's row and column", () => {
    // A label 50 mm high at 203 dpi: an EAN-13 at 10 mm from the left whose guard bars end 30 mm from the top
    const file = dplLabel("ean13", "9506000134352", { ...options(0.33, 203), x: 80, y: Math.round((30 / 25.4) * 203) - 15 - 183, heightDots: Math.round((50 / 25.4) * 203), barHeightDots: 183 });
    expect(file.startsWith("\x02L\rm\rD11\rz\r")).toBe(true);
    expect(file).toMatch(/\r1F33229(\d{4})0100950600013435\r/);
    expect(Number(/\r1F33229(\d{4})/.exec(file)![1])).toBeCloseTo(200, -1); // 20 mm up from the bottom, within a dot
    expect(file.endsWith("\rQ0001\rE\r")).toBe(true);
  });

  it("text beside a symbol is refused: the printer's font sets its width", () => {
    expect(() => tsplLabel("gs1-datamatrix", "(01)09506000134352(10)ABC", { ...o, hriPosition: "left" })).toThrow(/below or above/);
    expect(() => eplLabel("gs1-128", "(01)09506000134352(10)ABC", { ...o, hriPosition: "right" })).toThrow(/below or above/);
    expect(() => dplLabel("gs1-128", "(00)106141411234567897", { ...o, hriPosition: "left" })).toThrow(/below or above/);
  });

  it("TSPL quotes a double quote as \\[\"], as its manual says (read back above)", () => {
    expect(tsplLabel("dl-qrcode", 'https://example.com/a"b', options(0.495, 203))).toContain('"https://example.com/a\\["]b"');
  });
});
