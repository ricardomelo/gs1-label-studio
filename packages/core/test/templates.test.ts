import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  designLabel,
  examplesStillIn,
  guidance,
  identify,
  LABEL_TEMPLATES,
  POS_RADIUS_MM,
  labelSvg,
  leaveOut,
  TEMPLATE_SEGMENTS,
  templateById,
  templateFit,
  walk,
  syntaxEngine,
  type Identification,
  type SyntaxEngine,
} from "../src/index.ts";
import { hriFont } from "./font.ts";

// Labels by segment (backlog 6.5): each template a label of one's own whose page holds every element within it, apart,
// its symbols read back by ZXing from the SVG; step 2's answers reach a table that offers the symbol it picks for its
// data; and choosing one with step 1's data keeps what fits, adds the template's examples and names the rest.

const font = hriFont();
let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
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

const STEM = "https://id.gs1.org";

describe("labels by segment", () => {
  it("lists retail, then healthcare, each template with a unique id", () => {
    expect(TEMPLATE_SEGMENTS).toEqual(["retail", "healthcare"]);
    expect(LABEL_TEMPLATES.map((t) => t.segment)).toEqual(["retail", "retail", "retail", "healthcare", "healthcare", "healthcare"]);
    expect(new Set(LABEL_TEMPLATES.map((t) => t.id)).size).toBe(LABEL_TEMPLATES.length);
    expect(templateById("healthcare-pack")?.name).toBe("Medicine or medical device");
    expect(templateById("nothing")).toBeUndefined();
  });

  for (const template of LABEL_TEMPLATES) {
    it(`${template.id}: step 2's table offers its symbol for its data, and the page reads back whole`, async () => {
      const identified = identify(engine, template.identification, STEM);
      const { leaf } = walk(template.identification.key, template.answers);
      expect(leaf).toBeDefined();
      const offered = guidance(leaf!, identified).options;
      for (const symbol of [template.picked.symbol, template.picked.with].filter(Boolean)) {
        const option = offered.find((o) => o.symbol === symbol);
        expect(option, `${symbol} offered`).toBeDefined();
      }
      // The page: within its edges, nothing over a symbol's quiet zones; each symbol read back from the SVG
      const environment = Object.entries({ 1: "retail", 6: "healthcare", 11: "gsrn" }).find(([table]) => Number(table) === leaf!.table)?.[1];
      expect(environment, `table ${leaf!.table}`).toBeDefined();
      const label = designLabel(template.page, identified, font, { environment: environment! });
      expect(label.problems).toEqual([]);
      const svg = labelSvg(label.options, label.layout, font);
      expect(await read(new Resvg(svg, { fitTo: { mode: "zoom", value: 8 }, background: "#fff" }).render().asPng())).toEqual([...label.expected].sort());
      expect(label.expected.length).toBe(template.page.elements.filter((e) => e.kind === "symbol").length);
      // The symbol step 2 picks is the page's
      expect(template.page.elements.some((e) => e.kind === "symbol" && e.symbology === template.picked.symbol)).toBe(true);
      // Every field of its texts filled from the data
      for (const text of label.layout.texts) expect(text.text).not.toMatch(/[{}]/);
    }, 60_000);
  }

  it("shows each element string the template holds: the lot and expiry under the barcodes, the GTIN, expiry, lot and serial beside the GS1 DataMatrix", () => {
    const texts = (id: string, environment: string) => {
      const template = templateById(id)!;
      return designLabel(template.page, identify(engine, template.identification, STEM), font, { environment }).layout.texts.map((t) => t.text);
    };
    expect(texts("retail-lot-expiry", "retail")).toEqual(expect.arrayContaining(["LOT (10) ABC123", "EXPIRY (17) 291231"]));
    expect(texts("healthcare-pack", "healthcare")).toEqual(expect.arrayContaining(["GTIN (01) 09506000134352", "EXPIRY (17) 291231", "LOT (10) ABC123", "SERIAL (21) 1001"]));
    // The GS1 DataMatrix's element strings in the healthcare order: the expiry, then the lot and serial number last
    const pack = templateById("healthcare-pack")!;
    expect(identify(engine, pack.identification, STEM).elementString).toBe("(01)09506000134352(17)291231(10)ABC123(21)1001");
    // The UDI's element strings, a line each, no data titles
    expect(texts("healthcare-udi", "healthcare")).toEqual(expect.arrayContaining(["(01)09506000134352", "(17)291231", "(10)ABC123", "(21)1001", "UDI", "MD"]));
    // The wristband: the patient's name, the date of birth in a format of its own without its AI, the GSRN with its AI
    expect(texts("patient-wristband", "gsrn")).toEqual(expect.arrayContaining(["SILVA, MARIA", "DOB 15/03/1980   SEX 2", "GSRN (8018) 950600013435200008"]));
    const band = templateById("patient-wristband")!;
    // A GS1 DataMatrix at each end, one past the text's end and at the band's right edge
    const symbols = designLabel(band.page, identify(engine, band.identification, STEM), font, { environment: "gsrn" }).placed.filter((p) => p.id === "e1" || p.id === "e5");
    expect(symbols.map((p) => [p.xMm, Math.round((p.xMm + p.widthMm) * 100) / 100])).toEqual([[2, 16.44], [128, 142.44]]);
    expect(identify(engine, band.identification, STEM).elementString).toBe("(8018)950600013435200008(7253)SILVA(7254)MARIA(7250)19800315(7252)2");
    // The consumer unit: the QR code carries the GTIN alone in GS1 Digital Link, the call to scan under it, and the QR
    // code with its quiet zones within 50 mm of the EAN-13's centre (6.3.3.1)
    const unit = templateById("retail-digital-link")!;
    const unitLabel = designLabel(unit.page, identify(engine, unit.identification, STEM), font, { environment: "retail" });
    expect(unitLabel.expected).toEqual(["]E0 9506000134352", "]Q1 https://id.gs1.org/01/09506000134352"]);
    expect(texts("retail-digital-link", "retail")).toEqual(expect.arrayContaining(["SCAN FOR", "PRODUCT INFO"]));
    const [ean, qr, call] = ["e1", "e2", "e3"].map((id) => unitLabel.placed.find((p) => p.id === id)!);
    expect(call!.yMm).toBeGreaterThanOrEqual(qr!.yMm + qr!.heightMm);
    const [cx, cy] = [ean!.xMm + ean!.widthMm / 2, ean!.yMm + ean!.heightMm / 2];
    expect(Math.hypot(qr!.xMm + qr!.widthMm - cx, qr!.yMm + qr!.heightMm - cy)).toBeLessThan(POS_RADIUS_MM);
    // A variable measure GTIN starts with 9; its weight and price as element strings
    const weight = templateById("retail-weight")!;
    expect(identify(engine, weight.identification, STEM).elementString).toBe("(01)99506000134355(3102)000125(3922)1599");
  });
});

