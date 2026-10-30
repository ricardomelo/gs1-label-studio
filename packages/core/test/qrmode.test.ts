import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  encode,
  expectedReads,
  labelFor,
  labelSvg,
  qrModeProblem,
  syntaxEngine,
  upperCaseDomain,
  type LabelDesign,
  type SyntaxEngine,
} from "../src/index.ts";
import { hriFont } from "./font.ts";

// QR Code's encoding modes (backlog 1.14; ISO/IEC 18004): one mode for the whole data, through an encoder that takes
// segments; each read back by ZXing, the version the mode's capacity gives.

const font = hriFont();
let engine: SyntaxEngine;

beforeAll(async () => {
  engine = await syntaxEngine();
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(svg: string) {
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng();
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), { formats: [], tryHarder: true });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`);
}

const UPPER = "HTTPS://ID.GS1.ORG/01/09506000134376/10/B42"; // 43 characters
const version = (rows: number) => (rows - 17) / 4;

describe("one mode for the whole data", () => {
  it("takes the version each mode's capacity gives at level M (v3: 61 alphanumeric, 42 bytes; v4: 62 bytes)", () => {
    const rows = (mode: "alphanumeric" | "byte") => {
      const g = encode("dl-qrcode", UPPER, { eclevel: "M", mode });
      return g.kind === "matrix" ? g.rows : 0;
    };
    expect(version(rows("alphanumeric"))).toBe(3);
    expect(version(rows("byte"))).toBe(4);
    const digits = encode("dl-qrcode", "0".repeat(34), { eclevel: "M", mode: "numeric" }); // v1-M: 34 digits
    expect(digits.kind === "matrix" && version(digits.rows)).toBe(1);
  });

  it("refuses what a mode cannot encode, naming the character", () => {
    expect(qrModeProblem("https://id.gs1.org/01/09506000134376", "alphanumeric")).toMatch(/alphanumeric mode cannot encode “h”/);
    expect(qrModeProblem("HTTPS://ID.GS1.ORG/01/09506000134376?17=271231", "alphanumeric")).toMatch(/“\?”/);
    expect(qrModeProblem(UPPER, "numeric")).toMatch(/numeric mode cannot encode “H”: it takes digits only/);
    expect(qrModeProblem("anything at all", "byte")).toBeNull();
    expect(() => encode("dl-qrcode", "https://id.gs1.org", { mode: "alphanumeric" })).toThrow(/cannot encode “h”/);
    expect(() => encode("gs1-qrcode", "(01)09506000134376", { mode: "byte" })).toThrow(/Digital Link URI only/);
  });

  it("writes a URI's scheme and domain in capitals, never its path or query", () => {
    expect(upperCaseDomain("https://id.gs1.org/01/09506000134376/10/b42?17=271231")).toBe("HTTPS://ID.GS1.ORG/01/09506000134376/10/b42?17=271231");
    expect(upperCaseDomain("https://brand.example.com")).toBe("HTTPS://BRAND.EXAMPLE.COM");
  });
});

describe("a label in each mode, read back", () => {
  const DESIGN: LabelDesign = {
    symbology: "dl-qrcode", hri: "full", version: null, error: "m", environment: "retail", size: 100, linear: "none", linearSize: null,
    bearer: "frame", reduction: 0,
  };
  it.each([
    ["alphanumeric, capitals in the domain", { qrMode: "alphanumeric", qrUpperDomain: true }, UPPER],
    ["byte", { qrMode: "byte" }, "https://id.gs1.org/01/09506000134376/10/B42"],
    ["byte with capitals in the domain", { qrMode: "byte", qrUpperDomain: true }, UPPER],
  ] as const)("%s", async (_name, extra, uri) => {
    const identified = engine.parse("(01)09506000134376(10)B42", "https://id.gs1.org");
    const drawn = labelFor(identified as never, { ...DESIGN, ...extra }, font);
    expect(drawn.data).toBe(uri);
    expect(drawn.layout.version).toBe(extra.qrMode === "alphanumeric" ? 3 : 4);
    expect(drawn.geometry.kind === "matrix" && drawn.geometry.rows).toBe(drawn.layout.modules);
    expect(await read(labelSvg(drawn.options, drawn.layout, font))).toEqual(expectedReads(drawn.options));
    expect(expectedReads(drawn.options)).toEqual([`]Q1 ${uri}`]);
  });

  it("refuses alphanumeric for a URI with a query string or lower-case path; a version too small says so", () => {
    const identified = engine.parse("(01)09506000134376(10)B42(17)271231", "https://id.gs1.org");
    expect(() => labelFor(identified as never, { ...DESIGN, qrMode: "alphanumeric", qrUpperDomain: true }, font)).toThrow(/“\?”/);
    const plain = engine.parse("(01)09506000134376(10)B42", "https://id.gs1.org");
    expect(() => labelFor(plain as never, { ...DESIGN, qrMode: "byte", version: 2 }, font)).toThrow(/2-M/);
  });
});
