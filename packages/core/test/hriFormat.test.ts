import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  checkHriPattern,
  dataTitle,
  hriJoiner,
  hriText,
  labelFor,
  labelSvg,
  printFileFor,
  PRINTER_LANGUAGES,
  specificationFor,
  syntaxEngine,
  zplTemplate,
  type DesignPage,
  type HriFormat,
  type Identified,
  type LabelDesign,
  type PrinterLanguage,
  type SyntaxEngine,
} from "../src/index.ts";
import { textFile } from "./files.ts";
import { hriFont } from "./font.ts";

// The human readable text's format, chosen (backlog 6.11, the owner, 15 November 2026): the AI in parentheses as the
// symbols have always been drawn, data titles, both (General Specifications 4.14.1, figure 4-8), or a pattern of one's
// own, whose date in a format of its own takes its data title without the AI (figure 4-9). The same text in the SVG and
// in every printer language; the symbol itself does not change and still reads back.

const font = hriFont();
let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function reads(svg: string) {
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 6 }, background: "#fff" }).render().asPng();
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const TITLE: HriFormat = { style: "title" };
const BOTH: HriFormat = { style: "both" };
const own = (pattern: string, language?: HriFormat["language"]): HriFormat => ({ style: "own", pattern, ...(language ? { language } : {}) });

describe("the human readable text's format", () => {
  it("writes an element string as the AI and data, data titles, or both (figure 4-8)", () => {
    expect(hriText("(17)271231")).toBe("(17)271231");
    expect(hriText("(17)271231", { style: "ai" })).toBe("(17)271231");
    expect(hriText("(17)271231", TITLE)).toBe("USE BY or EXPIRY 271231");
    expect(hriText("(01)09506000134352", BOTH)).toBe("GTIN (01) 09506000134352");
    expect(hriText("(10)AB 12", BOTH)).toBe("BATCH/LOT (10) AB 12");
    expect(hriText("(3103)000500", TITLE)).toBe("NET WEIGHT (kg) 000500");
    // What is not an element string, as an EAN/UPC's or ITF-14's digits, as it is
    expect(hriText("09506000134352", BOTH)).toBe("09506000134352");
  });

  it("takes the data titles in a second language, an acronym as it is", () => {
    expect(dataTitle("10")).toBe("BATCH/LOT");
    expect(dataTitle("10", "pt-BR")).toBe("LOTE");
    expect(dataTitle("21", "de")).toBe("SERIENNUMMER");
    expect(dataTitle("01", "fr")).toBe("GTIN");
    // An English title of two meanings: the AI's own entry
    expect(dataTitle("4305", "pt-BR")).toBe("CIDADE DE ENTREGA");
    expect(hriText("(10)B42", { style: "both", language: "es" })).toBe(`${dataTitle("10", "es")} (10) B42`);
    expect(dataTitle("10", "es")).not.toBe("BATCH/LOT");
  });

  it("writes a pattern of one's own; a date in a format of its own loses its AI (figure 4-9), another AI's value stays as encoded", () => {
    expect(hriText("(10)B42", own("{title}: {value}"))).toBe("BATCH/LOT: B42");
    expect(hriText("(10)B42", own("[{ai}] {value}"))).toBe("[10] B42");
    expect(hriText("(17)271231", own("{title} ({ai}) {value:DD MMM YYYY}"))).toBe("USE BY or EXPIRY 31 DEC 2027");
    expect(hriText("(17)271231", own("{ai} {value:DD/MM/YYYY}"))).toBe("31/12/2027");
    expect(hriText("(17)271231", own("{title} ({ai}) {value:DD MMM YYYY}", "pt-BR"))).toBe(`${dataTitle("17", "pt-BR")} 31 DEZ 2027`);
    // Day 00: the month's last (section 7.12); a full year as (7250)'s; a time as (7003)'s
    expect(hriText("(17)270200", own("{value:DD/MM/YYYY}"))).toBe("28/02/2027");
    expect(hriText("(7003)2712311530", own("{title} {value:DD/MM/YYYY hh:mm}"))).toBe("EXPIRY TIME 31/12/2027 15:30");
    // Not a date: the format is not applied, the AI stays
    expect(hriText("(10)B42", own("{title} ({ai}) {value:DD MMM YYYY}"))).toBe("BATCH/LOT (10) B42");
    // A date as encoded keeps its AI
    expect(hriText("(17)271231", own("{title} ({ai}) {value}"))).toBe("USE BY or EXPIRY (17) 271231");
    // A ZPL template's field: the printer fills it, so no date is written from it and the AI stays
    expect(hriText("(17){{17}}", own("{title} ({ai}) {value:DD MMM YYYY}"))).toBe("USE BY or EXPIRY (17) {{17}}");
  });

  it("refuses a pattern without the data, with an unknown name, or with a format after the AI or title", () => {
    expect(() => checkHriPattern("{title}")).toThrow(/\{value\}/);
    expect(() => checkHriPattern("{title} {data}")).toThrow(/not \{data\}/);
    expect(() => checkHriPattern("{ai:DD} {value}")).toThrow(/Only \{value\}/);
    expect(() => hriText("(10)B42", own(""))).toThrow(/\{value\}/);
    expect(() => hriText("(17)271231", own("{value:QQ}"))).toThrow(/has none of DD/);
    expect(() => checkHriPattern("{title} ({ai}) {value:DD MMM YYYY}")).not.toThrow();
    expect(hriJoiner()).toBe("");
    expect(hriJoiner({ style: "ai" })).toBe("");
    expect(hriJoiner(TITLE)).toBe("  ");
  });
});