describe("choosing a template with step 1's data", () => {
  const template = templateById("retail-lot-expiry")!;
  const mine: Identification = { key: "01", value: "07891234567895", qualifiers: { "21": "S9" }, attributes: [["17", "301130"], ["11", "261001"]] };

  it("keeps the key's value and the data that fits, adds the template's examples and names the data it has no place for", () => {
    const fit = templateFit(template, mine);
    expect(fit.replaced).toBe(false);
    expect(fit.identification.value).toBe("07891234567895");
    expect(fit.identification.qualifiers).toEqual({ "21": "S9", "10": "ABC123" });
    expect(fit.identification.attributes).toEqual([["17", "301130"], ["11", "261001"]]);
    expect(fit.examples).toEqual([["10", "ABC123"]]);
    expect(fit.extra).toEqual(["21", "11"]);
    // Left out at the person's word
    const without = leaveOut(fit.identification, fit.extra);
    expect(without.qualifiers).toEqual({ "10": "ABC123" });
    expect(without.attributes).toEqual([["17", "301130"]]);
    // The examples still to replace, until the person types their own
    expect(examplesStillIn(fit.examples, fit.identification)).toEqual(["10"]);
    expect(examplesStillIn(fit.examples, { ...fit.identification, qualifiers: { "10": "L7" } })).toEqual([]);
  });

  it("gives way to the template's example when step 1 has another key or no value", () => {
    const sscc: Identification = { key: "00", value: "095060000000000017", qualifiers: {}, attributes: [] };
    const fit = templateFit(template, sscc);
    expect(fit.replaced).toBe(true);
    expect(fit.identification).toEqual(template.identification);
    expect(fit.examples).toEqual([["01", "09506000134352"], ["10", "ABC123"], ["17", "291231"]]);
    expect(fit.extra).toEqual([]);
    const empty = templateFit(template, { key: "01", value: " ", qualifiers: {}, attributes: [] });
    expect(empty.replaced).toBe(false);
    expect(empty.identification).toEqual(template.identification);
    expect(examplesStillIn(empty.examples, empty.identification)).toEqual(["01", "10", "17"]);
    // The key's example gone once the person types their own GTIN
    expect(examplesStillIn(empty.examples, { ...empty.identification, value: "07891234567895" })).toEqual(["10", "17"]);
  });

  it("gives a variable measure template its own GTIN when step 1's lacks the indicator digit 9", () => {
    const weight = templateById("retail-weight")!;
    const fit = templateFit(weight, mine);
    expect(fit.identification.value).toBe("99506000134355");
    expect(fit.examples).toEqual([["01", "99506000134355"], ["310n", "1.25"], ["392n", "15.99"]]);
    expect(fit.extra).toEqual(["21", "17", "11"]);
    expect(templateFit(weight, { ...mine, value: "97891234567892" }).identification.value).toBe("97891234567892");
    // Another template keeps step 1's GTIN, whatever its first digit
    expect(templateFit(template, { ...mine, value: "97891234567892" }).identification.value).toBe("97891234567892");
  });

  it("takes the template's order of the data when step 1 has none, and adds to step 1's own", () => {
    const pack = templateById("healthcare-pack")!;
    const plain: Identification = { key: "01", value: "07891234567895", qualifiers: {}, attributes: [["11", "261001"]] };
    expect(templateFit(pack, plain).identification.order).toEqual(["17", "10", "21", "11"]);
    expect(templateFit(pack, { ...plain, order: ["11"] }).identification.order).toEqual(["11", "17", "10", "21"]);
    // Nothing changes the template's own
    expect(pack.identification.qualifiers).toEqual({ "10": "ABC123", "21": "1001" });
  });
});
