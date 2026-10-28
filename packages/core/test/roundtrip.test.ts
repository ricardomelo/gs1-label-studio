import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { bitmapToGraphicField, encode, EncodeError, rasterize, toSvg, type SymbologyId } from "../src/index.ts";

// Every symbol is read back by an independent decoder (ZXing): the symbology identifier and the data must come out as
// they went in. This is what proves that the encoder, the geometry and the rasteriser agree.
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function decode(symbology: SymbologyId, data: string) {
  const bitmap = rasterize(encode(symbology, data), { dotsPerModule: 4, quietZone: 10 });
  const rgba = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
  bitmap.dark.forEach((dark, index) => {
    rgba.fill(dark ? 0 : 255, index * 4, index * 4 + 3);
    rgba[index * 4 + 3] = 255;
  });
  const image = { data: rgba, width: bitmap.width, height: bitmap.height, colorSpace: "srgb" } as ImageData;
  const [result] = await readBarcodes(image, { formats: [], textMode: "HRI", tryHarder: true });
  return result;
}

describe("encode, rasterise and read back", () => {
  it.each<[SymbologyId, string, string, string]>([
    ["ean13", "9506000134352", "]E0", "9506000134352"],
    ["ean8", "95012346", "]E4", "95012346"],
    // A UPC-A reads as the EAN-13 it is, with a leading zero (the GTIN-13 form of a GTIN-12).
    ["upca", "614141000036", "]E0", "0614141000036"],
    ["itf14", "19506000134359", "]I1", "19506000134359"],
    ["gs1-128", "(00)106141411234567897", "]C1", "(00)106141411234567897"],
    ["gs1-128", "(01)09506000134352(10)ABC123", "]C1", "(01)09506000134352(10)ABC123"],
    ["gs1-datamatrix", "(01)09506000134352(17)271231(10)ABC123", "]d2", "(01)09506000134352(17)271231(10)ABC123"],
    ["gs1-qrcode", "(01)09506000134352(21)12345", "]Q3", "(01)09506000134352(21)12345"],
    [
      "dl-qrcode",
      "https://id.gs1.org/01/09506000134352/10/ABC123",
      "]Q1",
      "https://id.gs1.org/01/09506000134352/10/ABC123",
    ],
    ["dl-datamatrix", "https://id.gs1.org/01/09506000134352", "]d1", "https://id.gs1.org/01/09506000134352"],
  ])("%s %s", async (symbology, data, identifier, text) => {
    const result = await decode(symbology, data);
    expect(result?.symbologyIdentifier).toBe(identifier);
    expect(result?.text).toBe(text);
  });

  it("refuses a wrong check digit and a malformed element string", () => {
    expect(() => encode("ean13", "9506000134353")).toThrow(EncodeError);
    expect(() => encode("gs1-datamatrix", "(01)09506000134353")).toThrow(EncodeError);
    expect(() => encode("gs1-128", "(17)271331")).toThrow(EncodeError);
  });
});

describe("exports", () => {
  it("sizes the SVG in millimetres from the X-dimension", () => {
    const svg = toSvg(encode("gs1-datamatrix", "(01)09506000134352"), { xMm: 0.5, quietZone: 1 });
    // 16 × 16 modules (FNC1 and 16 digits) plus one module of quiet zone each side.
    expect(svg).toContain('width="9mm" height="9mm"');
  });

  it("packs a graphic field row by row, eight dots a byte", () => {
    const field = bitmapToGraphicField({ width: 9, height: 1, dark: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 1]) });
    expect(field).toBe("^GFA,2,2,2,8180");
  });
});
