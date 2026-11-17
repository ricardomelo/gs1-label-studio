import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  check, checkGroup, encode, ESTIMATE_NOTE, measureSymbol, rasterize, readingFromDecoder, scaleFromWidth, SyntaxEngine,
  type CheckContext, type DecodedSymbol, type Pixels, type Reading, type SymbologyId,
} from "../src/index.ts";

// The Check Studio's size estimates from a picture (backlog 7.1 m): symbols drawn by the studio's own encoder at known
// sizes, turned and scaled as a photograph would show them, read by ZXing, measured and estimated. The X-dimension
// estimate must fall within its own stated tolerance of the size drawn, and the tolerance must be tight enough to be
// worth having; quiet zones, bar heights, light-on-dark symbols and the 50 mm between a pack's 2D and linear symbols
// are found when they are wrong and only then. Without a scale nothing is said about a size, and nothing is a grade.

let engine: SyntaxEngine;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  engine = await SyntaxEngine.create();
});

const AT = new Date("2026-11-17T03:00:00Z");
const RETAIL: CheckContext = { environment: "retail" };

/** A white picture to draw symbols on, in grey: 255 white, 0 black. */
class Sheet {
  grey: Uint8Array;
  constructor(readonly width: number, readonly height: number, background = 255) {
    this.grey = new Uint8Array(width * height).fill(background);
  }
  /** A symbol drawn at `d` pixels a module, its top left (quiet zone excluded) at x, y. */
  draw(symbology: SymbologyId, data: string, d: number, x: number, y: number, barModules = 70, colour = 0): { width: number; height: number } {
    const bitmap = rasterize(encode(symbology, data), { dotsPerModule: d, quietZone: 0, barHeight: barModules * d });
    for (let r = 0; r < bitmap.height; r++) {
      for (let c = 0; c < bitmap.width; c++) if (bitmap.dark[r * bitmap.width + c]) this.grey[(y + r) * this.width + x + c] = colour;
    }
    return { width: bitmap.width, height: bitmap.height };
  }
  fill(x: number, y: number, w: number, h: number, colour: number) {
    for (let r = y; r < y + h; r++) this.grey.fill(colour, r * this.width + x, r * this.width + x + w);
  }
  /** The sheet turned by `degrees` about its centre and scaled by `scale`, as a camera would see it (nearest pixel). */
  photographed(degrees = 0, scale = 1): Pixels {
    const a = (degrees * Math.PI) / 180;
    const width = Math.round(this.width * scale * (Math.abs(Math.cos(a)) + 0.0)) + Math.round(this.height * scale * Math.abs(Math.sin(a)));
    const height = Math.round(this.width * scale * Math.abs(Math.sin(a))) + Math.round(this.height * scale * Math.abs(Math.cos(a)));
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const [cx, cy, sx, sy] = [width / 2, height / 2, this.width / 2, this.height / 2];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x + 0.5 - cx) / scale;
        const dy = (y + 0.5 - cy) / scale;
        const ox = Math.floor(Math.cos(a) * dx + Math.sin(a) * dy + sx);
        const oy = Math.floor(-Math.sin(a) * dx + Math.cos(a) * dy + sy);
        const g = ox >= 0 && oy >= 0 && ox < this.width && oy < this.height ? this.grey[oy * this.width + ox]! : 255;
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = g;
      }
    }
    return { width, height, data };
  }
}

/** The readings ZXing finds in a picture, each measured in it. */
async function read(pixels: Pixels): Promise<Reading[]> {
  const image = { data: pixels.data, width: pixels.width, height: pixels.height, colorSpace: "srgb" } as unknown as ImageData;
  const found = await readBarcodes(image, { formats: [], textMode: "Plain", tryHarder: true, maxNumberOfSymbols: 4 });
  // ZXing may find a short ITF inside other bars (an ITF-14 has 14 digits)
  return found.filter((symbol) => symbol.format !== "ITF" || symbol.text.length === 14).map((symbol) => {
    const reading = readingFromDecoder(symbol as unknown as DecodedSymbol, { source: "image", at: AT, image: { width: pixels.width, height: pixels.height } });
    const forms = check(engine, reading).forms;
    return { ...reading, measure: measureSymbol(reading, pixels, forms?.elementString ?? null) };
  });
}

