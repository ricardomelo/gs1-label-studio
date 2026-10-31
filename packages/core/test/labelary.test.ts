import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  encode,
  fillTemplate,
  rasterize,
  snapToDots,
  splitGs1128,
  zplLabel,
  zplTemplate,
  graphicFields,
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

async function print(zpl: string, dpi: number, widthDots: number, heightDots: number) {
  const inches = (dots: number) => Math.ceil((dots / dpi) * 100) / 100;
  const url = `https://api.labelary.com/v1/printers/${DPMM[dpi]}/labels/${inches(widthDots)}x${inches(heightDots)}/0/`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "image/png", "Content-Type": "application/x-www-form-urlencoded" },
      body: zpl,
    });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    expect(response.status, await response.clone().text().catch(() => "")).toBe(200);
    const [result] = await readBarcodes(new Blob([await response.arrayBuffer()], { type: "image/png" }), {
      formats: [], textMode: "HRI", tryHarder: true,
    });
    return result;
  }
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
  });

  // GS1-128 over several symbols (backlog 1.13), stacked, each with its own element strings; every symbol read back.
  it("GS1-128 in two symbols, stacked", { timeout: 30000 }, async () => {
    const data = "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJ(15)271231(3102)001250";
    const parts = splitGs1128(data);
    expect(parts).toHaveLength(2);
    const o = { ...options(0.495, 203), parts, widthDots: Math.round(8 * 203), heightDots: Math.round(3 * 203) };
    const zpl = zplLabel("gs1-128", data, o);
    expect(zpl.match(/\^BCN/g)).toHaveLength(2);
    const inches = (dots: number) => Math.ceil((dots / 203) * 100) / 100;
    const response = await fetch(`https://api.labelary.com/v1/printers/8dpmm/labels/${inches(o.widthDots)}x${inches(o.heightDots)}/0/`, {
      method: "POST", headers: { Accept: "image/png", "Content-Type": "application/x-www-form-urlencoded" }, body: zpl,
    });
    expect(response.status).toBe(200);
    const results = await readBarcodes(new Blob([await response.arrayBuffer()], { type: "image/png" }), {
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
    expect(zpl).toContain(`^A0N,${t},${t}`);
    // Above: every text line ends above the symbol's top
    const textYs = [...zpl.matchAll(/\^FO\d+,(\d+)\^A0N/g)].map((m) => Number(m[1]));
    expect(textYs.some((ty) => ty + t <= 200)).toBe(true);
    if (position === "split") expect(textYs.some((ty) => ty > 200)).toBe(true);
    const result = await print(zpl, 203, o.widthDots, o.heightDots);
    expect(`${result?.symbologyIdentifier} ${result?.text}`).toBe(`${identifier} ${data}`);
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
