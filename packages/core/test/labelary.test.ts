import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hriFont } from "./font.ts";
import { GRAPHICS, logo, WITH_LOGO } from "./fixtures/graphics.ts";
import { decodePng, drawnBox } from "./png.ts";
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
  logisticPage,
  logisticLabel,
  specificationFor,
  graphicFields,
  PICTURE_THRESHOLD,
  pictureFromGrey,
  designLabel,
  printPageFor,
  syntaxEngine,
  zplPage,
  zplTurnedField,
  zplWithWork,
  readWork,
  turnedRect,
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

  // Data titles in a second language (6.6.4.2), in UTF-8 (^CI28): every symbol read back; each line of the titles
  // printed where the page puts it, its ink within the room the layout gives it, an accented capital's mark included
  it("the GS1 Logistic Label with its data titles also in Portuguese at 203 dpi: the titles where they belong", { timeout: 60000 }, async () => {
    const dpi = 203;
    const label = logisticLabel({
      elementString: "(00)106141411234567897(02)09506000134376(37)24(10)ABC123", size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5,
      percent: 100, from: ["Dal Giardino S.p.A."], to: ["Supermercado CD 12"], secondLanguage: "pt-BR",
    }, hriFont());
    const zpl = zplLogisticLabel(label, dpi, snapToDots(0.495, dpi).dots);
    expect(zpl).toMatch(/\^A0N,\d+,\d+\^FDCONTEÚDO\^FS/);
    const page = logisticPage(label, dpi, snapToDots(0.495, dpi).dots);
    const png = await labelaryPng(zpl, dpi, page.widthDots, page.heightDots);
    const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4 });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(label.parts.map((p) => `]C1 ${p}`).sort());
    const { grey, width } = decodePng(png);
    const offset = Math.floor((width - page.widthDots) / 2);
    const dark = (x: number, y: number) => grey[y * width + x + offset]! < 128;
    const ink = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dark(x, y)) n++;
      return n;
    };
    for (const title of ["REMETENTE", "DESTINATÁRIO", "CONTEÚDO", "QUANTIDADE", "LOTE"]) {
      const t = page.texts.find((line) => line.text === title)!;
      expect([title, ink(t.x, t.y, t.x + t.widthDots, t.y + t.heightDots) > 20]).toEqual([title, true]);
      // Nothing beyond its room on its line, nor in the gap between it and the English title above
      expect([title, ink(t.x + t.widthDots + 2, t.y, t.x + t.widthDots + 12, t.y + t.heightDots)]).toEqual([title, 0]);
    }
    // The acute accent over CONTEÚDO's U: ink above its capitals, where CONTENT above has none
    const conteudo = page.texts.find((line) => line.text === "CONTEÚDO")!;
    const content = page.texts.find((line) => line.text === "CONTENT")!;
    expect(ink(conteudo.x, conteudo.y - 5, conteudo.x + conteudo.widthDots, conteudo.y - 1)).toBeGreaterThan(0);
    expect(ink(content.x, content.y - 5, content.x + content.widthDots, content.y - 1)).toBe(0);
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

  // Lines and boxes on a label of one's own (backlog 4.2): ^GB draws each where the page puts it, to the dot, its outline
  // inside its size and as thick as asked; a line and a filled box filled
  it.each([203, 300])("a label of one's own at %i dpi: its lines and boxes drawn by ^GB where the page puts them", { timeout: 60000 }, async (dpi) => {
    const engine = await syntaxEngine();
    const designed = designLabel(GRAPHICS, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    expect(printed.boxes).toHaveLength(5);
    const png = await labelaryPng(zplPage(printed), dpi, printed.widthDots, printed.heightDots);
    const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    const offset = Math.floor((width - printed.widthDots) / 2); // Labelary centres the print width on its page
    const dark = (x: number, y: number) => grey[y * width + x + offset]! < 128;
    expect(printed.boxes.map((b) => drawnBox(dark, b))).toEqual(printed.boxes);
  });

  // An image on a label of one's own (backlog 4.2, step d): ^GFA prints every dot of the picture where the page puts
  // it, the symbol beside it still read back; a picture larger than one graphic field goes as stripes that meet
  it.each([203, 300])("a label of one's own at %i dpi: its image printed dot for dot by ^GF", { timeout: 60000 }, async (dpi) => {
    const engine = await syntaxEngine();
    const designed = designLabel(WITH_LOGO, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    const png = await labelaryPng(zplPage(printed), dpi, printed.widthDots, printed.heightDots);
    const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true });
    expect(results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort()).toEqual(designed.expected);
    const { grey, width } = decodePng(png);
    const offset = Math.floor((width - printed.widthDots) / 2);
    const { x, y, bitmap } = printed.images![0]!;
    const drawn = Uint8Array.from({ length: bitmap.width * bitmap.height }, (_, i) =>
      Number(grey[(y + Math.floor(i / bitmap.width)) * width + x + (i % bitmap.width) + offset]! < 128));
    expect(drawn.filter((d, i) => d !== bitmap.dark[i]).length).toBe(0);
    expect(bitmap.dark.reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
  });

  it("a label of one's own with an image larger than one graphic field: its stripes meet, every dot printed", { timeout: 60000 }, async () => {
    const page: DesignPage = { widthMm: 100, heightMm: 100, elements: [{ id: "big", kind: "image", name: "big", picture: logo(600, 600), widthMm: 96, xMm: 2, yMm: 2 }] };
    const designed = designLabel(page, { elements: [] } as unknown as Identified, hriFont(), { environment: "distribution" });
    const printed = printPageFor(designed, 300);
    const zpl = zplPage(printed);
    expect(zpl.match(/\^GFA/g)!.length).toBeGreaterThan(1);
    const png = await labelaryPng(zpl, 300, printed.widthDots, printed.heightDots);
    const { grey, width } = decodePng(png);
    const offset = Math.floor((width - printed.widthDots) / 2);
    const { x, y, bitmap } = printed.images![0]!;
    let differ = 0;
    for (let i = 0; i < bitmap.width * bitmap.height; i++) {
      const dark = grey[(y + Math.floor(i / bitmap.width)) * width + x + (i % bitmap.width) + offset]! < 128;
      if (Number(dark) !== bitmap.dark[i]) differ++;
    }
    expect(differ).toBe(0);
  });

  // A dithered image on a label of one's own (backlog 4.2): a photo's greys as dots, dithered again at the printer's
  // dots, every dot printed by the compressed ^GF (a field of scattered dots, the compression's hardest), and each
  // band of a grey ramp printed as dark as its grey
  it.each([203, 300])("a label of one's own at %i dpi: a dithered image printed dot for dot, each grey as dark as it is", { timeout: 60000 }, async (dpi) => {
    const [w, h] = [400, 100];
    const grey = Uint8Array.from({ length: w * h }, (_, p) => Math.floor((p % w) / 50) * 32 + 16); // 8 bands, 16 to 240
    const photo = pictureFromGrey(grey, w, h, PICTURE_THRESHOLD, true);
    const page: DesignPage = { widthMm: 34, heightMm: 12, elements: [{ id: "photo", kind: "image", name: "photo", picture: photo, dither: true, widthMm: (200 * 25.4) / dpi, xMm: 2, yMm: 2 }] };
    const designed = designLabel(page, { elements: [] } as unknown as Identified, hriFont(), { environment: "distribution" });
    const printed = printPageFor(designed, dpi);
    const png = await labelaryPng(zplPage(printed), dpi, printed.widthDots, printed.heightDots);
    const { grey: drawn, width } = decodePng(png);
    const offset = Math.floor((width - printed.widthDots) / 2);
    const { x, y, bitmap } = printed.images![0]!;
    expect(bitmap.width).toBe(w / 2); // a dot for two pixels, where sampling would take every other pixel of the pattern
    const dark = (i: number) => Number(drawn[(y + Math.floor(i / bitmap.width)) * width + x + (i % bitmap.width) + offset]! < 128);
    let differ = 0;
    for (let i = 0; i < bitmap.width * bitmap.height; i++) if (dark(i) !== bitmap.dark[i]) differ++;
    expect(differ).toBe(0);
    for (let band = 0; band < 8; band++) {
      const [from, to] = [Math.ceil(((band * 50 + 3) * bitmap.width) / w), Math.floor((((band + 1) * 50 - 3) * bitmap.width) / w)];
      let count = 0;
      for (let yy = 0; yy < bitmap.height; yy++) for (let xx = from; xx < to; xx++) count += dark(yy * bitmap.width + xx);
      expect(Math.abs(count / ((to - from) * bitmap.height) - (255 - (band * 32 + 16)) / 255)).toBeLessThan(0.02);
    }
  });

  // A turned barcode on a label of one's own (backlog 4.2, rotation): printed upright and turned a quarter, a half and
  // three quarters, each alone on a page, every dot of the turned symbol's own box is the upright one's turned about
  // it, the box's corner as turned where the page puts it, and read back each time. Its text, which the printer's font
  // draws turned, may differ by a dot at a glyph's edge: each dot that differs touches one of the other print's.
  const TURNED = [
    [203, "distribution", "gs1-128", "(01)09506000134376(10)B42", true],
    [300, "retail", "ean13", "(01)09506000134352", true],
    [203, "distribution", "itf14", "(01)19506000134359", true],
    [300, "distribution", "databar-expanded", "(01)09506000134376(10)B42", true],
    [203, "distribution", "gs1-datamatrix", "(01)09506000134376(10)B42", true],
    [300, "distribution", "dl-datamatrix", "https://id.gs1.org/01/09506000134376/10/B42", false],
    [203, "distribution", "databar-limited", "(01)09506000134376", true],
    [203, "distribution", "databar-stacked", "(01)09506000134376", true],
    [300, "distribution", "databar-expanded-stacked", "(01)09506000134376(17)271231(21)ABCDEFGH", true],
    [203, "retail", "upce", "(01)00012345000065", true],
  ] as const;
  it.each(TURNED)("a label of one's own at %i dpi: a %s %s turned, each dot the upright one's", { timeout: 90000 }, async (dpi, environment, symbology, elementString, hri) => {
    const engine = await syntaxEngine();
    const identified = engine.parse(elementString) as Identified;
    const pageAt = (rotation: 0 | 90 | 180 | 270) => {
      const page: DesignPage = { widthMm: 200, heightMm: 200, elements: [{ id: "s", kind: "symbol", symbology, ais: null, size: 100, hri, rotation, xMm: 15, yMm: 20 }] };
      const designed = designLabel(page, identified, hriFont(), { environment });
      expect(designed.problems).toEqual([]);
      return { designed, printed: printPageFor(designed, dpi) };
    };
    const dark = async ({ printed }: ReturnType<typeof pageAt>) => {
      const png = await labelaryPng(zplPage(printed), dpi, printed.widthDots, printed.heightDots);
      const { grey, width } = decodePng(png);
      const offset = Math.floor((width - printed.widthDots) / 2); // Labelary centres the print width on its page
      const results = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: [], textMode: "HRI", tryHarder: true });
      const dots = new Set<number>();
      for (let y = 0; y < printed.heightDots; y++) {
        for (let x = 0; x < printed.widthDots; x++) if (grey[y * width + x + offset]! < 128) dots.add(y * printed.widthDots + x);
      }
      return { dots, read: results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort() };
    };
    const upright = pageAt(0);
    const before = await dark(upright);
    expect(before.read).toEqual(upright.designed.expected);
    const { x: x0, y: y0 } = upright.printed.symbols[0]!.options;
    for (const rotation of [90, 180, 270] as const) {
      const turned = pageAt(rotation);
      const { symbology: printedAs, data, options: printed } = turned.printed.symbols[0]!;
      expect(printed.turned?.rotation).toBe(rotation);
      const { x, y, width: w, height: h } = zplTurnedField(printedAs, data, printed);
      // The corner as turned where the page puts its bars' box (the leading space of GS1 DataBar's guard added)
      const s = turned.designed.printer.symbols[0]!;
      const bars = s.layout.barRects && s.layout.barRects[1] > s.layout.barRects[0] ? s.layout.rects.slice(...s.layout.barRects) : s.layout.rects;
      const own = [Math.min(...bars.map((r) => r[0])), Math.min(...bars.map((r) => r[1])), Math.max(...bars.map((r) => r[0] + r[2])), Math.max(...bars.map((r) => r[1] + r[3]))];
      const [rx, ry] = turnedRect([own[0]!, own[1]!, own[2]! - own[0]!, own[3]! - own[1]!], s.layout.width, s.layout.height, rotation);
      const toDots = (mm: number) => Math.round((mm / 25.4) * dpi);
      const after = await dark(turned);
      expect(after.read).toEqual(upright.designed.expected);
      const W = upright.printed.widthDots;
      const moved = [...before.dots].map((i) => {
        const [px, py] = [i % W - x0, Math.floor(i / W) - y0];
        const [tx, ty] = rotation === 90 ? [x + h - 1 - py, y + px] : rotation === 180 ? [x + w - 1 - px, y + h - 1 - py] : [x + py, y + w - 1 - px];
        return ty * W + tx;
      });
      const [across, down] = rotation === 180 ? [w, h] : [h, w];
      const inBox = (i: number) => i % W >= x && i % W < x + across && Math.floor(i / W) >= y && Math.floor(i / W) < y + down;
      const near = (dots: Set<number>, i: number) => [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1].some((d) => dots.has(i + d));
      const turnedDots = new Set(moved);
      const inside = [moved.filter((i) => inBox(i) && !after.dots.has(i)).length, [...after.dots].filter((i) => inBox(i) && !turnedDots.has(i)).length];
      const text = [moved.filter((i) => !near(after.dots, i)).length, [...after.dots].filter((i) => !near(turnedDots, i)).length];
      expect([rotation, inside, text]).toEqual([rotation, [0, 0], [0, 0]]);
      // The printed bars' top left corner as turned where the page's layout puts it
      const corner = moved.filter(inBox).reduce(([cx, cy], i) => [Math.min(cx!, i % W), Math.min(cy!, Math.floor(i / W))], [Infinity, Infinity]);
      expect(corner).toEqual([toDots(s.xMm + rx * s.layout.xMm), toDots(s.yMm + ry * s.layout.xMm)]);
      expect(moved.filter(inBox).length).toBeGreaterThan(500);
    }
  });

  // A turned text block on a label of one's own (backlog 4.2, rotation): ^A0 turned, its capitals' top side where the
  // page puts it, to a dot, and its first letter where the line starts, within the letter's side bearing; the printer's
  // font sets how far it runs.
  it.each([203, 300])("a label of one's own at %i dpi: a line of text turned each way, where the page puts it", { timeout: 60000 }, async (dpi) => {
    const engine = await syntaxEngine();
    for (const rotation of [90, 180, 270] as const) {
      const page: DesignPage = { widthMm: 80, heightMm: 80, elements: [{ id: "t", kind: "text", text: "EXP {10}", heightMm: 4, rotation, xMm: 30, yMm: 30 }] };
      const designed = designLabel(page, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
      const printed = printPageFor(designed, dpi);
      const zpl = zplPage(printed);
      expect(zpl).toContain(`^A0${{ 90: "R", 180: "I", 270: "B" }[rotation]},`);
      const { grey, width } = decodePng(await labelaryPng(zpl, dpi, printed.widthDots, printed.heightDots));
      const offset = Math.floor((width - printed.widthDots) / 2);
      let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
      for (let y = 0; y < printed.heightDots; y++) {
        for (let x = 0; x < printed.widthDots; x++) {
          if (grey[y * width + x + offset]! >= 128) continue;
          [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
        }
      }
      const t = printed.texts[0]!;
      const [w, c] = [t.widthDots, t.heightDots];
      // The capitals' top side, and where the first letter starts (its side bearing at most a fifth of the height)
      const [capitals, start] = rotation === 90 ? [right + 1 - (t.x + c), top - t.y]
        : rotation === 180 ? [bottom + 1 - (t.y + c), t.x + w - (right + 1)]
        : [left - t.x, t.y + w - (bottom + 1)];
      expect([rotation, Math.abs(capitals) <= 1]).toEqual([rotation, true]);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(Math.ceil(c / 5));
    }
  });

  // The work carried in the studio's ZPL (backlog 4.3): its ^FX comments change nothing the printer draws
  it("a label of one's own with its work in ^FX comments prints exactly as without them", { timeout: 60000 }, async () => {
    const engine = await syntaxEngine();
    const designed = designLabel(GRAPHICS, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "distribution" });
    const printed = printPageFor(designed, 203);
    const zpl = zplPage(printed);
    const work = {
      mode: "one" as const, identification: { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [] },
      answers: {}, picked: null, settings: { designer: true, note: "x".repeat(4000) }, page: GRAPHICS, printer: null, columns: null,
    };
    const carrying = zplWithWork(zpl, work);
    expect(carrying.match(/\^FX /g)!.length).toBeGreaterThan(4);
    expect(readWork(carrying)).toEqual(work);
    const plain = decodePng(await labelaryPng(zpl, 203, printed.widthDots, printed.heightDots));
    const withWork = decodePng(await labelaryPng(carrying, 203, printed.widthDots, printed.heightDots));
    expect([withWork.width, withWork.grey.length]).toEqual([plain.width, plain.grey.length]);
    expect(withWork.grey.findIndex((g, i) => g !== plain.grey[i])).toBe(-1);
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

  // ZPL's ASCII compression in ^GFA (ZPL II Programming Guide, "Alternative Data Compression Scheme"): rows that use
  // each of its tokens — repeat counts up to z (Labelary prints at most 2,000 dots across, so a row of 800 digits, z z,
  // is checked by the guide's rules only), a comma, an exclamation mark after an odd run, a colon — print every dot as
  // the uncompressed field does
  it("prints a compressed graphic field dot for dot: repeat counts, row fills and repeated rows", { timeout: 30000 }, async () => {
    const width = 1920;
    const kinds: ((x: number) => boolean)[] = [
      (x) => x >= 2 && x < 1650, // a run of 411 F's after a 3, then a comma
      (x) => x >= 4, // a 0, then an odd run of F's: one kept before the exclamation mark
      (x) => x < 800 || x >= 1600, // 200 F's, 200 0's, then F's to the end
      (x) => x % 4 !== 1, // 480 B's: z j B
      (x) => (x >> 3) % 3 === 0, // no run long enough to count
      () => false, // a comma alone
      (x) => x % 97 < 40, // runs of every length
    ];
    const height = kinds.length * 6;
    const dark = Uint8Array.from({ length: width * height }, (_, i) => Number(kinds[Math.floor(i / width / 6)]!(i % width)));
    const bitmap = { width, height, dark };
    const fields = graphicFields(bitmap, 20, 20);
    const data = fields[0]!.slice(fields[0]!.indexOf(",", fields[0]!.indexOf(",", fields[0]!.indexOf(",", fields[0]!.indexOf(",") + 1) + 1) + 1));
    for (const token of ["zjB", "!", ",", ":"]) expect(data).toContain(token);
    expect(fields.join("").length * 20).toBeLessThan(graphicFields(bitmap, 20, 20, false).join("").length);
    // ^PW: the print width, which Labelary centres on its page as for the other labels
    const png = await labelaryPng([`^XA^PW${width + 40}`, ...fields, "^XZ"].join("\n"), 600, width + 40, height + 40);
    const { grey, width: pngWidth } = decodePng(png);
    const offset = Math.floor((pngWidth - (width + 40)) / 2);
    let differ = 0;
    for (let i = 0; i < width * height; i++) {
      const printed = grey[(20 + Math.floor(i / width)) * pngWidth + 20 + (i % width) + offset]! < 128;
      if (Number(printed) !== dark[i]) differ++;
    }
    expect(differ).toBe(0);
  });
});
