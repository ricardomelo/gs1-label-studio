import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { labelSvg, layoutLabel, type LabelOptions } from "../src/index.ts";
import { hriFont } from "./font.ts";

// The SVG label as a viewer draws it (resvg), read back by ZXing: every symbol on it, with its data.
const font = hriFont();

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(svg: string) {
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#ffffff" }).render().asPng();
  const results = await readBarcodes(new Blob([new Uint8Array(png)], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const DL = "https://id.gs1.org/01/09506000134352/10/ABC123";
const ES = "(01)09506000134352(17)271231(10)ABC123";
const CASES: [string, LabelOptions, string[]][] = [
  ["QR code with a GS1 Digital Link URI and an EAN-13 beside it", {
    symbology: "dl-qrcode", data: DL, hriLines: ["(01)09506000134352", "(10)ABC123"], showHri: true,
    linear: ["ean13", "9506000134352"],
  }, ["]E0 9506000134352", `]Q1 ${DL}`]],
  ["GS1 DataMatrix in healthcare, text as outlines", {
    symbology: "gs1-datamatrix", data: ES, hriLines: ["(01)09506000134352", "(17)271231", "(10)ABC123"], showHri: true,
    environment: "healthcare", size: 120,
  }, [`]d2 ${ES}`]],
  ["Data Matrix with a URI and a UPC-E at its own size", {
    symbology: "dl-datamatrix", data: DL, hriLines: [], showHri: false, linear: ["upce", "01234565"], linearSize: 150,
  }, ["]E0 0012345000065", `]d1 ${DL}`]],
  ["GS1 QR Code, error correction H", {
    symbology: "gs1-qrcode", data: ES, hriLines: ["(01)09506000134352"], showHri: true, error: "h",
  }, [`]Q3 ${ES}`]],
  ["EAN-8 alone", { symbology: "ean8", data: "95012346", hriLines: [], showHri: true }, ["]E4 95012346"]],
  ["UPC-A alone at 80 %", { symbology: "upca", data: "614141000036", hriLines: [], showHri: true, size: 80 },
    ["]E0 0614141000036"]],
];

describe("the label's SVG, drawn and read back", () => {
  it.each(CASES)("%s", async (_name, options, expected) => {
    const svg = labelSvg(options, layoutLabel(options, font), font);
    expect(await read(svg)).toEqual(expected);
  });
});
