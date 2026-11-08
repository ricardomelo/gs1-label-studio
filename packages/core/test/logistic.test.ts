import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { DICTIONARY, labelPdf, labelSvg, logisticLabel, SECOND_LANGUAGES, secondTitle, specificationFor, zplLogisticLabel, type LogisticInput, type LogisticTwoD, type SecondLanguage } from "../src/index.ts";
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

  // From and To wrapped (an open point since session 26): a line too long for its half of the label went on under the
  // other column and past the page's edge
  const SENDER = ["Distribuidora de Alimentos Dal Giardino Ltda.", "Avenida Engenheiro Luís Carlos Berrini 1748, conjunto 1201, Cidade Monções, São Paulo SP 04571-000"];
  const RECEIVER = ["Supermercados Exemplo S.A. — Centro de Distribuição 12", "Rodovia Anhanguera km 26, Cajamar SP"];
  const freeText = (label: ReturnType<typeof logisticLabel>, x: number) =>
    label.printer.texts.filter((t) => Math.abs(t.x - x) < 1e-9 && t.heightMm >= 3 && t.heightMm <= 3.5); // the free text's sizes alone

  it("wraps From and To between words within their halves of the label, at 3.5 mm while the label has room", () => {
    const label = logisticLabel({ ...INPUT, from: SENDER, to: RECEIVER }, font);
    const { width, xMm } = label.layout;
    const from = freeText(label, 4 / xMm);
    const to = freeText(label, width / 2);
    expect(from.map((t) => t.text)).toEqual(["Distribuidora de Alimentos", "Dal Giardino Ltda.", "Avenida Engenheiro Luís", "Carlos Berrini 1748, conjunto", "1201, Cidade Monções, São", "Paulo SP 04571-000"]);
    expect(to.map((t) => t.text)).toEqual(["Supermercados Exemplo S.A.", "— Centro de Distribuição 12", "Rodovia Anhanguera km 26,", "Cajamar SP"]);
    for (const t of from) expect(t.x + t.width).toBeLessThanOrEqual(width / 2 - 3 / xMm + 1e-9);
    for (const t of to) expect(t.x + t.width).toBeLessThanOrEqual(width - 4 / xMm + 1e-9);
    // Each line a line pitch below the one before, at 3.5 mm, and the middle block's rule below them all
    for (const column of [from, to]) {
      expect(column.every((t) => t.heightMm === 3.5)).toBe(true);
      for (let i = 1; i < column.length; i++) expect((column[i]!.top - column[i - 1]!.top) * xMm).toBeCloseTo(5.25, 6);
    }
    const rule = Math.min(...label.printer.rules.map((r) => r[1]));
    expect(rule).toBeGreaterThan(from.at(-1)!.top + 3.5 / xMm);
    // A word wider than the column alone is broken between its characters; runs of spaces become one
    const long = logisticLabel({ ...INPUT, from: ["X".repeat(60) + "   end"], to: [] }, font);
    const pieces = freeText(long, 4 / xMm).map((t) => t.text);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe("X".repeat(60) + " end");
    expect(pieces.at(-1)).toMatch(/X end$/);
    for (const t of freeText(long, 4 / xMm)) expect(t.x + t.width).toBeLessThanOrEqual(width / 2 - 3 / xMm + 1e-9);
    expect(pieces.every(Boolean)).toBe(true); // no empty line before the word
    // Each column's pieces as long as its room allows: FROM up to 3 mm before the middle, TO up to the 4 mm margin
    const words = logisticLabel({ ...INPUT, from: ["X".repeat(60)], to: ["X".repeat(60)] }, font);
    const em = words.layout.texts.find((t) => t.text.startsWith("X"))!.em;
    for (const [x, end] of [[4 / xMm, width / 2 - 3 / xMm], [width / 2, width - 4 / xMm]] as const) {
      const column = freeText(words, x);
      expect(column.map((t) => t.text).join("")).toBe("X".repeat(60));
      for (const t of column) expect(t.x + t.width).toBeLessThanOrEqual(end + 1e-9);
      expect(x + font.textWidth(column[0]!.text + "X", em)).toBeGreaterThan(end);
    }
    // Tabs and other spaces between words become one space
    const tabbed = logisticLabel({ ...INPUT, from: ["Dal\tGiardino \u00a0S.p.A."], to: [] }, font);
    expect(freeText(tabbed, 4 / xMm).map((t) => t.text)).toEqual(["Dal Giardino S.p.A."]);
    // In ZPL each wrapped line is a field of its own
    const zpl = zplLogisticLabel(label, 300, 3);
    expect(zpl).toContain("^FDDistribuidora de Alimentos^FS");
    expect(zpl).toContain("^FDDal Giardino Ltda.^FS");
  });

  it("takes the free text down to 3 mm (6.6.4.4) when its lines leave the label too short, and then names it among the cures", () => {
    const a6 = { ...INPUT, size: "a6" as const, elementString: "(00)106141411234567897(02)09506000134376(37)24" };
    // Two lines each fit at 3.5 mm
    const short = logisticLabel({ ...a6, from: ["Dal Giardino S.p.A."], to: ["Supermarket DC 12"] }, font);
    expect(short.printer.texts.find((t) => t.text === "Dal Giardino S.p.A.")!.heightMm).toBe(3.5);
    // Wrapped to five lines, 3.5 mm needs 149 mm, 3 mm fits
    const sender = ["Dal Giardino Alimentos Ltda.", "Av. Eng. Luís Carlos Berrini 1748, São Paulo SP"];
    const smaller = logisticLabel({ ...a6, from: sender, to: RECEIVER }, font);
    const from = freeText(smaller, 4 / smaller.layout.xMm);
    expect(from.map((t) => t.text)).toEqual(["Dal Giardino Alimentos", "Ltda.", "Av. Eng. Luís Carlos", "Berrini 1748, São", "Paulo SP"]);
    expect(from.every((t) => t.heightMm === 3)).toBe(true);
    for (let i = 1; i < from.length; i++) expect((from[i]!.top - from[i - 1]!.top) * smaller.layout.xMm).toBeCloseTo(4.5, 6);
    // Too long even at 3 mm: the refusal names the text; without free text it does not
    expect(() => logisticLabel({ ...a6, from: SENDER, to: RECEIVER }, font)).toThrow(
      /^The label's text and symbols need \d+ mm; the A6 label is 148 mm high\. Choose a smaller size, fewer element strings, shorter text in From and To, or the larger label\.$/);
    expect(() => logisticLabel({ ...INPUT, size: "a6", from: [], to: [] }, font)).toThrow(
      /148 mm high\. Choose a smaller size, fewer element strings, or the larger label\.$/);
    // Another refusal is not retried into a different one
    expect(() => logisticLabel({ ...a6, from: SENDER, percent: 190 }, font)).toThrow(/outside the table's range/);
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
    // In French, German and Italian; a title the language writes as English does (German's ROUTE, (403)) on one line
    const routed = { ...INPUT, elementString: `${INPUT.elementString}(403)ROUTE42` };
    const titles = (secondLanguage: SecondLanguage) => logisticLabel({ ...routed, secondLanguage }, font).printer.texts.map((t) => t.text);
    expect(titles("fr")).toEqual(expect.arrayContaining(["EXPÉDITEUR", "DESTINATAIRE", "CONTENU", "QUANTITÉ", "LOT", "ITINÉRAIRE"]));
    expect(titles("it")).toEqual(expect.arrayContaining(["MITTENTE", "DESTINATARIO", "CONTENUTO", "QUANTITÀ", "LOTTO", "PERCORSO"]));
    const german = titles("de");
    expect(german).toEqual(expect.arrayContaining(["ABSENDER", "EMPFÄNGER", "INHALT", "ANZAHL", "CHARGE"]));
    expect(german.filter((t) => t === "ROUTE")).toEqual(["ROUTE"]);
    expect(german.length).toBe(logisticLabel(routed, font).printer.texts.length + 5);
    expect(zplLogisticLabel(logisticLabel({ ...routed, secondLanguage: "de" }, font), 300, 3)).toMatch(/\^FDEMPFÄNGER\^FS/);
  }, SLOW);

  it("names a data title in Portuguese, Spanish, French, German and Italian, an AI of its own where one title has two meanings", () => {
    expect(secondTitle("SHIP TO LOC", "pt-BR", "410")).toBe("LOCAL DE ENTREGA");
    expect(secondTitle("SHIP TO LOC", "pt-BR", "4305")).toBe("CIDADE DE ENTREGA");
    expect(secondTitle("SHIP TO LOC", "es", "4305")).toBe("CIUDAD DE ENTREGA");
    expect(secondTitle("NET WEIGHT (kg)", "es", "3102")).toBe("PESO NETO (kg)");
    expect(secondTitle("VOLUME (l), log", "pt-BR")).toBe("VOLUME (l), log");
    expect(secondTitle("USE BY or EXPIRY", "pt-BR")).toBe("VALIDADE");
    expect(secondTitle("USE BY or EXPIRY", "es")).toBe("CADUCIDAD");
    expect(secondTitle("SSCC", "pt-BR")).toBeNull();
    expect(secondTitle("AI (99999)", "es")).toBeNull();
    expect(secondTitle("SHIP TO LOC", "fr", "4305")).toBe("VILLE DE LIVRAISON");
    expect(secondTitle("SHIP TO LOC", "de", "410")).toBe("LIEFERORT");
    expect(secondTitle("SHIP TO LOC", "it", "4305")).toBe("CITTÀ DI CONSEGNA");
    expect(secondTitle("BATCH/LOT", "de")).toBe("CHARGE");
    expect(secondTitle("USE BY or EXPIRY", "it")).toBe("DATA DI SCADENZA");
    expect(secondTitle("NET WEIGHT (kg)", "fr", "3102")).toBe("POIDS NET (kg)");
    expect(secondTitle("GTIN", "it")).toBeNull();
    // Every title of the dictionary in both languages, or an acronym that is the same in every one: a title added to a
    // newer dictionary fails here until it is translated or listed
    const ACRONYMS = ["CPID", "CPV", "DIGSIG", "ESIM", "GCN", "GDTI", "GIAI", "GINC", "GMN", "GRAI", "GSIN", "GTIN", "IBAN", "IMEI",
      "IMEI2", "ITIP", "MUDI", "NHRN AIC", "NHRN AIM", "NHRN CIP", "NHRN CN", "NHRN DRN", "NHRN NDC", "NHRN PZN", "NHRN SRN", "NSN",
      "OPTSEN", "PCN", "PSIM", "SRIN", "SSCC", "TPX", "UIC+EXT", "VCN"];
    const titles = new Set(Object.values(DICTIONARY.ais).map((e) => e.title).filter(Boolean));
    const languages = Object.keys(SECOND_LANGUAGES) as SecondLanguage[];
    expect(languages).toEqual(["pt-BR", "es", "fr", "de", "it"]);
    for (const title of titles) {
      const seconds = languages.map((language) => secondTitle(title, language));
      if (ACRONYMS.includes(title)) expect([title, ...seconds]).toEqual([title, ...languages.map(() => null)]);
      else expect([title, ...seconds.map((s) => typeof s)]).toEqual([title, ...languages.map(() => "string")]);
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
