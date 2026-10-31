import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  gs1128FieldData,
  parseElementString,
  upcaManufacturerAndProduct,
  zplLabel,
  zplTemplate,
  ZplUnsupportedError,
  zplTextAbove,
} from "../src/index.ts";

const at203 = { x: 40, y: 40, dotsPerModule: 3, barHeightDots: 120, dpi: 203, widthDots: 800, heightDots: 400 };

describe("ZPL with the printer's commands", () => {
  it("gives the printer the digits it expects, without the check digit", () => {
    expect(zplLabel("ean13", "9506000134352", at203)).toContain("^BEN,120,Y,N^FD950600013435^FS");
    expect(zplLabel("ean8", "95012346", at203)).toContain("^B8N,120,Y,N^FD9501234^FS");
    expect(zplLabel("upca", "614141000036", at203)).toContain("^BUN,120,Y,N,Y^FD61414100003^FS");
    expect(zplLabel("itf14", "19506000134359", at203)).toContain("^B2N,120,Y,N,Y^FD1950600013435^FS");
    expect(zplLabel("upce", "01234565", at203)).toContain("^B9N,120,Y,N,Y^FD1234500006^FS");
  });

  it("expands UPC-E by its last digit's rule", () => {
    expect(upcaManufacturerAndProduct("01234505")).toBe("1200000345"); // 0–2: d1 d2 d6 0 0, then 0 0 d3 d4 d5
    expect(upcaManufacturerAndProduct("01234531")).toBe("1230000045"); // 3
    expect(upcaManufacturerAndProduct("01234548")).toBe("1234000005"); // 4
    expect(upcaManufacturerAndProduct("01234565")).toBe("1234500006"); // 5–9
  });

  it("places FNC1 in a GS1 DataMatrix only first and after variable-length element strings", () => {
    const zpl = zplLabel("gs1-datamatrix", "(01)09506000134352(10)ABC_1(17)271231(21)XYZ", at203);
    expect(zpl).toContain("^BXN,3,200,0,0,6,_^FD_10109506000134352" + "10ABC__1_1" + "17271231" + "21XYZ^FS");
  });

  it("writes GS1-128 with FNC1 and code sets chosen here", () => {
    const elements = parseElementString("(01)09506000134352(10)AB12345>(21)7(17)271231");
    // Start C, FNC1, (01) in pairs; (10) as AI in C, "AB" and an odd digit in B, then four digits in C, ">" as ">0";
    // FNC1 after the variable-length (10) and (21); (17) in C.
    expect(gs1128FieldData(elements)).toBe(">;>80109506000134352" + "10>6AB1>52345>6>0>8" + ">521>67>8" + ">517271231");
    expect(gs1128FieldData(elements, (e) => `{{${e.ai}}}`)).toBe(
      ">;>801{{01}}" + "10>6{{10}}>8" + ">521>6{{21}}>8" + ">517{{17}}",
    );
    expect(zplLabel("gs1-128", "(00)106141411234567897", at203)).toContain("^BCN,120,N,N,N,N^FD>;>800106141411234567897^FS");
  });

  it("writes ^BQ at the error correction level chosen, M when none; refuses one mode for the data (ADR 0002)", () => {
    const uri = "https://id.gs1.org/01/09506000134352";
    expect(zplLabel("dl-qrcode", uri, at203)).toContain(`^FDMA,${uri}^FS`);
    expect(zplLabel("dl-qrcode", uri, { ...at203, qrError: "H" })).toContain(`^FDHA,${uri}^FS`);
    expect(() => zplLabel("dl-qrcode", uri.toUpperCase(), { ...at203, qrMode: "alphanumeric" })).toThrow(ZplUnsupportedError);
  });

  it("writes reserved characters through ^FH", () => {
    expect(zplLabel("dl-qrcode", "https://example.com/01/09506000134352?x=~", at203))
      .toContain("^BQN,2,3^FH\\^FDMA,https://example.com/01/09506000134352?x=\\7E^FS");
  });

  it("writes the text above, or split with the key below, at the height chosen; refuses it beside the symbol", () => {
    const o = { ...at203, y: 200 };
    const data = "(01)09506000134352(10)ABC123";
    expect(zplLabel("gs1-128", data, { ...o, hriPosition: "above", hriHeightMm: 3 })).toMatch(/\^FO\d+,\d+\^A0N,24,24\^FB\d+,1,0,C\^FD\(01\)09506000134352\(10\)ABC123\^FS/);
    const split = zplLabel("gs1-128", data, { ...o, hriPosition: "split" });
    const [above, below] = [/\^FO\d+,(\d+)\^A0N,18,18\^FB\d+,1,0,C\^FD\(10\)ABC123/.exec(split), /\^FO\d+,(\d+)\^A0N,18,18\^FB\d+,1,0,C\^FD\(01\)09506000134352\^FS/.exec(split)];
    expect(Number(above![1]) + 18).toBeLessThanOrEqual(200);
    expect(Number(below![1])).toBeGreaterThan(200 + o.barHeightDots);
    expect(() => zplLabel("gs1-128", data, { ...o, hriPosition: "right" })).toThrow(/below or above the symbol/);
    expect(zplTextAbove({ dpi: 203, dotsPerModule: 3 }, 2)).toBe(0);
    expect(zplTextAbove({ dpi: 203, dotsPerModule: 3, hriPosition: "above" }, 2)).toBe(2 * 25 + 6 + 8);
  });

  it("refuses a GS1 QR Code: ^BQ has no FNC1", () => {
    expect(() => zplLabel("gs1-qrcode", "(01)09506000134352", at203)).toThrow(ZplUnsupportedError);
  });

  it("makes a template whose filled placeholders give the label back", () => {
    const data = "(01)09506000134352(17)271231(10)ABC123";
    const template = zplTemplate("gs1-128", data, at203);
    expect(template.placeholders.map((p) => [p.name, p.sample])).toEqual([
      ["01", "09506000134352"], ["17", "271231"], ["10", "ABC123"],
    ]);
    expect(template.zpl).toContain("^FD>;>801{{01}}17{{17}}10>6{{10}}^FS");
    expect(template.zpl).toContain("^FD(01){{01}}(17){{17}}(10){{10}}^FS"); // the text below the bars
    expect(template.zpl).toMatch(/^\^FX \{\{10\}\}: the value of AI \(10\)/m);
    const values = Object.fromEntries(template.placeholders.map((p) => [p.name, p.sample]));
    const withoutComments = (zpl: string) => zpl.split("\n").filter((line) => !line.startsWith("^FX")).join("\n");
    // "ABC123" has no run of four digits, so the label also writes it in code set B: the same ZPL.
    expect(withoutComments(fillTemplate(template, values))).toBe(zplLabel("gs1-128", data, at203));
    expect(withoutComments(fillTemplate(zplTemplate("ean13", "9506000134352", at203), { "01": "950600013435" })))
      .toBe(zplLabel("ean13", "9506000134352", at203));
  });

  it("escapes a template's values in the symbol, not in the text below it", () => {
    const template = zplTemplate("gs1-datamatrix", "(01)09506000134352(10)A_B", at203);
    const zpl = fillTemplate(template, { "01": "09506000134352", "10": "X_Y" });
    expect(zpl).toContain("^FD_1010950600013435210X__Y^FS");
    expect(zpl).toContain("^FD(10)X_Y^FS");
  });

  it("parses bracketed element strings and refuses anything else", () => {
    expect(parseElementString("(01)09506000134352(10)A")).toEqual([
      { ai: "01", value: "09506000134352" }, { ai: "10", value: "A" },
    ]);
    expect(() => parseElementString("0109506000134352")).toThrow();
  });
});

