import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { designFor, fieldsOf, identify, labelFor, printFileFor, syntaxEngine, type SyntaxEngine } from "@gs1-label-studio/core";
import { drawPdf } from "../../core/test/files.ts";
import { hriFont } from "../../core/test/font.ts";
import { run } from "../src/main.ts";

// gs1ls (backlog 5.1 a, ADR 0009): the check of one reading and one label in every format, from the sources and from
// the bundle Node runs; every symbol drawn read back by ZXing (symbology identifier and data), the print files the
// core's own for the same design.

const BUNDLE = new URL("../dist/gs1ls.mjs", import.meta.url).pathname;
const DATA = "(01)09506000134376(10)B42(17)271231";
const URI = "https://id.gs1.org/01/09506000134376/10/B42?17=271231";
let engine: SyntaxEngine;

beforeAll(async () => {
  engine = await syntaxEngine();
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(png: Uint8Array): Promise<string[]> {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const svgPng = (svg: Uint8Array) => new Uint8Array(new Resvg(new TextDecoder().decode(svg), { fitTo: { mode: "zoom", value: 8 }, background: "white" }).render().asPng());

/** A run whose -o file is kept in memory rather than written. */
async function label(args: string[]): Promise<{ status: number; name?: string; bytes?: Uint8Array; stderr: string }> {
  let written: { name: string; bytes: Uint8Array } | undefined;
  const result = await run(["label", ...args], (name, bytes) => (written = { name, bytes }));
  return { status: result.status, stderr: result.stderr, ...(written ?? {}) };
}

describe("gs1ls check", () => {
  it("says whether the data follows the rules, how to fix each fault, as text or JSON, in its exit status", async () => {
    const good = await run(["check", DATA]);
    expect(good.status).toBe(0);
    expect(good.stdout).toContain("Follows the GS1 rules checked.");
    expect(good.stdout).toContain(`GS1 Digital Link URI: ${URI}`);
    const bad = await run(["check", "(01)09506000134377(10)B42"]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^Does not follow the GS1 rules\.\n\nC1 \(error\) AI \(01\): Wrong check digit/);
    expect(bad.stdout).toContain("  expected: 6\n");
    const json = JSON.parse((await run(["check", "--json", "(01)09506000134377(10)B42"])).stdout as string);
    expect(json.verdict).toBe("does-not-follow");
    expect(json.findings[0]).toMatchObject({ code: "C1", severity: "error", ai: "01", details: { expected: "6" } });
    // a scanner's text with its symbology identifier and a group separator written {GS}
    expect((await run(["check", "]d2010950600013437610B42{GS}17271231"])).status).toBe(0);
    // a separator at the end: a remark, which still follows the rules
    const remark = await run(["check", "]d2010950600013437610B42{GS}"]);
    expect([remark.status, (remark.stdout as string).split("\n")[0]]).toEqual([0, "Follows the GS1 rules checked, with remarks."]);
    expect(remark.stdout).toContain("B5 (warning)");
  });
});

describe("gs1ls label", () => {
  it("draws the symbol step 2 recommends, read back in SVG, PNG and PDF; EPS is the core's", async () => {
    const svg = await label([DATA, "--format", "svg"]);
    expect([svg.status, svg.name, svg.stderr]).toEqual([0, "dl-qrcode_09506000134376.svg", "dl-qrcode_09506000134376.svg\n"]);
    // the QR code with the EAN-13 beside it, as step 2 recommends a batch and a date at the point of sale
    expect(await read(svgPng(svg.bytes!))).toEqual(["]E0 9506000134376", `]Q1 ${URI}`]);
    const png = await label([DATA, "--format", "png", "-o", "out.png"]);
    expect(png.name).toBe("out.png");
    expect(await read(png.bytes!)).toEqual(["]E0 9506000134376", `]Q1 ${URI}`]);
    const pdf = await label([DATA, "--format", "pdf"]);
    expect(await read(drawPdf(pdf.bytes!, 600))).toEqual(["]E0 9506000134376", `]Q1 ${URI}`]);
    const eps = new TextDecoder().decode((await label([DATA, "--format", "eps"])).bytes);
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
  });

  it("takes the symbol, environment, size and text named", async () => {
    const dm = await label(["(01)09506000134376(10)B42", "--symbol", "gs1-datamatrix", "--environment", "healthcare", "--format", "png", "--hri", "none"]);
    expect(dm.name).toBe("gs1-datamatrix_09506000134376.png");
    expect(await read(dm.bytes!)).toEqual(["]d2 (01)09506000134376(10)B42"]);
    // the human readable text: the key's alone, then none
    const texts = await Promise.all(["full", "key", "none"].map(async (hri) =>
      (await label(["(01)09506000134376(10)B42", "--symbol", "gs1-datamatrix", "--environment", "healthcare", "--format", "svg", "--hri", hri])).bytes!.length));
    expect(texts[0]).toBeGreaterThan(texts[1]!);
    expect(texts[1]).toBeGreaterThan(texts[2]!);
    const sscc = await label(["(00)106141411234567897", "--format", "svg"]);
    expect(await read(svgPng(sscc.bytes!))).toEqual(["]C1 (00)106141411234567897"]);
    const small = await label(["(01)09506000134376", "--format", "svg", "--size", "80"]);
    const full = await label(["(01)09506000134376", "--format", "svg"]);
    expect(small.bytes!.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(small.bytes)).not.toBe(new TextDecoder().decode(full.bytes));
  });

  it("writes each printer language as the core does for the same design", async () => {
    const identified = identify(engine, fieldsOf(engine.parse("(00)106141411234567897")));
    const design = designFor(identified);
    const drawn = labelFor(identified, design, hriFont());
    for (const [format, extension] of [["zpl", "zpl"], ["tspl", "prn"], ["epl2", "epl"], ["dpl", "dpl"], ["ppla", "ppla"], ["pplb", "pplb"]] as const) {
      const file = await label(["(00)106141411234567897", "--format", format, "--dpi", "300"]);
      expect(file.name, format).toBe(`gs1-128_106141411234567897_300dpi.${extension}`);
      expect(new TextDecoder().decode(file.bytes), format).toBe(printFileFor(format, drawn, design, 300));
    }
  });

  it("refuses what it cannot do: a usage error 2, data or a design refused 1, in the core's words", async () => {
    expect(await label([DATA, "--format", "gif"])).toMatchObject({ status: 2, stderr: expect.stringContaining("Unknown format: gif. Use one of: svg, png") });
    expect(await label([DATA, "--dpi", "250"])).toMatchObject({ status: 2 });
    expect(await label([DATA, "--size", "big"])).toMatchObject({ status: 2, stderr: "--size takes a number.\n" });
    expect(await label(["(01)09506000134376", "--symbol", "gs1-128", "--environment", "retail"])).toMatchObject({ status: 1, stderr: expect.stringContaining("no row for GS1-128") });
    expect(await label(["(01)09506000134377"])).toMatchObject({ status: 1, stderr: expect.stringMatching(/check digit/i) });
    expect(await label([DATA, "--format", "pplb"])).toMatchObject({ status: 1, stderr: expect.stringContaining("PPLB has no QR code") });
    expect((await run(["label"])).status).toBe(2);
    expect((await run(["frobnicate", "x"])).status).toBe(2);
    expect((await run(["check", "x", "--colour"])).status).toBe(2);
    expect(await run([])).toMatchObject({ status: 2, stderr: expect.stringContaining("Usage:") });
  });
});

describe("the bundle Node runs", () => {
  // Node's own warnings (a proxy set for the tests' network) left out of the child's standard error
  const env = { ...process.env, NODE_NO_WARNINGS: "1" };
  const gs1ls = (...args: string[]) => spawnSync(process.execPath, [BUNDLE, ...args], { encoding: "buffer", env });

  it("draws a label to standard output, read back, and says its version and usage", async () => {
    const png = gs1ls("label", DATA, "--format", "png", "-o", "-");
    expect([png.status, png.stderr.toString()]).toEqual([0, ""]);
    expect(await read(new Uint8Array(png.stdout))).toEqual(["]E0 9506000134376", `]Q1 ${URI}`]);
    // The release, as the root package.json carries it, and the commit (backlog 0.4)
    const release = (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string }).version;
    expect(gs1ls("--version").stdout.toString()).toMatch(new RegExp(`^gs1ls ${release.replaceAll(".", "\\.")} \\([0-9a-f]{7,}\\)\n$`));
    expect(gs1ls("--help").stdout.toString()).toContain("gs1ls check <data> [--json]");
    const bad = gs1ls("check", "(01)09506000134377");
    expect([bad.status, bad.stdout.toString().split("\n")[0]]).toEqual([1, "Does not follow the GS1 rules."]);
    expect(gs1ls("label", DATA, "--format", "gif").status).toBe(2);
  });

  it("writes a tag's EPC with the schemes bundled (backlog 5.1 b)", () => {
    const epc = gs1ls("epc", "(01)09506000134352(21)12345", "--prefix-length", "7");
    expect([epc.status, epc.stderr.toString()]).toEqual([0, ""]);
    expect(epc.stdout.toString()).toContain("EPC Pure Identity URI: urn:epc:id:sgtin:9506000.013435.12345\n");
  });

  it("serves the API until stopped, on the port it names (backlog 5.1 c)", async () => {
    const child = spawn(process.execPath, [BUNDLE, "serve", "--port", "0"], { env });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        child.stderr.on("data", (chunk: Buffer) => resolve(chunk.toString()));
        child.once("exit", (code) => reject(new Error(`gs1ls serve stopped with ${code}`)));
      });
      const url = line.match(/^gs1ls serving on (http:\/\/127\.0\.0\.1:\d+\/v1\/) /)![1];
      const out = await (await fetch(`${url}check`, { method: "POST", body: JSON.stringify({ data: DATA }) })).json();
      expect(out.verdict).toBe("follows");
    } finally {
      child.kill();
    }
  });
});