const withScale = (reading: Reading, mmPerPixel: number, tolerance = 0.01): Reading => ({ ...reading, measure: { ...reading.measure!, scale: { mmPerPixel, tolerance } } });
const codes = (reading: Reading, context: CheckContext = RETAIL) => check(engine, reading, context).findings.map((f) => f.code).filter((c) => c.startsWith("H"));

describe("the X-dimension estimate", () => {
  // Each symbol straight, scaled and on its side; turned where ZXing gives its corners when turned (it reads a turned
  // GS1 DataBar Expanded with corners that do not follow the symbol, and no turned GS1-128 beyond a few degrees)
  const SYMBOLS: [SymbologyId, string, string, number[]][] = [
    ["ean13", "9506000134352", "EAN13", [8, 15]],
    ["gs1-128", "(01)09506000134352(10)ABC123", "Code128", [8]],
    ["gs1-datamatrix", "(01)09506000134352(17)271231(10)ABC123", "DataMatrix", [8, 15]],
    ["gs1-qrcode", "(01)09506000134352(10)ABC123", "QRCode", [8, 15]],
    ["databar-expanded", "(01)09506000134352(10)AB", "DataBarExp", []],
    ["itf14", "19506000134359", "ITF", [8]],
  ];
  for (const [symbology, data, format, turns] of SYMBOLS) {
    const cases: [number, number, number][] = [[4, 0, 1], [3, 0, 1.6], [3, 90, 1], ...turns.map((t): [number, number, number] => [5, t, 1.3])];
    for (const [d, degrees, scale] of cases) {
      it(`${symbology}, ${d} pixels a module, turned ${degrees}°, scaled ${scale}: within its tolerance`, async () => {
        const sheet = new Sheet(1300, 1000);
        sheet.draw(symbology, data, d, 120, 120, 50);
        // ZXing may also find a short ITF inside other bars: the symbol drawn is the widest of its format
        const reading = (await read(sheet.photographed(degrees, scale))).filter((r) => r.format === format).sort((a, b) => b.measure!.across - a.measure!.across)[0];
        expect(reading, "ZXing reads the symbol").toBeDefined();
        const x = 0.33;
        const result = check(engine, withScale(reading!, 0.33 / (d * scale)), RETAIL);
        const estimate = result.estimate!.xMm!;
        expect(Math.abs(estimate.value - x), `${estimate.value} ± ${estimate.tolerance}`).toBeLessThanOrEqual(estimate.tolerance);
        expect(estimate.tolerance / x, "a tolerance worth having").toBeLessThan(0.08);
      });
    }
  }

  it("takes the scale from one symbol's printed width as a ruler gives it", async () => {
    const sheet = new Sheet(900, 500);
    const { width } = sheet.draw("ean13", "9506000134352", 4, 120, 120);
    const [reading] = await read(sheet.photographed(5, 1.2));
    const printedMm = (width / 4) * 0.30; // 95 modules of 0.30 mm
    const scale = scaleFromWidth(reading!.measure!, printedMm);
    const estimate = check(engine, { ...reading!, measure: { ...reading!.measure!, scale } }, RETAIL).estimate!.xMm!;
    expect(Math.abs(estimate.value - 0.3)).toBeLessThanOrEqual(estimate.tolerance);
    expect(() => scaleFromWidth(reading!.measure!, 0)).toThrow(RangeError);
  });
});

describe("H1: the X-dimension outside the context's range", () => {
  it("is found below the least X and above the most, and not in range", async () => {
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120);
    const [reading] = await read(sheet.photographed());
    expect(codes(withScale(reading!, 0.2 / 4))).toEqual(["H1", "H3"]); // and its 70 modules are then 14 mm, short of 18.28
    expect(codes(withScale(reading!, 0.8 / 4))).toEqual(["H1"]);
    expect(codes(withScale(reading!, 0.33 / 4))).toEqual([]);
    const h1 = check(engine, withScale(reading!, 0.2 / 4), RETAIL).findings.find((f) => f.code === "H1")!;
    expect(h1.details).toMatchObject({ min: "0.264", max: "0.66", table: "1", quality: "1.5/06/660" });
  });

  it("is not assessed without a scale or without a context", async () => {
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120);
    const [reading] = await read(sheet.photographed());
    const without = check(engine, reading!, RETAIL);
    expect(without.notChecked).toContain("H1");
    expect(without.estimate!.xMm).toBeNull();
    expect(check(engine, withScale(reading!, 0.2 / 4), {}).notChecked).toContain("H1");
    expect(codes(withScale(reading!, 0.2 / 4), {})).not.toContain("H1");
  });

  it("is not said on a guess: an interval that reaches the range is not a finding", async () => {
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120);
    const [reading] = await read(sheet.photographed());
    expect(codes(withScale(reading!, 0.255 / 4, 0.05))).toEqual([]); // 0.255 ± 5 %: may be 0.264
    expect(codes(withScale(reading!, 0.255 / 4, 0.001))).toEqual(["H1"]);
  });
});

