import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hriFont } from "./font.ts";
import { decodePng } from "./png.ts";
import {
  encode,
  fillTemplate,
  rasterize,
  snapToDots,
  splitGs1128,
  zplLabel,
  zplTestAreaDots,
  zplTestLabel,
  zplTemplate,
  zplFontHeight,
  gs1128FieldData,
  gs1128Modules,
  parseElementString,
  zplLogisticLabel,
  logisticLabel,
  specificationFor,
  graphicFields,
  designLabel,
  printPageFor,
  syntaxEngine,
  zplPage,
  type DesignPage,
  type Identified,
  type SymbologyId,
} from "../src/index.ts";

// The ZPL the studio writes, printed by a simulated printer: Labelary (labelary.com) renders it at the printer's
// resolution as a PNG, and ZXing must read the same symbol back — symbology identifier and data. The owner checks
// labels with Labelary's viewer, as no physical printer is at hand (ADR 0002). Runs with LABELARY=1 (the CI; in a
// cloud session also NODE_USE_ENV_PROXY=1, so that fetch() goes through the session's proxy); the free API allows a
// few requests a second, hence one request at a time.
const enabled = process.env.LABELARY === "1";
const DPMM: Record<number, string> = { 203: "8dpmm", 300: "12dpmm", 600: "24dpmm" };

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

/** Labelary's PNG of the ZPL, at the printer's resolution, trying again while it asks to slow down (HTTP 429). */
async function labelaryPng(zpl: string, dpi: number, widthDots: number, heightDots: number): Promise<Uint8Array<ArrayBuffer>> {
  const inches = (dots: number) => Math.ceil((dots / dpi) * 100) / 100;
  const url = `https://api.labelary.com/v1/printers/${DPMM[dpi]}/labels/${inches(widthDots)}x${inches(heightDots)}/0/`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "image/png", "Content-Type": "application/x-www-form-urlencoded" },
      body: zpl,
    });
    if (response.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    expect(response.status, await response.clone().text().catch(() => "")).toBe(200);
    return new Uint8Array(await response.arrayBuffer());
  }
}

async function print(zpl: string, dpi: number, widthDots: number, heightDots: number) {
  const [result] = await readBarcodes(new Blob([await labelaryPng(zpl, dpi, widthDots, heightDots)], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true,
  });
  return result;
}

function options(xMm: number, dpi: number) {
  const { dots } = snapToDots(xMm, dpi);
  const margin = 15 * dots;
  return {
    x: margin, y: margin, dotsPerModule: dots, barHeightDots: Math.round((22.85 / 25.4) * dpi), dpi,
    widthDots: Math.round(6 * dpi), heightDots: Math.round(2.5 * dpi), hri: true,
  };
}

type Case = [SymbologyId, string, number, number, string, string];
const CASES: Case[] = [
  ["ean13", "9506000134352", 0.33, 203, "]E0", "9506000134352"],
  ["ean8", "95012346", 0.33, 300, "]E4", "95012346"],
  ["upca", "614141000036", 0.33, 203, "]E0", "0614141000036"],
  ["upce", "01234565", 0.33, 203, "]E0", "0012345000065"],
  ["itf14", "19506000134359", 0.5, 203, "]I1", "19506000134359"],
  ["gs1-128", "(00)106141411234567897", 0.33, 203, "]C1", "(00)106141411234567897"],
  ["gs1-128", "(01)09506000134352(10)Ab-1/2.%+>(21)X", 0.33, 300, "]C1", "(01)09506000134352(10)Ab-1/2.%+>(21)X"],
  ["gs1-128", "(01)09506000134352(10)12345(21)7(17)271231", 0.33, 203, "]C1", "(01)09506000134352(10)12345(21)7(17)271231"],
  ["gs1-datamatrix", "(01)09506000134352(10)AB_C(17)271231(21)123", 0.38, 300, "]d2",
    "(01)09506000134352(10)AB_C(17)271231(21)123"],
  ["gs1-datamatrix", "(01)09506000134352(21)ABCDEFGH12345", 0.5, 600, "]d2", "(01)09506000134352(21)ABCDEFGH12345"],
  ["dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123", 0.495, 203, "]Q1",
    "https://id.gs1.org/01/09506000134352/10/ABC123"],
  ["dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A_B", 0.495, 300, "]d1",
    "https://id.gs1.org/01/09506000134352/10/A_B"],
];

