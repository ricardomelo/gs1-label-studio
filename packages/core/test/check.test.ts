import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import bwipjs from "bwip-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  check, encode, faultOfEngineMessage, rasterize, readingFromDecoder, readingFromNdef, readingFromText, ndefUriMessage, SYMBOLOGIES,
  SyntaxEngine, type CheckResult, type DecodedSymbol, type Reading, type SymbologyId,
} from "../src/index.ts";

// The Check Studio's check of one reading (backlog 7.1 b): groups A (the carrier) and B (the structure of the element
// strings), the named repairs, and the engine's own faults reported for every element string, not only the first.
// The fault corpus is drawn by bwip-js with each fault in it, read back by ZXing, and checked: the check must find
// exactly that fault at those bytes. The clean corpus is every symbol the studio's own encoder makes: no finding.

let engine: SyntaxEngine;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  engine = await SyntaxEngine.create();
});

const GS = "\u001d";
const AT = new Date("2026-11-15T23:00:00Z");

async function drawn(bcid: string, text: string, extra: Record<string, unknown> = {}): Promise<Reading> {
  const svg = bwipjs.toSVG({ bcid, text, scale: 3, includetext: false, ...extra } as never);
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 3 }, background: "#fff" }).render().asPng();
  const [symbol] = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>]), { formats: [], textMode: "Plain", tryHarder: true });
  if (!symbol) throw new Error(`ZXing read nothing of ${bcid} ${text}`);
  return readingFromDecoder(symbol as DecodedSymbol, { source: "image", at: AT });
}

const pasted = (text: string) => readingFromText(text, { source: "wedge", at: AT });

/** The findings as "code severity [start,end]…" lines, the easiest to compare and to read in a failure. */
const summary = (result: CheckResult) => result.findings.map((f) => `${f.code} ${f.severity} ${f.ranges.map((r) => `[${r[0]},${r[1]}]`).join("")}`.trim());

interface Case {
  code: string;
  bcid: string;
  text: string;
  extra?: Record<string, unknown>;
  /** The identifier ZXing gives, to prove the symbol is the wrong one meant. */
  identifier: string;
  findings: string[];
  fixed?: string;
}

const FNC1 = "^FNC1";
const PARSE = { parsefnc: true };

