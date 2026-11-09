import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  CROP_MARKS,
  expectedReads,
  labelEps,
  labelPdf,
  labelZip,
  labelPng,
  labelReadme,
  SYNTAX_ENGINE,
  labelSvg,
  layoutLabel,
  pdfContent,
  pngAt,
  pyFixed,
  specificationFor,
  type LabelOptions,
} from "../src/index.ts";
import { hriFont } from "./font.ts";
import { decodePng, type DecodedPng } from "./png.ts";
import { drawPdf, unzip } from "./files.ts";

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
    // The tool, and the engine release that checked the data.
    expect(lines).toContain(`%%Creator: GS1 Label Studio, data checked by the GS1 Barcode Syntax Engine ${SYNTAX_ENGINE.release}`);
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

  it("goes in the zip, and the README gives its resolution and the X-dimension it prints at", async () => {
    const options = CASES[1]![1];
    const layout = layoutLabel(options, font); // X = 0.495 mm
    const files = unzip(await labelZip(options, layout, font, "itf", undefined, false, 300));
    const png = files.get("itf.png")!;
    expect(png).toEqual(await labelPng(layout, font, 6, 300));
    expect(decodePng(png).perMetre).toBe(11811);
    expect(await read(png)).toEqual(expectedReads(options));
    const readme = new TextDecoder().decode(files.get("README.txt")).split("\r\n");
    expect(readme).toContain(`PNG: 300 dpi, 6 pixels a module, so it prints at X = 0.508 mm, ${pyFixed(layout.width * 0.508, 1)} x ` +
      `${pyFixed(layout.height * 0.508, 1)} mm`);
    expect(readme.indexOf(readme.find((l) => l.startsWith("PNG:"))!)).toBeLessThan(readme.findIndex((l) => l.startsWith("Label size:")));
    expect(labelReadme(options, layout, false, 72)).toContain("PNG: 72 dpi, 1 pixel a module, so it prints at X = 0.353 mm");
    // Without a choice: the PNG at the label's size, the README as before.
    const plain = unzip(await labelZip(options, layout, font, "itf"));
    expect(plain.get("itf.png")).toEqual(await labelPng(layout, font));
    expect(new TextDecoder().decode(plain.get("README.txt"))).toBe(labelReadme(options, layout));
    expect(labelReadme(options, layout)).not.toContain("PNG:");
  }, SLOW);
});

// Crop marks (the rest of item 1.5): a page 10 mm larger on every side, two hairlines at each corner of the label, 3 mm
// outside its edges and 5 mm long, in process black; the PDF's TrimBox and BleedBox are the label. Drawn by poppler and
// Ghostscript: the symbol read back, each mark where it belongs, and nothing else outside the label.

const PT = 72 / 25.4; // points a millimetre

/** The eight marks as segments, in points from the bottom left of a page with crop marks around a label w × h points. */
function markSegments(w: number, h: number): [number, number, number, number][] {
  const [m, o, l] = [CROP_MARKS.marginMm * PT, CROP_MARKS.offsetMm * PT, CROP_MARKS.lengthMm * PT];
  const segments: [number, number, number, number][] = [];
  for (const x of [m, m + w]) {
    for (const y of [m, m + h]) {
      const sx = x === m ? -1 : 1;
      const sy = y === m ? -1 : 1;
      segments.push([x + sx * o, y, x + sx * (o + l), y], [x, y + sy * o, x, y + sy * (o + l)]);
    }
  }
  return segments;
}

/** Each mark drawn along its length, and every dark pixel outside the label on one of them. */
function checkMarks(image: DecodedPng, dpi: number, w: number, h: number) {
  const scale = dpi / 72;
  const pageH = h + 2 * CROP_MARKS.marginMm * PT;
  const px = (x: number, y: number) => [x * scale, (pageH - y) * scale] as const; // image pixels, from the top left
  const dark = (x: number, y: number) => image.grey[y * image.width + x]! < 128;
  const segments = markSegments(w, h).map(([x1, y1, x2, y2]) => [...px(x1, y1), ...px(x2, y2)] as const);
  for (const [x1, y1, x2, y2] of segments) {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const [x, y] = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
      const near = [-2, -1, 0, 1, 2].some((d) => (x1 === x2 ? dark(Math.round(x) + d, Math.round(y)) : dark(Math.round(x), Math.round(y) + d)));
      expect(near, `a mark at ${x.toFixed(0)}, ${y.toFixed(0)}`).toBe(true);
    }
  }
  const [left, top] = px(CROP_MARKS.marginMm * PT, CROP_MARKS.marginMm * PT + h);
  const [right, bottom] = px(CROP_MARKS.marginMm * PT + w, CROP_MARKS.marginMm * PT);
  const onMark = (x: number, y: number) => segments.some(([x1, y1, x2, y2]) =>
    x1 === x2
      ? Math.abs(x - x1) <= 3 && y >= Math.min(y1, y2) - 3 && y <= Math.max(y1, y2) + 3
      : Math.abs(y - y1) <= 3 && x >= Math.min(x1, x2) - 3 && x <= Math.max(x1, x2) + 3);
  let outside = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (x >= left - 2 && x <= right + 2 && y >= top - 2 && y <= bottom + 2) continue;
      if (!dark(x, y)) continue;
      outside++;
      expect(onMark(x, y), `a dark pixel at ${x}, ${y}, outside the label and off the marks`).toBe(true);
    }
  }
  expect(outside).toBeGreaterThan(8 * CROP_MARKS.lengthMm * (dpi / 25.4)); // eight marks, at least a pixel wide
}

