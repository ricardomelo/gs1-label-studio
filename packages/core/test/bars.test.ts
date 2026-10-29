import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  encode,
  labelPdf,
  labelPng,
  labelReadme,
  labelSvg,
  layoutLabel,
  OutOfRange,
  PNG_PIXELS_PER_MODULE,
  specificationFor,
  type LabelOptions,
  type Layout,
  type SymbologyId,
} from "../src/index.ts";
import { hriFont } from "./font.ts";

// Item 1.3: ITF-14, GS1-128 and the GS1 DataBar family laid out as the GS1 General Specifications place them (release
// 26.0: sections 4.14, 5.3.2 and the symbol specification tables of 5.12.3), and every symbol read back by ZXing from
// the SVG (as resvg draws it), the PNG and the PDF (as poppler draws it).

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

function drawPdf(pdf: Uint8Array, dpi: number): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "bars-pdf-"));
  try {
    writeFileSync(join(dir, "label.pdf"), pdf);
    const run = spawnSync("pdftoppm", ["-png", "-r", String(dpi), "-singlefile", "label.pdf", "page"], { cwd: dir, encoding: "utf8" });
    expect(run.error, "pdftoppm (poppler-utils) is needed").toBeUndefined();
    expect([run.status, run.stderr]).toEqual([0, ""]);
    return new Uint8Array(readFileSync(join(dir, "page.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The options as the editor gives them: the symbol's row of the table, at a size of its base X-dimension. */
function options(symbology: SymbologyId, data: string, hriLines: string[], table: number, size = 100, extra: Partial<LabelOptions> = {}): LabelOptions {
  const spec = specificationFor(table, symbology)!;
  expect(spec, `table ${table} allows ${symbology}`).toBeDefined();
  return { symbology, data, hriLines, showHri: true, size, spec, table, ...extra };
}

const GTIN = "(01)09506000134352";
const CASES: [string, LabelOptions, string][] = [
  ["ITF-14, table 2, bearer frame", options("itf14", "15400141288763", ["(01)15400141288763"], 2), "]I1 15400141288763"],
  ["ITF-14, table 6 at 80 %, bearer bars", options("itf14", "15400141288763", [], 6, 80, { bearer: "bars" }),
    "]I1 15400141288763"],
  ["GS1-128, table 5, an SSCC", options("gs1-128", "(00)106141411234567897", ["(00)106141411234567897"], 5),
    "]C1 (00)106141411234567897"],
  ["GS1-128, table 9 at 150 %", options("gs1-128", "(414)9506000134352(254)A1", ["(414)9506000134352", "(254)A1"], 9, 150),
    "]C1 (414)9506000134352(254)A1"],
  ["GS1 DataBar Omnidirectional, table 1", options("databar-omni", GTIN, [GTIN], 1), `]e0 ${GTIN}`],
  ["GS1 DataBar Truncated, table 4", options("databar-truncated", GTIN, [GTIN], 4), `]e0 ${GTIN}`],
  ["GS1 DataBar Stacked, table 2", options("databar-stacked", GTIN, [GTIN], 2), `]e0 ${GTIN}`],
  ["GS1 DataBar Stacked Omnidirectional, table 1", options("databar-stacked-omni", GTIN, [GTIN], 1), `]e0 ${GTIN}`],
  ["GS1 DataBar Limited, table 6 at 150 %", options("databar-limited", GTIN, [GTIN], 6, 150), `]e0 ${GTIN}`],
  ["GS1 DataBar Expanded, table 11", options("databar-expanded", "(8018)950600013435200008(8019)12",
    ["(8018)950600013435200008", "(8019)12"], 11), "]e0 (8018)950600013435200008(8019)12"],
  ["GS1 DataBar Expanded Stacked, table 3", options("databar-expanded-stacked", `${GTIN}(3103)001250(15)271231`,
    [GTIN, "(3103)001250", "(15)271231"], 3), `]e0 ${GTIN}(3103)001250(15)271231`],
];

describe("ITF-14, GS1-128 and GS1 DataBar: the label read back from every file", () => {
  it.each(CASES)("%s: SVG, PNG and PDF", async (_name, o, reads) => {
    const layout = layoutLabel(o, font);
    const svg = labelSvg(o, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng())).toEqual([reads]);
    expect(await read(await labelPng(layout, font))).toEqual([reads]);
    expect(await read(drawPdf(await labelPdf(o, layout, font), 600))).toEqual([reads]);
  }, SLOW);
});

/** The bars' bounding box, in the label's units (the bearer bars left out). */
function bars(layout: Layout, bearerRects = 0) {
  const rects = layout.rects.slice(bearerRects);
  const left = Math.min(...rects.map(([x]) => x));
  const right = Math.max(...rects.map(([x, , w]) => x + w));
  const top = Math.min(...rects.map(([, y]) => y));
  const bottom = Math.max(...rects.map(([, y, , h]) => y + h));
  return { left, right, top, bottom };
}

describe("ITF-14 (section 5.3.2)", () => {
  it("is as wide as section 5.3.2.2's expression at the target ratio 2.5, with quiet zones of 10X", () => {
    // W = (P(4N+6)+N+6)X+2Q; the section's example: X = 1.016 mm, N = 2.5, Q = 10.16 mm, W = 142.75 mm.
    const o = options("itf14", "15400141288763", [], 2, 200, { bearer: "bars" }); // 0.990 mm
    const layout = layoutLabel(o, font);
    const { left, right } = bars(layout, 2);
    expect((right - left) * layout.xMm).toBeCloseTo((7 * (4 * 2.5 + 6) + 2.5 + 6) * 0.99, 9);
    // The bearer bars span the quiet zones: 10X each side of the bars.
    const [top, bottom] = layout.rects;
    expect(top![0]).toBeCloseTo(left - 10, 9);
    expect(top![2]).toBeCloseTo(right - left + 20, 9);
    expect(bottom![2]).toBe(top![2]);
  });

  it("has a frame 4.83 mm thick around the symbol and its quiet zones, or bars of 2X at the top and bottom", () => {
    const frame = layoutLabel(options("itf14", "15400141288763", [], 2), font);
    expect(frame.rects.slice(0, 4).map(([, , w, h]) => Math.min(w, h) * frame.xMm)).toEqual(
      [4.83, 4.83, 4.83, 4.83].map((t) => expect.closeTo(t, 9)));
    const inner = bars(frame, 4);
    // The vertical sections enclose the quiet zones; the horizontal ones butt against the bars.
    expect(frame.rects[2]![0] + frame.rects[2]![2]).toBeCloseTo(inner.left - 10, 9);
    expect(frame.rects[0]![1] + frame.rects[0]![3]).toBeCloseTo(inner.top, 9);
    expect(frame.rects[1]![1]).toBeCloseTo(inner.bottom, 9);

    const plain = layoutLabel(options("itf14", "15400141288763", [], 2, 100, { bearer: "bars" }), font);
    expect(plain.rects.slice(0, 2).map(([, , , h]) => h)).toEqual([2, 2]);
  });

  it("has bars as high as the table asks, its 14 digits below at least 1.02 mm from the bearer bar", () => {
    const layout = layoutLabel(options("itf14", "15400141288763", ["(01)15400141288763"], 2), font);
    const { top, bottom } = bars(layout, 4);
    expect((bottom - top) * layout.xMm).toBeCloseTo(31.75, 9);
    expect(layout.barHeight! * layout.xMm).toBeCloseTo(31.75, 9);
    expect(layout.texts.map((t) => t.text)).toEqual(["15400141288763"]);
    const frameBottom = layout.rects[1]![1] + layout.rects[1]![3];
    const capTop = layout.texts[0]!.baseline - (font.capHeight * layout.texts[0]!.em) / font.unitsPerEm;
    expect((capTop - frameBottom) * layout.xMm).toBeCloseTo(1.02, 9); // section 5.3.2.2
    expect(((layout.texts[0]!.baseline - capTop) * layout.xMm)).toBeCloseTo(2.2, 9); // never below 2 mm (4.14, 2.a.iii)
  });
});

describe("GS1-128 and GS1 DataBar (sections 4.14, 5.12.3)", () => {
  it("keeps GS1-128's quiet zones of 10X and its minimum bar height", () => {
    const o = options("gs1-128", "(00)106141411234567897", ["(00)106141411234567897"], 5);
    const layout = layoutLabel(o, font);
    const { left, right, top, bottom } = bars(layout);
    const width = encode("gs1-128", o.data).kind === "linear" ? right - left : 0;
    expect((bottom - top) * layout.xMm).toBeCloseTo(31.75, 9);
    // The text is narrower than the symbol here: the label is the bars, their quiet zones and the margins.
    expect(layout.width - width).toBeCloseTo(20 + 4, 9);
  });

  it("puts the element strings under the symbol on as few lines as its width allows, never breaking one", () => {
    // At X = 0.250 mm (table 9) the digits' text is wider than their bars.
    const strings = ["(01)09506000134352", "(17)271231", "(21)12345678901234567890", "(30)12345678"];
    const o = options("gs1-128", strings.join(""), strings, 9);
    const layout = layoutLabel(o, font);
    const lines = layout.texts.map((t) => t.text);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(strings.join(""));
    for (const line of lines) expect(strings.some((s) => line.startsWith(s))).toBe(true);
    const { left, right } = bars(layout);
    for (const t of layout.texts) expect(font.textWidth(t.text, t.em)).toBeLessThanOrEqual(right - left + 20 + 1e-9);
  });

  it("grows a stacked symbol's rows to the table's height, its separators one module each", () => {
    // Table 1: GS1 DataBar Stacked Omnidirectional at least 31.37 mm high at X = 0.330 mm: rows of 46X, not 33X.
    const layout = layoutLabel(options("databar-stacked-omni", GTIN, [], 1), font);
    expect(layout.barHeight! * layout.xMm).toBeGreaterThanOrEqual(31.37 - 1e-9);
    const heights = [...new Set(layout.rects.map(([, , , h]) => Number(h.toFixed(9))))].sort((a, b) => a - b);
    expect(heights).toEqual([1, (layout.barHeight! - 3) / 2].map((h) => Number(h.toFixed(9))));
    // Table 2: GS1 DataBar Stacked at 8.58 mm for X = 0.660 mm, its least height of 13X.
    const stacked = layoutLabel(options("databar-stacked", GTIN, [], 2), font);
    expect(stacked.barHeight).toBe(13);
  });

  it("refuses a size outside the row's range", () => {
    expect(() => layoutLabel(options("gs1-128", "(00)106141411234567897", [], 5, 200), font)).toThrow(OutOfRange);
  });

  it("describes the symbol in the SVG and the README", () => {
    const o = options("itf14", "15400141288763", [], 2);
    const layout = layoutLabel(o, font);
    const line = "ITF-14: X = 0.495 mm, 100 % of the target 0.495 mm of table 2 (GS1 General Specifications 5.12.3.2), " +
      "bars 31.75 mm high, quiet zones 10X and 10X, a bearer bar frame 4.83 mm thick, wide-to-narrow ratio 2.5";
    expect(labelSvg(o, layout, font)).toContain(`<desc>${line}.</desc>`);
    expect(labelReadme(o, layout).split("\r\n")).toContain(line);
    expect(labelReadme(o, layout).split("\r\n")).toContain("Human readable text: 15400141288763");
  });
});

describe("a 2D symbol of a table without a scanning environment (12, 13)", () => {
  it("is laid out at its row's X-dimension, with its text, and read back", async () => {
    const data = "(01)09506000134352(21)ABC";
    const o = options("gs1-datamatrix", data, ["(01)09506000134352", "(21)ABC"], 12);
    const layout = layoutLabel(o, font);
    expect(layout.xMm).toBe(0.38);
    expect(layout.texts).toHaveLength(2);
    expect(await read(await labelPng(layout, font))).toEqual([`]d2 ${data}`]);
    expect(labelReadme(o, layout)).toContain("GS1 DataMatrix: X = 0.380 mm, 100 % of the target 0.380 mm of table 12");
    expect(PNG_PIXELS_PER_MODULE).toBe(12);
  }, SLOW);
});