describe("H2: the quiet zone", () => {
  it("is found on the side something dark intrudes, and only there", async () => {
    const sheet = new Sheet(900, 500);
    sheet.draw("ean13", "9506000134352", 4, 200, 120);
    sheet.fill(200 - 7 * 4 - 8, 100, 8, 320, 0); // a rule 7 modules left of the bars; the EAN-13 needs 11
    const [reading] = await read(sheet.photographed());
    const h2 = check(engine, reading!, RETAIL).findings.find((f) => f.code === "H2");
    expect(h2?.details).toMatchObject({ sides: "left", left: "7", leftNeeded: "11" });
    expect(check(engine, reading!, RETAIL).estimate!.quietZone!.right).toBeGreaterThan(11);
  });

  it("is not found with clear margins, and a margin cut by the picture's edge is not judged", async () => {
    const clear = new Sheet(900, 500);
    clear.draw("ean13", "9506000134352", 4, 200, 120);
    const [ok] = await read(clear.photographed());
    expect(codes(ok!)).toEqual([]);
    const cut = new Sheet(420, 400);
    cut.draw("ean13", "9506000134352", 4, 12, 50); // 3 modules of picture left of the bars
    const [edge] = await read(cut.photographed());
    expect(check(engine, edge!, RETAIL).estimate!.quietZone!.left).toBeNull();
    expect(codes(edge!)).toEqual([]);
  });

  it("is found round a 2D symbol on all four sides", async () => {
    const sheet = new Sheet(500, 500);
    sheet.draw("gs1-qrcode", "(01)09506000134352", 5, 150, 150);
    sheet.fill(150, 150 - 2 * 5 - 6, 105, 6, 0); // a rule two modules above; a QR Code needs four
    const [reading] = await read(sheet.photographed());
    const h2 = check(engine, reading!, RETAIL).findings.find((f) => f.code === "H2");
    expect(h2?.details?.sides).toBe("top");
    // Something in one part of a side is enough: a mark over the top's first quarter only
    const part = new Sheet(500, 500);
    part.draw("gs1-qrcode", "(01)09506000134352", 5, 150, 150);
    part.fill(150, 150 - 2 * 5 - 6, 30, 6, 0);
    const [marked] = await read(part.photographed());
    expect(check(engine, marked!, RETAIL).findings.find((f) => f.code === "H2")?.details?.sides).toBe("top");
  });
});

describe("H3: bars truncated", () => {
  it("finds an EAN-13 whose bars are cut short, with or without a scale", async () => {
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120, 35);
    const [reading] = await read(sheet.photographed(6));
    expect(codes(reading!)).toEqual(["H3"]);
    expect(codes(withScale(reading!, 0.33 / 4))).toEqual(["H3"]);
    expect(check(engine, reading!, RETAIL).findings.find((f) => f.code === "H3")!.details).toMatchObject({ needed: "69.2" });
  });

  it("is not found at full height", async () => {
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120, 72);
    const [reading] = await read(sheet.photographed(6));
    expect(codes(reading!)).toEqual([]);
    expect(check(engine, reading!, RETAIL).estimate!.barHeight).toBeGreaterThan(69);
  });

  it("follows the bars of a turned picture, whose corners ZXing gives along the picture's rows", async () => {
    const sheet = new Sheet(1300, 1000);
    sheet.draw("ean13", "9506000134352", 4, 120, 120, 72);
    const [reading] = await read(sheet.photographed(23, 1.3));
    expect(check(engine, reading!, RETAIL).estimate!.barHeight).toBeGreaterThan(69);
    expect(codes(reading!)).toEqual([]);
  });
});