// One symbol for each fault of groups A and B that a symbol can show (A9 is a symbol the decoder cannot read: DotCode)
const CORPUS: Case[] = [
  { code: "A1", bcid: "datamatrix", text: "010950600013435210ABC123", identifier: "]d1", findings: ["A1 error"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "A2", bcid: "qrcode", text: "010950600013435210ABC123", identifier: "]Q1", findings: ["A2 error"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "A3", bcid: "code128", text: "010950600013435210ABC123", identifier: "]C0", findings: ["A3 error"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "A4", bcid: "datamatrix", text: "FNC1010950600013435210ABC123", identifier: "]d1", findings: ["A4 error [0,4]"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "A5", bcid: "datamatrix", text: "^029010950600013435210ABC123", extra: { parse: true }, identifier: "]d1", findings: ["A5 error [0,1]"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "A6", bcid: "datamatrix", text: `${FNC1}https://id.gs1.org/01/09506000134352`, extra: PARSE, identifier: "]d2", findings: ["A6 error"] },
  { code: "A7", bcid: "interleaved2of5", text: "950600013435", identifier: "]I0", findings: ["A7 error [0,12]"] },
  { code: "A8", bcid: "code39", text: "ABC123", identifier: "]A0", findings: ["A8 note"] },
  { code: "B1", bcid: "datamatrix", text: `${FNC1}(01)09506000134352(10)ABC123`, extra: PARSE, identifier: "]d2", findings: [], fixed: "(01)09506000134352(10)ABC123" },
  { code: "B2", bcid: "datamatrix", text: `${FNC1}0109506000134352 10ABC123`, extra: PARSE, identifier: "]d2", findings: ["B2 error [16,17]"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "B3", bcid: "datamatrix", text: `${FNC1}010950600013435210ABCDEFGHIJKLMNOPQRST17271231`, extra: PARSE, identifier: "]d2", findings: ["B3 error [38,38]", "B11 note [38,46]"], fixed: "(01)09506000134352(10)ABCDEFGHIJKLMNOPQRST(17)271231" },
  { code: "B4", bcid: "datamatrix", text: `${FNC1}0109506000134352${FNC1}10ABC123`, extra: PARSE, identifier: "]d2", findings: ["B4 warning [16,17]"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "B5", bcid: "datamatrix", text: `${FNC1}010950600013435210ABC123${FNC1}`, extra: PARSE, identifier: "]d2", findings: ["B5 warning [24,25]"], fixed: "(01)09506000134352(10)ABC123" },
  { code: "B6", bcid: "datamatrix", text: `${FNC1}010950600013435210ABC123{GS}17271231`, extra: PARSE, identifier: "]d2", findings: ["B6 error [24,28]", "B11 note [28,36]"], fixed: "(01)09506000134352(10)ABC123(17)271231" },
  { code: "B7", bcid: "datamatrix", text: `${FNC1}01095060001343528912`, extra: PARSE, identifier: "]d2", findings: ["B7 error [16,20]"] },
  { code: "B8", bcid: "datamatrix", text: `${FNC1}010950600013435`, extra: PARSE, identifier: "]d2", findings: ["B8 error [2,15]"] },
  { code: "B9", bcid: "datamatrix", text: `${FNC1}010950600013435210ABC#123`, extra: PARSE, identifier: "]d2", findings: ["B9 error [21,22]"] },
  { code: "B10", bcid: "datamatrix", text: `${FNC1}010950600013435210A${FNC1}10B`, extra: PARSE, identifier: "]d2", findings: ["B10 error [16,19][20,23]"] },
  { code: "B11", bcid: "datamatrix", text: `${FNC1}10ABC123${FNC1}0109506000134352`, extra: PARSE, identifier: "]d2", findings: ["B11 note [9,25]"] },
  {
    code: "B12", bcid: "code128", text: `${FNC1}010950600013435210ABCDEFGHIJKLMNOPQRST${FNC1}21ABCDEFGHIJKLMN`, extra: PARSE, identifier: "]C1",
    findings: ["B12 error [0,55]"],
  },
];

describe("the fault corpus: each fault of groups A and B drawn in a symbol, read back by ZXing and found at its bytes", () => {
  it.each(CORPUS)("$code ($bcid)", async (c) => {
    const reading = await drawn(c.bcid, c.text, c.extra);
    expect(reading.symbologyIdentifier).toBe(c.identifier);
    const result = check(engine, reading);
    const expected = c.code === "B1" ? ["B1 error [0,1][3,4][18,19][21,22]"] : c.findings;
    expect(summary(result)).toEqual(expected);
    if (c.fixed) expect(result.findings.find((f) => f.code === c.code)?.fixedData).toBe(c.fixed);
    else expect(result.findings.every((f) => f.fixedData === undefined)).toBe(true);
  });

  it("A9: a reading with no data, as from a symbol the decoder finds and cannot read, is not assessed", () => {
    const result = check(engine, pasted(""));
    expect(summary(result)).toEqual(["A9 not-assessed"]);
    expect(result.verdict).toBe("not-assessed");
  });
});

// The studio's own symbols: every symbology it makes, encoded, rasterised and read back by ZXing
const CLEAN: [SymbologyId, string][] = [
  ["ean13", "9506000134352"], ["ean8", "95012346"], ["upca", "614141000036"], ["upce", "01234565"], ["itf14", "19506000134359"],
  ["gs1-128", "(00)106141411234567897"], ["gs1-128", "(01)09506000134352(10)ABC123"],
  ["gs1-datamatrix", "(01)09506000134352(17)271231(10)ABC123"], ["gs1-qrcode", "(01)09506000134352(21)12345"],
  ["dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123"], ["dl-datamatrix", "https://id.gs1.org/01/09506000134352"],
  ["databar-omni", "(01)09506000134352"], ["databar-truncated", "(01)09506000134352"], ["databar-stacked", "(01)09506000134352"],
  ["databar-stacked-omni", "(01)09506000134352"], ["databar-limited", "(01)15012345678907"],
  ["databar-expanded", "(01)09506000134352(10)ABC123"], ["databar-expanded-stacked", "(01)09506000134352(3103)001250(10)ABC123(21)12345"],
];

describe("the clean corpus: every symbol the studio makes follows the rules", () => {
  it("covers every symbology", () => {
    expect(new Set(CLEAN.map(([s]) => s))).toEqual(new Set(Object.keys(SYMBOLOGIES)));
  });

  it.each(CLEAN)("%s %s", async (symbology, data) => {
    const bitmap = rasterize(encode(symbology, data), { dotsPerModule: 4, quietZone: 10 });
    const rgba = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
    bitmap.dark.forEach((dark, index) => {
      rgba.fill(dark ? 0 : 255, index * 4, index * 4 + 3);
      rgba[index * 4 + 3] = 255;
    });
    const image = { data: rgba, width: bitmap.width, height: bitmap.height, colorSpace: "srgb" } as ImageData;
    const [symbol] = await readBarcodes(image, { formats: [], textMode: "Plain", tryHarder: true });
    const result = check(engine, readingFromDecoder(symbol as DecodedSymbol, { source: "image", at: AT }));
    expect(summary(result)).toEqual([]);
    expect(result.verdict).toBe("follows");
    expect(result.forms?.elementString).toMatch(/^\(\d{2,4}\)/);
  });
});

describe("check()", () => {
  it("the project's worked example: a plain Data Matrix with the parentheses encoded and an impossible date gives A1, B1, D1", async () => {
    const reading = await drawn("datamatrix", "(01)09506000134352(17)271300(10)ABC123");
    const result = check(engine, reading);
    expect(summary(result)).toEqual(["A1 error", "B1 error [0,1][3,4][18,19][21,22][28,29][31,32]", "D1 error [24,26]"]);
    expect(result.verdict).toBe("does-not-follow");
    expect(result.repairs).toEqual(["assume-fnc1", "strip-parentheses"]);
    expect(result.findings[2]).toMatchObject({ ai: "17", engineMessage: "AI (17): The date contains an illegal month of the year." });
    // The data is not valid even once repaired: no data made right is offered
    expect(result.findings.some((f) => f.fixedData)).toBe(false);
    expect(result.forms).toBeNull();
    expect(result.elements.map((e) => [e.ai, e.value, e.title])).toEqual([
      ["01", "09506000134352", "GTIN"], ["17", "271300", "USE BY or EXPIRY"], ["10", "ABC123", "BATCH/LOT"],
    ]);
  });

  it("reports every fault in one symbol, not only the engine's first", () => {
    const result = check(engine, pasted(`]d2010950600013435317271300` + `10AB#C${GS}21X`));
    expect(summary(result)).toEqual(["C1 error [15,16]", "D1 error [20,22]", "B9 error [28,29]"].sort(bySummaryOrder));
    expect(result.findings.map((f) => f.ai)).toEqual(["01", "17", "10"].sort(byAiOrder(result)));
  });

  it("finds the associations once every element string is valid alone", () => {
    expect(summary(check(engine, pasted("]d210ABC123")))).toEqual(["E1 error [0,8]"]);
    expect(summary(check(engine, pasted("]d20109506000134352020950600013435237"))).length).toBe(1);
  });

  it("B3: a separator left out is a Warning while the value is still valid, and the data is left as it is", () => {
    const result = check(engine, pasted("]d2010950600013435210ABC12317271231"));
    expect(summary(result)).toEqual(["B3 warning [24,24]"]);
    expect(result.verdict).toBe("remarks");
    expect(result.findings[0]!.fixedData).toBe("(01)09506000134352(10)ABC123(17)271231");
    expect(result.elements.map((e) => e.ai)).toEqual(["01", "10"]);
  });

  it("B3: where two separators would each make the data valid, the one before a value of predefined length", () => {
    // (10)ABCDEFGHIJ21XY17271231 is too long for a batch: (21)XY17271231 would do, but a date after the batch is likelier
    const result = check(engine, pasted("]d210ABCDEFGHIJ21XY17271231"));
    expect(summary(result)).toEqual(["B3 error [16,16]", "E1 error [0,16]", "B11 note [16,24]"]);
    expect(result.elements.map((e) => `(${e.ai})${e.value}`)).toEqual(["(10)ABCDEFGHIJ21XY", "(17)271231"]);
  });

  it("B3: never a separator before a company's internal AI (90 to 99), which would take any rest", () => {
    const result = check(engine, pasted("]d210ABCDEFGHIJ91XYZ21ABCDEFGHIJKL"));
    expect(result.elements.map((e) => `(${e.ai})${e.value}`)).toEqual(["(10)ABCDEFGHIJ91XYZ", "(21)ABCDEFGHIJKL"]);
  });

  it("B7 in bracketed data: an AI between parentheses that does not exist", () => {
    expect(summary(check(engine, pasted("]d2(01)09506000134352(89)12")))).toEqual(["B1 error [0,1][3,4][18,19][21,22]", "B7 error [18,24]"]);
  });

  it("lists warnings before notes", () => {
    const result = check(engine, pasted(`]d210ABC${GS}0109506000134352${GS}17271231`));
    expect(summary(result)).toEqual(["B4 warning [22,23]", "B11 note [6,22]", "B11 note [23,31]"]);
  });

  it("A8: a plain symbol whose data is not GS1 data, even digits that look like an AI", () => {
    for (const text of ["]d1Hello world", "]Q112345678", "]C0ABC-123"]) {
      const result = check(engine, pasted(text));
      expect(summary(result), text).toEqual(["A8 note"]);
      expect(result.verdict).toBe("not-gs1");
    }
  });

  it("B2: printed titles and spaces between bracketed element strings", () => {
    const result = check(engine, pasted("]d2(01)09506000134352 LOT (10)ABC123"));
    expect(summary(result)).toEqual(["B1 error [0,1][3,4][23,24][26,27]", "B2 error [18,23]"]);
    expect(result.repairs).toEqual(["strip-formatting", "strip-parentheses"]);
  });

  it("B2 as the project defines it: a space that leaves valid data once removed, wherever it is", () => {
    const result = check(engine, pasted("]d2010950600013435210ABC 123"));
    expect(summary(result)).toEqual(["B2 error [21,22]"]);
    expect(result.findings[0]!.fixedData).toBe("(01)09506000134352(10)ABC123");
  });

  it("takes pasted text without an identifier as people write it: brackets, ^ for FNC1, a GTIN alone", () => {
    for (const text of ["(01)09506000134352(10)ABC123", "^01095060001343521727123110ABC123", "09506000134352", "9506000134352"]) {
      const result = check(engine, readingFromText(text, { source: "paste", at: AT }));
      expect(summary(result), text).toEqual([]);
      expect(result.verdict).toBe("follows");
    }
    expect(check(engine, readingFromText("hello world", { source: "paste", at: AT })).verdict).toBe("not-gs1");
  });

  it("EAN/UPC and ITF-14 carry a GTIN, its check digit verified (C1 until item 7.1 c gives its own rule)", () => {
    expect(summary(check(engine, pasted("]E09506000134353")))).toEqual(["C1 error [0,13]"]);
    expect(summary(check(engine, pasted("]I019506000134359")))).toEqual(["A7 note [0,14]"]);
    expect(check(engine, pasted("]I019506000134359")).verdict).toBe("follows");
    expect(check(engine, pasted("]E495012346")).forms?.elementString).toBe("(01)00000095012346");
  });

  it("a GS1 Digital Link URI, in a plain symbol or an NFC tag, through the engine (group G is item 7.1 c)", () => {
    expect(check(engine, pasted("]Q1https://id.gs1.org/01/09506000134352/10/ABC")).verdict).toBe("follows");
    expect(summary(check(engine, pasted("]Q1https://example.com/about")))).toEqual(["G1 note"]);
    expect(check(engine, pasted("]Q1https://example.com/about")).verdict).toBe("not-gs1");
    const nfc = readingFromNdef(ndefUriMessage("https://id.gs1.org/01/09506000134353"), { at: AT });
    expect(summary(check(engine, nfc))).toEqual(["C1 error"]);
  });

  it("points at bytes, not characters, when the data holds UTF-8", () => {
    const result = check(engine, pasted(`]d2010950600013435210ÀBC${GS}`));
    // À is two bytes: the value is bytes 18 to 21, and the separator at the end byte 22, not character 21
    expect(summary(result)).toEqual(["B9 error [18,22]", "B5 warning [22,23]"]);
    expect(summary(check(engine, readingFromText("^0109506000134352^10ABC", { source: "paste", at: AT })))).toEqual(["B4 warning [17,18]"]);
  });

  it("leaves the generators' parse() as it was: associations still checked after a check of one element string", () => {
    engine.checkElementString("10", "ABC");
    expect(() => engine.parse("(10)ABC")).toThrow(/Required AIs/);
  });
});

describe("faultOfEngineMessage()", () => {
  it.each([
    ["No known AI is a prefix of: 8912...", "B7"],
    ["AI (01) data has incorrect length", "B8"],
    ["AI (10) data is too long", "B8"],
    ["AI (10): A non-CSET 82 character was found where a CSET 82 character is expected.", "B9"],
    ["Multiple instances of AI (10) have different values", "B10"],
    ["AI (01): The numeric check digit is incorrect.", "C1"],
    ["AI (17): The date contains an illegal day of the month.", "D1"],
    ["Required AIs for AI (10) are not satisfied: 01,02,03,8006,8026", "E1"],
    ["It is invalid to pair AI (01) with AI (02)", "E2"],
    ["No GS1 DL keys found in path info", "G1"],
  ])("%s → %s", (message, code) => {
    expect(faultOfEngineMessage(message)).toBe(code);
  });
});

const ORDER = (s: string) => s.charCodeAt(0) * 1e8 + Number(/\[(\d+),/.exec(s)?.[1] ?? 0) * 100 + Number(s.split(" ")[0]!.slice(1));
const bySummaryOrder = (a: string, b: string) => ORDER(a) - ORDER(b);
const byAiOrder = (result: CheckResult) => (a: string, b: string) => result.findings.findIndex((f) => f.ai === a) - result.findings.findIndex((f) => f.ai === b);