const DESIGN: LabelDesign = {
  symbology: "gs1-datamatrix", hri: "full", version: null, error: "m", environment: "healthcare", size: 100, linear: "none",
  linearSize: null, bearer: "frame", reduction: 0,
};
const DATA = "(01)09506000134352(17)271231(10)B42";

describe("the format on the label and in the print files", () => {
  it("draws each line of a 2D symbol in the format, the symbol unchanged and read back", async () => {
    const data = engine.parse(DATA) as Identified;
    const plain = labelFor(data, DESIGN, font);
    const both = labelFor(data, { ...DESIGN, hriFormat: BOTH }, font);
    expect(plain.layout.texts.map((t) => t.text)).toEqual(["(01)09506000134352", "(17)271231", "(10)B42"]);
    expect(both.layout.texts.map((t) => t.text)).toEqual(["GTIN (01) 09506000134352", "USE BY or EXPIRY (17) 271231", "BATCH/LOT (10) B42"]);
    // The same modules, moved as a whole
    const shift = both.layout.rects[0]![0] - plain.layout.rects[0]![0];
    const moved = plain.layout.rects.slice(0, plain.layout.symbolRects).map(([x, y, w, h]) => [x + shift, y, w, h]);
    both.layout.rects.slice(0, both.layout.symbolRects).forEach((rect, i) => rect.forEach((v, j) => expect(v).toBeCloseTo(moved[i]![j]!, 9)));
    // Wider text widens the label around the same symbol
    expect(both.layout.width).toBeGreaterThan(plain.layout.width);
    expect(await reads(labelSvg(both.options, both.layout, font))).toEqual(["]d2 (01)09506000134352(17)271231(10)B42"]);
    // The AI in parentheses is the default: no format and "ai" draw the same
    expect(labelFor(data, { ...DESIGN, hriFormat: { style: "ai" } }, font).layout).toEqual(plain.layout);
  });

  it("joins a linear symbol's element strings with two spaces, the date in a format of its own, and still reads", async () => {
    const data = engine.parse(DATA) as Identified;
    const gs1128: LabelDesign = { ...DESIGN, symbology: "gs1-128", environment: "distribution", spec: specificationFor(5, "gs1-128")!, table: 5 };
    const format = own("{title} ({ai}) {value:DD MMM YYYY}");
    const drawn = labelFor(data, { ...gs1128, hriFormat: format }, font);
    const text = drawn.layout.texts.map((t) => t.text).join("|");
    expect(text).toContain("GTIN (01) 09506000134352  USE BY or EXPIRY 31 DEC 2027");
    expect(text).toContain("BATCH/LOT (10) B42");
    expect(await reads(labelSvg(drawn.options, drawn.layout, font))).toEqual(["]C1 (01)09506000134352(17)271231(10)B42"]);
  });

  const LANGUAGES = Object.keys(PRINTER_LANGUAGES) as PrinterLanguage[];
  it.each(LANGUAGES)("%s writes the text in the format", (language) => {
    // GS1 DataMatrix in ZPL and TSPL; GS1-128 in EPL2 and PPLB; in DPL and PPLA, whose GS1-128 carries an SSCC alone
    const gs1128: LabelDesign = { ...DESIGN, symbology: "gs1-128", environment: "distribution", spec: specificationFor(5, "gs1-128")!, table: 5 };
    const sscc = language === "dpl" || language === "ppla";
    const design: LabelDesign = { ...(language === "zpl" || language === "tspl" ? DESIGN : gs1128), hriFormat: TITLE };
    const data = engine.parse(sscc ? "(00)106141411234567897" : DATA) as Identified;
    const file = textFile(printFileFor(language, labelFor(data, design, font), design, 203));
    if (sscc) {
      expect(file).toContain("SSCC 106141411234567897");
      expect(file).not.toContain("(00)");
      return;
    }
    expect(file).toContain("GTIN 09506000134352");
    expect(file).toContain("BATCH/LOT B42");
    expect(file).not.toContain("(10)B42");
  });

  it("writes a ZPL template's text in the format, the printer filling the values", () => {
    const template = zplTemplate("gs1-128", DATA, {
      x: 20, y: 20, dotsPerModule: 2, barHeightDots: 100, dpi: 203, widthDots: 900, heightDots: 300, hriFormat: BOTH,
    });
    expect(template.zpl).toContain("GTIN (01) {{01}}  USE BY or EXPIRY (17) {{17}}  BATCH/LOT (10) {{10}}");
  });

  it("a label of one's own takes the format, on the page and in the print file", () => {
    const page: DesignPage = {
      widthMm: 60, heightMm: 30,
      elements: [{ kind: "symbol", id: "s", symbology: "gs1-datamatrix", xMm: 2, yMm: 2, size: 100, hri: true, ais: null }],
    };
    const data = engine.parse(DATA) as Identified;
    const designed = labelFor(data, { ...DESIGN, page, hriFormat: TITLE }, font);
    expect(designed.layout.texts.map((t) => t.text)).toContain("BATCH/LOT B42");
    expect(textFile(printFileFor("zpl", designed, { ...DESIGN, page, hriFormat: TITLE }, 203))).toContain("^FDBATCH/LOT B42^FS");
  });
});
