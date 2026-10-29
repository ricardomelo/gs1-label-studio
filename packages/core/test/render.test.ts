import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  crc32,
  fileName,
  labelPdf,
  labelPixels,
  labelPng,
  labelReadme,
  labelSvg,
  labelZip,
  layoutLabel,
  pdfContent,
  PNG_PIXELS_PER_MODULE,
  pngDpi,
  type LabelOptions,
} from "../src/index.ts";
import { hriFont } from "./font.ts";
import { decodePng } from "./png.ts";
import { fixture, optionsOf, type Resolver } from "./resolver.ts";

// PNG, PDF and zip (item 1.5) against the resolver's render_png, render_pdf and render_zip (ADR 0004), and every
// symbol in them read back by ZXing: the PNG directly, the PDF as poppler's pdftoppm draws it.

const font = hriFont();
const SLOW = 60_000; // ZXing trying harder on large images
const renders = fixture("renders.json") as {
  pngPixelsPerModule: number;
  renders: {
    options: Resolver; pdf: { mediaBox: string; content: string; info: string }; png: string; zipNames: string[];
    readme: string;
  }[];
};

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

/** The PDF as a viewer draws it: poppler's pdftoppm (in CI: the poppler-utils package), which must not complain. */
function drawPdf(pdf: Uint8Array, dpi: number): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "label-pdf-"));
  try {
    writeFileSync(join(dir, "label.pdf"), pdf);
    const run = spawnSync("pdftoppm", ["-png", "-r", String(dpi), "-singlefile", "label.pdf", "page"], {
      cwd: dir, encoding: "utf8",
    });
    expect(run.error, "pdftoppm (poppler-utils) is needed").toBeUndefined();
    expect([run.status, run.stderr]).toEqual([0, ""]);
    return new Uint8Array(readFileSync(join(dir, "page.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pdfStream(pdf: Uint8Array): string {
  const text = Buffer.from(pdf).toString("latin1");
  const start = text.indexOf("stream\n") + "stream\n".length;
  const end = text.indexOf("\nendstream");
  return inflateSync(pdf.subarray(start, end)).toString("ascii");
}

/** Every object where the cross-reference table says, and startxref pointing at it. */
function checkXref(pdf: Uint8Array) {
  const text = Buffer.from(pdf).toString("latin1");
  const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
  expect(text.slice(xref, xref + 5)).toBe("xref\n");
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  expect(offsets).toHaveLength(5);
  offsets.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`));
}

/** The reader's answers for the symbols on a resolver label. */
function expected(options: LabelOptions): string[] {
  const out = [`${options.symbology === "gs1-datamatrix" ? "]d2" : options.symbology === "dl-datamatrix" ? "]d1" : "]Q1"} ${options.data}`];
  if (options.linear) {
    const [kind, digits] = options.linear;
    // ZXing gives a UPC-E as its UPC-A, in 13 digits
    out.push(`]E0 ${kind === "upce" ? { "01234565": "0012345000065" }[digits] : digits.padStart(13, "0")}`);
  }
  return out.sort();
}

describe.each(renders.renders.map((r, i) => [i, JSON.stringify(r.options), r] as const))("render %i: %s", (_i, _name, r) => {
  const options = optionsOf(r.options);
  const layout = layoutLabel(options, font);
  const resolverPng = new Uint8Array(Buffer.from(r.png, "base64"));

  it("PDF: the resolver's page and operators; its symbol modules may differ (ADR 0004), the rest is equal", async () => {
    const { content } = pdfContent(layout, font);
    expect(r.pdf.mediaBox).toBe(`0 0 ${/0 0 ([\d.]+ [\d.]+) re f/.exec(content)![1]}`);
    const ours = content.split("\n");
    const theirs = r.pdf.content.split("\n");
    expect(ours.slice(0, 3)).toEqual(theirs.slice(0, 3));
    // The 2D symbol's rectangles come first: after them, the EAN/UPC's bars and the text's outlines.
    const rest = ours.slice(3 + layout.symbolRects);
    expect(rest).toEqual(theirs.slice(theirs.length - rest.length));

    const pdf = await labelPdf(options, layout, font);
    expect(pdfStream(pdf)).toBe(content);
    checkXref(pdf);
    const info = /5 0 obj\n(.*?)\nendobj/s.exec(Buffer.from(pdf).toString("latin1"))![1];
    expect(info).toBe(r.pdf.info.replace("(GS1 Resolver CE portal)", "(GS1 Label Studio)"));
    expect(await read(drawPdf(pdf, 600))).toEqual(expected(options));
  }, SLOW);

  it("PNG: the resolver's size and DPI, the same pixels outside the 2D symbol and the text; read back", async () => {
    expect(renders.pngPixelsPerModule).toBe(PNG_PIXELS_PER_MODULE);
    const png = await labelPng(layout, font);
    const ours = decodePng(png);
    const theirs = decodePng(resolverPng);
    expect([ours.width, ours.height, ours.perMetre]).toEqual([theirs.width, theirs.height, theirs.perMetre]);
    expect(ours.grey).toEqual(labelPixels(layout, font).grey);

    const px = PNG_PIXELS_PER_MODULE;
    const symbol = layout.rects.slice(0, layout.symbolRects);
    const left = Math.min(...symbol.map((s) => s[0])) * px;
    const top = Math.min(...symbol.map((s) => s[1])) * px;
    const right = Math.max(...symbol.map((s) => s[0] + s[2])) * px;
    const bottom = Math.max(...symbol.map((s) => s[1] + s[3])) * px;
    const boxes = layout.texts.map((t) => [
      t.x * px - 2, (t.baseline - t.em) * px, (t.x + font.textWidth(t.text, t.em)) * px + 2, (t.baseline + t.em * 0.3) * px,
    ]);
    const inside = (x: number, y: number, [l, t, rr, b]: number[]) => x >= l! && x < rr! && y >= t! && y < b!;
    let differ = 0;
    let textOurs = 0;
    let textTheirs = 0;
    let textBoth = 0;
    for (let y = 0; y < ours.height; y++) {
      for (let x = 0; x < ours.width; x++) {
        const a = ours.grey[y * ours.width + x]! < 128;
        const b = theirs.grey[y * ours.width + x]! < 128;
        if (inside(x, y, [left, top, right, bottom])) continue;
        if (boxes.some((box) => inside(x, y, box))) {
          textOurs += Number(a);
          textTheirs += Number(b);
          textBoth += Number(a && b);
        } else if (a !== b) {
          differ++;
        }
      }
    }
    expect(differ, "pixels outside the 2D symbol and the text").toBe(0);
    // Pillow draws the text through FreeType, hinted; here from the outlines, unhinted: the same glyphs, a pixel apart.
    if (boxes.length) {
      expect(textOurs / textTheirs).toBeGreaterThan(0.9);
      expect(textOurs / textTheirs).toBeLessThan(1.1);
      expect(textBoth / (textOurs + textTheirs - textBoth), "overlap of the text").toBeGreaterThan(0.6);
    }
    expect(await read(png)).toEqual(expected(options));
    expect(await read(resolverPng)).toEqual(expected(options));
  }, SLOW);

  it("zip: SVG, PNG, PDF and the resolver's README", async () => {
    const zip = await labelZip(options, layout, font, "label");
    const files = unzip(zip);
    expect([...files.keys()]).toEqual(r.zipNames);
    const svg = labelSvg(options, layout, font);
    expect(new TextDecoder().decode(files.get("label.svg"))).toBe(svg);
    expect(files.get("label.png")).toEqual(await labelPng(layout, font));
    expect(files.get("label.pdf")).toEqual(await labelPdf(options, layout, font));
    const readme = new TextDecoder().decode(files.get("README.txt"));
    expect(readme).toBe(r.readme.replace("Data Matrix with a GS1 Digital Link URI:", "Data Matrix (GS1 Digital Link):"));
    expect(readme).toBe(labelReadme(options, layout));
  }, SLOW);
});

/** A zip reader for the tests: the central directory, each local header, inflated and checked against its CRC. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  expect(at + view.getUint32(end + 12, true)).toBe(end);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(zip.subarray(local + 4, local + 30)).toEqual(zip.subarray(at + 6, at + 32));
    const size = view.getUint32(local + 18, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = new Uint8Array(inflateRawSync(zip.subarray(start, start + size)));
    expect(data.length).toBe(view.getUint32(local + 22, true));
    expect(crc32(data)).toBe(view.getUint32(local + 14, true));
    files.set(name, data);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return files;
}

describe("files", () => {
  it("records the DPI as Pillow did: pixels per metre, rounded", async () => {
    const layout = layoutLabel({ symbology: "ean13", data: "9506000134352", hriLines: [], showHri: false, size: 90 }, font);
    expect(layout.xMm).toBeCloseTo(0.297, 12);
    expect(decodePng(await labelPng(layout, font)).perMetre).toBe(40404); // 1026.26 dpi: 40404.04 per metre
  });

  it("names files as the resolver did", () => {
    expect(fileName("qrcode_01_09506000134352_10_ABC/1 2")).toBe("qrcode_01_09506000134352_10_ABC-1-2");
  });
});