describe("H4: light on dark, or mirrored", () => {
  it("is a warning, a note in direct part marking, and needs no picture measure", async () => {
    const sheet = new Sheet(400, 400, 0);
    sheet.draw("gs1-datamatrix", "(01)09506000134352", 6, 120, 120, 0, 255);
    const [reading] = await read(sheet.photographed());
    expect(reading!.inverted).toBe(true);
    const warning = check(engine, { ...reading!, measure: null }, RETAIL).findings.find((f) => f.code === "H4")!;
    expect(warning.severity).toBe("warning");
    expect(check(engine, reading!, { environment: "dpm" }).findings.find((f) => f.code === "H4")!.severity).toBe("note");
    const plain = new Sheet(400, 400);
    plain.draw("gs1-datamatrix", "(01)09506000134352", 6, 120, 120);
    const [dark] = await read(plain.photographed());
    expect(codes(dark!)).toEqual([]);
  });
});

describe("J5: the 2D symbol far from the linear one", () => {
  /** An EAN-13 and a GS1 DataMatrix of one pack, the DataMatrix's farthest corner `mm` from the EAN-13's centre. */
  async function pack(mm: number) {
    const d = 4;
    const perMm = d / 0.33;
    const sheet = new Sheet(Math.round(140 * perMm), Math.round(70 * perMm));
    const ean = sheet.draw("ean13", "9506000134352", d, 60, 60, 70);
    const centre = [60 + ean.width / 2, 60 + ean.height / 2];
    const side = 18 * 4;
    const quiet = 4 * Math.SQRT2; // one module's quiet zone, along the diagonal
    const corner = centre[0]! + Math.sqrt((mm * perMm - quiet) ** 2 - (side + 60 - centre[1]!) ** 2);
    sheet.draw("gs1-datamatrix", "(01)09506000134352", d, Math.round(corner - side), 60 + 0, 0);
    const readings = (await read(sheet.photographed())).map((r) => withScale(r, 1 / perMm));
    expect(readings).toHaveLength(2);
    return checkGroup(readings.map((reading) => ({ reading, result: check(engine, reading, RETAIL) })), "consumer-pack", RETAIL);
  }

  it("is found at 60 mm and not at 40 mm", async () => {
    const far = await pack(60);
    const j5 = far.findings.find((f) => f.code === "J5")!;
    expect(j5.severity).toBe("warning");
    expect(Math.abs(Number(j5.details!.distance) - 60), j5.details!.distance).toBeLessThan(0.25); // the drawing rounds the DataMatrix to whole pixels
    const near = await pack(40);
    expect(near.findings.map((f) => f.code)).not.toContain("J5");
    expect(near.notChecked).not.toContain("J5");
  });

  it("stays not assessed without a scale", async () => {
    const sheet = new Sheet(900, 400);
    sheet.draw("ean13", "9506000134352", 4, 60, 60);
    sheet.draw("gs1-datamatrix", "(01)09506000134352", 4, 600, 60);
    const readings = await read(sheet.photographed());
    const group = checkGroup(readings.map((reading) => ({ reading, result: check(engine, reading, RETAIL) })), "consumer-pack", RETAIL);
    expect(group.findings.find((f) => f.code === "J5")?.severity).toBe("not-assessed");
    expect(group.notChecked).toContain("J5");
  });
});

describe("never a grade", () => {
  it("says it is an estimate, and no estimate or finding carries a grade", async () => {
    expect(ESTIMATE_NOTE).toMatch(/^Estimate from a photograph\. For a quality grade, have the symbol verified\.$/);
    const sheet = new Sheet(800, 500);
    sheet.draw("ean13", "9506000134352", 4, 120, 120, 35);
    const [reading] = await read(sheet.photographed());
    const result = check(engine, withScale(reading!, 0.2 / 4), RETAIL);
    const words = JSON.stringify([result.estimate, result.findings.map((f) => f.details)]);
    expect(words).not.toMatch(/grade/i);
    expect(Object.keys(result.estimate!)).toEqual(["symbol", "table", "pixelsPerModule", "xMm", "range", "quietZone", "barHeight", "quality"]);
  });
});
