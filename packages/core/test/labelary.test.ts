import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { encode, MM_PER_INCH, rasterize, snapToDots, zplLabel, type SymbologyId } from "../src/index.ts";

// The ZPL the studio writes, printed by a simulated printer: Labelary (labelary.com) renders it at the printer's
// resolution as a PNG, and ZXing must read the same symbol back. The owner checks labels with Labelary's viewer, as no
// physical printer is at hand (ADR 0002). Runs where api.labelary.com is reachable and LABELARY=1 (the CI); the free
// API allows a few requests a second, hence one request at a time and few cases.
const enabled = process.env.LABELARY === "1";
const DPMM: Record<number, string> = { 203: "8dpmm", 300: "12dpmm", 600: "24dpmm" };

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function printWithLabelary(symbology: SymbologyId, data: string, xMm: number, dpi: number) {
  const { dots } = snapToDots(xMm, dpi);
  const geometry = encode(symbology, data);
  const quietZone = geometry.kind === "linear" ? 12 : 3;
  const bitmap = rasterize(geometry, { dotsPerModule: dots, quietZone, barHeight: 60 * dots });
  const margin = 20;
  const zpl = zplLabel(bitmap, {
    widthDots: bitmap.width + 2 * margin, heightDots: bitmap.height + 2 * margin, x: margin, y: margin,
  });
  const inches = (size: number) => Math.ceil(((size + 2 * margin) / dpi) * 100) / 100;
  const url = `https://api.labelary.com/v1/printers/${DPMM[dpi]}/labels/` +
    `${inches(bitmap.width)}x${inches(bitmap.height)}/0/`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { method: "POST", headers: { Accept: "image/png" }, body: zpl });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    expect(response.status, await response.clone().text().catch(() => "")).toBe(200);
    const png = new Blob([await response.arrayBuffer()], { type: "image/png" });
    const [result] = await readBarcodes(png, { formats: [], textMode: "HRI", tryHarder: true });
    return { result, printedXMm: (dots * MM_PER_INCH) / dpi };
  }
}

describe.skipIf(!enabled)("ZPL printed by Labelary and read back", () => {
  it.each<[SymbologyId, string, number, number, string, string]>([
    ["ean13", "9506000134352", 0.33, 203, "]E0", "9506000134352"],
    ["gs1-128", "(00)106141411234567897", 0.33, 203, "]C1", "(00)106141411234567897"],
    ["gs1-datamatrix", "(01)09506000134352(17)271231(10)ABC123", 0.38, 300, "]d2",
      "(01)09506000134352(17)271231(10)ABC123"],
    ["gs1-qrcode", "(01)09506000134352(21)12345", 0.495, 203, "]Q3", "(01)09506000134352(21)12345"],
    ["dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123", 0.495, 600, "]Q1",
      "https://id.gs1.org/01/09506000134352/10/ABC123"],
  ])("%s at %s mm, %i dpi", { timeout: 30000 }, async (symbology, data, xMm, dpi, identifier, text) => {
    const { result } = await printWithLabelary(symbology, data, xMm, dpi);
    expect(result?.symbologyIdentifier).toBe(identifier);
    expect(result?.text).toBe(text);
  });
});