describe("crop marks", () => {
  const options = CASES[1]![1]; // ITF-14: its bearer frame on the label's edges
  const layout = layoutLabel(options, font);
  const plain = pdfContent(layout, font);
  const margin = CROP_MARKS.marginMm * PT;

  it("puts the label on a page 10 mm larger on every side, its TrimBox and BleedBox the label, the marks in K alone", async () => {
    const page = pdfContent(layout, font, true);
    expect(page.width).toBeCloseTo(plain.width + 2 * margin, 9);
    expect(page.height).toBeCloseTo(plain.height + 2 * margin, 9);
    expect(page.trim).toEqual([margin, margin, plain.width, plain.height]);
    const ops = page.content.split("\n");
    expect(ops[0]).toBe("q 1 0 0 1 28.346 28.346 cm");
    expect(ops.slice(1, 1 + plain.content.split("\n").length).join("\n")).toBe(plain.content); // the label as it was
    expect(ops.filter((op) => / (g|G|rg|RG|k|K)$/.test(op))).toEqual(["0 0 0 0 k", "0 0 0 1 k", "0 0 0 1 K"]);
    expect(ops.slice(-11)).toEqual(["0 0 0 1 K", "0.250 w", ...markSegments(plain.width, plain.height).map(([x1, y1, x2, y2]) =>
      `${x1.toFixed(3)} ${y1.toFixed(3)} m ${x2.toFixed(3)} ${y2.toFixed(3)} l`), "S"]);
    const pdf = Buffer.from(await labelPdf(options, layout, font, true)).toString("latin1");
    const box = [margin, margin, margin + plain.width, margin + plain.height].map((v) => v.toFixed(3)).join(" ");
    expect(pdf).toContain(`/MediaBox [0 0 ${page.width.toFixed(3)} ${page.height.toFixed(3)}] /TrimBox [${box}] /BleedBox [${box}] `);
    // Without crop marks, the page is the label, as the resolver's: no TrimBox.
    expect(Buffer.from(await labelPdf(options, layout, font)).toString("latin1")).not.toContain("/TrimBox");
    expect(pdfContent(layout, font, false)).toEqual(plain);
  });

  it("is drawn by poppler: the symbol read back, each mark in place, nothing else outside the label", async () => {
    const image = drawPdf(await labelPdf(options, layout, font, true), 600);
    expect(await read(image)).toEqual(expectedReads(options));
    checkMarks(decodePng(image), 600, plain.width, plain.height);
  }, SLOW);

  it("is drawn by Ghostscript from the EPS, its bounding box the page: the same", async () => {
    const page = pdfContent(layout, font, true);
    const eps = labelEps(options, layout, font, true);
    expect(eps.split("\n")).toContain(`%%HiResBoundingBox: 0 0 ${page.width.toFixed(3)} ${page.height.toFixed(3)}`);
    expect(eps.split("\n")).toContain("%%DocumentProcessColors: Black");
    const image = drawEps(eps, 600);
    expect(await read(image)).toEqual(expectedReads(options));
    checkMarks(decodePng(image), 600, plain.width, plain.height);
  }, SLOW);

  it("goes in the zip's PDF and EPS, and the README says so", async () => {
    const files = unzip(await labelZip(options, layout, font, "itf", undefined, true));
    expect(Buffer.from(files.get("itf.pdf")!).toString("latin1")).toContain("/TrimBox");
    expect(new TextDecoder().decode(files.get("itf.eps")).split("\n")).toContain(
      `%%HiResBoundingBox: 0 0 ${(plain.width + 2 * margin).toFixed(3)} ${(plain.height + 2 * margin).toFixed(3)}`);
    expect(new TextDecoder().decode(files.get("README.txt")).split("\r\n")).toContain(
      "Crop marks: in the PDF and EPS, 3 mm outside the label's edges, on a page 10 mm larger on every side; the PDF's TrimBox is the label");
    const without = unzip(await labelZip(options, layout, font, "itf"));
    expect(new TextDecoder().decode(without.get("README.txt"))).not.toContain("Crop marks");
    expect(Buffer.from(without.get("itf.pdf")!).toString("latin1")).not.toContain("/TrimBox");
  });
});
