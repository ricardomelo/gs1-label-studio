import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import bwipjs from "bwip-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  check, checkDigit, encode, expectedCheckDigit, faultOfEngineMessage, parseGcpTable, rasterize, reorderedDate, readingFromDecoder, readingFromNdef, readingFromText, ndefUriMessage, SYMBOLOGIES,
  SyntaxEngine, type CheckContext, type CheckResult, type DecodedSymbol, type Reading, type SymbologyId,
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
  { code: "B8", bcid: "datamatrix", text: `${FNC1}0012345678901234567`, extra: PARSE, identifier: "]d2", findings: ["B8 error [2,19]"] },
  { code: "B9", bcid: "datamatrix", text: `${FNC1}0109506000134352240ABC#123`, extra: PARSE, identifier: "]d2", findings: ["B9 error [22,23]"] },
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
    expect(summary(result)).toEqual(["C1 error [15,16]", "D1 error [20,22]", "D6 error [28,29]"]);
    expect(result.findings.map((f) => f.ai)).toEqual(["01", "17", "10"]);
  });

  it("finds the associations once every element string is valid alone", () => {
    expect(summary(check(engine, pasted("]d20209506000134352")))).toEqual(["E1 error [0,16]"]);
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
    expect(summary(result)).toEqual(["B3 error [16,16]", "C9 error [0,16]", "B11 note [16,24]", "D7 note [2,16]"]);
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
    expect(summary(check(engine, nfc))).toEqual(["C1 error [22,36]"]);
  });

  it("points at bytes, not characters, when the data holds UTF-8", () => {
    const result = check(engine, pasted(`]d2010950600013435210ÀBC${GS}`));
    // À is two bytes: the value is bytes 18 to 21, and the separator at the end byte 22, not character 21
    expect(summary(result)).toEqual(["D6 error [18,22]", "B5 warning [22,23]"]);
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

// Item 7.1 c: the key (group C), the values (D), the associations (E) and GS1 Digital Link URIs (G)
const withCheck = (body: string) => `${body}${checkDigit(body)}`;
const findings = (text: string, context: CheckContext = {}) => summary(check(engine, pasted(text), context));
const TODAY = new Date("2026-11-16T00:00:00Z");

describe("group C: the key", () => {
  it("C1: the check digit that would be right", () => {
    const result = check(engine, pasted("]d20109506000134353"));
    expect(summary(result)).toEqual(["C1 error [15,16]"]);
    expect(result.findings[0]!.details).toEqual({ expected: "2" });
    expect(expectedCheckDigit("00", "106141411234567890")).toBe("7");
    expect(expectedCheckDigit("10", "ABC")).toBeNull();
  });

  it("C3: indicator 9 without its measure; with (3103) it is a variable measure trade item", () => {
    const gtin = withCheck("9950600013435");
    expect(findings(`]d201${gtin}`)).toEqual(["C3 error [2,3]"]);
    expect(findings(`]d201${gtin}3103001250`)).toEqual([]);
  });

  it("C4: indicator 1 to 8 only matters at a retail point of sale", () => {
    const gtin = withCheck("1950600013435");
    expect(findings(`]d201${gtin}`)).toEqual([]);
    expect(findings(`]d201${gtin}`, { environment: "retail" })).toEqual(["C4 warning [2,3]", "F3 warning"]);
    expect(findings(`]d201${gtin}`, { environment: "distribution" })).toEqual([]);
  });

  it("C5: a GTIN-13 under AI (01), not padded", () => {
    expect(findings("]d2019506000134352")).toEqual(["C5 error [2,15]"]);
  });

  it("C6: restricted circulation, coupons, books and serials; a Warning outside retail", () => {
    expect(findings(`]E0${withCheck("200123456789")}`)).toEqual(["C6 note [0,2]"]);
    expect(findings(`]E0${withCheck("978014300723")}`)).toEqual(["C6 note [0,3]"]);
    expect(findings(`]E0${withCheck("978014300723")}`, { environment: "distribution" })).toEqual(["C6 warning [0,3]"]);
    expect(findings(`]E4${withCheck("2012345")}`)).toEqual(["C6 note [0,1]"]);
    expect(findings(`]E0${withCheck("950600013435")}`)).toEqual([]);
  });

  it("C7: the prefix for examples, in a GTIN and in an SSCC", () => {
    expect(findings(`]E0${withCheck("952012345678")}`)).toEqual(["C7 warning [0,3]"]);
    expect(findings(`]C100${withCheck("39520123456789012")}`)).toEqual(["C7 warning [3,6]"]);
  });

  it("C8: a company prefix the user's GCP table does not hold; not assessed without a table", () => {
    const gcp = parseGcpTable('<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="950" gcpLength="7"/></GCPPrefixFormatList>');
    expect(findings("]E09506000134352", { gcp })).toEqual([]);
    expect(findings(`]E0${withCheck("761234567890")}`, { gcp })).toEqual(["C8 warning [0,13]"]);
    expect(check(engine, pasted("]E09506000134352")).notChecked).toEqual(["C8"]);
    expect(check(engine, pasted("]E09506000134352"), { gcp }).notChecked).toEqual([]);
  });

  it("C9: attributes with no key, the companions named with their titles", () => {
    const result = check(engine, pasted("]d210ABC123"));
    expect(summary(result)).toEqual(["C9 error [0,8]"]);
    expect(result.findings[0]!.details).toEqual({ ais: "10 BATCH/LOT", required: "01 GTIN, 02 CONTENT, 03 MTO GTIN, 8006 ITIP, 8026 ITIP CONTENT" });
  });
});

describe("group D: dates and other values", () => {
  it("D1 and D4: an impossible date that reads right as DDMMYY, re-ordered", () => {
    const result = check(engine, pasted("]d2010950600013435217150635"), { today: TODAY });
    expect(summary(result)).toEqual(["D4 error [18,24]", "D1 error [22,24]"]);
    expect(result.findings[0]!.details).toEqual({ reordered: "350615" });
    expect(check(engine, pasted("]d2010950600013435217061535"), { today: TODAY }).findings[0]!.details).toEqual({ reordered: "350615" });
    expect(reorderedDate("131227", TODAY)).toBe("271213");
    expect(reorderedDate("121327", TODAY)).toBe("271213");
    expect(reorderedDate("991399", TODAY)).toBeNull();
    expect(reorderedDate("310427", TODAY)).toBeNull(); // 31 April, read either way
  });

  it("D2 and D3: day 00, the last day of the month; an Error in regulated healthcare", () => {
    const result = check(engine, pasted("]d2010950600013435217280200"), { today: TODAY });
    expect(summary(result)).toEqual(["D2 note [22,24]"]);
    expect(result.findings[0]!.details).toEqual({ date: "2028-02-29" });
    expect(findings("]d2010950600013435217280200", { today: TODAY, environment: "healthcare" })).toEqual(["D3 error [22,24]"]);
  });

  it("D5: expiry before production, expired, made in the future, too far away, the century by the rule of 7.12", () => {
    expect(findings("]d201095060001343521126060117260101", { today: TODAY })).toEqual(["D5 warning [18,24][26,32]"]);
    expect(findings("]d2010950600013435217250101", { today: TODAY })).toEqual(["D5 warning [18,24]"]);
    expect(findings("]d2010950600013435211270101", { today: TODAY })).toEqual(["D5 warning [18,24]"]);
    const far = check(engine, pasted("]d2010950600013435217700101"), { today: TODAY });
    expect(summary(far)).toEqual(["D5 warning [18,24]"]);
    expect(far.findings[0]!.details).toEqual({ reason: "far", date: "2070-01-01" });
  });

  it("D6: a batch too long; D7: a serial likely to be mis-keyed", () => {
    expect(findings("]d2010950600013435210ABCDEFGHIJKLMNOPQRSTU")).toEqual(["D6 error [18,39]"]);
    expect(findings("]d201095060001343522112-")).toEqual(["D7 note [18,21]"]);
    expect(findings("]d2010950600013435221AO0")).toEqual(["D7 note [18,21]"]);
  });

  it("D8: a measure of zero, its value with the decimal point and unit", () => {
    const result = check(engine, pasted("]d201995060001343533103000000".replace("99506000134353", withCheck("9950600013435"))));
    expect(summary(result)).toEqual(["D8 warning [20,26]"]);
    expect(result.findings[0]!.details).toEqual({ value: "0.000", unit: "kg" });
  });

  it("D9: a typed field's own rule (a country code)", () => {
    expect(findings("]d20109506000134352422999")[0]).toMatch(/^D9 error/);
  });
});

describe("group E: combinations", () => {
  it("E1 and E2 name both AIs with their data titles", () => {
    const e1 = check(engine, pasted("]d20209506000134352"));
    expect(e1.findings[0]!.details).toEqual({ ais: "02 CONTENT", required: "37 COUNT" });
    const e2 = check(engine, pasted(`]d242012345${GS}4210761234`));
    expect(summary(e2)).toEqual(["E2 error [0,8][9,19]"]);
    expect(e2.findings[0]!.details?.ais).toMatch(/^420 SHIP TO POST, 421 SHIP TO POST$/);
  });
});

describe("group G: GS1 Digital Link URIs", () => {
  const uri = (text: string, context: CheckContext = {}) => check(engine, pasted(`]Q1${text}`), context);
  it("G1: a web address with no key is not a GS1 code", () => {
    expect(summary(uri("https://example.com/about"))).toEqual(["G1 note"]);
  });

  it("G2: qualifiers out of order, the URI re-ordered", () => {
    const result = uri("https://id.gs1.org/01/09506000134352/21/12345/10/ABC");
    expect(summary(result)).toEqual(["G2 error [0,52]"]);
    expect(result.findings[0]!.details?.uri).toBe("https://id.gs1.org/01/09506000134352/10/ABC/21/12345");
    expect(result.findings[0]!.fixedData).toBe("(01)09506000134352(10)ABC(21)12345");
  });

  it("G3: an attribute in the path, moved to the query; a qualifier in the query", () => {
    const result = uri("https://id.gs1.org/01/09506000134352/17/271231");
    expect(summary(result)).toEqual(["G3 error [37,39]"]);
    expect(result.findings[0]!.details?.uri).toBe("https://id.gs1.org/01/09506000134352?17=271231");
    expect(summary(uri("https://id.gs1.org/01/09506000134352?10=ABC"))).toEqual(["G3 error [40,43]"]);
  });

  it("G4 and G5: an unknown AI in the query; an AI a URI cannot carry", () => {
    expect(summary(uri("https://id.gs1.org/01/09506000134352?9999=x"))[0]).toMatch(/^G4|^B7/);
    expect(summary(uri("https://id.gs1.org/01/09506000134352?235=x"))[0]).toMatch(/^G5/);
  });

  it("G6: a percent sign that starts no %hh, and a slash left raw in a batch", () => {
    const percent = uri("https://id.gs1.org/01/09506000134352/10/A%2");
    expect(summary(percent)).toEqual(["G6 error [41,42]"]);
    expect(percent.findings[0]!.details?.uri).toBe("https://id.gs1.org/01/09506000134352/10/A%252");
    const slash = uri("https://id.gs1.org/01/09506000134352/10/AB/12");
    expect(summary(slash)).toEqual(["G6 error [0,45]"]);
    expect(slash.findings[0]!.details?.uri).toBe("https://id.gs1.org/01/09506000134352/10/AB%2F12");
  });

  it("G7: valid but not canonical, with the canonical URI", () => {
    for (const [text, reason] of [
      ["https://ID.GS1.ORG/01/09506000134352", "upper-case-host"], ["https://id.gs1.org/01/09506000134352/", "trailing-slash"],
      ["https://id.gs1.org/01/09506000134352#top", "fragment"], ["https://example.com/shop/01/09506000134352", "path-before-key"],
      ["https://id.gs1.org/01/9506000134352", "gtin"],
    ]) {
      const result = uri(text!);
      expect(summary(result).map((s) => s.split(" ")[0]), text).toEqual(["G7"]);
      expect(result.findings[0]!.details).toEqual({ canonical: "https://id.gs1.org/01/09506000134352", reason });
      expect(result.verdict).toBe("follows");
    }
  });

  it("G8: plain http is a Warning, another scheme an Error", () => {
    expect(summary(uri("http://id.gs1.org/01/09506000134352"))).toEqual(["G8 warning [0,4]"]);
    expect(summary(uri("ftp://id.gs1.org/01/09506000134352"))).toEqual(["G8 error [0,3]"]);
    expect(summary(uri("ftp://example.com/file.txt"))).toEqual(["A8 note"]);
  });

  it("G9: short names in the path, which the engine refuses, given their AIs", () => {
    const result = uri("https://id.gs1.org/gtin/09506000134352/lot/ABC");
    expect(summary(result)).toEqual(["G9 warning [19,23][39,42]"]);
    expect(result.findings[0]!.details).toEqual({ names: "gtin, lot", uri: "https://id.gs1.org/01/09506000134352/10/ABC" });
    expect(engine.checkMessage("https://id.gs1.org/gtin/09506000134352")?.message).toBe("No GS1 DL keys found in path info");
  });

  it("G10: a compressed URI", () => {
    expect(summary(uri("https://id.gs1.org/ARHKVAdpQgEJ"))).toEqual(["G10 note [0,31]"]);
  });

  it("G11: the key's and the values' rules inside the URI", () => {
    expect(summary(uri("https://id.gs1.org/01/09506000134353"))).toEqual(["C1 error [22,36]"]);
    expect(summary(uri("https://id.gs1.org/01/09506000134352?17=280200", { today: TODAY }))).toEqual(["D2 note [44,46]"]);
  });
});
