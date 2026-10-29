import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  expectedReads,
  labelEps,
  labelPng,
  labelReadme,
  labelSvg,
  layoutLabel,
  pdfContent,
  pngAt,
  specificationFor,
  type LabelOptions,
} from "../src/index.ts";
import { hriFont } from "./font.ts";
import { decodePng } from "./png.ts";

// The rest of item 1.5: EPS, process black alone (100 % K), bar width reduction and a PNG at a chosen resolution. The
// EPS is drawn by Ghostscript (in CI: the ghostscript package) and read back by ZXing, as the PDF is by poppler.

const font = hriFont();
const SLOW = 60_000;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(png: Uint8Array) {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

/** The EPS as Ghostscript draws it, cropped to its bounding box; Ghostscript must not complain. */
function drawEps(eps: string, dpi: number): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "label-eps-"));
  try {
    writeFileSync(join(dir, "label.eps"), eps);
    const run = spawnSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=pnggray", `-r${dpi}`,
      "-o", "page.png", "label.eps"], { cwd: dir, encoding: "utf8" });
    expect(run.error, "Ghostscript is needed").toBeUndefined();
    expect([run.status, run.stderr]).toEqual([0, ""]);
    return new Uint8Array(readFileSync(join(dir, "page.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const GTIN = "(01)09506000134352";
const sized = (symbology: LabelOptions["symbology"], data: string, table: number, extra: Partial<LabelOptions> = {}): LabelOptions => ({
  symbology, data, hriLines: [], showHri: true, spec: specificationFor(table, symbology)!, table, ...extra,
});
const CASES: [string, LabelOptions][] = [
  ["a QR code with a GS1 Digital Link URI and an EAN-13 beside it", {
    symbology: "dl-qrcode", data: "https://id.gs1.org/01/09506000134352/10/ABC123", hriLines: ["(01)09506000134352"],
    showHri: true, linear: ["ean13", "9506000134352"],
  }],
  ["an ITF-14 with its bearer frame", sized("itf14", "15400141288763", 2)],
  ["a GS1 DataBar Stacked Omnidirectional", sized("databar-stacked-omni", GTIN, 1, { hriLines: [GTIN] })],
  ["a QR code of version 15, its modules in several paths", {
    symbology: "dl-qrcode", data: "https://id.gs1.org/01/09506000134352/10/ABC123", hriLines: [], showHri: false,
    version: 15, error: "h",
  }],
];

describe("EPS: the PDF's drawing in PostScript", () => {
  it.each(CASES)("%s: drawn by Ghostscript and read back", async (_name, options) => {
    const layout = layoutLabel(options, font);
    const eps = labelEps(options, layout, font);
    const { width, height } = pdfContent(layout, font);
    const lines = eps.split("\n");
    expect(lines[0]).toBe("%!PS-Adobe-3.0 EPSF-3.0");
    expect(lines).toContain(`%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`);
    expect(lines).toContain(`%%HiResBoundingBox: 0 0 ${width.toFixed(3)} ${height.toFixed(3)}`);
    expect(lines).toContain("%%DocumentProcessColors: Black");
    // Every rectangle and outline of the PDF, in the same order.
    expect(lines.filter((l) => / (re|m|l|c)$/.test(l))).toEqual(
      pdfContent(layout, font).content.split("\n").filter((l) => / (re|m|l|c)$/.test(l)));
    // No path holds more than 400 rectangles.
    if (options.version === 15) expect(layout.rects.length).toBeGreaterThan(1000);
    let open = 0;
    for (const line of lines) {
      open = line.endsWith(" re") ? open + 1 : line === "f" ? 0 : open;
      expect(open).toBeLessThanOrEqual(400);
    }
    expect(await read(drawEps(eps, 600))).toEqual(expectedReads(options));
  }, SLOW);
});

describe("process black alone (100 % K)", () => {
  it("paints the PDF and the EPS in DeviceCMYK: white, then black as K only; no grey", () => {
    const options = CASES[1]![1];
    const layout = layoutLabel(options, font);
    const ops = pdfContent(layout, font).content.split("\n");
    expect(ops[0]).toBe("0 0 0 0 k");
    expect(ops[2]).toBe("0 0 0 1 k");
    expect(ops.filter((op) => / (g|rg|k)$/.test(op))).toEqual(["0 0 0 0 k", "0 0 0 1 k"]);
  });
});

describe("bar width reduction", () => {
  it("narrows every bar of a linear symbol by the reduction, half on each side, and nothing else", () => {
    const options = CASES[0]![1];
    const full = layoutLabel(options, font);
    const reduced = layoutLabel({ ...options, barWidthReduction: 0.03 }, font);
    const cut = 0.03 / full.xMm;
    const [from, to] = full.barRects!;
    expect(to - from).toBeGreaterThan(20);
    full.rects.forEach((rect, i) => {
      const [x, y, w, h] = reduced.rects[i]!;
      if (i >= from && i < to) {
        expect(x).toBeCloseTo(rect[0] + cut / 2, 12);
        expect(w).toBeCloseTo(rect[2] - cut, 12);
      } else {
        expect([x, w]).toEqual([rect[0], rect[2]]); // the QR code's modules
      }
      expect([y, h]).toEqual([rect[1], rect[3]]);
    });
    expect(reduced.width).toBe(full.width);
  });

  it("leaves ITF-14's bearer bars as they are", () => {
    const options = CASES[1]![1];
    const full = layoutLabel(options, font);
    const reduced = layoutLabel({ ...options, barWidthReduction: 0.05 }, font);
    expect(full.barRects![0]).toBe(4);
    expect(reduced.rects.slice(0, 4)).toEqual(full.rects.slice(0, 4));
    expect(reduced.rects[4]![2]).toBeCloseTo(full.rects[4]![2] - 0.05 / full.xMm, 12);
  });

  it("says so in the SVG and the README, and is read back", async () => {
    const options = { ...CASES[2]![1], barWidthReduction: 0.02 };
    const layout = layoutLabel(options, font);
    expect(labelSvg(options, layout, font)).toContain(", bars reduced by 0.020 mm (bar width reduction).</desc>");
    expect(labelReadme(options, layout)).toContain(
      "Prepress: bars reduced by 0.020 mm (bar width reduction); black is 100 % K in the PDF and EPS");
    expect(await read(await labelPng(layout, font))).toEqual(expectedReads(options));
  }, SLOW);

  it("refuses a reduction that leaves a bar of no width", () => {
    expect(() => layoutLabel({ ...CASES[1]![1], barWidthReduction: 0.5 }, font)).toThrow(RangeError);
  });
});

describe("a PNG at a chosen resolution", () => {
  it("takes the whole number of pixels a module nearest to it and records the resolution chosen", async () => {
    const layout = layoutLabel(CASES[1]![1], font); // X = 0.495 mm
    const at300 = pngAt(layout, 300);
    expect(at300).toEqual({ pixelsPerModule: 6, dpi: 300, xMm: (6 * 25.4) / 300 }); // 5.85 pixels → 6: X 0.508 mm
    const png = decodePng(await labelPng(layout, font, at300.pixelsPerModule, at300.dpi));
    expect(png.perMetre).toBe(11811); // 300 dpi
    expect(png.width).toBe(Math.round(layout.width * 6));
    expect(pngAt(layout, 72).pixelsPerModule).toBe(1); // never less than a pixel
    expect(await read(await labelPng(layout, font, at300.pixelsPerModule, at300.dpi))).toEqual(expectedReads(CASES[1]![1]));
  }, SLOW);
});