// Item 3.2 with the layouts of item 1.3: GS1 DataBar through ^BR, ITF-14's bearer bars through ^GB.
describe("GS1 DataBar and ITF-14's bearer bars in ZPL", () => {
  const databar = { ...at203, barHeightDots: 33 * 3 };
  it("gives ^BR the GTIN's first 13 digits, or Expanded's element strings, at the module's dots, the text below", () => {
    const omni = zplLabel("databar-omni", "(01)09506000134352", databar);
    expect(omni).toContain("^FO40,40^BRN,1,3,1,99,22^FD0950600013435^FS");
    expect(omni).toMatch(/\^A0N,18,18\^FB288,1,0,C\^FD\(01\)09506000134352\^FS/); // 96 modules of 3 dots
    expect(zplLabel("databar-limited", "(01)09506000134352", { ...databar, barHeightDots: 30 })).toContain("^BRN,5,3,1,30,22^FD0950600013435^FS");
    expect(zplLabel("databar-expanded", "(01)09506000134352(17)271231(10)AB", { ...databar, barHeightDots: 102 }))
      .toContain("^BRN,6,3,1,102,22^FD01095060001343521727123110AB^FS");
    expect(zplLabel("databar-expanded-stacked", "(01)09506000134352(10)AB", { ...databar, barHeightDots: 213 }))
      .toContain("^BRN,6,3,1,213,4^FD0109506000134352" + "10AB^FS");
  });

  it("refuses what ^BR cannot print as the table asks: a taller symbol, a variable-length element string not last", () => {
    // Table 1 asks GS1 DataBar Omnidirectional 46 modules high; ^BR prints 33.
    expect(() => zplLabel("databar-omni", "(01)09506000134352", { ...at203, barHeightDots: 46 * 3 })).toThrow(/33 modules high/);
    expect(() => zplLabel("databar-expanded", "(01)09506000134352(10)AB(17)271231", { ...databar, barHeightDots: 102 }))
      .toThrow(ZplUnsupportedError);
    expect(() => zplLabel("databar-omni", "(01)09506000134352", { ...databar, dotsPerModule: 11 })).toThrow(/1 to 10 dots/);
  });

  it("templates GS1 DataBar with the GTIN's 13 digits for the symbol and the whole GTIN for the text", () => {
    const template = zplTemplate("databar-truncated", "(01)09506000134352", { ...databar, barHeightDots: 39 });
    expect(template.placeholders.map((p) => [p.name, p.sample])).toEqual([["01", "0950600013435"], ["GTIN", "09506000134352"]]);
    expect(fillTemplate(template, { "01": "1950600013435", GTIN: "19506000134359" })).toContain("^FD(01)19506000134359^FS");
  });

  it("draws ITF-14's bearer bars around the symbol and its quiet zones, its 14 digits below them", () => {
    const o = { ...at203, x: 70, y: 60, barHeightDots: 254 };
    const frame = zplLabel("itf14", "19506000134359", { ...o, bearer: { kind: "frame", thicknessDots: 39 } });
    // 135 modules at ratio 3 and 3 dots: 405 dots; quiet zones of 30 dots; a frame of 39 dots.
    expect(frame).toContain("^FO70,60^BY3,3.0,254^B2N,254,N,N,N^FD19506000134359^FS");
    expect(frame).toContain("^FO1,21^GB543,332,39^FS");
    expect(frame).toContain("^FO1,361^A0N,18,18^FB543,1,0,C^FD19506000134359^FS"); // 1.02 mm: 8 dots below
    const bars = zplLabel("itf14", "19506000134359", { ...o, bearer: { kind: "bars", thicknessDots: 6 } });
    expect(bars).toContain("^FO40,54^GB465,6,6^FS");
    expect(bars).toContain("^FO40,314^GB465,6,6^FS");
    const template = zplTemplate("itf14", "19506000134359", { ...o, bearer: { kind: "bars", thicknessDots: 6 } });
    expect(template.placeholders.map((p) => p.name)).toEqual(["01"]);
    expect(template.zpl).toContain("^FB465,1,0,C^FD{{01}}^FS");
  });
});