describe.skipIf(!enabled)("ZPL printed by Labelary and read back", () => {
  it.each(CASES)("%s %s at %s mm, %i dpi", { timeout: 30000 }, async (symbology, data, xMm, dpi, identifier, text) => {
    const o = options(xMm, dpi);
    const result = await print(zplLabel(symbology, data, o), dpi, o.widthDots, o.heightDots);
    expect(result?.symbologyIdentifier).toBe(identifier);
    expect(result?.text).toBe(text);
  });

  it.each(CASES.filter(([symbology]) => ["ean13", "gs1-128", "gs1-datamatrix", "dl-qrcode"].includes(symbology)))(
    "template of %s %s, filled with other values",
    { timeout: 30000 },
    async (symbology, data, xMm, dpi, identifier) => {
      const o = options(xMm, dpi);
      const template = zplTemplate(symbology, data, o);
      // Other values of the same lengths, as a system would send them.
      const values = Object.fromEntries(template.placeholders.map((p) => [p.name, p.sample.replace(/[0-9]/g, (c) =>
        p.name === "01" || p.name === "00" ? c : String((Number(c) + 1) % 10))]));
      const result = await print(fillTemplate(template, values), dpi, o.widthDots, o.heightDots);
      expect(result?.symbologyIdentifier).toBe(identifier);
      if (symbology.startsWith("gs1")) {
        const filled = template.placeholders.reduce((text, p) => text.replace(`(${p.name})${p.sample}`,
          `(${p.name})${values[p.name]}`), data);
        expect(result?.text).toBe(filled);
      }
    },
  );

  // ^BQ's error correction level as the label has it, a minimum: Labelary raised M to Q where the version had room
  // (31 October 2026). Its manual input in one mode is not offered: Labelary printed the same symbol for any mode.
  const LEVELS = "LMQH";
  it.each([["L", 203], ["M", 300], ["Q", 203], ["H", 300]] as const)("a QR code at level %s or above, %i dpi", { timeout: 30000 }, async (level, dpi) => {
    const o = { ...options(0.495, dpi), qrError: level };
    const data = "https://id.gs1.org/01/09506000134352/10/ABC123";
    const zpl = zplLabel("dl-qrcode", data, o);
    expect(zpl).toContain(`^FD${level}A,${data}^FS`);
    const result = await print(zpl, dpi, o.widthDots, o.heightDots);
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe(`]Q1 ${data}`);
    expect(LEVELS.indexOf(result!.ecLevel)).toBeGreaterThanOrEqual(LEVELS.indexOf(level));
    // Its top where the label puts it: ^BQ's shift by ^BY's bar height (10 dots by default) set to a dot and taken off
    expect(Math.min(result!.position.topLeft.y, result!.position.topRight.y)).toBe(o.y);
  });

  // GS1-128 over several symbols (backlog 1.13), stacked, each with its own element strings; every symbol read back.
  it("GS1-128 in two symbols, stacked", { timeout: 30000 }, async () => {
    const data = "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJ(15)271231(3102)001250";
    const parts = splitGs1128(data);
    expect(parts).toHaveLength(2);
    const o = { ...options(0.495, 203), parts, widthDots: Math.round(8 * 203), heightDots: Math.round(3 * 203) };
    const zpl = zplLabel("gs1-128", data, o);
    expect(zpl.match(/\^BCN/g)).toHaveLength(2);
    const results = await readBarcodes(new Blob([await labelaryPng(zpl, 203, o.widthDots, o.heightDots)], { type: "image/png" }), {
      formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
    });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(parts.map((p) => `]C1 ${p}`).sort());
  });

  // The text above or split (backlog 1.16), at the height chosen: the symbol still reads, the text clear of its bars.
  it.each([
    ["gs1-128", "(01)09506000134352(10)ABC123(17)271231", "above", 3, "]C1"],
    ["gs1-128", "(01)09506000134352(10)ABC123(17)271231", "split", 2.5, "]C1"],
    ["gs1-datamatrix", "(01)09506000134352(10)ABC123(17)271231", "split", 3, "]d2"],
    ["databar-expanded", "(01)09506000134352(3103)001250(17)271231", "above", 2, "]e0"],
  ] as const)("%s with its text %s, %s mm high", { timeout: 30000 }, async (symbology, data, position, mm, identifier) => {
    const o = { ...options(0.495, 203), hriPosition: position, hriHeightMm: mm, y: 200 };
    if (symbology === "databar-expanded") o.barHeightDots = 34 * o.dotsPerModule;
    const zpl = zplLabel(symbology, data, o);
    const t = Math.round((mm / 25.4) * 203);
    expect(zpl).toContain(`^A0N,${zplFontHeight(t)},${zplFontHeight(t)}`);
    // Above: every text line ends above the symbol's top
    const textYs = [...zpl.matchAll(/\^FO\d+,(\d+)\^A0N/g)].map((m) => Number(m[1]));
    expect(textYs.some((ty) => ty + t <= 200)).toBe(true);
    if (position === "split") expect(textYs.some((ty) => ty > 200)).toBe(true);
    const result = await print(zpl, 203, o.widthDots, o.heightDots);
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe(`${identifier} ${data}`);
  });

  // The text's height is its capitals' (section 4.14): ^A0's capitals are 0.78 of the height it is given, so the studio
  // gives it more. ITF-14's digits (no descenders; with bearer bars, so the text is the studio's, not the printer's
  // interpretation line) 3 mm high at 203 dpi: 24 dots of ink, within a dot.
  it("the text's capitals are as high as asked", { timeout: 30000 }, async () => {
    const o = { ...options(0.5, 203), hriHeightMm: 3, bearer: { kind: "bars" as const, thicknessDots: 8 } };
    const png = await labelaryPng(zplLabel("itf14", "19506000134359", o), 203, o.widthDots, o.heightDots);
    const { grey, width } = decodePng(png);
    let top = Infinity;
    let bottom = 0;
    grey.forEach((value, index) => {
      const row = Math.floor(index / width);
      if (value < 128 && row > o.y + o.barHeightDots + 8 + 2) {
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
    });
    expect(Math.abs(bottom - top + 1 - Math.round((3 / 25.4) * 203))).toBeLessThanOrEqual(1);
  });

  // GS1-128 as ^BC prints it: as wide as gs1128Modules() counts from the field data (a count's "24" kept in code set C),
  // which is what the label's width and the text's box are made from.
  it("GS1-128 is as wide as the modules counted from its field data", { timeout: 30000 }, async () => {
    const data = "(02)09506000134376(37)24(10)ABC123";
    const o = { ...options(0.33, 203), hri: false };
    const png = await labelaryPng(zplLabel("gs1-128", data, o), 203, o.widthDots, o.heightDots);
    const [result] = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true });
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe(`]C1 ${data}`);
    const { grey, width } = decodePng(png);
    const row = o.y + Math.round(o.barHeightDots / 2);
    let left = width;
    let right = 0;
    for (let col = 0; col < width; col++) {
      if (grey[row * width + col]! < 128) {
        left = Math.min(left, col);
        right = Math.max(right, col);
      }
    }
    expect(right - left + 1).toBe(gs1128Modules(gs1128FieldData(parseElementString(data))) * o.dotsPerModule); // from the start bar to the stop's last bar
  });

  // The GS1 Logistic Label (backlog 4.1, 3.2) with the printer's own commands: each GS1-128 a ^BC, read back from the
  // whole label as Labelary prints it; the rules and the label's own text where the layout puts them, clear of the
  // symbols; the label the page's size in dots.
  it.each([["a5", 203, 0.495], ["6x8", 300, 0.495]] as const)("the GS1 Logistic Label %s at %i dpi: every symbol read back", { timeout: 60000 }, async (size, dpi, xMm) => {
    const label = logisticLabel({
      elementString: "(00)106141411234567897(02)09506000134376(37)24(10)ABC123", size, spec: specificationFor(5, "gs1-128")!, table: 5,
      percent: 100, from: ["Dal Giardino S.p.A.", "Via Roma 1, Milano"], to: ["Supermarket DC 12"],
    }, hriFont());
    const { dots } = snapToDots(xMm, dpi);
    const zpl = zplLogisticLabel(label, dpi, dots);
    const width = Math.round((label.layout.width * label.layout.xMm / 25.4) * dpi);
    const height = Math.round((label.layout.height * label.layout.xMm / 25.4) * dpi);
    expect(zpl).toContain(`^PW${width}\n^LL${height}`);
    expect(zpl.match(/\^BCN/g)).toHaveLength(2);
    expect(zpl).toMatch(/\^A0N,\d+,\d+\^FDFROM\^FS/);
    // The data content's capitals 7 mm high (6.6.4.2), as zplFontHeight() gives them (measured above)
    const seven = zplFontHeight(Math.round((7 / 25.4) * dpi));
    expect(zpl).toContain(`^A0N,${seven},${seven}^FD106141411234567897^FS`);
    const png = await labelaryPng(zpl, dpi, width, height);
    const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4 });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(label.parts.map((p) => `]C1 ${p}`).sort());
    // Nothing printed between the middle block's rule and the first symbol's text above it, but the symbols' own
    const firstBars = Math.min(...label.printer.symbols.map((s) => s.y)) * (label.layout.xMm / 25.4) * dpi;
    const lastRule = Math.max(...label.printer.rules.map((r) => r[1] + r[3])) * (label.layout.xMm / 25.4) * dpi;
    expect(lastRule).toBeLessThan(firstBars);
  });

  // With a 2D symbol beside the middle block (6.6.4.1.1): a ^BX or ^BQ at whole dots within table 5's X-dimensions,
  // read back with the GS1-128 from the whole label; its right edge where the layout puts it
  it.each([["gs1-datamatrix", 203, "]d2 (00)106141411234567897(02)09506000134376(37)24(10)ABC123"], ["dl-qrcode", 300, "]Q1 https://id.gs1.org/00/106141411234567897?02=09506000134376&37=24&10=ABC123"]] as const)(
    "the GS1 Logistic Label with a %s at %i dpi: every symbol read back", { timeout: 60000 }, async (symbology, dpi, expected) => {
      const elementString = "(00)106141411234567897(02)09506000134376(37)24(10)ABC123";
      const label = logisticLabel({
        elementString, size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100, from: ["Dal Giardino S.p.A."], to: [],
        twoD: { symbology, data: expected.slice(4) },
      }, hriFont());
      const zpl = zplLogisticLabel(label, dpi, snapToDots(0.495, dpi).dots);
      const d2 = Math.ceil(0.743 / (25.4 / dpi)); // 6 dots at 203 dpi (0.750 mm), 9 at 300 (0.762 mm)
      expect(zpl).toContain(symbology === "dl-qrcode" ? `^BQN,2,${d2}^FDMA,https://id.gs1.org/00/` : `^BXN,${d2},200,0,0,6,_^FD_100106141411234567897`);
      const width = Math.round((label.layout.width * label.layout.xMm / 25.4) * dpi);
      const height = Math.round((label.layout.height * label.layout.xMm / 25.4) * dpi);
      const png = await labelaryPng(zpl, dpi, width, height);
      const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4 });
      expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual([...label.parts.map((p) => `]C1 ${p}`), expected].sort());
      // Where the layout puts it, within a module: its right edge 4 mm from the label's, its top as laid out (^BQ's own
      // shift taken off). Labelary centres the label's print width on its page, a few dots wider in whole hundredths of
      // an inch.
      const offset = Math.floor((decodePng(png).width - width) / 2);
      const two = results.find((r) => !r.symbologyIdentifier.startsWith("]C"))!.position;
      const right = Math.max(two.topRight.x, two.bottomRight.x) + 1 - offset;
      expect(Math.abs(width - Math.round((4 / 25.4) * dpi) - right)).toBeLessThanOrEqual(d2);
      const top = Math.min(two.topLeft.y, two.topRight.y);
      expect(Math.abs(top - Math.round(label.printer.twoD!.y * (label.layout.xMm / 25.4) * dpi))).toBeLessThanOrEqual(1);
    });

  // A label of one's own (backlog 4.2): each barcode with the commands of a symbol alone, read back from the whole page
  // as Labelary prints it; its first bar or module where the page's layout puts it, to the dot (GS1 DataBar's left
  // guard starts with a space, which the printer's corner includes); the text's capitals at their corner.
  it.each([
    [203, "distribution", "(01)09506000134376(10)B42(17)271231", [
      { id: "t", kind: "text", text: "BATCH {10}", heightMm: 4, xMm: 6, yMm: 6 },
      { id: "q", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, xMm: 94, yMm: 3 },
      { id: "c", kind: "symbol", symbology: "gs1-128", ais: ["01", "17"], size: 100, hri: true, xMm: 4, yMm: 40 },
      { id: "m", kind: "symbol", symbology: "gs1-datamatrix", ais: ["01", "10"], size: 100, hri: true, xMm: 112, yMm: 44 },
    ]],
    [300, "retail", "(01)09506000134352(17)271231(10)B42", [
      { id: "e", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 2, yMm: 2 },
      { id: "x", kind: "symbol", symbology: "databar-expanded", ais: null, size: 100, hri: true, xMm: 2, yMm: 32 },
      { id: "d", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, xMm: 64, yMm: 4 },
    ]],
  ] as const)("a label of one's own at %i dpi: every barcode read back, each where the layout puts it", { timeout: 60000 }, async (dpi, environment, elementString, elements) => {
    const engine = await syntaxEngine();
    const page = { widthMm: 150, heightMm: 80, elements: elements as unknown as DesignPage["elements"] };
    const designed = designLabel(page, engine.parse(elementString) as Identified, hriFont(), { environment });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    const zpl = zplPage(printed);
    const png = await labelaryPng(zpl, dpi, printed.widthDots, printed.heightDots);
    const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 6 });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    const offset = Math.floor((width - printed.widthDots) / 2); // Labelary centres the print width on its page
    const dark = (x: number, y: number) => grey[y * width + x + offset]! < 128;
    const dots = (mm: number) => Math.round((mm / 25.4) * dpi);
    for (const s of designed.printer.symbols) {
      const range = s.layout.barRects && s.layout.barRects[1] > s.layout.barRects[0] ? s.layout.barRects : [0, s.layout.rects.length] as const;
      const bars = s.layout.rects.slice(...range);
      const [left, top] = [dots(s.xMm + Math.min(...bars.map((r) => r[0])) * s.layout.xMm), dots(s.yMm + Math.min(...bars.map((r) => r[1])) * s.layout.xMm)];
      // From a few dots outside, along a row a few dots below the top and a column inside the first bar
      let x = left - 8;
      while (x < left + 8 && !dark(x, top + 4)) x++;
      let y = top - 8;
      while (y < top + 8 && !dark(left + 1, y)) y++;
      expect([s.id, x, y]).toEqual([s.id, left, top]);
    }
    for (const t of page.elements.filter((e) => e.kind === "text")) {
      let y = dots(t.yMm) - 8;
      const row = (yy: number) => Array.from({ length: dots(20) }, (_, i) => dots(t.xMm) + i).some((xx) => dark(xx, yy));
      while (y < dots(t.yMm) + 8 && !row(y)) y++;
      expect(Math.abs(y - dots(t.yMm))).toBeLessThanOrEqual(1);
    }
  });

  // The test label of a printer profile (backlog 3.1): its 50 mm ruler measures 400 dots at 8 dots a millimetre.
  it("a test label: the symbol reads and the ruler is 50 mm", { timeout: 30000 }, async () => {
    const o = { ...options(0.33, 203), heightDots: 400 };
    const zpl = zplTestLabel("gs1-128", "(01)09506000134352(10)ABC", o, ["Printer: any ZPL printer, 203 dpi", "Module: 3 dots, X 0.375 mm"]);
    const height = o.heightDots + zplTestAreaDots(203, 2);
    const png = await labelaryPng(zpl, 203, o.widthDots, height);
    const [result] = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true });
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe("]C1 (01)09506000134352(10)ABC");
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
    expect(Math.abs(longest - 400)).toBeLessThanOrEqual(2);
  });

  // Item 3.2 with the layouts of item 1.3. GS1 DataBar through ^BR at the height it prints each symbol at.
  const GTIN = "(01)09506000134352";
  const BARS: [SymbologyId, string, number, number][] = [
    ["databar-omni", GTIN, 33, 203],
    ["databar-truncated", GTIN, 13, 300],
    ["databar-stacked", GTIN, 13, 203],
    ["databar-stacked-omni", GTIN, 69, 203],
    ["databar-limited", "(01)15012345678907", 10, 300],
    ["databar-expanded", "(01)09506000134352(3103)001250(17)271231(10)AB-12", 34, 203],
    ["databar-expanded-stacked", "(01)09506000134352(3103)001250(17)271231(21)SERIAL-0001", 34, 300],
  ];
  it.each(BARS)("%s %s, %i modules high, %i dpi", { timeout: 30000 }, async (symbology, data, modules, dpi) => {
    const o = { ...options(0.33, dpi), hri: true };
    o.barHeightDots = modules * o.dotsPerModule;
    const result = await print(zplLabel(symbology, data, o), dpi, o.widthDots, o.heightDots);
    expect(result?.symbologyIdentifier).toBe("]e0");
    expect(result?.text).toBe(data);
  });

  it("templates GS1 DataBar Expanded, filled with other values", { timeout: 30000 }, async () => {
    const o = { ...options(0.33, 203), hri: true };
    o.barHeightDots = 34 * o.dotsPerModule;
    const template = zplTemplate("databar-expanded", "(01)09506000134352(17)271231(10)AB-12", o);
    const filled = fillTemplate(template, { "01": "09506000134376", "17": "281130", "10": "ZZ-99" });
    const result = await print(filled, 203, o.widthDots, o.heightDots);
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe("]e0 (01)09506000134376(17)281130(10)ZZ-99");
  });

  // ITF-14's bearer bars through ^GB: a frame 4.83 mm thick, or bars of 2X; the GTIN-14 given whole.
  it.each([["frame", 203], ["bars", 300]] as const)("ITF-14 with bearer bars as a %s, %i dpi", { timeout: 30000 }, async (kind, dpi) => {
    const { dots } = snapToDots(0.495, dpi);
    const t = kind === "frame" ? Math.round((4.83 / 25.4) * dpi) : 2 * dots;
    const o = {
      x: 10 * dots + t + 20, y: t + 20, dotsPerModule: dots, barHeightDots: Math.round((31.75 / 25.4) * dpi), dpi,
      widthDots: Math.round(4.5 * dpi), heightDots: Math.round(2.2 * dpi), hri: true, bearer: { kind, thicknessDots: t },
    };
    const result = await print(zplLabel("itf14", "19506000134359", o), dpi, o.widthDots, o.heightDots);
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe("]I1 19506000134359");
  });

  it("prints an image (a logo) larger than one graphic field, in stripes", { timeout: 30000 }, async () => {
    // A symbol stands in for a logo: a picture ZXing can check. At 600 dpi it is 1 222 dots square, 153 bytes a row,
    // 186 966 bytes in all: two graphic fields.
    const bitmap = rasterize(encode("gs1-datamatrix", "(01)09506000134352(21)ABCDEFGH12345"), {
      dotsPerModule: snapToDots(2, 600).dots, quietZone: 3,
    });
    const zpl = ["^XA", ...graphicFields(bitmap, 20, 20), "^XZ"].join("\n");
    const result = await print(zpl, 600, bitmap.width + 40, bitmap.height + 40);
    expect(result?.symbologyIdentifier).toBe("]d2");
    expect(result?.text).toBe("(01)09506000134352(21)ABCDEFGH12345");
  });
});
