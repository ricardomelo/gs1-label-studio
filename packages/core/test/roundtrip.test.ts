import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { bitmapToGraphicField, encode, graphicFields, EncodeError, rasterize, toSvg, type SymbologyId } from "../src/index.ts";

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
    ["databar-omni", "(01)09506000134352", "]e0", "(01)09506000134352"],
    ["databar-truncated", "(01)09506000134352", "]e0", "(01)09506000134352"],
    ["databar-stacked", "(01)09506000134352", "]e0", "(01)09506000134352"],
    ["databar-stacked-omni", "(01)09506000134352", "]e0", "(01)09506000134352"],
    ["databar-limited", "(01)15012345678907", "]e0", "(01)15012345678907"],
    ["databar-expanded", "(01)09506000134352(10)ABC123", "]e0", "(01)09506000134352(10)ABC123"],
    ["databar-expanded-stacked", "(01)09506000134352(3103)001250(10)ABC123(21)12345", "]e0",
      "(01)09506000134352(3103)001250(10)ABC123(21)12345"],
  ])("%s %s", async (symbology, data, identifier, text) => {
    const result = await decode(symbology, data);
    expect(result?.symbologyIdentifier).toBe(identifier);
    expect(result?.text).toBe(text);
  });

  it("refuses a wrong check digit and a malformed element string", () => {
    expect(() => encode("ean13", "9506000134353")).toThrow(EncodeError);
    expect(() => encode("gs1-datamatrix", "(01)09506000134353")).toThrow(EncodeError);
    expect(() => encode("gs1-128", "(17)271331")).toThrow(EncodeError);
    expect(() => encode("databar-limited", "(01)25012345678901")).toThrow(EncodeError);
  });

  it("gives a stacked GS1 DataBar its rows at their least heights (ISO/IEC 24724)", () => {
    const rows = (symbology: SymbologyId, data: string) => {
      const geometry = encode(symbology, data);
      if (geometry.kind !== "matrix") throw new Error("not rows");
      const heights: number[] = [];
      for (let r = 0; r < geometry.rows; r++) {
        const same = r > 0 && geometry.dark.slice(r * geometry.cols, (r + 1) * geometry.cols)
          .every((d, c) => d === geometry.dark[(r - 1) * geometry.cols + c]);
        if (same) heights[heights.length - 1]!++;
        else heights.push(1);
      }
      return heights;
    };
    expect(rows("databar-stacked", "(01)09506000134352")).toEqual([5, 1, 7]);
    expect(rows("databar-stacked-omni", "(01)09506000134352")).toEqual([33, 1, 1, 1, 33]);
    expect(rows("databar-expanded-stacked", "(01)09506000134352(3103)001250(10)ABC123(21)12345")).toEqual(
      [34, 1, 1, 1, 34, 1, 1, 1, 34, 1, 1, 1, 34]);
  });
});

