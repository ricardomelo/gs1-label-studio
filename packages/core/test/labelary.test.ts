import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  encode,
  fillTemplate,
  rasterize,
  snapToDots,
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
