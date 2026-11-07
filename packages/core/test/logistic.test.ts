import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { DICTIONARY, labelPdf, labelSvg, logisticLabel, secondTitle, specificationFor, zplLogisticLabel, type LogisticInput, type LogisticTwoD } from "../src/index.ts";
import { drawPdf } from "./files.ts";
import { hriFont } from "./font.ts";

// The GS1 Logistic Label (backlog 4.1; General Specifications 26.0, 6.6): free text, text with data titles, and the
// GS1-128 symbols at the bottom, the SSCC's lowest; every symbol read back by ZXing from the SVG and the PDF.

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

const INPUT: LogisticInput = {
  elementString: "(00)106141411234567897(02)09506000134376(37)24(10)ABC123",
  size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
  from: ["Dal Giardino S.p.A.", "Via Roma 1, Milano"], to: ["Supermarket DC 12", "São Paulo"],
};

describe("the GS1 Logistic Label", () => {
  it("is the page's size, its SSCC alone in the lowest symbol, the other element strings above it", () => {
    const { layout, parts } = logisticLabel(INPUT, font);
    expect(layout.width * layout.xMm).toBeCloseTo(148, 6);
    expect(layout.height * layout.xMm).toBeCloseTo(210, 6);
    expect(parts).toEqual(["(02)09506000134376(37)24(10)ABC123", "(00)106141411234567897"]);
    const lowest = Math.max(...layout.rects.slice(0, layout.symbolRects).map((r) => r[1] + r[3]));
    const sscc = layout.texts.find((t) => t.text === "(00)106141411234567897")!;
    expect(sscc.baseline).toBeGreaterThan(lowest - 40); // the SSCC's text under the lowest bars
    // Data titles from the dictionary, the content 7 mm high, the free text 3.5 mm, the HRI 3 mm
    const capital = (t: { em: number }) => ((t.em * font.capHeight) / font.unitsPerEm) * layout.xMm;
    expect(layout.texts.map((t) => t.text)).toEqual(expect.arrayContaining(["SSCC", "CONTENT", "COUNT", "BATCH/LOT", "FROM", "TO", "São Paulo"]));
    expect(capital(layout.texts.find((t) => t.text === "106141411234567897")!)).toBeCloseTo(7, 6);
    expect(capital(layout.texts.find((t) => t.text === "São Paulo")!)).toBeCloseTo(3.5, 6);
    expect(capital(sscc)).toBeCloseTo(3, 6);
    // Everything on the page
    for (const t of layout.texts) expect(t.x + font.textWidth(t.text, t.em)).toBeLessThanOrEqual(layout.width + 1e-9);
  });

  it("reads back every symbol from the SVG and the PDF", async () => {
    const { layout, options, parts } = logisticLabel(INPUT, font);
    const expected = parts.map((p) => `]C1 ${p}`).sort();
    const svg = labelSvg(options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(expected);
    expect(await read(drawPdf(await labelPdf(options, layout, font), 300))).toEqual(expected);
  }, SLOW);

  it("refuses data without an SSCC, a symbol wider than the page, and more than the page holds", () => {
    expect(() => logisticLabel({ ...INPUT, elementString: "(01)09506000134376" }, font)).toThrow(/needs an SSCC/);
    expect(() => logisticLabel({ ...INPUT, percent: 190 }, font)).toThrow(RangeError);
    const many = "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJKLMNOPQRST(15)271231(3102)001250(401)9506000134376ABCDEFGHIJKLMNO(403)ROUTE-12345";
    expect(() => logisticLabel({ ...INPUT, elementString: many, percent: 150 }, font)).toThrow(/label is 148 mm high|wider than|165.10 mm/);
    expect(logisticLabel({ ...INPUT, from: [], to: [] }, font).layout.texts.some((t) => t.text === "FROM")).toBe(false);
    // The same data on A6: two of its element strings take a symbol each, and the page is too short
    expect(() => logisticLabel({ ...INPUT, size: "a6" }, font)).toThrow(/the A6 label is 148 mm high/);
    const small = logisticLabel({ ...INPUT, size: "4x6", elementString: "(00)106141411234567897(02)09506000134376(37)24" }, font);
    expect(small.layout.height * small.layout.xMm).toBeCloseTo(152.4, 6);
    expect(small.parts).toEqual(["(02)09506000134376(37)24", "(00)106141411234567897"]);
  });

  it("fits the SSCC's content on a 4 × 6 in label: 2 mm margins, and as near 7 mm as they allow", () => {
    // 18 digits at 7 mm are 102 mm wide in the HRI font: more than the 101.6 mm label, so the content is shrunk to fit
    const { layout } = logisticLabel({ ...INPUT, size: "4x6", elementString: "(00)106141411234567897(02)09506000134376(37)24" }, font);
    const capital = (t: { em: number }) => ((t.em * font.capHeight) / font.unitsPerEm) * layout.xMm;
    const sscc = layout.texts.find((t) => t.text === "106141411234567897")!;
    expect(capital(sscc)).toBeGreaterThan(6.7);
    expect(capital(sscc)).toBeLessThan(7);
    expect((font.textWidth(sscc.text, sscc.em)) * layout.xMm).toBeCloseTo(101.6 - 4, 6);
    for (const t of layout.texts) {
      expect(t.x * layout.xMm).toBeGreaterThanOrEqual(2 - 1e-9);
      expect((t.x + font.textWidth(t.text, t.em)) * layout.xMm).toBeLessThanOrEqual(layout.width * layout.xMm - 2 + 1e-9);
    }
    // The other contents stay at 7 mm, and start where the SSCC does
    expect(capital(layout.texts.find((t) => t.text === "09506000134376")!)).toBeCloseTo(7, 6);
    // The block's titles and contents start where the SSCC does
    expect(layout.texts.find((t) => t.text === "CONTENT")!.x).toBeCloseTo(sscc.x, 9);
  });

  // A 2D symbol to the right of the middle block (6.6.3.1, 6.6.4.1.1), at table 5's row for it: its quiet zone clear of
  // the text, the rule above and the page's edge; read back with the GS1-128 symbols
  const URI = "https://id.gs1.org/00/106141411234567897?02=09506000134376&37=24&10=ABC123";
  const TWO_D: [LogisticTwoD, string, string, number][] = [
    ["gs1-datamatrix", INPUT.elementString, `]d2 ${INPUT.elementString}`, 1],
    ["dl-qrcode", URI, `]Q1 ${URI}`, 4],
    ["dl-datamatrix", URI, `]d1 ${URI}`, 1],
  ];
  /** No text in the 2D symbol's quiet zone: every line of the middle block beside it ends 3 mm before it. */
  function clearOf(label: ReturnType<typeof logisticLabel>, quiet: number) {
    const { layout } = label;
    const two = label.printer.twoD!;
    const capital = (t: { em: number }) => (t.em * font.capHeight) / font.unitsPerEm;
    const [left, top, bottom] = [two.x - quiet, two.y - quiet, two.y + two.modules * two.module + quiet];
    for (const t of layout.texts) {
      if (t.baseline > top && t.baseline - capital(t) < bottom) expect(t.x + font.textWidth(t.text, t.em)).toBeLessThanOrEqual(left - 3 / layout.xMm + 1e-9);
    }
  }

  it.each(TWO_D)("places a %s to the right of the middle block, read back with the GS1-128", async (symbology, data, read_, quietModules) => {
    const label = logisticLabel({ ...INPUT, twoD: { symbology, data } }, font);
    const { layout, options, parts } = label;
    const two = label.printer.twoD!;
    expect(two.module * layout.xMm).toBeCloseTo(0.743, 9); // table 5's target at 100 %
    // The symbol and its quiet zone on the page, within the middle block: below the top rule, above the middle one
    const quiet = quietModules * two.module;
    const box = [two.x - quiet, two.y - quiet, two.x + two.modules * two.module + quiet, two.y + two.modules * two.module + quiet] as const;
    expect(box[0]).toBeGreaterThan(0);
    expect(box[2]).toBeLessThanOrEqual(layout.width + 1e-9);
    expect((two.x + two.modules * two.module) * layout.xMm).toBeCloseTo(layout.width * layout.xMm - 4, 9); // the page's margin
    const [top, middle] = label.printer.rules.map((r) => r[1]);
    expect(box[1]).toBeGreaterThanOrEqual(top! + label.printer.rules[0]![3] - 1e-9);
    expect(box[3]).toBeLessThanOrEqual(middle! + 1e-9);
    clearOf(label, quiet);
    // Each module a dark square of the module's size, drawn after GS1-128's bars (a bar width reduction leaves it)
    expect(layout.barRects![1]).toBeLessThan(layout.rects.length);
    const expected = [...parts.map((p) => `]C1 ${p}`), read_].sort();
    const svg = labelSvg(options, layout, font);
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(expected);
    expect(await read(drawPdf(await labelPdf(options, layout, font), 300))).toEqual(expected);
  }, SLOW);

  // A second language for the data titles (6.6.4.2: English, and a second language at the labeller's discretion)
  it("adds a second language under each data title and under FROM and TO, the contents on a row level", async () => {
    const label = logisticLabel({ ...INPUT, secondLanguage: "pt-BR", twoD: { symbology: "gs1-datamatrix", data: INPUT.elementString } }, font);
    const own = label.printer.texts;
    const at = (text: string) => own.find((t) => t.text === text)!;
    const line = 2.5 * 1.6 / label.layout.xMm; // a title's line: 2.5 mm capitals and the gap below them
    for (const [english, second] of [["FROM", "REMETENTE"], ["TO", "DESTINATÁRIO"], ["CONTENT", "CONTEÚDO"], ["COUNT", "QUANTIDADE"], ["BATCH/LOT", "LOTE"]] as const) {
      expect(at(second).x).toBeCloseTo(at(english).x, 9);
      expect(at(second).top).toBeCloseTo(at(english).top + line, 9);
      expect(at(second).heightMm).toBe(2.5);
    }
    // An acronym stays one line, its content where the others' are: two title lines down, level with its row's
    expect(own[own.indexOf(at("SSCC")) + 1]!.text).toBe("106141411234567897");
    expect(at("106141411234567897").top).toBeCloseTo(at("SSCC").top + 2 * line, 9);
    expect(at("24").top).toBeCloseTo(at("09506000134376").top, 9);
    expect(at("09506000134376").top).toBeCloseTo(at("CONTENT").top + 2 * line, 9);
    // The free text below FROM's two lines; the 2D symbol's quiet zone still clear; every symbol read back
    expect(at("Dal Giardino S.p.A.").top).toBeCloseTo(at("FROM").top + 2 * line, 9);
    clearOf(label, label.printer.twoD!.module);
    const { layout, options, parts } = label;
    const svg = labelSvg(options, layout, font);
    const expected = [...parts.map((p) => `]C1 ${p}`), `]d2 ${INPUT.elementString}`].sort();
    expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 1.5 }, background: "#fff" }).render().asPng())).toEqual(expected);
    // A second title wider than its English one and its content (QUANTIDADE over COUNT and 24) keeps the next item clear
    const small = logisticLabel({ ...INPUT, size: "4x6", from: [], to: [], elementString: "(00)106141411234567897(37)24(10)ABC123", secondLanguage: "pt-BR" }, font);
    const count = small.printer.texts;
    const lote = count.find((t) => t.text === "LOTE")!;
    expect(lote.top).toBeCloseTo(count.find((t) => t.text === "QUANTIDADE")!.top, 9); // on the same row
    for (const [i, a] of count.entries()) {
      for (const b of count.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.top + a.heightMm / small.layout.xMm <= b.top || b.top + b.heightMm / small.layout.xMm <= a.top;
        expect([a.text, b.text, apart]).toEqual([a.text, b.text, true]);
      }
    }
    // In Spanish; English alone without one; ZPL writes the titles in UTF-8 (^CI28)
    const spanish = logisticLabel({ ...INPUT, secondLanguage: "es" }, font).printer.texts.map((t) => t.text);
    expect(spanish).toEqual(expect.arrayContaining(["REMITENTE", "DESTINATARIO", "CONTENIDO", "CANTIDAD", "LOTE"]));
    const english = logisticLabel(INPUT, font).printer.texts.map((t) => t.text);
    expect(english.filter((t) => ["LOTE", "REMETENTE", "CONTEÚDO"].includes(t))).toEqual([]);
    expect(english).toEqual(spanish.filter((t) => !["REMITENTE", "DESTINATARIO", "CONTENIDO", "CANTIDAD", "LOTE"].includes(t)));
    const zpl = zplLogisticLabel(logisticLabel({ ...INPUT, secondLanguage: "pt-BR" }, font), 300, 3);
    expect(zpl).toContain("^CI28");
    expect(zpl).toMatch(/\^FDDESTINATÁRIO\^FS/);
  }, SLOW);

  it("names a data title in Portuguese and Spanish, an AI of its own where one title has two meanings", () => {
    expect(secondTitle("SHIP TO LOC", "pt-BR", "410")).toBe("LOCAL DE ENTREGA");
    expect(secondTitle("SHIP TO LOC", "pt-BR", "4305")).toBe("CIDADE DE ENTREGA");
    expect(secondTitle("SHIP TO LOC", "es", "4305")).toBe("CIUDAD DE ENTREGA");
    expect(secondTitle("NET WEIGHT (kg)", "es", "3102")).toBe("PESO NETO (kg)");
    expect(secondTitle("VOLUME (l), log", "pt-BR")).toBe("VOLUME (l), log");
    expect(secondTitle("USE BY or EXPIRY", "pt-BR")).toBe("VALIDADE");
    expect(secondTitle("USE BY or EXPIRY", "es")).toBe("CADUCIDAD");
    expect(secondTitle("SSCC", "pt-BR")).toBeNull();
    expect(secondTitle("AI (99999)", "es")).toBeNull();
    // Every title of the dictionary in both languages, or an acronym that is the same in every one: a title added to a
    // newer dictionary fails here until it is translated or listed
    const ACRONYMS = ["CPID", "CPV", "DIGSIG", "ESIM", "GCN", "GDTI", "GIAI", "GINC", "GMN", "GRAI", "GSIN", "GTIN", "IBAN", "IMEI",
      "IMEI2", "ITIP", "MUDI", "NHRN AIC", "NHRN AIM", "NHRN CIP", "NHRN CN", "NHRN DRN", "NHRN NDC", "NHRN PZN", "NHRN SRN", "NSN",
      "OPTSEN", "PCN", "PSIM", "SRIN", "SSCC", "TPX", "UIC+EXT", "VCN"];
    const titles = new Set(Object.values(DICTIONARY.ais).map((e) => e.title).filter(Boolean));
    for (const title of titles) {
      const [pt, es] = [secondTitle(title, "pt-BR"), secondTitle(title, "es")];
      if (ACRONYMS.includes(title)) expect([title, pt, es]).toEqual([title, null, null]);
      else expect([title, typeof pt, typeof es]).toEqual([title, "string", "string"]);
    }
  });

  it("puts a line too wide for the room beside the 2D symbol below it, and refuses a page too short for both", () => {
    // On A6 the SSCC's 18 digits do not fit beside the Data Matrix: the content and count go beside it, the SSCC below
    const data = "(00)106141411234567897(02)09506000134376(37)24";
    const label = logisticLabel({ ...INPUT, size: "a6", elementString: data, twoD: { symbology: "gs1-datamatrix", data } }, font);
    const two = label.printer.twoD!;
    const bottom = two.y + (two.modules + 1) * two.module;
    const at = (text: string) => label.layout.texts.find((t) => t.text === text)!;
    expect(at("09506000134376").baseline).toBeLessThan(bottom);
    expect(at("106141411234567897").baseline).toBeGreaterThan(bottom);
    expect(label.layout.texts.map((t) => t.text).filter((t) => ["SSCC", "CONTENT", "COUNT"].includes(t))).toEqual(["CONTENT", "COUNT", "SSCC"]);
    // A count that would end in the gap before the symbol, beside the SSCC, starts the next row
    const countSecond = "(00)106141411234567897(37)24(02)09506000134376(10)A";
    const beside = logisticLabel({ ...INPUT, elementString: countSecond, twoD: { symbology: "gs1-datamatrix", data: countSecond } }, font);
    clearOf(beside, beside.printer.twoD!.module);
    expect(beside.layout.texts.find((t) => t.text === "COUNT")!.x).toBeCloseTo(beside.layout.texts.find((t) => t.text === "SSCC")!.x, 9);
    // Larger with GS1-128: the same percentage of table 5's target
    const larger = logisticLabel({ ...INPUT, percent: 120, twoD: { symbology: "gs1-datamatrix", data: INPUT.elementString } }, font);
    expect(larger.printer.twoD!.module * larger.layout.xMm).toBeCloseTo(0.743 * 1.2, 9);
    // A QR code with its URI on a 4 × 6 in label leaves no room for the GS1-128 symbols
    const uri = "https://id.gs1.org/00/106141411234567897?02=09506000134376&37=24";
    expect(() => logisticLabel({ ...INPUT, size: "4x6", elementString: data, twoD: { symbology: "dl-qrcode", data: uri } }, font)).toThrow(/the 4 × 6 in label is 152.4 mm high/);
  });
});
