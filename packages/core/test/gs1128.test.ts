import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  dataCharacters,
  expectedReads,
  labelPdf,
  labelSvg,
  layoutLabel,
  parseElementString,
  specificationFor,
  splitGs1128,
  encode,
  gs1128StackDots,
  labelFor,
  syntaxEngine,
  widthInModules,
  zplLabel,
  zplOptionsFor,
  type LabelDesign,
  type LabelOptions,
} from "../src/index.ts";
import { drawPdf } from "./files.ts";
import { hriFont } from "./font.ts";

// GS1-128 over several symbols (backlog 1.13; General Specifications 26.0, 5.4.4.3): at most 48 data characters and
// 165.10 mm a symbol, the key in the first, stacked; each symbol read back by ZXing.

const font = hriFont();
const SLOW = 90_000;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(png: Uint8Array) {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 6,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const LONG = "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJ(15)271231(3102)001250";
const lines = (data: string) => parseElementString(data).map((e) => `(${e.ai})${e.value}`);
const options = (data: string, extra: Partial<LabelOptions> = {}): LabelOptions => ({
  symbology: "gs1-128", data, hriLines: lines(data), showHri: true, spec: specificationFor(5, "gs1-128")!, table: 5, size: 100, ...extra,
});

describe("splitting", () => {
  it("counts data characters as section 5.4.4.3 does: AIs, data and a separating FNC1 after a variable length", () => {
    expect(dataCharacters(parseElementString("(01)09506000134376(10)AB(17)271231"))).toBe(16 + 4 + 1 + 8);
    expect(dataCharacters(parseElementString("(01)09506000134376(17)271231(10)AB"))).toBe(16 + 8 + 4);
  });

  it("keeps the order and the key first, as many as fit in each; or where the person starts a symbol", () => {
    expect(dataCharacters(parseElementString(LONG))).toBe(72); // 20 + 16 + 4 + FNC1 + 12 + FNC1 + 8 + 10
    expect(splitGs1128(LONG)).toEqual(["(00)106141411234567897(02)09506000134376(37)24", "(10)ABCDEFGHIJ(15)271231(3102)001250"]);
    expect(splitGs1128(LONG, [5, 3, 3])).toEqual(["(00)106141411234567897(02)09506000134376(37)24", "(10)ABCDEFGHIJ(15)271231", "(3102)001250"]);
    expect(splitGs1128("(01)09506000134376(10)AB")).toEqual(["(01)09506000134376(10)AB"]);
    expect(() => splitGs1128(LONG, [5])).toThrow(/at most 48 data characters .* has 62/);
    expect(() => splitGs1128(`(01)09506000134376(8200)${"x".repeat(45)}`)).toThrow(/\(8200\)x+ has 49/);
  });
});

describe("the stacked symbols", () => {
  it("stacks them on the left, each with its own text, read back from the SVG and the PDF", async () => {
    const o = options(LONG);
    const layout = layoutLabel(o, font);
    expect(layout.parts).toEqual(splitGs1128(LONG));
    expect(layout.texts.map((t) => t.text).join("")).toBe(LONG);
    const expected = expectedReads(o);
    expect(expected).toEqual(splitGs1128(LONG).map((part) => `]C1 ${part}`).sort());
    const svg = labelSvg(o, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng())).toEqual(expected);
    expect(await read(drawPdf(await labelPdf(o, layout, font), 400))).toEqual(expected);
    // The second symbol starts below the first one's text, a quiet zone's 10X on from its margin
    const firstText = layout.texts.find((t) => t.text.startsWith("(00)"))!;
    const secondTop = Math.min(...layout.rects.filter((r) => r[1] > firstText.baseline).map((r) => r[1]));
    expect(secondTop - firstText.baseline).toBeGreaterThan(10);
  }, SLOW);

  it("splits where a symbol would pass 165.10 mm, and refuses one element string that would", () => {
    const wide = "(01)09506000134376(10)ABCDEFGHIJKL(240)ABCDEFGHIJKL";
    expect(dataCharacters(parseElementString(wide))).toBeLessThanOrEqual(48);
    const big = options(wide);
    const layout = layoutLabel(big, font);
    expect(layout.parts!.length).toBeGreaterThan(1);
    expect(layout.width * layout.xMm).toBeLessThanOrEqual(165.1 + 4 * layout.xMm);
    expect(() => layoutLabel(options(`(01)09506000134376(8200)${"X".repeat(30)}`, ), font)).toThrow(/at most 165.10 mm long/);
  });
});

describe("in ZPL", () => {
  it("stacks a ^BC a symbol on a label as wide as the widest and as high as the stack", async () => {
    const engine = await syntaxEngine();
    const design: LabelDesign = {
      symbology: "gs1-128", hri: "full", version: null, error: "m", size: 100, linear: "none", linearSize: null, bearer: "frame",
      reduction: 0, spec: specificationFor(5, "gs1-128")!, table: 5,
    };
    const drawn = labelFor(engine.parse(LONG) as never, design, font);
    const o = zplOptionsFor(drawn, design, 203);
    expect(o.parts).toEqual(splitGs1128(LONG));
    const widest = Math.max(...o.parts!.map((part) => widthInModules(encode("gs1-128", part))));
    expect(o.widthDots).toBeGreaterThanOrEqual(o.x + widest * o.dotsPerModule);
    expect(o.heightDots).toBeGreaterThanOrEqual(o.y + (o.parts!.length - 1) * gs1128StackDots(o) + o.barHeightDots);
    const zpl = zplLabel("gs1-128", drawn.data, o);
    expect(zpl.match(/\^BCN/g)).toHaveLength(2);
    expect(zpl).toContain(`^FO${o.x},${o.y + gs1128StackDots(o)}^BY`);
  });
});