describe("exports", () => {
  it("sizes the SVG in millimetres from the X-dimension", () => {
    const svg = toSvg(encode("gs1-datamatrix", "(01)09506000134352"), { xMm: 0.5, quietZone: 1 });
    // 16 × 16 modules (FNC1 and 16 digits) plus one module of quiet zone each side.
    expect(svg).toContain('width="9mm" height="9mm"');
  });

  it("splits an image larger than a graphic field into stripes", () => {
    // 1600 dots wide (200 bytes a row) and 1200 rows: 240 000 bytes, so 499 rows a field and three fields.
    const bitmap = { width: 1600, height: 1200, dark: new Uint8Array(1600 * 1200) };
    const fields = graphicFields(bitmap, 10, 20);
    expect(fields.map((field) => field.slice(0, field.indexOf("^GFA")))).toEqual(["^FO10,20", "^FO10,519", "^FO10,1018"]);
    expect(fields.map((field) => field.split(",")[2])).toEqual(["99800", "99800", "40400"]);
    expect(() => bitmapToGraphicField(bitmap)).toThrow();
  });

  it("packs a graphic field row by row, eight dots a byte", () => {
    const field = bitmapToGraphicField({ width: 9, height: 1, dark: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 1]) });
    expect(field).toBe("^GFA,2,2,2,8180");
  });

  // ZPL's ASCII compression (ZPL II Programming Guide, "Alternative Data Compression Scheme"): each token as the guide
  // writes it, and every field expanded again by the guide's rules to the uncompressed dots
  it("compresses a graphic field with ZPL's repeat counts, row fills and repeated rows", () => {
    const rows = (width: number, ...dark: ((x: number) => boolean)[]) => ({
      width, height: dark.length, dark: Uint8Array.from(dark.flatMap((d) => Array.from({ length: width }, (_, x) => Number(d(x))))),
    });
    // 64 dots, 16 digits a row: trailing white of an odd count keeps one 0; the same row again; trailing black of an
    // odd count keeps one F; 16 eights; a white row; a black row; a row ending in 14 white digits
    const small = rows(64, (x) => x < 4, (x) => x < 4, (x) => x >= 4, (x) => x % 4 === 0, () => false, () => true, (x) => x < 8);
    expect(bitmapToGraphicField(small)).toBe("^GFA,56,56,8,F0,:0F!V8,!FF,");
    expect(bitmapToGraphicField(small, 0, small.height, false)).toBe(
      "^GFA,56,56,8,F000000000000000F0000000000000000FFFFFFFFFFFFFFF8888888888888888" + "0".repeat(16) + "F".repeat(16) + "FF" + "0".repeat(14));
    // Runs past 19 and 400 digits: 26 B's (g L), the guide's 327 (v M), 850 (z z h P); a row of 1308 dots ends in
    // half a byte of padding, a single 0 left as it is
    const b = (x: number) => x % 4 !== 1;
    const data = (field: string) => field.split(",").slice(4).join(",");
    expect(data(bitmapToGraphicField(rows(104, b)))).toBe("gLB");
    expect(data(bitmapToGraphicField(rows(1308, b)))).toBe("vMB0");
    expect(data(bitmapToGraphicField(rows(3400, b)))).toBe("zzhPB");
    // Runs of two are as short as they are, a single trailing 0 too; two trailing F's are an exclamation mark, two 0s a
    // comma; four F's are J F
    expect(data(bitmapToGraphicField(rows(16, (x) => x < 4 || (x >= 8 && x < 12))))).toBe("F0F0");
    expect(data(bitmapToGraphicField(rows(16, (x) => x < 4 || (x >= 8 && x < 16))))).toBe("F0!");
    expect(data(bitmapToGraphicField(rows(16, (x) => x < 8)))).toBe("FF,");
    expect(data(bitmapToGraphicField(rows(24, (x) => x < 16)))).toBe("JF,");
  });

  it("expands every compressed graphic field, by the guide's rules, to the dots it holds", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 200; n++) {
      // Rows of a few dark runs, often the row above again, at widths that are and are not whole bytes
      const width = 1 + Math.floor(random() * 900);
      const height = 1 + Math.floor(random() * 12);
      const dark = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        if (y > 0 && random() < 0.3) dark.copyWithin(y * width, (y - 1) * width, y * width);
        else for (let run = Math.floor(random() * 5); run > 0; run--) {
          const from = Math.floor(random() * width);
          dark.fill(1, y * width + from, y * width + Math.min(width, from + Math.floor(random() * width)));
        }
      }
      const bitmap = { width, height, dark };
      const [, , , bytesPerRow, plain] = bitmapToGraphicField(bitmap, 0, height, false).split(",");
      const data = bitmapToGraphicField(bitmap).split(",").slice(4).join(",");
      expect(expandGraphicData(data, Number(bytesPerRow))).toBe(plain);
      expect(data.length).toBeLessThanOrEqual(plain!.length);
    }
  });

  it("makes an image's graphic fields several times smaller", () => {
    const bitmap = rasterize(encode("gs1-datamatrix", "(01)09506000134352(21)ABCDEFGH12345"), { dotsPerModule: 24, quietZone: 3 });
    const compressed = graphicFields(bitmap, 0, 0).join("");
    const plain = graphicFields(bitmap, 0, 0, false).join("");
    expect(compressed.match(/\^GFA,\d+,\d+,\d+,/g)).toEqual(plain.match(/\^GFA,\d+,\d+,\d+,/g));
    expect(compressed.length * 10).toBeLessThan(plain.length);
  });
});

/**
 * A graphic field's ASCII data expanded as the ZPL II Programming Guide describes it, independently of the studio's
 * writer: G to Y count 1 to 19 and g to z 20 to 400, added together until a digit; a comma fills the row with 0 and an
 * exclamation mark with F, each from a whole byte; a colon at a row's start repeats the row above.
 */
function expandGraphicData(data: string, bytesPerRow: number): string {
  const rows: string[] = [];
  let row = "";
  let count = 0;
  const digits = bytesPerRow * 2;
  for (const c of data) {
    if (c === ":") {
      expect(row).toBe("");
      expect(rows.length).toBeGreaterThan(0);
      rows.push(rows[rows.length - 1]!);
      continue;
    }
    if (c === "," || c === "!") {
      expect(row.length % 2).toBe(0);
      expect(count).toBe(0);
      row = row.padEnd(digits, c === "," ? "0" : "F");
    } else if (c >= "G" && c <= "Y") count += c.charCodeAt(0) - 70;
    else if (c >= "g" && c <= "z") count += (c.charCodeAt(0) - 102) * 20;
    else {
      expect(c).toMatch(/[0-9A-F]/);
      row += c.repeat(count || 1);
      count = 0;
    }
    expect(row.length).toBeLessThanOrEqual(digits);
    if (row.length === digits) [rows[rows.length], row] = [row, ""];
  }
  expect(row).toBe("");
  return rows.join("");
}

