import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lz_render_lang } from "@goodboy008/labelize-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hriFont } from "./font.ts";
import { decodePng } from "./png.ts";
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
  type DesignPage,
  type Identified,
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
function render(language: Language, file: string, widthDots: number, heightDots: number, dpi: number): Uint8Array {
  const mm = (dots: number) => (language === "dpl" ? dots / Math.round(dpi / 25.4) : (dots / dpi) * 25.4);
  return lz_render_lang(new TextEncoder().encode(file), mm(widthDots), mm(heightDots), Math.round(dpi / 25.4), false, false, language);
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
